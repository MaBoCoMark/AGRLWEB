# Car Soccer Engine 反混淆与渐进式重构方案 (Deobfuscation & Modularization Roadmap)

> **原则**：“一点一点修，稳扎稳打，绝不冒进，步步验证”。  
> 本文档面向 Car Soccer 项目，基于对原版编译打包产物 `CarSoccerEngine.js`（约 3 万行）与 upstream C++ 物理引擎 [zealanL/rocketsim](https://github.com/zealanL/rocketsim) 的严格源码对照，制定全生命周期的反混淆、解耦与重构工程方案。

---

## 1. 现状剖析与“为什么必须渐进式修复”？

### 1.1 混淆的本质与历史教训
`dist_game/js/index-Dm9xG-kJ.js` 以及 `car_soccer_source/src/game/CarSoccerEngine.js` 是由 Rollup/Vite 打包器从多文件 TypeScript 工程构建出的单一产物。打包过程中：
1. **作用域拍平 (Scope Hoisting)**：将全部模块内联在顶层作用域，所有函数和类相互直接捕获外部局部变量。
2. **标识符高频混淆 (Identifier Mangling)**：核心类名（如 `yC`, `CC`, `bC`, `ow`, `cw`, `Lw`, `BM`, `UM`, `VM`, `QM`, `nB`, `aB`）和变量名（`Mt`, `ke`, `Fe`, `be`, `Rn`, `zn`）均被降维为单双字母。
3. **内联依赖 (Inlined Three.js)**：文件前 17,824 行（占总体积 61%）为完整打包的 Three.js r185，且内部所有导出类被混淆为单字母变量（例如 `Zd` = Vector3, `Yd` = Vector2, `jn` = Quaternion, `KA` = Matrix4）。

历史提交（如 `a8c6c76 AG refused to split car_soccer.JS`）表明：**盲目对 3 万行代码进行一刀切物理拆分，会直接触发 JavaScript TDZ (Temporal Dead Zone - 变量未初始化即被调用) 或循环引用异常，导致整个游戏白屏崩溃**。

### 1.2 成功的破局之道：外向内剥离 + 别名平滑过渡
正确且工业级可靠的重构范式为：
- **自底向上，逐模块拆分**：先解耦无外部闭包缠绕的基础底座（物理引擎、常量映射、时钟调度），再解耦外围独立 UI/音频，最后处理高度耦合的 3D 场景与相机。
- **保留向下兼容别名 (Backward-Compatibility Aliases)**：每个解耦后的独立 ES 模块既导出语义化类名（如 `RocketSimPhysicsEngine`），又重导出原混淆别名（如 `export { RocketSimPhysicsEngine as yC }`），确保未重构部分无缝运行，**实现 0 回归风险**。

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
| **05** | **喷气量弧形表盘 HUD**| `class nB` | `src/ui/BoostGaugeHUD.js` | ⏳ *阶段二* | 纯 DOM/SVG 渲染，监听 boost 浮点数 |
| **06** | **性能监控与帧耗时** | `class aB`, `class iB` | `src/ui/PerformanceOverlayHUD.js` | ⏳ *阶段二* | 极简与详情 FPS / p95 耗时视图 |
| **07** | **综合音效总线与合成**| `class Lw`, `Sw`, `kw`, `gameAudio` | `src/audio/GameAudioSubsystem.js` | ⏳ *阶段三* | Web Audio API、立体声空间音效、程序化轮胎/撞击声 |
| **08** | **全平台输入控制器** | `SC`, `XC`, `ib`, `_M` | `src/input/MultiPlatformInput.js` | ⏳ *阶段四* | 键鼠映射、Gamepad 轮询、移动端虚拟摇杆 |
| **09** | **车库与 3D 展台** | `class UM`, `class HM` | `src/ui/GarageDialog.js` | ⏳ *阶段五* | 车身切换 (Octane/Dominus)、涂装、独立离屏渲染展台 |
| **10** | **比赛与模式状态机** | `class VM`, `class $M` | `src/game/MatchController.js` | ⏳ *阶段五* | Kickoff 开球、321 倒计时、进球判定、加时赛判定 |
| **11** | **RL Bot 强化学习代理**| `class QM` | `src/ai/RLBotAgent.js` | ⏳ *阶段六* | ONNX Runtime Web Worker 推理策略 (Nexto, Necto, Seer) |
| **12** | **动态追踪相机系统** | `class cw` | `src/camera/CameraController.js` | ⏳ *阶段七* | 跟随相机、Ball Cam 球心锁定、穿墙防穿刺、镜头震动 |
| **13** | **三维球场与赛车世界**| `class ow` | `src/entities/ArenaWorld.js` | ⏳ *阶段七* | Three.js GLTF 载入、充能垫动效、悬挂车轮矩阵解算 |
| **14** | **Three.js 内核外部化**| 前 17,824 行混淆库代码 | `import * as THREE from 'three'` | ⏳ *阶段七* | 消除 60% 文件冗余，全面恢复标准 API 命名 |

---

## 4. 阶段实施蓝图 (Phased Implementation Blueprint)

### 阶段一：物理层与时钟调度器规范化（本次已落地）
1. 创建 `src/physics/RocketSimConstants.js`：定义严格与 C++ 源码一致的结构体偏移与物理常量。
2. 创建 `src/physics/RocketSimPhysicsEngine.js`：封装 RocketSim C++ WASM 胶水层，命名所有方法，添加 JSDoc。
3. 创建 `src/physics/PhysicsStateInterpolator.js`：将 120Hz 物理累加步进与状态插值独立封装。
4. 创建 `src/game/RenderClockScheduler.js`：将基于 MessageChannel 和 WebGL2 fenceSync 的时钟调度器解耦。
5. 更新 `src/physics/PhysicsManager.js`：使原有的空壳管理器变更为功能完整的统一门面导出层。
6. 重构 `src/game/CarSoccerEngine.js`：引入上述模块，删除内联的 270 余行混淆实现，以干净别名保障零回归。

### 阶段二：UI HUD 组件抽离（建议下一阶段执行）
- 目标：将 `nB`（喷气表盘 HUD，约 45 行）与 `aB`/`iB`（性能与帧率监控面板，约 370 行）抽取为独立模块：
  - `src/ui/BoostGaugeHUD.js`
  - `src/ui/PerformanceOverlayHUD.js`
- 收益：精简主文件 400 余行，使 HUD 的样式与逻辑完全可复用。

### 阶段三：音频子系统统一与空间化解耦
- 目标：整合 `Lw`（Web Audio 总线）、`tm`（电机合成器）、`Sw`（轮胎抓地声）、`kw`（撞击声）与 `gameAudio`（空间化音效管理器）：
  - `src/audio/GameAudioSubsystem.js`
- 收益：消除主渲染循环中繁杂的临时变量判断，实现声明式音效触发。

### 阶段四：输入子系统统一
- 目标：合并键鼠 (`SC`)、手柄 (`XC`)、移动触控 (`ib`) 与按键重映射编辑器 (`_M`) 至 `src/input/`。

### 阶段五：弹窗与比赛状态机模块化
- 目标：抽取 `SettingsSheet` (`BM`)、`GarageDialog` (`UM`/`HM`)、`MatchDialog` (`$M`) 与 `MatchStateMachine` (`VM`)。

### 阶段六：AI 智能体模块化
- 目标：抽取 `QM`（ONNX 神经网络推理调度）至 `src/ai/RLBotAgent.js`。

### 阶段七：Three.js 外部化与 ArenaWorld 解耦
- 目标：将内联的 1.7 万行 Three.js 替换为外部 `import * as THREE from 'three'`，彻底完成整个项目的现代工程化转型。
