# Car Soccer (火箭车足球) - 官方完整还原与现代化开发工程

本项目是对 `car-soccer.com`（基于 Three.js 与 RocketSim C++ WebAssembly 的 3D 浏览器版火箭车足球游戏）进行深度逆向分析、代码反混淆、结构化排版与工程化重构后的**完整可运行源代码工程**。

---

## 核心发现与架构诊断报告

针对之前版本中出现的“车和球初始化在球场中心、缺少设置和菜单、误用粗糙 fallback 模拟”等问题，经对原始打包产物 `dist_game/` 的全量反混淆扫描，得出以下关键结论：

### 1. 源代码完整性（无需补充任何外部 JS 源码）
- **UI 与所有设置功能 100% 存在于原始代码中**：
  原始代码并非缺失 UI 组件，而是之前的人工复刻版本没有接入原始工程的 70+ 个系统类，仅手写了一个临时的骨架 HUD。
  所有组件（设置弹窗、车库换车、比赛选择、喷气表、状态诊断面板、触控控件）均完整包含在原始 JS 与 CSS（`index-BC9eDWqq.css`）中，**无需从外部寻找或补充任何 JavaScript 源代码**。
- **二进制编译部分**：
  游戏物理核心由 `RocketSim`（C++ Rocket League 物理仿真库）通过 Emscripten 编译为 WebAssembly 内嵌在 JS 中，提供 120Hz 确定性车辆悬挂、轮胎摩擦、空中翻滚与碰撞解算。
- **外部非代码资源（媒体与模型文件）**：
  仅包括 3D 模型（`.glb`/`.gltf`）、音频（`.wav`）、强化学习机器人权重（`.onnx`）与球场碰撞体分块（`.cmf`）。这些资产由 `public/download_assets.py` 自动化从官网拉取，且已被 `.gitignore` 排除。

### 2. 为何此前车和球会初始化在球场正中心 `(0, 0, 0)`？
- 之前的重构代码在 `GameEngine.js` 中虽然初始化了 RocketSim 物理核心，但**漏掉了调用 `physics.addCar(...)`**，导致 RocketSim 内部车辆数量为 0。
- 当视图尝试读取第 0 辆车的数据时，读取到的是全 0 的未初始化内存缓冲，因此车辆位置显示为 `(0, 0, 0)`。
- 同时，之前代码错误地绕过了 RocketSim 的真实开球生成逻辑 `resetKickoff(-1)`，并强行开启了 3 秒比赛倒计时。而在原版设计中，游戏加载后**默认进入 Free Play（自由训练场模式）**，车辆与足球会立刻按照标准火箭联盟开球点生成。

### 3. 移除粗糙的伪物理回退 (Procedural Physics Fallback)
- 根据用户明确要求：“*如果没有检测到必要的资源文件的话，你可以显示一个提示，比如说少什么东西，而不是说我们有一个 fallback 的一个模拟选项*”。
- 我们**彻底移除了伪物理回退模块 (`ProceduralPhysicsFallback.js`)**。
- 引入了**开机启动资产预检机制 (`checkRequiredAssets`)**：
  若在本地启动时缺少碰撞体分块或模型文件，游戏不会启动劣质模拟器，而是在加载屏幕上以友好的高对比度界面清晰列出缺失的具体文件路径，并提示执行 `python3 public/download_assets.py` 进行一键下载。

---

## 游戏功能还原清单 (100% 原版表现)

| 功能模块 | 所在位置 / 快捷键 | 原版真实表现与特性 |
| :--- | :--- | :--- |
| **默认模式 (Free Play)** | 页面加载即入 | 自由训练场模式。车辆与足球立刻在场地就绪，无倒计时阻塞，无比赛时钟限制，无限畅玩练习。 |
| **车辆车库 (Garage)** | 左下角按钮 (`car-tab`) | 展开车辆选择弹窗 (`#car-overlay`)，支持 Octane (默认)、Dominus (扁平车)、Realistic (写实车)。内置实时 3D 旋转展台预览。 |
| **对战菜单 (Play Menu)** | 右下角按钮 (`match-tab` / <kbd>M</kbd>) | 展开比赛配置弹窗 (`#match-dialog`)，支持自由训练场与 1v1 人机对战切换；可选 Nexto、Necto、Seer 等 ONNX AI 机器人及难度。比赛期间显示专属比分时钟牌 (`.match-scoreboard`)。 |
| **系统设置 (Settings)** | 右上角齿轮 (`#settings-button`) | 展开 6 大设置分页的大型覆层 (`#settings-overlay`)：<br>1. **Camera**: FOV、距离、高度、俯仰角、硬度、旋转平滑速度、反转水平。<br>2. **Controls**: 完整的键鼠与手柄按键重映射绑定器。<br>3. **Graphics**: 分辨率缩放、帧率限制 (60/120/144/240/无限制)、球场建筑显隐、高光 Bloom 开关。<br>4. **Audio**: 主音量、引擎声、喷气声、撞击声独立滑块。<br>5. **Training**: 自由练习规则（无限喷气、禁用进球重置、4种快速控球训练：拿球、带球、传球、挑球）。<br>6. **Status**: 实时性能监控（FPS、物理 step 耗时、掉帧率、图表分析）。 |
| **喷气指示器 (Boost Meter)** | 右下角弧形表盘 (`.boost`) | 原版 SVG 矢量喷气表盘，带刻度线、动态充填弧线、闪烁特效与 0-100 实时数值读数，支持无限喷气状态指示。 |
| **球心视角指示 (Ball Cam)** | 左下角指示灯 (`.ball-cam-indicator`) | 按 <kbd>C</kbd> 或手柄 <kbd>Y / △</kbd> 切换视角时，实时亮起显示 Ball Cam 状态。 |
| **光标提示 (Cursor Hint)** | 顶部工具栏 (`.cursor-hint`) | 动态提示当前鼠标锁定状态与解锁热键。 |

---

## 快速运行指南

### 1. 检查并下载外部资产 (若未下载)
由于 `public/assets` 包含约 40+ 个 3D 高模、音效与碰撞体分块，且已被 `.gitignore` 排除。若您本地尚未下载，只需执行：
```bash
python3 public/download_assets.py
```
*注：该脚本将全自动从官网下载球场模型、足球贴图、车辆模型、RocketSim 16 个碰撞体分块与引擎音效。*

### 2. 启动开发服务器
进入 `car_soccer_source` 目录：
```bash
pnpm run dev
# 或者使用 npm / yarn
# npm run dev
```
打开浏览器访问控制台输出的地址（通常为 `http://localhost:3000`），即可直接体验原汁原味的官方完整版火箭车足球！

---

## 目录结构说明

```
car_soccer_source/
├── index.html                   # 游戏入口 HTML
├── package.json                 # 项目依赖 (Three.js, Vite)
├── vite.config.js               # Vite 服务器配置 (带 COOP/COEP 安全头)
├── public/                      # 静态资源 (assets, 图标, manifest)
│   ├── assets/                  # 3D模型、音频、碰撞网格 (git ignored)
│   ├── favicon.ico
│   └── site.webmanifest
├── src/
│   ├── main.js                  # 应用统一入口
│   ├── game/
│   │   └── CarSoccerEngine.js   # 格式化反混淆的完整游戏主引擎 (含70+功能类)
│   └── styles/
│       ├── game.css             # 游戏样式主入口
│       └── original_fonts.css   # 官方完整 253KB 像素级 UI 样式表 (包含所有菜单、弹窗、表盘样式)
└── ../public/ (decoupled assets └── tools/ download tools)
    └── download_assets.py       # 官方资产自动化下载工具
```
