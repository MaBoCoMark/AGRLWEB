# Car Soccer 核心技术架构与二次开发手册 (Architecture & Engineering Guide)

本文档是本项目**唯一权威的架构反混淆指南与二次开发手册**。
针对原版编译打包产物 `CarSoccerEngine.js`（约 2.9 万行），本文档完整揭示其 14 个核心子系统、符号反混淆字典、物理内存布局及未来 5 大特性的精确扩展方案。

---

## 1. 为什么不宜直接对混淆产物进行“盲目一刀切拆分”？

`CarSoccerEngine.js` 是由 Rollup/Vite 从原始多文件 TypeScript 工程编译打包生成的。打包器在构建时执行了深度的**作用域拍平 (Scope Hoisting)** 与 **高频单双字母混淆**：

1. **混淆变量的跨作用域穿透 (Closure Mangling)**：
   例如设置面板类 `BM` 单独就直接读写了外部 49 个全局混淆标识符（如 `Vt`, `_r`, `jr`, `cl`, `Na`, `MM`, `Pr`, `im`, `Yh`, `uA`, `EM`, `yM`, `Kd`, `CM`, `bM`, `Zh`, `SM`, `wM`, `nm`, `rm` 等）。强行切分为 14 个物理文件，需要跨文件暴露与引入数百个单双字母变量，极易引发 **TDZ (Temporal Dead Zone - 变量在初始化前被访问)** 或循环依赖导致白屏崩溃。
2. **“拆了仍不可读”的悖论 (Readability Paradox)**：
   若仅做物理切分而不做符号语义还原，开发者在 `ArenaWorld.js` 中看到的仍然是 `class ow`、`class cw`、`const s = new CC(n)` 等 4,800 行单字母代码，排查变量来源反而因跨文件引用变得更加晦涩。
3. **现代工业级二开范式 (Recommended Engineering Paradigm)**：
   - **保持核心驱动稳定闭环**：底层 120Hz RocketSim 物理步进与 Three.js PBR 渲染管线高度紧密耦合，保持其内联闭环可确保绝对零性能损耗与零回归风险。
   - **符号反混淆地图导航**：通过本文档的精准行号与符号映射表，秒级定位修改点。
   - **外围新特性独立模块化 (Decoupled Extension)**：后续所有新增特性（如速度表、白模碰撞箱、多球控制器）均在外部建立纯净、语义化命名的 ES 模块（如 `src/ui/Speedometer.js`），在主循环仅以 1~2 行只读 API 接入，实现真正的解耦开发。

---

## 2. 十四核心子系统深度剖析与行号索引 (System Breakdown)

整个 `CarSoccerEngine.js`（共 29,257 行）精确划分为以下 14 个子系统：

