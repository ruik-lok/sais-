# ORBITAL — 视觉重构方案（feature/visual-redesign，基线 integration 73bcc66）

## 0. 现状审查结论（先审查后开发）

- 结构：index.html 内联样式 + Grid 布局（56px 顶栏 / 250px 左 / 300px 右 / 底部时间条）；移动端仅靠 `@media (max-width:900px)` 把三列堆叠，导航与信息面板各限高 220px——这是移动端拥挤与遮挡的根源。
- 原型化问题清单：蓝色描边与蓝色按钮悬停（`--accent:#6ba8ff` 贯穿）、原生 `<select>`、原生 checkbox、原生 `<input type=date>`、原生 range 默认外观、Emoji/符号混用（⛶、⏸、⇄ 尚可，但须统一为文字符号体系）、面板为不透明实色块、无磨砂玻璃、无折叠、底部时间条在移动端换行拥挤。
- 引擎现状：render.js 已有 ACES、PCFSoft 阴影、decay=2、选择性泛光、菲涅尔大气、彗发彗尾、setMode 全覆盖、FPS governor；重构不重写引擎，只补视觉层次（星空分层、轨道线分层、环剖面、选中反馈）。
- 已知待修（与重构同批处理，不得遗漏）：
  - **B11 横幅疑点（根因已定位）**：`src/main.js` 中 `refreshRangeBanner()` 只在两处被调用——`renderPanel()`（选中变化时）与主循环中 `interaction.selectedId && dayChanged` 的分支内。于是：① 无选中（全景）时播放跨越适用期，横幅永远不刷新；② 暂停时 jd 不变、dayChanged 为假，横幅不刷新；③ 日期输入 `change` 处理只调 `refreshTimeUI()`，不调 `refreshRangeBanner()`，改日期后横幅不出现，直到下一次“有选中且日变化”。这解释了 B11“连续播放全程未触发、日期输入无法复现、回 2026 消失未复现”。修复：主循环中 `dayChanged` 时无条件调用 `refreshRangeBanner(jd)`；日期应用与“回到现在”后立即调用；另在 ui.js 新增增量函数 `updateInfoValidity(el, jdTT)`，在日变化时只更新面板内的 `.range-warning` 行（不全量重绘，不破坏“日变化只增量更新”的契约）。
  - **面板/相机短暂不同步（防御性修复）**：已通过的 B 项复核中， footer“返回全景”后立即切模式曾出现相机回总览、面板仍停留土星。直接根因未在代码中确证（interaction.overview() 本应经 onSelect(null) 重绘全景面板），故不做臆断性大改；修复为同步守卫：主循环每帧比对 `infoEl.dataset.bodyId` 与 `interaction.selectedId || ""`，不一致时调用 `renderPanel(selectedId)` 一次性纠正；模式切换处理中若 selectedId 为 null，确保面板为全景态。该守卫只在不一致时触发，正常路径零开销、无滚动丢失。

## 1. 分工与文件所有权（防并发冲突，各 Agent 只改自己文件）

| 角色 | 文件所有权 | 不许碰 |
|---|---|---|
| 设计系统 | DESIGN_SYSTEM.md（已定稿，见本仓库）、src/tokens.css（新建：全部 token 与通用组件类） | index.html、src/*.js |
| 桌面布局与自定义控件 | index.html（结构与样式引用）、src/main.js（控件接线、B11 修复、同步守卫） | src/render.js、src/ui.js（除新增 updateInfoValidity 的调用外）、src/astro.js、data.js、events.js |
| 移动端 | src/mobile.css（新建）、src/mobile.js（新建：抽屉、底部拖动面板、悬浮时间控制器） | index.html（除桌面 Agent 预留的钩子外）、src/render.js、main.js 核心逻辑 |
| 3D 视觉 | src/render.js（仅视觉层：星空分层、轨道线分层、环剖面、选中反馈、辉光层次） | astro.js、data.js、events.js、ui.js、main.js |
| 动效与性能 | src/motion.css（新建：全部过渡/动效/reduced-motion）、render.js 中 governor/LOD 段落（在 3D Agent 完成后接手，只做节流与降级微调） | 计算逻辑、数据层 |
| 回归 QA | 只读 + 新增测试文件 test_redesign.mjs（不改源码；发现问题以清单交回主控） | 全部源码（QA 不改源码） |

钩子约定（桌面 Agent 必须在 index.html 中预留，移动端 Agent 只用这些钩子，不得改结构）：
`#nav-toggle`（移动端打开导航抽屉的按钮）、`#nav-scrim`（抽屉遮罩）、`#info-sheet`（包裹右侧信息面板的移动端底部面板容器类名 `sheet` + 拖动手柄 `#sheet-handle`）、`#time-float`（移动端悬浮时间控制器容器，桌面端隐藏）、`body[data-nav-open]`、`body[data-sheet]`（`collapsed/half/full`）。

## 2. 实施顺序

1. 本方案 + DESIGN_SYSTEM.md 定稿（主控已完成）。
2. 并行：设计系统 tokens.css、桌面布局与控件、移动端、3D 视觉（文件互不重叠）。
3. 动效与性能接手：统一过渡、reduced-motion、governor 复核。
4. 回归 QA：仓库测试 + B 项复核清单 + 移动端实测方法（见 §4）。
5. 主控集成：合并各 Agent 改动到 feature/visual-redesign、跑全量测试、写 CHANGELOG 与本方案 §5 的未完成清单；不推 GitHub、不合 main、不碰 integration/main。

## 3. 不变清单（回归底线）

全部已有功能不得删除：40 天体目录、点击/导航聚焦、聚焦链、搜索下拉与消歧、两种比例模式、时间控制（播放/暂停/倒退/变速/滑杆/预设/指定日期保留时刻/回到现在恢复正向）、事件面板（5° 三维角距）、全屏、标签/轨道线/云层开关、精度警告、CDN 失败提示、快捷键（Esc/Space/方向键，输入聚焦时守卫）。
计算层不动接口：astro.js、data.js、events.js 的函数签名与数值逻辑不改；ui.js 只新增 updateInfoValidity，不得改 renderInfo 的字段语义。

## 4. 移动端实测方法（QA 必须如实执行并记录）

- 子 Agent 无 live browser 权限，故移动端“真实视口”验证以以下三层为准，不得谎称已做真机验证：① 静态结构检查（mobile.css 媒体查询、抽屉/底部面板/悬浮控制器的 DOM 钩子存在性、触屏目标尺寸的 CSS 计算值）；② Node + 轻量 DOM 桩验证自定义控件逻辑（日期步进、开关、分段控件、抽屉开合状态机）；③ 在最终报告中明确写“移动端真实视口/触屏/FPS 仍需主控派浏览器任务复验”，并给出浏览器复验清单（390px 布局无横向溢出、抽屉开合、底部面板三档吸附拖动、悬浮控制器不遮挡场景中心、触屏目标 ≥44px、移动端 FPS）。
- 桌面回归复核：B1、B2、B3、B4、B5、B6、B7、B10、B15 的代码级复核（DOM id、事件接线、setMode 覆盖、环/辉光缩放）+ 仓库测试，浏览器实测留给主控。

## 5. 交付物

- DESIGN_SYSTEM.md、REDESIGN_PLAN.md（本文件）、src/tokens.css、src/mobile.css、src/mobile.js、src/motion.css、改后的 index.html / src/main.js / src/ui.js（仅 updateInfoValidity）/ src/render.js（仅视觉层）、test_redesign.mjs。
- 集成后 CHANGELOG 条目与 TEST_REPORT 补充节（由主控写，不由 QA 改源码）。
