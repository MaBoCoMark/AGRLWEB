# Car Soccer 核心技术架构手册 (Architecture & Engineering Guide)

本文档面向后续接手此项目的核心开发者，详细解析前端引擎各子系统的架构、数据流与模块映射关系。

---

## 1. 核心子系统架构概览

游戏运行时的核心骨架由以下 6 个主要子系统构成：

```
+-------------------------------------------------------------------------+
|                              Game Engine Loop                           |
|  +--------------------+   120Hz Tick   +-----------------------------+  |
|  | Input Subsystem    | -------------> | RocketSim C++ Wasm Physics  |  |
|  | (SC: Keys / Mouse) |                | (16 Mesh Chunks, Suspension)|  |
|  | (XC: Gamepad)      |                +-----------------------------+  |
|  | (ib: Mobile Touch) |                               |                 |
|  +--------------------+                               v                 |
|                                         +-----------------------------+ |
|                                         | Physics Synchronizer (CC)   | |
|                                         | (Lerp State Interpolation)  | |
|                                         +-----------------------------+ |
|                                                       |                 |
|            +------------------------------------------+                 |
|            v                                          v                 |
|  +-----------------------+              +----------------------------+  |
|  | Three.js World (ow)   |              | Authentic DOM UI & HUD     |  |
|  | - Stadium (stadium.glb|              | - Free Play Default (VM)   |  |
|  | - Octane / Dominus    |              | - Garage Dialog (UM)       |  |
|  | - Ball Cam System (cw)|              | - Play Menu / Bot ($M)     |  |
|  | - Audio Manager (Lw)  |              | - Settings Sheet (BM)      |  |
|  +-----------------------+              | - Boost Meter Arc (nB)     |  |
|                                         +----------------------------+  |
+-------------------------------------------------------------------------+
```

---

## 2. 关键核心类与反混淆对照表

在 `src/game/CarSoccerEngine.js` 中，核心类对应关系如下：

### 2.1 物理与仿真层 (Physics & Simulation)
| 原始类/对象 | 功能与职责 |
| :--- | :--- |
| **`yC`** | **RocketSim 物理外壳门面**。负责分配 WASM 内存、装载 16 个碰撞体分块 (`manifest.json`)、调用 `_physics_init`、创建赛车实体 (`addCar`)、读取状态指针与重置开球点 (`resetKickoff`)。 |
| **`jC`** | **WebAssembly 加载器**。基于 Emscripten 封装的 RocketSim C++ 模块初始化函数。 |
| **`CC`** | **120Hz 状态插值器**。以 120Hz 固定物理帧与 requestAnimationFrame 渲染帧进行累加与线性插值 (Lerp)，保证高帧率下平滑运动且无微卡顿。 |
| **`bC`** | **渲染时钟调度器**。负责测量帧间隔、限制最大 FPS (60/120/144/240) 并调度每一帧渲染。 |

### 2.2 视图与渲染层 (Three.js Graphics)
| 原始类/对象 | 功能与职责 |
| :--- | :--- |
| **`ow`** | **三维世界总控**。负责加载 `stadium.glb` 大球场高模、`ball.gltf` 足球、车辆模型与 34 个大/小充气喷气垫；管理动态光影、车辆尾焰与撞击粒子。 |
| **`cw`** | **动态摄像机系统**。包含第三人称跟随视角与球心锁定视角 (Ball Cam)；计算相机弹簧阻尼、高度、FOV 衰减与穿墙规避。 |
| **`HM`** | **车库 3D 展台渲染器**。在 Garage 弹窗中开辟离屏或子画布，以平滑旋转的展示台实时渲染选中的车辆 3D 模型。 |

