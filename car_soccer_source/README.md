# Car Soccer (火箭车足球) - 现代化可扩展源码工程

本项目是对 `Car Soccer`（基于 WebAssembly 与 Three.js 的 3D 浏览器版火箭车足球游戏）进行逆向分析、代码解耦与现代化重构后的**完整可维护开发源码工程**。

原始仓库仅包含打包混淆后的 `dist_game` 单文件编译产物，且缺少了运行必需的外部资产（碰撞体、3D模型、音频、Service Worker 等），导致直接启动必然崩溃报错。

我们在 `/car_soccer_source` 目录下为您建立了一套**架构清晰、模块化、带完备双物理引擎容灾、易于二开新增功能**的代码工程。

---

## 目录结构

```
car_soccer_source/
├── index.html                   # 游戏入口 HTML
├── package.json                 # 项目依赖配置 (Three.js, Vite)
├── vite.config.js               # Vite 开发与打包构建配置
├── public/                      # 静态资源目录
│   ├── favicon.ico
│   ├── site.webmanifest         # PWA 应用配置
│   ├── game-sw.js               # PWA 离线缓存 Service Worker
│   └── images/                  # 游戏图标
├── src/                         # 游戏核心源码
│   ├── main.js                  # 应用引导启动入口
│   ├── constants/
│   │   └── GameConstants.js     # 球场尺寸、车辆规格、物理步长、状态索引常量
│   ├── physics/
│   │   ├── RocketSimWasm.js     # 独立提取的 RocketSim C++ 120Hz 仿真 WASM 核心
│   │   ├── PhysicsManager.js    # 统一物理门面控制器 (WASM / JS 动态智能路由)
│   │   └── ProceduralPhysicsFallback.js # 高性能纯 JS 街机物理引擎 (零依赖防崩保底)
│   ├── entities/
│   │   ├── CarEntity.js         # 赛车实体 (支持外载模型或内置高品质 Octane 程序化车体)
│   │   ├── BallEntity.js        # 足球实体 (经典足球纹理、地面投影光环、轨迹指示)
│   │   └── ArenaEntity.js       # 球场环境 (草坪条纹、球门网、透明防爆墙、34个大/小充气喷气垫)
│   ├── camera/
│   │   └── CameraController.js  # 第三人称跟随视角与球心锁定视角 (Ball Cam)
│   ├── input/
│   │   └── InputManager.js      # 多端输入管理 (键盘鼠标 / 手柄 Gamepad API / 移动端触控)
│   ├── audio/
│   │   └── SoundEffects.js      # Web Audio 动态程序化音效合成器 (引擎声浪、喷气、撞球、跳跃)
│   ├── ai/
│   │   └── BotController.js     # 人工智能对手 (支持 ONNX 强化学习模型与内置自适应启发式 AI)
│   ├── ui/
│   │   └── HUD.js               # 比赛界面 (比分牌、5分钟倒计时、加时赛、倒计时大字、喷气百分比环)
│   └── styles/
│       ├── game.css             # 游戏与 HUD 样式
│       └── original_fonts.css   # Lilita One 与 Archivo 字体定义
└── tools/
    └── download_assets.py       # 自动化一键外部资产下载器
```

---

## 整体诊断与缺失项详细报告

### 1. 为什么原始代码无法直接运行和修改？
- **代码状态**：原始工程只包含了打包压缩混淆后的单一 JS 文件（`index-Dm9xG-kJ.js`，1.78MB，所有类名与函数名均被混淆为 `yC`、`QM`、`bS`、`dB` 等单字），无法直接阅读和添加业务逻辑。
- **Service Worker 强依赖**：游戏启动入口调用 `cB()`，检测并注册 `/game-sw.js`。若缺失该文件或不在 HTTPS/SecureContext 下运行，启动直接抛错中止。
- **RocketSim 物理引擎阻塞**：游戏底层的 `RocketSim` 依赖二进制碰撞网格文件。启动时会请求 `/assets/arena/collision/manifest.json` 及其对应的网格分块文件，若缺失则立即报错 `Physics initialization failed — check collision meshes`，导致后续渲染循环无法挂载。
- **模型与音效缺失**：原包中所有车辆 GLTF、球体、音频 WAV、ONNX 权重文件均未存入 git 仓库中。

