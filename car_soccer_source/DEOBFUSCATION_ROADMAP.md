# Car Soccer Engine 反混淆与渐进式重构方案 (Deobfuscation & Modularization Roadmap)

> **原则**：“一点一点修，稳扎稳打，绝不冒进，步步验证”。  
> 本文档面向 Car Soccer 项目，基于对原版编译打包产物 `CarSoccerEngine.js`（约 3 万行）与 upstream C++ 物理引擎 [zealanL/rocketsim](https://github.com/zealanL/rocketsim) 的严格源码对照，制定全生命周期的反混淆、解耦与重构工程方案。

---

## 1. 现状剖析与“为什么必须渐进式修复”？

### 1.1 混淆的本质与历史教训
`dist_game/js/index-Dm9xG-kJ.js` 以及 `car_soccer_source/src/game/CarSoccerEngine.js` 是由 Rollup/Vite 打包器从多文件 TypeScript 工程构建出的单一产物。打包过程中：
1. **作用域拍平 (Scope Hoisting)**：将全部模块内联在顶层作用域，所有函数和类相互直接捕获外部局部变量。
2. **标识符高频混淆 (Identifier Mangling)**：核心类名（如 `yC`, `CC`, `bC`, `ow`, `cw`, `Lw`, `BM`, `UM`, `VM`, `QM`, `nB`, `aB`, `Sw`, `kw`, `V1`, `jw`, `tm`, `u1`, `cg`）和变量名（`Mt`, `ke`, `Fe`, `be`, `Rn`, `zn`）均被降维为单双字母。
3. **内联依赖 (Inlined Three.js)**：文件前 17,824 行（占总体积 61%）为完整打包的 Three.js r185，且内部所有导出类被混淆为单字母变量（例如 `Zd` = Vector3, `Yd` = Vector2, `jn` = Quaternion, `KA` = Matrix4）。

历史提交（如 `a8c6c76 AG refused to split car_soccer.JS`）表明：**盲目对 3 万行代码进行一刀切物理拆分，会直接触发 JavaScript TDZ (Temporal Dead Zone - 变量未初始化即被调用) 或循环引用异常，导致整个游戏白屏崩溃**。

### 1.2 成功的破局之道：外向内剥离 + 别名平滑过渡
正确且工业级可靠的重构范式为：
- **自底向上，逐模块拆分**：先解耦无外部闭包缠绕的基础底座（物理引擎、常量映射、时钟调度），再解耦外围独立 UI/音频，随后统一输入与状态机，最后处理高度耦合的 3D 场景与相机。
- **保留向下兼容别名 (Backward-Compatibility Aliases)**：每个解耦后的独立 ES 模块既导出语义化类名（如 `RocketSimPhysicsEngine`, `BoostGaugeHUD`, `PerformanceOverlayHUD`, `SpatialAudioSource`, `GameAudioSubsystem`），又重导出原混淆别名（如 `export { BoostGaugeHUD as nB }`，`export { SpatialAudioSource as cg }`），确保未重构部分无缝运行，**实现 0 回归风险**。

---

## 2. RocketSim 核心物理内存映射与对齐分析 (Upstream rocketsim)

RocketSim 是由 ZealanL 开源的高保真 Rocket League C++ 物理仿真库（基于 Bullet Physics）。在 WebAssembly 环境下，它通过共享堆内存（`HEAPF32` / `Float32Array`）与 JavaScript 进行超高速 120Hz 状态同步。

### 2.1 全局 Arena 状态偏移 (`SIM_OFFSETS` / 混淆名 `ht`)
| 字段名 | 偏移索引 (Float32) | 对应 C++ 结构体 / 含义 |
| :--- | :---: | :--- |
| `TICK` | 0 | 当前物理仿真 Tick 计数器 (`arena->tickCount`) |
| `GOAL` | 1 | 进球事件状态 (`0`: 无进球, `1`: 蓝队进球, `2`: 橙队进球) |
| `NUM_CARS` | 2 | 场上有效赛车数量 (自由模式为 1，人机模式为 2，多人模式可扩充至 8) |
| `NUM_PADS` | 3 | 球场充能喷气垫总数 (标准球场为 34 个) |
| `BALL` | 4 | 足球物理状态起始偏移 (跨度 18 个 Float32) |
| `CARS` | 22 | 赛车数据数组起始偏移 (每辆车跨度 51 个 Float32) |

### 2.2 单车物理状态偏移 (`CAR_STATE_OFFSETS` / 混淆名 `ye`, 跨度 `ln = 51`)
访问第 `i` 辆车：`const carOffset = SIM_OFFSETS.CARS + i * CAR_STATE_STRIDE;`
| 字段名 | 偏移 | C++ 对应字段 (`CarState` in `Sim/Car/Car.h`) |
| :--- | :---: | :--- |
| `POS` | 0..2 | `Vec pos` (世界坐标 X, Y, Z，单位: UU) |
| `FWD` | 3..5 | `rotMat.forward` (车头朝向单位向量 X, Y, Z) |
| `RIGHT` | 6..8 | `rotMat.right` (车身右向单位向量 X, Y, Z) |
| `UP` | 9..11 | `rotMat.up` (车顶朝向单位向量 X, Y, Z) |
| `VEL` | 12..14 | `Vec vel` (线速度向量 X, Y, Z，UU/s) |
| `ANG_VEL` | 15..17 | `Vec angVel` (角速度向量，rad/s) |
| `BOOST` | 18 | `float boost` (剩余喷气量 0.0 ~ 100.0) |
| `ON_GROUND` | 19 | `bool isOnGround` (是否贴地，>=3 轮触地) |
| `SUPERSONIC` | 20 | `bool isSupersonic` (是否超音速，速度 > 2200 UU/s) |
| `DEMOED` | 21 | `bool isDemoed` (是否被撞爆) |
| `HAS_FLIP_OR_JUMP` | 22 | `bool HasFlipOrJump()` (是否拥有跳跃/翻滚机会) |
| `IS_BOOSTING` | 23 | `bool isBoosting` (当前是否正在喷气) |
| `IS_FLIPPING` | 24 | `bool isFlipping` (是否正在执行翻滚空翻) |
| `FLIP_RESET_SERIAL`| 25 | 四轮触球/天花板翻滚重置序列号 |
| `WHEELS` | 26..37| 4 个车轮的悬挂压缩与触地状态 (4 轮 × 3 Float) |
| `GROUND_NORMAL` | 38..40| 地面接触表面法向量 |
| `JUMP_SERIAL` | 41 | 起跳事件触发序列号 |
| `DODGE_SERIAL` | 42 | 翻滚闪避事件触发序列号 |
| `DOUBLE_JUMP_SERIAL`| 43 | 二段跳触发序列号 |
| `WHEEL_IMPACT_SERIAL`| 44 | 悬挂着陆撞击序列号 |
| `WHEEL_IMPACT_SPEED` | 45 | 悬挂着陆撞击垂直速度 |
| `BALL_HIT_SERIAL` | 46 | 触球事件序列号 (车球接触时自增) |
| `BALL_HIT_SPEED` | 47 | 击球相对碰撞速度 |
| `BALL_WORLD_IMPACT_SERIAL`| 48 | 球体撞击球场表面序列号 |
| `BALL_WORLD_IMPACT_SPEED` | 49 | 球体撞击速度 |
| `BALL_WORLD_SURFACE` | 50 | 球体撞击表面材质 (0: 地面, 1: 墙体) |

### 2.3 控制输入内存映射 (`CONTROLS_STRIDE = 8` / 混淆名 `kf = 8`)
对应 RocketSim `CarControls` (`Sim/CarControls.h`)：
```
[0: throttle, 1: steer, 2: pitch, 3: yaw, 4: roll, 5: jump, 6: boost, 7: handbrake]
```

---

## 3. 全局十四大子系统反混淆清单 (Master Deobfuscation Map)

| 序号 | 子系统名称 | 原代码混淆符号 | 语义化重构目标 | 当前状态 | 依赖与解耦方案 |
| :---: | :--- | :--- | :--- | :---: | :--- |
| **01** | **RocketSim 常量与布局** | `ht`, `ye`, `ln`, `kf`, `u0`, `xC`, `da`, `oc`, `to` | `src/physics/RocketSimConstants.js` | ✅ **已完成** | 纯数据定义，0 外部依赖 |
| **02** | **RocketSim 物理外壳** | `class yC` | `src/physics/RocketSimPhysicsEngine.js` | ✅ **已完成** | 依赖 WASM 加载器与碰撞网格加载 |
| **03** | **120Hz 物理插值器** | `class CC` | `src/physics/PhysicsStateInterpolator.js`| ✅ **已完成** | 定步长累加器，Lerp 插值与防螺旋停滞 |
| **04** | **GPU 渲染时钟调度器**| `class bC` | `src/game/RenderClockScheduler.js` | ✅ **已完成** | RAF + WebGL2 fenceSync，解耦帧率限制 |
| **05** | **喷气量弧形表盘 HUD**| `class nB`, `um` | `src/ui/BoostGaugeHUD.js` | ✅ **已完成** | 纯 DOM/SVG 渲染，监听 boost 浮点数与点火状态 |
| **06** | **性能监控与帧耗时** | `class aB`, `class iB` | `src/ui/PerformanceOverlayHUD.js` | ✅ **已完成** | 极简与详情 FPS / p95 耗时视图、SVG 折线图与环形缓冲 |
| **07** | **全局 UI 矢量图标库**| `jM`, `Vt` | `src/ui/Icons.js` | ✅ **已完成** | 包含 20 个高精度 SVG 矢量图标库与格式化输出 |
| **08** | **综合音效总线与空间音频**| `class Lw`, `Sw`, `kw`, `V1`, `jw`, `tm`, `u1`, `cg`, `GameAudioManager` | `src/audio/SpatialAudioSource.js`<br>`src/audio/GameAudioSubsystem.js` | ✅ **已完成** | Web Audio HRTF 空间化立体声、Smoothstep 距离衰减、多层撞球撞墙声、起跳翻滚与着陆悬挂声、超音速音爆与循环、黄金喷气火焰粒子声效、引擎音频桥接、比赛播报与设置持久化 |
| **09** | **全平台输入控制器** | `SC`, `XC`, `ib`, `_M`, `BC`, `Rh`, `Yo` | `src/input/MultiPlatformInput.js` | ✅ **已完成** | 键鼠映射、Gamepad 轮询、移动端虚拟摇杆、Bindings 存储与重映射 |
| **10** | **比赛与模式状态机** | `class VM`, `class $M`, `qM`, `sm` | `src/game/MatchStateMachine.js`<br>`src/ui/MatchDialog.js` | ✅ **已完成** | Kickoff 开球、321 倒计时、进球判定、加时赛判定、实时记分牌与手柄导航 |
| **11** | **RL Bot 强化学习代理**| `class QM`, `JM`, `KM`, `ZM`, `pl`, `JA`, `Am`, `XM`, `dm` | `src/ai/RLBotAgent.js` | ✅ **已完成** | ONNX Runtime Web Worker 推理策略 (Nexto, Necto, Seer)、Nexto 离散动作表与开球例程、智能启发式保底 AI |
| **12** | **车库与 3D 展台** | `class UM`, `class HM` | `src/ui/GarageDialog.js` | ✅ *阶段六 (Part 2)* | 车身切换 (Octane/Dominus)、涂装、独立离屏渲染展台 |
| **13** | **全局设置面板** | `class BM` | `src/ui/SettingsSheet.js` | ✅ **已完成** *(阶段六 Part 1)* | 键位映射、手柄配置、图像与音效配置弹窗 |
| **14** | **动态追踪相机系统** | `class cw` | `src/camera/CameraController.js` | ✅ **已完成** *(阶段七 Part 1)* | 32位 RocketSim 视图内核同步、跟随相机、Ball Cam 球心锁定、动态 FOV、多平台 Swivel 视角偏移 |
| **15** | **特效与渲染通道** | `class fw`, `class xw`, `class Zw`, `class Yw` | `src/effects/index.js`<br>`src/effects/BoostBloom.js`<br>`src/effects/FlipResetVisual.js`<br>`src/effects/SupersonicSpeedLinesPass.js` | ✅ **已完成** *(阶段七 Part 2)* | BoostBloom 渐进辉光、FlipResetVisual 翻滚重置环/粒子、SupersonicSpeedLinesPass 超音速全屏流线 |
| **16** | **三维球场与视觉实体**| `class ow`, `class bS`, `class nS`, `BoostPadSystem` | `src/entities/BallLocatorArrow.js`<br>`src/entities/DemolitionEffect.js`<br>`src/entities/BoostPadSystem.js` | 🔄 **进行中 (Step 1 落地)** | 球心指示箭头、车辆自毁粒子烟雾、34 颗喷气补给垫系统与状态轮询 |
| **17** | **Three.js 内核外部化**| 前 17,824 行混淆库代码 | `import * as THREE from 'three'` | ⏳ *阶段八* | 消除 60% 文件冗余，全面恢复标准 API 命名 |

---

## 4. 阶段实施蓝图 (Phased Implementation Blueprint)

### 阶段一：物理层与时钟调度器规范化（✅ 已落地）
1. 创建 `src/physics/RocketSimConstants.js`：定义严格与 C++ 源码一致的结构体偏移与物理常量。
2. 创建 `src/physics/RocketSimPhysicsEngine.js`：封装 RocketSim C++ WASM 胶水层，命名所有方法，添加 JSDoc。
3. 创建 `src/physics/PhysicsStateInterpolator.js`：将 120Hz 物理累加步进与状态插值独立封装。
4. 创建 `src/game/RenderClockScheduler.js`：将基于 MessageChannel 和 WebGL2 fenceSync 的时钟调度器解耦。
5. 更新 `src/physics/PhysicsManager.js`：使原有的空壳管理器变更为功能完整的统一门面导出层。
6. 重构 `src/game/CarSoccerEngine.js`：引入上述模块，删除内联的 270 余行混淆实现，以干净别名保障零回归。

### 阶段二：UI HUD 与性能监控抽离（✅ 已落地）
1. 创建 `src/ui/Icons.js`：收敛全部 20 项矢量图标（`play`, `gear`, `bolt`, `car-profile`, `arrows-clockwise` 等），封装 `renderIcon(name, size)` 并提供向后兼容别名 `Vt` 与 `jM`。
2. 创建 `src/ui/BoostGaugeHUD.js`：解耦线性喷气计量表盘（原混淆类 `nB` 与算法 `um`），封装 `boostToTrackX`，支持刻度绘制、瞬时喷气动态高光以及无限气模式（`∞`）。
3. 创建 `src/ui/PerformanceOverlayHUD.js`：
   - 抽离 `PerformanceProfiler`（原 `iB`）：基于 10000 槽位的高性能环形数组统计单帧耗时、CPU 渲染耗时、6 大细分渲染阶段（`sim`, `scene`, `camera`, `prep`, `bloom`, `final`）、120Hz 仿真子步、丢帧分析以及屏幕刷新率自适应识别（30Hz 至 600Hz）。
   - 抽离 `PerformanceOverlayHUD`（原 `aB`）：解耦状态监视器 DOM 浮层、Summary 极简指示器、SVG 实时延迟折线波动图、Three.js 显存与渲染绘制调用（Draw Calls）统计、以及手柄按键导航响应。
4. 创建单元测试套件 `tests/hud_and_profiler.test.js`，通过 Node.js 运行全量功能与别名兼容性校验（100% 通过）。
5. 重构 `src/game/CarSoccerEngine.js`：移除 460 余行高混淆 DOM/HUD 逻辑，替换为清晰的模块引用。

### 阶段三：音频子系统统一与空间化解耦（✅ 已落地）
1. 创建 `src/audio/SpatialAudioSource.js`：
   - 抽离 `SpatialAudioSource`（原混淆类 `cg`）：Web Audio HRTF 空间化立体声源，设置单声道扬声器输出与零滚降因子。
   - 抽离 `calculateDistanceGain(distance)`（原混淆函数 `j1`）：实现基于三次 Hermite 样条曲线的距离增益平滑衰减算法（`MIN_DISTANCE = 250`, `MAX_DISTANCE = 4500`, `MAX_GAIN = 0.4`）。
   - 抽离 `updateAudioListener(camera)`（原混淆函数 `_1`）：全自动解算 3D 相机朝向与四元数旋转，无缝适配 AudioParam 与 legacy Web Audio Listener 接口。
2. 创建 `src/audio/GameAudioSubsystem.js`：
   - 抽离 `AudioMixer`（原 `u1`）与主混音通道（`qr`, `$r`, `up`, `setEngineVolume`, `setBoostVolume`），支持窗口失焦静音与 localStorage 音量配置同步。
   - 抽离 `VehicleActionAudio`（原 `Sw`）：根据物理 Tick 序列号监听起跳（`jumpSerial`）、翻滚（`dodgeSerial`）、二段跳（`doubleJumpSerial`）以及着陆悬挂冲击（`wheelImpactSerial` / `wheelImpactSpeed`）。
   - 抽离 `BallImpactAudio`（原 `kw`）：实现 8 层音频材质声效的叠加播放，支持车球碰撞（`carCore`, `carDetail`, `carHard`, `carSweetener`）与球场碰撞（`surfaceDetail`, `surfaceBody`, `grass`, `arena`）。
   - 抽离 `SupersonicAudio`（原 `Lw`）：支持音爆瞬间 Stinger 音效与持续超音速高频环绕循环（`supersonic-loop`），集成用户手势解锁机制。
   - 抽离 `BoostAudio`（原 `V1`）：多喷口 3D 空间火焰音效，维护 WeakMap 缓冲池与启停交叉淡入淡出。
   - 抽离 `FlipResetAudio`（原 `jw`）：四轮重置触发声效。
   - 抽离 `VehicleEngineAudio`（原 `tm`）：桥接赛车速度、物理负载与 `EMotorSynth`。
   - 抽离 `GameAudioManager`、`gameAudio` 与 `boostCollectAudio`：比赛开球、进球、倒计时与拾取大喷气声效。
3. 创建单元测试套件 `tests/audio_subsystem.test.js`：涵盖全部 8 组音频类、数学公式、序列号触发及别名映射，8 组测试用例 100% 通过。
4. 重构 `src/game/CarSoccerEngine.js`：精简移除 901 行内联混淆音频实现，代之以清晰的模块导入与别名桥接，并通过 `node --check` 语法校验。

### 阶段四：全平台输入子系统统一（✅ 已落地）
1. 创建 `src/utils/StorageHelper.js`：
   - 封装类型安全的 `createLocalStorageStore`（原混淆 `rr`），支持 JSON 反序列化、多版本迁移回调与异常静默兜底。
   - 提供通用类型校验与安全裁剪辅助：`isPlainObject` (`Dr`)、`booleanOrDefault` (`jr`)、`clampNumberOrDefault` (`_r`)、`stringOrDefault` (`cl`)、`filterArraySlice` (`MC`)。
2. 创建 `src/input/InputConstants.js`：
   - 规范化 RocketSim 8 维度控制约束（`throttle`, `steer`, `pitch`, `yaw`, `roll`, `jump`, `boost`, `handbrake`）。
   - 收敛全部 21 项游戏可配置动作元数据（`INPUT_ACTIONS`，原 `io`）与 5 大动作组（`Driving`, `Aerial`, `Camera`, `Ball Control`, `Session`）。
   - 定义按键与手柄按钮跨平台展示名矩阵（`KEY_DISPLAY_NAMES`, `MOUSE_BUTTON_NAMES`, `XBOX_BUTTON_NAMES`, `PLAYSTATION_BUTTON_NAMES`, `AXIS_NAMES`）。
3. 创建 `src/input/InputBindings.js`：
   - 抽离键鼠与手柄默认按键布局配置器（`createDefaultKeyboardBindings`, `createDefaultGamepadBindings`, `createDefaultInputBindings`）。
   - 抽离按键绑定增删改与比对算法（`assignBinding`, `removeBinding`, `resetDeviceBindings`, `resetAxisBindings`, `areBindingsEqual`）。
   - 抽离手柄品牌自适应识别（`detectControllerType`，识别 PlayStation DualSense/DualShock 与 Xbox 标准映射）。
   - 抽离 Gamepad 自动捕获与多手柄热插拔选择器（`getConnectedGamepads`, `getSelectedController`, `setSelectedController`, `getEffectiveGamepad`）。
4. 创建 `src/input/KeyboardMouseController.js`：
   - 抽离键盘鼠标高响应控制器 `KeyboardMouseController`（原 `SC`），内置 UI 穿透防护（`isEventWithinUI`，原 `Tf`）。
   - 优化空翻与空中俯仰滚转控制模型（Air Roll 与 Pitch 严格分离，消除 -0 精度毛刺）。
5. 创建 `src/input/GamepadController.js`：
   - 抽离专业级手柄控制器 `GamepadController`（原 `XC`），集成基于线性斜率补正的径向死区算法（`dz`）、扳机渐进行程、摇杆看球视角平移与训练动作触发。
6. 创建 `src/input/TouchControls.js`：
   - 抽离移动端触控控制器 `TouchControls`（原 `ib`）与嵌入式虚拟摇杆（`VirtualJoystick`）。
   - 抽离触控安全区适配与自适应布局解算器（`getScreenSafeArea`, `computeTouchLayoutBounds`, `normalizeTouchLayoutRect`, `applyTouchLayoutToDom`）。
   - 抽离触控自定义布局编辑器 `TouchLayoutEditor`（原 `_M`）。
7. 创建 `src/input/MultiPlatformInput.js`：
   - 提供全平台统合外观门面与多设备动态切换调度器 `MultiPlatformInputCoordinator`。\n   - 保持 100% 向后兼容别名桥接（`SC`, `XC`, `ib`, `_M`, `io`, `BC`, `Rf`, `UC`, `qC`, `Li`, `Hi`, `TC`, `RC`, `Pf`, `PC`, `OA`, `Hd`, `$C`, `Ks` 等）。
8. 创建测试套件 `tests/input_subsystem.test.js`：涵盖配置存取、按键映射、设备识别、控制器读取及触控布局数学，全部 7 组测试用例 100% 通过。
9. 重构 `src/game/CarSoccerEngine.js`：移除 2,178 行内联高混淆输入与布局编辑代码，替换为现代 ES Module 导入。
10. **缺陷修复与别名补齐 (Bugfix)**：修复启动实例化设置面板 `SettingsSheet` (`BM`) 时因缺失 `detectControllerType` (`Rh`) 与 `formatAxisName` (`Yo`) 别名导致的 `ReferenceError: Can't find variable: Rh` 运行时白屏崩溃问题；并在 `tests/input_subsystem.test.js` 中扩充了手柄品牌识别与轴名格式化验证。

### 阶段五：比赛状态机与 RLBot 强化学习智能体解耦（✅ 已落地）
1. 创建 `src/game/MatchStateMachine.js`：
   - 抽离高精度 120Hz 比赛状态机 `MatchStateMachine`（原 `VM`），完整支持 5 分钟常规赛、开球 321 倒计时、进球 3 秒缓冲回放、触地终场死球裁决（零秒绝平判定）以及金球加时赛（Golden Goal Sudden Death Overtime）。
   - 收敛比赛模式常量与阶段常量（`MATCH_MODES`, `MATCH_PHASES`, `DEFAULT_MATCH_STATE` / `qM`）。
   - 提供时间格式化工具函数 `formatMatchTime(seconds, ceil)`（原 `sm`）。
2. 创建 `src/ai/RLBotAgent.js`：
   - 收敛 3 大竞技级 Bot 元数据配置表 `BOT_POLICIES`（`seer`, `necto`, `nexto`，原 `pl`）与策略检索函数 `getBotPolicy`（原 `JA`）。
   - 解耦 RocketSim 控制量序列化与反序列化算法（`encodeCarControls` / `Eg`, `decodeCarControls` / `ed`）。
   - 抽离 Nexto 90 项离散动作决策空间表 `NEXTO_ACTION_TABLE`（原 `Am`）与极速 Speed-flip 开球动作机 `getNextoKickoffControls`（原 `XM`）。
   - 抽离三大 ONNX 模型适配器（`NextoAdapter` / `JM`, `NectoAdapter` / `KM`, `SeerAdapter` / `ZM`）以及模型张量输入构造器（`buildNextoObservation` / `WM`, `wrapTensorInputs` / `lm`）。
   - 封装 `RLBotAgent`（原 `QM`）统一调度门面，集成 ONNX Web Worker 调度、超时重试与自适应降级至智能启发式 AI（`heuristicDecide`）。
   - 抽离 Bot 选型持久化存储 `botSettingsStore`（原 `dm`）。
3. 创建 `src/ui/MatchDialog.js`：
   - 抽离比赛控制面板与人机难度选择弹窗 `MatchDialog`（原 `$M`）。
   - 集成实时比分板 HUD、动态开球/进球/加时播报横幅以及全平台键鼠/手柄（PlayStation/Xbox）焦点无缝导航。
4. 创建单元测试套件 `tests/match_and_rlbot.test.js`：涵盖比赛全生命周期、开球与倒计时判定、加时赛流转、控制量编解码、Nexto 开球序列、三种 Bot 适配器张量结构、Worker 离线启发式保底与全套兼容别名，4 大测试集 100% 通过。
5. 重构 `src/game/CarSoccerEngine.js`：精简移除 835 行内联混淆实现，以干净别名桥接，消除 TDZ 风险。
6. **缺陷修复与别名补齐 (Bugfix)**：修复启动实例化比赛面板 `pe = new $M(an, ...)` 时因 `CarSoccerEngine.js` 导入遗漏 `$M` 别名导致的 `ReferenceError: Can't find variable: $M` 运行时白屏崩溃问题；在 `CarSoccerEngine.js` 头部补齐 `$M` 导入并在 `tests/match_and_rlbot.test.js` 中扩充别名防漏与实例化校验。

### 阶段六：全局设置面板与主题管理器解耦（✅ 已落地 Part 1）
1. 创建 `src/ui/ThemeManager.js`：
   - 抽离视觉主题管理器：支持 Realistic（写实物理材质、微光车漆与现代 HUD）与 Arcade（卡通街机高饱和材质与活泼 UI）双模式流转。
   - 收敛主题存储器 `themeSettingsStore`（原 `I0`，存储键 `car-soccer.theme.v1`）与主题列表 `THEMES`（原 `dl`）、默认值 `DEFAULT_THEME`（原 `Gh`）。
   - 提供响应式主题订阅机制 `onThemeChange(callback)`（原 `uo`）、主题设置器 `setTheme(theme, options)`（原 `qs`）、当前主题检索器 `getTheme()`（原 `tr`）以及 DOM 数据属性同步器 `applyThemeToDocument()`（原 `L0`）。
2. 创建 `src/ui/SettingsSheet.js`：
   - 抽离游戏全局综合设置抽屉弹窗 `SettingsSheet`（原 `BM`），统一管理 6 大功能模块（Camera / Controls / Graphics / Audio / Training / Diagnostics）。
   - 相机系统调谐（Camera）：解耦视野 `fov`、跟随距离 `distance`、高度 `height`、俯仰仰角 `angleDeg`、刚度 `stiffness`、旋转速度 `swivelSpeed`、过渡速度 `transitionSpeed`、冲击镜头震动 `cameraShake` 与反向旋转 `invertSwivel`。
   - 控制系统调谐（Controls）：整合按键映射捕捉、手柄死区与触发器阈值微调、摇杆轴反转、TouchControls 触控布局设计器 `TouchLayoutEditor` 与输入设备热插拔适配。
   - 画面系统调谐（Graphics）：集成主题切换、帧率上限锁定（`limitFps`, `maxFps` 60~240 FPS）、动态分辨率内插比例缩放（`renderScale` 25%~100%）、球场外围建筑细节剔除（`showStadium`）以及后台低功耗挂起模式（`Stop Rendering`）。
   - 音频系统调谐（Audio）：无缝对接 `GameAudioSubsystem`，提供主音量、引擎声浪与推进爆发音量实时映射。
   - 练习规则调谐（Training）：提供进球重置关闭 `disableGoalReset`、无限气量 `boostOption`、车体物理包围盒碰撞箱轮廓 `showCarHitbox` 与足球轨迹线预测器面板呼出。
   - 性能诊断监控（Diagnostics）：对接 PerformanceProfiler，控制 FPS 帧率计数器、帧耗时统计（p50/p95/p99）、时间细分消耗（Sim/Scene/Camera/Render）以及物理仿真降频丢步监控。
   - 完备的跨平台手柄（Xbox/PlayStation）菜单 D-Pad 与肩键平滑穿梭导航（`startPadNav`, `pollPadNav`, `stepTab`）。
3. 补充 Phase 6 完整单元测试套件 `tests/settings_and_theme.test.js`：覆盖主题变更订阅、全量配置项校验、范围限制与默认值恢复、UI 生命周期及别名兼容性，测试集 100% 通过。
4. 重构 `src/game/CarSoccerEngine.js`：移除 1,132 行内联混淆实现，以规范别名无损接入，消除 TDZ 风险。

### 阶段六（续）：车库展示台与车辆选择弹窗解耦（✅ 已落地 Part 2）
1. 创建 `src/ui/GarageDialog.js`：
   - 抽离标准车辆碰撞盒规格表 `HITBOX_PRESETS`：严格对齐上游 RocketSim C++ 核心（`Sim/Car/CarConfig/CarConfig.h`），包含 Octane、Dominus、Breakout、Hybrid、Batmobile (Plank)、Merc 六大标准物理盒尺寸（length/width/height）与轴距质心偏移（forward/up）。
   - 抽离程序化车身线框/实体构建器 `createWhiteboxCarModel(presetId, teamColor, three)`：根据 Hitbox 规格自动构建 6 面独立物理材质网格，车头为队伍色、车尾白标朝向指示，附带外廓线段高亮 `LineSegments`。
   - 抽离车身外观存储器 `garageSettingsStore`（原 `Qh`，键名 `car-soccer.display-settings.v1`）、支持车型列表 `CAR_VISUAL_IDS`（原 `kM`）与车型选项卡 `CAR_VISUAL_OPTIONS`（原 `Fc`）。
   - 抽离 3D 展台离屏渲染器 `GarageTurntable`（原 `HM`）：基于 WebGLRenderer、RoomEnvironment 与 PMREM 独立舞台离屏渲染旋转车模，支持多主题实时编译预热与 2D Canvas 绘制同步。
   - 抽离车库选择弹窗 `GarageDialog`（原 `UM`）：提供车库触发 Tab 按钮、九宫格车模卡片展示、双轴手柄 D-pad / 摇杆平滑焦点穿梭导航（原 `xs`）、键盘左右键快速切换及车型热装配。
   - 提供解耦依赖注入机制 `setGarageThreeContext` 与 `setGarageModelLoaders`，消除模块与游戏主循环外部闭包耦合。
2. 编写 Phase 6 Part 2 单元测试套件 `tests/garage_dialog.test.js`：
   - 验证 6 大 Hitbox 规格几何参数与 RocketSim 物理定义 100% 吻合。
   - 验证 LocalStorage 读写防腐与非法车型回退机制。
   - 验证程序化白盒模型尺寸、材质索引与偏移装配正确性。
   - 验证 3D 展台生命周期（init, attach, preload, start, stop, draw）。
   - 验证弹窗 DOM 结构、手柄方向键切换与卡片装配。
   - 验证所有向下兼容别名（`HM`, `UM`, `HITBOX_PRESETS`, `createWhiteboxCarModel`, `kM`, `Fc`, `Qh`, `xs`）。
3. 重构 `src/game/CarSoccerEngine.js`：
   - 移除 460 余行内联混淆实现，通过解耦模块无损接入。
   - 通过 `node --check` 语法校验与全部 6 大测试套件 100% 验收。

### 阶段七（Part 1）：动态追踪相机系统解耦（✅ 已落地）
1. 模块化重构 `src/camera/CameraController.js`：
   - 深入逆向与还原 RocketSim C++ 视图步进内核（`stepView` / `resetView`）的 32 槽位 Float64 状态输入结构（`CAMERA_INPUT_INDICES`），涵盖帧间隔 `dt`、`ballCam` 开关、赛车位置四元数（`carPos`/`carQuat`）、球体世界坐标（`ballPos`）、状态位掩码 `flags`（`onGround` / `groundNormal` / `velocity` / `supersonic`）、动态相机参数（`fov`, `distance`, `height`, `angleDeg`, `stiffness`, `transitionSpeed`）以及手柄/键鼠视线偏转（`lookX`, `lookY`, `swivelSpeed`, `invertSwivel`）。
   - 严格映射 42 维全局缓冲区输出字段：相机位置 `CAMERA_POS_OFFSET` (32..34)、观察朝向单位向量 `CAMERA_DIR_OFFSET` (35..37)、相机上向量 `CAMERA_UP_OFFSET` (38..40) 以及动态超音速/冲刺视野缩放 `CAMERA_FOV_OFFSET` (41)。
   - 实现无 WASM 环境下的优雅纯 JS 几何兜底（`stepFallbackView`），确保在单元测试与降级模式下平稳运行。
   - 提供优雅的三维上下文依赖注入机制 `setCameraThreeContext`，支持无缝桥接内联 Three.js 实例与独立 `THREE` 实例。
   - 导出全套向后兼容别名：`export { CameraController as cw, CAMERA_INPUT_SIZE as Aw, CAMERA_POS_OFFSET as Sc, CAMERA_DIR_OFFSET as wc, CAMERA_UP_OFFSET as Mc, CAMERA_FOV_OFFSET as lw }`。
2. 单元测试验收 `tests/camera_subsystem.test.js`：
   - 验证 6 项核心测试集（缓冲区布局、生命周期与 Ball Cam 切换、32 槽位输入序列化与内核调用、几何兜底解算、窗口重置、向后兼容别名），100% 通过。
3. 主引擎解耦接入 `src/game/CarSoccerEngine.js`：
   - 引入 `CameraController` 及别名，注入 `PerspectiveCamera` 与 `Vector3` 上下文。
   - 移除内联的混淆 `class cw` 与 `const Aw = 32, Sc = 32, wc = 35, Mc = 38, lw = 41;`。
   - 达成零性能损耗、零回归（`node --check` 与 7 大测试套件 17 项测试 100% PASS）。

### 阶段七（Part 2）：视觉特效与后处理渲染通道解耦（✅ 已落地）
1. 模块化抽取特效与后处理通道至 `src/effects/`：
   - `src/effects/BoostBloom.js`（原 `fw`）：多级渐进双向滤波辉光（4 级双线性降采样与帐篷滤波器升采样），精确还原车载喷气尾焰与超音速大气晕光。
   - `src/effects/FlipResetVisual.js`（原 `xw`）：翻滚重置视觉提示系统，支持街机八角星环（`_w`）与拟真半球冲击波（`Jp`）多主题渲染，集成 8 粒子火花爆发动效与音效触发生命周期。
   - `src/effects/SupersonicSpeedLinesPass.js`（原 `Zw` 与 `Yw`）：基于 80 实例线段几何体的全屏后处理流线通道，结合视锥投影矩阵、摄像机姿态四元数取逆与车速矢量解算动态空间拉伸流线。
   - `src/effects/index.js`：统一导出模块与全套向后兼容别名（`fw`, `Bc`, `Jn`, `Up`, `hw`, `dw`, `uw`, `qp`, `xw`, `_w`, `Ew`, `yw`, `Jp`, `mw`, `Vp`, `gw`, `Wp`, `ys`, `Yw`, `Zw`）。
2. 单元测试验收 `tests/effects_subsystem.test.js`：
   - 验证 6 项测试集（BoostBloom 常量/生命周期/尺寸自适应/销毁、FlipResetVisual 常量/星形几何体生成/火花粒子更新/序列号重置触发、SupersonicSpeedLinesPass 亚音速与超音速平滑阻尼插值切换、EffectComposer Pass 协议适配与生命周期验证），100% 通过。
3. 主引擎解耦接入 `src/game/CarSoccerEngine.js`：
   - 引入三维上下文注入接口（`setBoostBloomThreeContext`, `setFlipResetThreeContext`, `setSpeedLinesThreeContext`），实现零循环依赖。
   - 移除内联约 500 行混淆着色器与类定义，补齐 `SpeedLinesEffectPass` 的 `setSize` / `dispose` 规范接口，并在 `EffectComposer` 处增加防御性调用。
   - `node --check` 与全量 8 大测试套件 23 项测试 100% 验收通过。

### 阶段七（Part 3）：三维球场世界与车辆实体解耦（🔄 进行中）
1. 模块化抽取球场周边实体与特效通道至 `src/entities/`（✅ Step 1 已落地）：
   - `src/entities/BallLocatorArrow.js`（原 `bS`）：非球心锁定相机（Ball Cam 关闭）下的 3D 箭头导航系统，支持与球体动态测距（100~10000 码）、缓动平移插值、四元数姿态对齐与软阴影清晰光晕（`yS`）。
   - `src/entities/DemolitionEffect.js`（原 `nS`）：车辆被撞毁（Demoed）时的瞬态爆炸与烟雾粒子系统，包含双层 Shader（烟雾羽流与中心闪爆）、真实/街机双主题湍流噪声、高光内衬与黄金角散射分布。
   - `src/entities/BoostPadSystem.js`：解耦 34 颗 RocketSim 喷气补给垫（6 大 28 小）的实体拓扑、模型加载挂载、网格克隆与双缓冲材质替换，以及离线物理状态缓冲区（偏移量 `ro`）同步。
   - `src/entities/index.js`：统一导出模块与全部向后兼容别名。
2. 单元测试验收 `tests/entities_subsystem.test.js`：
   - 包含 4 项测试用例，覆盖指示箭头测距更新、自毁烟雾生命周期与状态切换、补给垫几何体生成与状态轮询，100% 通过（全量 9 大测试套件 27 项测试全部通过）。
3. 主引擎解耦接入 `src/game/CarSoccerEngine.js`：
   - 引入三维上下文注入接口（`setBallLocatorThreeContext`, `setDemolitionThreeContext`, `setBoostPadThreeContext`）。
   - 移除内联约 300 行混淆类与着色器，`node --check` 语法校验通过。
4. 下一步拆分计划（⏳ Step 2）：
   - 拆分 `SpeedTrail`（原 `pS`，足球超速拖尾粒子带）。
   - 拆分 `ArenaWorld`（原 `ow`，球场主场景与赛车悬挂动画）。

### 阶段八：Three.js 内核外部化与启动主循环现代化（⏳ 待实施）
- 目标：将内联的 1.7 万行 Three.js r185 替换为外部 `import * as THREE from 'three'`，彻底消除 60% 文件冗余，并将 `dB()` 启动器与 `wt()` 渲染循环现代化封装为 `GameEngine.js`。