### 2.3 状态机与游戏规则 (Game State Machine)
| 原始类/对象 | 功能与职责 |
| :--- | :--- |
| **`VM`** | **游戏模式状态机**。管理当前游戏处于 `freeplay`（自由训练场）还是 `match`（人机对抗）；记录比分 (`blueScore`, `orangeScore`)、比赛剩余秒数 (`remainingSeconds: 300`)、加时赛及进球庆祝状态。 |
| **`QM`** | **AI 强化学习控制器**。通过 Web Worker 加载 ONNX Runtime，运行 Nexto、Necto、Seer 神经网络策略，驱动对手机器人行动。 |

### 2.4 用户交互与界面组件 (User Interface)
| 原始类/对象 | 功能与职责 |
| :--- | :--- |
| **`BM`** | **系统设置大面板 (Settings Sheet)**。管理 Camera、Controls、Graphics、Audio、Training、Status 六大标签页及其持久化存储。 |
| **`UM`** | **车辆车库面板 (Garage Dialog)**。支持换装 Octane、Dominus (Flat Car)、Realistic Car，提供独立车辆属性。 |
| **`$M`** | **比赛/对战面板 (Play Menu Dialog)**。控制 1v1 人机比赛启动、机器人选择、难度切换、放弃比赛返回自由训练场。 |
| **`nB`** | **矢量弧形喷气表 (Boost Gauge)**。计算弧长与百分比刻度，执行无限喷气或扣减闪烁动效。 |
| **`SC` / `XC` / `ib`** | 分别为键盘鼠标监听器、手柄 Gamepad 监听器与移动端虚拟摇杆/触控按钮系统。 |

---

## 3. 内存布局与 RocketSim 状态解析

RocketSim 通过一个扁平的 `Float32Array` 共享物理状态缓冲区。状态偏移常量定义如下：

```javascript
const ht = {
  TICK: 0,        // 当前物理仿真 Tick
  GOAL: 1,        // 进球标记 (0: 无, 1: 蓝队进球, 2: 橙队进球)
  NUM_CARS: 2,    // 场上车辆总数
  NUM_PADS: 3,    // 喷气充能垫总数 (34)
  BALL: 4,        // 足球状态起始偏移 (18 个 Float: POS[3], ROT[3], VEL[3], ANG_VEL[3] 等)
  CARS: 22        // 车辆数据数组起始偏移
};

// 每辆车占用 51 个 Float (ln = 51)
const ye = {
  POS: 0,         // 位置 X, Y, Z
  FWD: 3,         // 正前方朝向向量 X, Y, Z
  RIGHT: 6,       // 右方朝向向量 X, Y, Z
  UP: 9,          // 上方朝向向量 X, Y, Z
  VEL: 12,        // 线速度 X, Y, Z
  ANG_VEL: 15,    // 角速度
  BOOST: 18,      // 剩余喷气量 (0.0 ~ 100.0)
  ON_GROUND: 19,  // 是否贴地 (0 或 1)
  SUPERSONIC: 20, // 是否处于音爆极速状态 (0 或 1)
  DEMOED: 21,     // 是否被撞毁爆车 (0 或 1)
  HAS_FLIP_OR_JUMP: 22 // 是否拥有二段跳/翻滚机会
};
```

---

## 4. 资产预检与无伪回退原则 (No Procedural Fallback)

1. **为什么坚决移除 Procedural Fallback**：
   伪物理回退只是一个极简的欧拉积分脚本，无法重现火箭车特有的双跳翻滚冲量（Dodge Impulse）、轮毂悬挂弹性、墙面行驶下压力与弹力摩擦。
2. **预检机制设计**：
   在 `dB()` 入口处通过 `checkRequiredAssets()` 异步发送 `HEAD` 请求校验：
   - 物理网格清单：`/assets/arena/collision/manifest.json`
   - 球场模型：`/assets/arena/stadium/stadium.glb`
   - 足球模型：`/assets/ball/ball.gltf`
   - 车辆模型：`/assets/game-car/model.gltf`
   若检测到 404 或未加载，直接在 `<div id="loading" data-state="error">` 呈现格式化错误指示，指引开发者运行 `python3 public/download_assets.py`。