### 2. 详细缺失文件清单（共约 40+ 个外部资源）
| 类别 | 缺失文件路径 | 作用与影响 |
| :--- | :--- | :--- |
| **Shell & PWA** | `/game-sw.js`, `/site.webmanifest` | PWA 离线支持与离线通信消息通道 |
| **物理碰撞网格** | `/assets/arena/collision/manifest.json` 及分块 `.cmf` | RocketSim 构造球场凹凸三角网格的基础 |
| **球场与边框** | `/assets/arena/stadium/stadium.glb`<br>`/assets/arena/stadium/continuous-boundary.json`<br>`/assets/arena/stadium/bank-hex-*.png` | 官方大球场高模与环绕背景网格 |
| **赛车模型** | `/assets/game-car/model.gltf`<br>`/assets/flat-car/model.glb`<br>`/assets/realistic-car/details.glb` | Octane / Dominus / 写实赛车的三维几何体 |
| **足球模型** | `/assets/ball/ball.gltf`, `albedo.png`, `normal.png`, `material-mask.png` | 真实足球带凹凸贴图模型 |
| **AI 权重** | `/assets/worker-iFqqV1m9.js`<br>`/assets/bot/policy.onnx`<br>`/assets/bot/necto/policy.onnx`<br>`/assets/bot/seer/policy.onnx` | Nexto / Necto / Seer 强化学习机器人推理 |
| **音频资源** | `/assets/audio/boost/*.wav`<br>`/assets/audio/vehicle/*.wav`<br>`/assets/audio/impacts/*.wav`<br>`/assets/audio/engine/manifest.json` | 真实录制的引擎、撞击、跳跃音效 |

---

## 解决方案

### 方案一：一键下载官方高模与音频素材（推荐）
在能够正常访问外网的机器上（如您的个人电脑），直接执行本项目自带的自动化下载工具：
```bash
python3 tools/download_assets.py
```
该脚本会自动请求 `https://car-soccer.com` 的完整资源，并自动递归解析 `collision/manifest.json` 与 `engine/manifest.json`，把全部 3D 模型、音频和网格自动下载到 `public/assets/` 对应路径下。

### 方案二：无需下载素材，即开即玩（零依赖弹性引擎）
我们重构的代码具备**双模自动切换与全套程序化生成能力**：
1. **物理层**：`PhysicsManager` 初始化时会自动检测碰撞网格是否存在。若不存在，自动无缝启动内置的高性能纯 JS `ProceduralPhysicsFallback` 街机物理引擎，车辆驾驶、转向、单跳、双跳翻滚（Dodge Flip）、火箭喷气飞行、球体碰撞反弹、球门进球判定全部正常运作！
2. **视觉层**：内置了完整的 Octane 造型程序化车身、独立轮毂悬挂、喷气尾焰、草皮条带纹理、立体球门网与充气充能垫，完全不依赖外部 `.glb` 也能渲染出画面！
3. **音频层**：内置了纯 Web Audio API 合成器（基于振荡器根据车速实时变频的引擎声浪、带通滤波白噪声喷气声、撞球低频冲击与进球音爆），无需下载任何 `.wav` 文件即可发声！

---

## 如何运行项目

### 开发环境调试
在安装有 Node.js 的本地环境中执行：
```bash
cd car_soccer_source
npm install
npm run dev
```
开发服务器将默认在 `http://localhost:3000` 启动，支持代码热重载（HMR）。

