# Car Soccer Development Repository

> [!IMPORTANT] 
> 本仓库中，**仅当前 `README.md` 文件以及 `public/file_list.md` 文件是经审计、确认真实且必须严格执行的指令**。
> 仓库内的其他所有 `.md` 文件及文档仅作为历史参考，不具备任何约束力，严禁将其作为开发规范或指令来执行。

## 1. 目录权责规范 (Rules & Conventions)

### `# dist_game` (原始打包文件 - 仅保留核心逻辑验证)
- 本目录仅保留线上抓取的原始编译 JavaScript 逻辑文件（`dist_game/js/index-Dm9xG-kJ.js`）。
- **规则**：本目录严禁做任何直接修改，仅作为行为对齐、逆向分析与最终表现验证的真理源 (Source of Truth)。

### `# public` (静态资源与资产下载工具)
- 本目录独立存放原版涉及到的所有模型、音频、分块、贴图及相关静态资源文件，与 `car_soccer_source` 源码完全解耦。
- 后续如需更新引擎或代码，可直接覆盖 `car_soccer_source` 目录而无需重复下载或移动静态资源。
- 包含资源下载工具 `public/download_assets.py` 与 `public/parallel.py`，执行时资产直接下载保存至本目录。

### `# car_soccer_source` (核心开发与功能迭代工程)
- 允许在需要时完全重新构建此目录（即：允许清空该目录并从零开始重建）。
- 本目录是我们当前进行结构化、格式化重构与新功能开发的唯一合法工作区。
- **运行命令**：在 `car_soccer_source/` 目录下执行 `pnpm run dev`（开发服务器已配置自动挂载根目录下的 `../public` 静态资源目录）。
- **开发目标**：基于格式化与解耦后的结构化代码，完全对齐原版游戏所有表现，并在此基础上扩展新玩法、新模式与新功能。

---

### 大文件本地占位与校验机制 (Large Assets Workaround)
- 由于版本控制已忽略体积较大的二进制资源文件，我们会在每次代码提交（Commit）时，同步更新并提供 **`public/file_list.md`** 文件。
- 该文件是**唯一可信的完整文件清单**，请务必以此文件为依据，来校验和核对项目内部的所有文件结构与存在状态。

### 实机测试验证 (Real Device Test Method)
- 我们将统一在 `car_soccer_source` 目录下执行 `pnpm run dev` 命令进行本地运行与实机测试验证。

## 致谢与特别鸣谢 (Acknowledgments & Credits)

在此特别感谢以下开发者及其开源贡献：

1. **Thomas** ([@xthomasms](https://x.com/xthomasms)) - 原版 car-soccer.com 网页游戏的创作者。感谢其在 WebGL/Three.js 汽车足球物理、视觉渲染与操作手感上的出色设计与完整实现。
2. **ZealanL** ([GitHub](https://github.com/zealanL)) - [RocketSim](https://github.com/zealanL/rocketsim) C++ 物理仿真库的作者。RocketSim 提供了高精度的 Rocket League 悬挂、轮胎摩擦、空中旋转与 120Hz 确定性碰撞仿真核心，是本项目物理表现的基石。