| 子系统编号 | 系统名称 (语义化类名) | 原始代码行段 | 核心职责与关键符号 |
| :---: | :--- | :---: | :--- |
| **01** | **ThreeCore** (三维图形内核) | 行 1 ～ 17824 (17,824行) | Three.js r185 引擎库、数学库 (`Vector3`, `Quaternion`, `Matrix4`)、PBR材质、着色器、`EffectComposer` 与后期辉光通道 (`RenderPass`, `OutputPass`)。**占全文件体积 61%**。 |
| **02** | **PhysicsEngine** (RocketSim 物理) | 行 17825 ～ 17989 (165行) | `yC` (RocketSim Wasm 胶水层：装载 16 个网格、加车 `addCar`、碰撞、进球 `pollGoal`)；`CC` (120Hz 物理定步长插值器，计算 Lerp alpha)。 |
| **03** | **ClockScheduler** (渲染时钟) | 行 17990 ～ 18085 (96行) | `bC` (动态 RAF 渲染时钟调度、屏幕刷新率 Hz 测量、动态帧率限制 60/120/144/240)。 |
| **04** | **InputSystem** (全平台控制输入) | 行 18086 ～ 19879 (1,794行) | `SC` (键鼠输入与按键绑定重映射)、`XC` (手柄 Gamepad 监听与死区滤波)、`ib` (触控虚拟摇杆与屏幕按钮)、`_M` (移动端触控布局编辑器)。 |
| **05** | **ArenaWorld** (球场与赛车实体) | 行 19880 ～ 24722 (4,843行) | `ow` (三维场景总控：载入 `stadium.glb`、`ball.gltf`、34 个喷气充能垫、车身高模、车轮悬挂旋转与粒子尾焰)。 |
| **06** | **CameraManager** (动态相机系统) | 行 24723 ～ 25156 (434行) | `cw` (跟随相机与球心锁定视角 Ball Cam；实现相机弹簧阻尼、高度、FOV 速度衰减、穿墙规避与屏幕震动 Camera Shake)。 |
| **07** | **AudioEngine** (声效与引擎合成器) | 行 25157 ～ 25522 (366行) | `Lw` (Web Audio API 节点网络总线)、`tm` (基于 RPM 动态调频调速的程序化引擎声音频合成器)、`Sw` (轮胎摩擦声)、`kw` (足球/墙体撞击声)。 |
| **08** | **SettingsSheet** (系统设置弹窗) | 行 25523 ～ 27075 (1,633行) | `BM` (系统设置大面板：Camera, Controls, Graphics, Audio, Training, Diagnostics 六大分页、Stop Rendering 功耗开关、大屏自动 50% 缩放)。 |
| **09** | **GarageDialog** (车库与 3D 展台) | 行 27156 ～ 27479 (324行) | `UM` (车辆选择弹窗) 与 `HM` (独立 3D 旋转展示台：提供车漆颜色、贴花材质与车辆属性实时切换)。 |
| **10** | **MatchDialog** (比赛与状态机) | 行 27480 ～ 27897 (418行) | `$M` (比赛创建与机器人难度选择面板) 与 `VM` (比赛状态机：Kickoff 开球、Playing 对战、Goal 进球倒计时、Ended 比赛结算)。 |
| **11** | **BotAgent** (强化学习机器人) | 行 27898 ～ 28295 (398行) | `QM` (ONNX Runtime 神经网络推理驱动的 RL 智能体，支持 Nexto、Necto、Seer 策略与启发式开球)。 |
| **12** | **BoostGauge** (喷气表盘 HUD) | 行 28296 ～ 28340 (45行) | `nB` (右下角 SVG 矢量环形喷气表盘、数值文字读数、超音速闪烁与无限喷气指示)。 |
| **13** | **StatusOverlay** (性能监控面板) | 行 28341 ～ 28706 (369行) | `aB` (左上角状态监控 HUD：默认极简 FPS / 刷新率独立展示) 与 `iB` (帧耗时采样器，统计 p50/p95/p99 及最差帧)。 |
| **14** | **GameOrchestration** (启动与主循环) | 行 28710 ～ 29257 (548行) | `dB` (引擎异步启动主流程、资产审计、模块组装、事件绑定) 与 `wt` (主渲染循环：物理驱动、状态同步、功耗阻断与帧呈现)。 |

---

## 3. 核心内存布局与物理状态映射 (RocketSim Shared Memory)

RocketSim 通过一个扁平的 `Float32Array`（由 C++ Wasm 堆内存共享）进行状态同步，状态偏移常量索引如下：

```javascript
// 全局状态偏移 (ht)
const ht = {
  TICK: 0,        // 当前物理仿真 Tick
  GOAL: 1,        // 进球标记 (0: 无, 1: 蓝队进球, 2: 橙队进球)
  NUM_CARS: 2,    // 场上有效车辆总数 (默认为 1，比赛开启后增加为 2，支持扩充至 6)
  NUM_PADS: 3,    // 喷气充能垫总数 (34)
  BALL: 4,        // 足球状态起始偏移 (共 18 个 Float: POS[3], ROT[3], VEL[3], ANG_VEL[3] 等)
  CARS: 22        // 车辆数据数组起始偏移
};

// 每辆车数据跨度为 51 个 Float (ln = 51)
// 访问第 i 辆车数据：const carOffset = ht.CARS + i * ln;
const ye = {
  POS: 0,                     // 世界坐标 X, Y, Z
  FWD: 3,                     // 车头朝向单位向量 X, Y, Z
  RIGHT: 6,                   // 车身右向单位向量 X, Y, Z
  UP: 9,                      // 车顶朝向单位向量 X, Y, Z
  VEL: 12,                    // 线速度 X, Y, Z (单位: uu/s)
  ANG_VEL: 15,                // 角速度 (弧度/秒)
  BOOST: 18,                  // 剩余喷气量 (0.0 ~ 100.0)
  ON_GROUND: 19,              // 是否接触地面 (0 或 1)
  SUPERSONIC: 20,             // 是否进入超音速 (0 或 1)
  DEMOED: 21,                 // 是否撞毁爆车 (0 或 1)
  HAS_FLIP_OR_JUMP: 22,       // 是否拥有翻滚/二段跳机会
  IS_BOOSTING: 23,            // 是否正在喷气
  IS_FLIPPING: 24,            // 是否正在执行翻滚空翻
  FLIP_RESET_SERIAL: 25,      // 获得翻滚重置的序列号
  WHEELS: 26,                 // 4 个轮子的贴地与悬挂数据
  GROUND_NORMAL: 38,          // 接地表面法向量
  JUMP_SERIAL: 41,            // 起跳计数
  DODGE_SERIAL: 42,           // 空翻翻滚计数
  DOUBLE_JUMP_SERIAL: 43,     // 二段跳计数
  WHEEL_IMPACT_SERIAL: 44,    // 悬挂接地撞击序列号
  WHEEL_IMPACT_SPEED: 45,     // 接地撞击速度
  BALL_HIT_SERIAL: 46,        // 击球次数序列号
  BALL_HIT_SPEED: 47,         // 击球瞬间相对速度
  BALL_WORLD_IMPACT_SERIAL: 48,// 球体撞墙/地面序列号
  BALL_WORLD_IMPACT_SPEED: 49, // 球体撞墙撞击强度
  BALL_WORLD_SURFACE: 50      // 球体撞击表面材质类型
};
```