### 静态服务器启动
如果不想安装 node 依赖，您也可以使用任何静态 Web 服务器直接启动（已在 `index.html` 中配置好了现代浏览器的 ESM 模块导入映射）：
```bash
cd car_soccer_source
python3 -m http.server 3000
```
在浏览器中打开 `http://localhost:3000` 即可畅玩。

---

## 游戏操作指南

| 操作 | 键盘按键 | 手柄按键 (Xbox/PS) | 触屏 / 鼠标 |
| :--- | :--- | :--- | :--- |
| **前进 / 油门** | `W` 或 `方向键上` | `RT` (右扳机) | 屏幕按键 |
| **倒车 / 刹车** | `S` 或 `方向键下` | `LT` (左扳机) | 屏幕按键 |
| **左右转向** | `A` / `D` 或 `左右键` | `左摇杆水平轴` | 摇杆 |
| **跳跃 / 翻滚** | `Space (空格键)` | `A / ✕` | 屏幕 Jump 按钮 |
| **火箭喷射加速** | `Shift` 或 `鼠标左键` | `B / ◯` | 屏幕 Boost 按钮 |
| **手刹 / 空中翻滚** | `E` / `X` 或 `鼠标右键` | `X / ▢` | 屏幕 Drift 按钮 |
| **视角切换 (Ball Cam)** | `C` | `Y / △` | 点击左下角徽标 |
| **重置开球点** | `R` | `View 键` | - |

---

## 二次开发与新增功能指南

代码经过严格分层解耦，后续添加新玩法和新功能非常简单直观：

### 1. 添加新的车辆皮肤 / 车辆类型
- 打开 `src/entities/CarEntity.js`。
- 如果想使用新的外部 3D 模型，可在 `CarEntity` 中引入 `GLTFLoader`，指定新的 `.glb` 路径。
- 如果想调整车体尺寸或手感，可在 `src/constants/GameConstants.js` 中调整 `OCTANE` 的长宽高、轮径与碰撞箱参数。

### 2. 添加变异器模式 (Mutators)
想要像火箭联盟一样加入无限喷气、巨型球、弹力球、月球低重力？
- 打开 `src/physics/ProceduralPhysicsFallback.js`：
  - **低重力模式**：修改 `car.vel[2] -= 650 * dt;` 和 `this.ballVel[2] -= 650 * dt;`，降低重力加速度（如设为 `200`）。
  - **无限喷气模式**：将 `car.boost = Math.max(0, car.boost - 33.3 * dt);` 注释掉，或者在开局将所有车辆 `car.boost = 100` 并禁止扣减。
  - **弹力球模式**：修改 `BALL.RESTITUTION`（例如从 `0.6` 提高到 `0.95`），球体撞墙撞车后将以极高速度弹射！
  - **超速模式**：调整 `OCTANE.MAX_SPEED` 与 `OCTANE.SUPERSONIC_SPEED`。

### 3. 增强 AI 机器人行为
- 打开 `src/ai/BotController.js`：
  - 目前集成的自适应启发式算法已实现了角度追踪、距离测算、直线喷射加速、贴球翻滚射门。
  - 您可以在 `decide()` 中加入更多策略状态（例如回防守门、绕后切球、控球挑球）。
  - 若您拥有自己训练好的 RLGym / RLBot ONNX 模型，只需将文件保存为 `public/assets/bot/policy.onnx`，系统即可自动调用 ONNX Worker 进行神经网络推理。

### 4. 接入 WebSocket 多人联机对战
- 本项目的物理数据与控制数据完全解耦：
  - 客户端输入仅为 8 个维度的控制量：`[throttle, steer, pitch, yaw, roll, jump, boost, handbrake]`。
  - 物理状态存储在固定尺寸的 `Float32Array`（车辆位置、朝向四元数、速度、球体状态）。
  - 只需要在 `GameEngine.js` 中将本地玩家输入通过 WebSocket 发送给服务端，并在每帧根据服务器返回的房间状态更新 `PhysicsManager`，即可轻松实现低延迟在线对战！
