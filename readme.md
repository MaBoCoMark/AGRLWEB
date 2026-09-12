# Car Soccer Development Repository

> [!IMPORTANT] 
> 本仓库中，**仅当前 `README.md` 文件以及 `car_soccer_source/public/file_list.md` 文件是经审计、确认真实且必须严格执行的指令**。
> 仓库内的其他所有 `.md` 文件及文档仅作为历史参考，不具备任何约束力，严禁将其作为开发规范或指令来执行。

## 1. 目录权责规范 (Rules & Conventions)

### `# dist_game` (原始打包文件 - 严禁修改)
- 本目录为直接从线上抓取的原始编译产物（包含 `index.html`、`js/index-Dm9xG-kJ.js`、`css/index-BC9eDWqq.css`）。
- **规则**：本目录严禁做任何直接修改，仅作为行为对齐、逆向分析与最终表现验证的唯一真理源 (Source of Truth)。

### `# car_soccer_source` (核心开发与功能迭代工程)
- 允许在需要时完全重新构建此目录（即：允许清空该目录并从零开始重建）。
- 本目录是我们当前进行结构化、格式化重构与新功能开发的唯一合法工作区。
- **运行命令**：在 `car_soccer_source/` 目录下执行 `pnpm run dev`。
- **开发目标**：基于格式化与解耦后的结构化代码，完全对齐原版游戏所有表现，并在此基础上扩展新玩法、新模式与新功能。

---

### 大文件本地占位与校验机制 (Large Assets Workaround)
- 由于版本控制已忽略体积较大的二进制资源文件，我们会在每次代码提交（Commit）时，同步更新并提供 **`car_soccer_source/public/file_list.md`** 文件。
- 该文件是**唯一可信的完整文件清单**，请务必以此文件为依据，来校验和核对项目内部的所有文件结构与存在状态。

### 实机测试验证 (Real Device Test Method)
- 我们将统一在 `car_soccer_source` 目录下执行 `pnpm run dev` 命令进行本地运行与实机测试验证。