---

## 4. 五大规划特性的工程实施蓝图 (Implementation Blueprints)

### ① 速度表 (Speedometer)
- **读取点**：在主渲染循环 `wt(W)`（行 29150 附近）获取玩家第 0 辆车速度向量：
  ```javascript
  const Nt = ht.CARS + r * ln;
  const vx = s.currState[Nt + ye.VEL];
  const vy = s.currState[Nt + ye.VEL + 1];
  const vz = s.currState[Nt + ye.VEL + 2];
  const speedUu = Math.hypot(vx, vy, vz); // 0 ~ 2300 uu/s
  const speedKmh = Math.round(speedUu * 0.036); // 换算为公里/小时 (超音速对应 ~80 km/h)
  ```
- **UI 挂载**：在 `src/ui/Speedometer.js` 中创建独立 SVG/Canvas 表盘，在 `dB()` 中初始化，每帧 `speedometer.draw(speedKmh)`。

### ② 支持最多 6 名玩家 (3v3 Multi-Car)
- **物理生成**：在 `PhysicsEngine` (`yC.init`) 或比赛开始时，循环调用：
  ```javascript
  // 蓝队 3 辆车 (team 0), 橙队 3 辆车 (team 1)
  const cars = [
    n.addCar(0, 'default'), n.addCar(0, 'default'), n.addCar(0, 'default'),
    n.addCar(1, 'default'), n.addCar(1, 'default'), n.addCar(1, 'default')
  ];
  ```
- **模型渲染**：`ow.update` 遍历 `for(let i = 0; i < n.state[ht.NUM_CARS]; i++)`，以 `ht.CARS + i * ln` 分别更新 6 辆车网格的位姿。

### ③ 独立专属足球 (Per-player Soccer Ball)
- **材质区分**：在 `ow.loadBall()` 中创建两套贴图：
  - 蓝队纹理：`/assets/arena/ball/ball_blue.png`
  - 橙队纹理：`/assets/arena/ball/ball_orange.png`
- **视角锁定绑定**：`cw.camera` 的球心追踪目标由写死的唯一足球位置解耦为追踪特定球员分配的足球实例。

### ④ 车库新增 Plank 和 Hybrid 碰撞箱 (白模网格预设)
- **碰撞箱尺寸**：RocketSim 原生包含精确配置：
  - **Plank**：长 128.82, 宽 84.67, 高 29.39
  - **Hybrid**：长 127.02, 宽 82.19, 高 34.16
- **白模网格构建**：
  ```javascript
  const plankGeom = new BoxGeometry(84.67, 29.39, 128.82);
  const whiteboxMat = new MeshStandardMaterial({ color: 0x4aa3ff, wireframe: false, roughness: 0.4 });
  const plankMesh = new Mesh(plankGeom, whiteboxMat);
  ```
- **车库挂载**：在 `UM`（车库弹窗）中追加 `plank` 与 `hybrid` 单选卡片，点击即可在 `HM` 3D 展台查看半透明高亮白模。

### ⑤ 声效增强与自研音频二开 (Audio Engine Expansion)
- **音频架构挂载点**：`Lw`（音频总线）拥有原生的 `AudioContext`。
- **扩展方式**：直接接入自定义 `ConvolverNode`（混响器，用于模拟大型室内球场的自然混响）、`StereoPannerNode`（根据球体在视口中的 X 坐标实时计算左右声道立体声声相）及引擎增压进气泄压阀（Blow-off Valve）拟真合成器。
