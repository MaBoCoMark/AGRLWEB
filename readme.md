# Car Soccer Development Repository

## 1. 目录权责规范 (Rules & Conventions)

### `# dist_game` (原始打包文件 - 严禁修改)
- 本目录为直接从线上抓取的原始编译产物（包含 `index.html`、`js/index-Dm9xG-kJ.js`、`css/index-BC9eDWqq.css`）。
- **规则**：本目录严禁做任何直接修改，仅作为行为对齐、逆向分析与最终表现验证的唯一真理源 (Source of Truth)。

### `# car_soccer_source` (核心开发与功能迭代工程)
- allows to fully recreate this folder if needed. I mean allowed to empty this folder then recreate starting from zero.
- 本目录是我们当前进行结构化、格式化重构与新功能开发的唯一合法工作区。
- **运行命令**：在 `car_soccer_source/` 目录下执行 `pnpm run dev`。
- **开发目标**：基于格式化与解耦后的结构化代码，完全对齐原版游戏所有表现，并在此基础上扩展新玩法、新模式与新功能。

---

### Real device test method
- We will run command `pnpm run dev` under folder `car_soccer_source` to validate.