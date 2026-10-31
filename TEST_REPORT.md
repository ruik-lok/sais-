# ORBITAL — 独立测试报告（QA Agent，第 6 步）

- **分支 / 基线**：`test/independent-audit`，基线提交 `58cea66`（Step 5 集成版）。本报告撰写期间**未切换分支、未动其他 worktree、未动 main、未 force-push、未碰用户服务器、未推送 GitHub**（推送由主控统一做）。
- **测试日期**：2026-10-31（独立探针运行日；本机时间为 CST）。
- **方法声明**：本报告所有结论均由本 QA 在本目录独立跑出，不采信开发方自述。探针脚本为一次性脚本 `/tmp/qa_probe.mjs`（未写入仓库，避免污染源码；其逻辑在下文逐项复述，可复现）。
- **关键边界**：本 QA 为通用子代理，**没有 live browser 操作权限**。凡涉及浏览器实测（点击、视觉、FPS、移动端）的内容，本报告**一律未做、不得视为通过**，统一列入第 6 节“待主控/父级浏览器验证清单”。任何 FPS 数字、浏览器截图结论均不在本报告中出现。

## 1. 测试命令与结果（逐条可复现）

| 命令 | 结果 | 退出码 |
|---|---|---|
| `node test_kepler.mjs` | **181 PASS，0 FAIL**，末行 `ALL TESTS PASSED` | 0 |
| `node test_ui.mjs` | **32 PASS，0 FAIL**，末行 `ALL UI TESTS PASSED` | 0 |
| `node --check src/*.js`（astro, data, events, interaction, main, render, time, ui 共 8 个文件） | 全部 `OK` | 0 |
| 独立探针 `node /tmp/qa_probe.mjs`（数据 / 物理 / 事件 / 集成回归，见第 3–4 节） | **107 PASS，0 FAIL** | 0 |
| 静态服务器 `python3 -m http.server 8001` + curl（见第 5 节） | `/`、`/index.html`、全部 `src/*.js`、`package.json` 返回 200；`/nonexistent` 正确返回 404 | — |

合计（本树当前口径，见文末 Phase 2 基建附录）：仓库自带测试 297 项（kepler 181 + ui 32 + redesign 84）+ `node --check src/*.js` 10/10，0 失败。

## 2. 逐项验证表

### 2.1 数据一致性探针（Node，只读）

| 检查 | 结果 |
|---|---|
| BODIES 数量 | 19：`sun, mercury, venus, earth, mars, jupiter, saturn, uranus, neptune, pluto, ceres, eris, haumea, makemake, vesta, pallas, eros, halley, 67p` |
| MOONS 数量 | 21 |
| id 唯一性 | ALL_BODIES 共 40 个 id，无重复 |
| 卫星 parent 存在 | 21 颗卫星的 parent 均在 BODIES 中 |
| moonsTotal / moonsModelled 与 `moonsOf()` 计数一致 | 19 个 BODIES 逐个比对全部一致（例：木星 95/4、土星 146/6、天王星 28/5、海王星 16/2、冥王星 5/1、地球 1/1；阋神星 1/0、妊神星 2/0、鸟神星 1/0） |
| SBDB 9 体 orbitSolution 齐全 | 全部齐全，含 orbitId、epochJd、arcDays、uncertainty（含 RMS 与 condition code）、conditionCode、source、solnDate。谷神星 48、阋神星 103、妊神星 132、鸟神星 130、灶神星 36、智神星 74、爱神星 659、哈雷 75、67P K284/1 |
| 卫星相位 | 仅月球可用（218.32°，历元 J2000）；其余 20 颗 `phaseDeg: null`，`moonPosition` 对其全部抛错（20/20）；月球相对位置有限，r ≈ 0.002519 AU |
| accuracy 对象字段 | 19 个 BODIES 全部为对象，含 `level / validFromJd / validToJd / note`（JPL 支 level=kepler，SBDB 支 level=sbdb，太阳 level=schematic） |
| shapeKindFor 分档 | 木星 oblate、土星 oblate、妊神星 triaxial（axesKm [1960,1518,996]）、哈雷 irregular、灶神星 irregular、地球 sphere；`shapeFallbackFor(earth)=true`，`shapeFallbackFor(sun)=false`（太阳是真球体，非兜底） |
| ring 字段 | 仅 4 颗巨行星有环，profile 全部为 `schematic`（非实测剖面，已如实标注）：木星 1.40–1.81、土星 1.24–2.27（唯一 `cassiniGap: true`）、天王星 1.64–2.00、海王星 1.69–2.54 |
| `moonsList` 死字段 | grep 全仓 0 处，已删除，符合契约 |

### 2.2 物理探针

| 检查 | 结果 |
|---|---|
| TT 换算已知值 | `deltaTSeconds(2000)=64.2 s`，`deltaTSeconds(2026)=69.2 s`；`jdFromDate(2000-01-01 12:00 UTC)=2451545.000743`（与 2451545.0 + 64.2/86400 一致，误差 < 1e-4） |
| solveKepler 非法输入 | `e=1`、`e=-0.1`、`M=NaN`、`e=NaN` 全部抛错，无静默 NaN |
| 高偏心率收敛 | e=0.968、M 从 −π 到 π 步进 0.05 全部收敛，最大残差 8.88e-16（< 1e-9） |
| isOutOfRange（JPL 支） | 2026 年内 in-range；1799 年 out；2100 年 out；边界 JD 2378496.5（1800-01-01）in-range；branch=jpl，窗口 1800–2050 |
| isOutOfRange（SBDB 支） | 9 体全部返回 `outOfRange: null, validityKnown: false, branch: osculating`（适用期未知，**不是**“在范围内”） |
| 事件对照（2025 年，detectEventsInRange 全年扫） | 火星冲日命中 2025-01-16（±2 天内，实测极值 JD 2460691.58，偏差 4.29°）；土星冲日命中 2025-09-21（偏差 2.51°）；天王星冲日命中 2025-11-21（偏差 0.21°）。另扫出冥王星、67P、海王星冲日，属模型正常输出，非误报项 |
| 内行星不报冲日 | 2025 年全年无水星/金星冲日事件 |
| 阈值 | `ANGLE_THRESHOLD_DEG = 5`（三维角距展示阈值，非 IAU 标准，events.js 注释已明示；main.js 面板文案已同步为 5°，见已知缺陷 D3 的反向注释问题） |
| 单日 vs 区间扫不漏检 | 2025-01 全月：区间扫 2 件 = 逐日单日扫 2 件；`detectEvents(2025-01-16)` 当日命中火星冲日；`detectEventsInRange` 对 NaN 边界抛错 |

### 2.3 集成回归探针（模拟 main.js 的 computePositions 逻辑）

| 检查 | 结果 |
|---|---|
| 带 try/catch 跳过示意卫星 | 复现 main.js 逻辑：20 颗示意卫星被跳过（skipped=20），仅月球保留（kept=1），循环不中断，月球位置有限 |
| 全部 BODIES 有位置 | 19 个 BODIES 在 2026-01-01 均算出有限位置 |
| renderInfo 未知 id | 用假 DOM（同 test_ui 做法）调用 `renderInfo(el, "no-such-id-xyz", …)`：不抛错，面板含“未找到该天体” |
| 搜索歧义不再静默取首个 | `searchCandidates("星")` 返回 16 个候选；`Interaction.search("星")` 返回 null、`ambiguousCandidates` 为 16、`selectedId` 保持 null（未移动）；精确搜索 `earth` 正常选中 |

### 2.4 启动项目验证（静态服务器，curl，非浏览器）

- 服务器：`python3 -m http.server 8001`（工作目录根目录，避开 8000 端口），测试后已停止。
- curl 结果：`/` 200（10209 B）、`/index.html` 200、`src/main.js`、`src/render.js`、`src/astro.js`、`src/data.js`、`src/ui.js`、`src/events.js`、`src/interaction.js`、`src/time.js` 全部 200，`package.json` 200，`/nonexistent` 404。
- `index.html` 关键 id 逐个 grep 确认存在（各 1 处）：`fullscreen-btn`（全屏按钮）、`search` + `search-dropdown`（搜索下拉）、`speed-slider`（速度滑杆）、`range-banner`（精度警告横幅）、`cdn-fallback`（CDN 失败提示条，含 three@0.160.0 文案与 15 秒兜底定时器）、`play-btn`、`reverse-btn`、`overview-btn`、`scale-mode`、`sim-date`、`date-input`。
- `package.json` 含依赖 `"three": "0.160.0"`；`index.html` importmap 同为 three@0.160.0（jsdelivr），版本一致。
- **未验证**：上述 curl 只能证明文件可达与静态 id 存在，不能证明 Three.js 在浏览器中成功加载、场景渲染、或任何交互可用——见第 6 节。

### 2.5 性能与代码检查（grep + 走查）

| 检查 | 结果 |
|---|---|
| InstancedMesh 滥用 | grep 全仓 `InstancedMesh`：0 处 |
| 跨帧位置缓存 | 无 `positionCache / cachedPosition / lastPositions`；main.js 仅在 jd 变化时重算 `positionsAU`，不挂钩帧率；`orbitPointsAU` 是轨道线采样缓存（buildOrbits 求解一次，模式切换时只重映射），不是天体位置跨帧缓存 |
| 求解器精度降级 | 无：`solveKepler` 残差阈值 1e-9 + 二分法回退保持不变；governor 注释与代码均声明只降渲染（像素比、标签、轨道线），不降位置精度 |
| refreshOrbits 不再全量重建 | 确认：`render.js:577` 原地更新既有 `position` attribute（`setXYZ` + `needsUpdate`），无新几何、无新材质；`disposeOrbitLines`（同时 dispose 几何与材质）仅为 teardown 路径，模式切换不走它 |
| setMode 覆盖范围 | 确认覆盖 mesh、hit、label、环、太阳辉光、大气、云层（`render.js:606`），并随后 `updateMaxDistance()` + `refreshOrbits()` + 恢复高亮 + `applyLod()` |
| maxDistance 科学模式 | `render.js:661`：科学模式 `max(2500, far*1.2)`，≥ 2500，符合契约 §7；视觉模式 floor 800 |
| FPS governor | 代码存在：`govTierCaps=[2,1.5,1]`，每秒采样，<30 降档、>55 且连续 2 秒好转才回升（迟滞）；最低档隐藏轨道线与远处标签；**但无实测 FPS**，见第 6 节 |
| scenePos 重复计算 | 已修复为单次 `_posFromAU` 调用（render.js 注释与代码一致，卫星分支先算一次母天体场景位置再复用） |
| **deferred texture queue（已知取舍）** | **未实现启动分帧，不得谎称已实现**：`textureQueue`、`pumpTextureQueue`、`prioritizeTexture` 方法仍存在于 render.js，但 **animate() 从不调用 `pumpTextureQueue`**（全仓除定义外无调用者）；`buildBodies` 仍同步生成全部程序化纹理（41 张 × 2600 弧 ≈ 106,600 次圆弧绘制，见 render.js:67 与 :387 注释）。集成提交 58cea66 的说明称该队列“因与新纹理系统不兼容而丢弃”，与代码现状一致（方法残留 = 死代码，功能上等于丢弃）。render.js:387 的注释仍写“Jobs drain … inside animate()”，与代码不符，列入已知缺陷 D2 |
| MeshBasicMaterial 误用 | 无：太阳用 `MeshBasicMaterial` 仅配 `map + color`（HDR 乘数），无 `emissive` 属性；`highlight()` 对 emissive 有存在性守卫，太阳高亮走辉光 scale/opacity |

## 3. 已知缺陷清单

### 关键缺陷（影响合并门槛）：无代码层关键缺陷

仓库自带测试（本树 297 项）0 失败；上一轮独立探针 107 项为上一轮记录、本轮未重跑（探针脚本已丢失且从未入仓），不计入本轮结论；未发现位置计算错误、数据不一致、搜索静默取首个、示意卫星占位绘制、或 SBDB 适用期误标为“在范围内”等关键问题。

### 非关键缺陷（不阻塞代码合并，但须记录与修复，括号内为建议负责人）

- **D1（文档措辞，沿用审计报告 §8.1 的旧发现，至今未改）**：`test_kepler.mjs:35` 注释称有限性测试覆盖“1900 / 2026 / 2100”，但实际 JD 为 2415020（1899-12-31）、2461000.5（经 `dateFromJd` 约 2025-11-20/21，**不是 2026**）、2488070（2100-01-01）。计算本身无错，注释误导。修复：把注释改为真实日期，或把中间 JD 改为 2461041.5（2026-01-01）。负责人：Physics / QA。
- **D2（注释与代码不符）**：`render.js:387` 称 deferred 纹理队列“在 animate() 内分帧排出”，实际 animate() 从不调用 `pumpTextureQueue`，且 `buildBodies` 同步绘制全部纹理。修复：删改该注释为“队列已丢弃、启动同步绘制（已知取舍）”，或删死代码。负责人：Performance / Rendering。
- **D3（过期注释，功能无影响）**：`main.js` 注释称“astro.js 目前不导出 isOutOfRange”，实际 astro.js 已导出且 main.js 已通过 `astroNS.isOutOfRange` 成功接入（ui 测试亦证实注入 checker 优先）。`events.js` 注释称“main.js 面板文案仍写阈值 3°”，实际 main.js 已写 5°。`ui.js` 头注释称“数据层尚未落地 moonsTotal/moonsModelled”，实际 data.js 已落地且 `moonCounts` 的 `??` 链已优先使用。`data.js` 头注释称“ui.js 目前把 accuracy 当字符串插值”，实际 `ui.js:accuracyText` 已处理对象。修复：批量清理上述 4 处过期注释。负责人：QA / 主控。
- **D4（探针观察，非生产路径）**：探针初期以 `renderer: null` 构造 Interaction 并调用精确搜索时，`select()` 在 `this.renderer.bodies` 处抛错；main.js 恒传 Renderer 实例，故生产路径不可达。建议 UI Agent 加防御（renderer 为空时跳过聚焦/高亮，只更新选择与面板）。负责人：UI，不列入合并门槛。
- **D5（模型固有限制，已如实标注，非缺陷）**：20/21 卫星无 AU 位置，场景中不定位（网格须隐藏，不得滞留原点）；阋神星/妊神星/鸟神星的卫星总数未建模；SBDB 固定椭圆外推误差未量化；卫星模型无交点退行/近地点进动；地球条目为 EMB 非地心（差约 4670 km）；章动与光行差未实现。以上均已在 README / 数据注释 / 面板中明示，不得在对外口径中淡化。
- **P0-1 修复记录（Phase 2 修复组 B，2026-10-31，本工作树 addendum；浏览器点击土卫六/木卫二未测，列入待测清单，不得声称通过）**：Node 复现（/tmp 临时脚本，未入仓；复现 main.js computePositions 循环，JD 2461344.5008 = 2026-10-31）：MOONS 21，非月球 20 颗全部无位置（missing 20/20：phobos, deimos, io, europa, ganymede, callisto, enceladus, tethys, dione, rhea, titan, iapetus, miranda, ariel, umbriel, titania, oberon, triton, proteus, charon），moonPosition 对其抛错 20/20，月球保留有限位置，BODIES 19/19 有位置。修复：render.js animate() 对无位置体 group.visible=false 并同步隐藏标签与命中球（applyLod、governor、pick、选中指示亦守住：不拾取、不把指示/相机粘到原点）；interaction.js 无位置体聚焦重定向到母天体（选中身份仍为原体，面板仍展示目录与物理参数），面板与聚焦逻辑共用同一文案“暂无可用相位，位置未知，仅展示目录与物理参数”；main.js getScenePos 对无位置体返回 null，搜索“已定位”不再覆盖该提示。新增 test_moons.mjs 24 项（直接执行位置判定、聚焦重定向、面板渲染三类被测函数），全部通过；既有 test_kepler 181、test_ui 32、test_redesign 84 全部通过。根本修复（正式相位历元或 Horizons 卫星星历）不在本组范围，列为后续任务；未恢复整数占位相位，未改卫星总数（仍 21），未删 Kepler / EMB 诚实标注。

### 已知取舍（合并说明中必须保留，不得删除）

- 启动纹理同步绘制（见 2.5）：首帧阻塞量级约 106,600 次圆弧绘制；集成决议接受此取舍，**不得**在合并说明或对外文档中写“已实现启动分帧/懒加载”。
- 精度结论不得引用为 Horizons 实测对比：README 已明示“未做 Kepler 与 Horizons 的数值对比”，本报告亦未做（无浏览器/服务端接入）；精度分因此扣分（见第 7 节）。

## 4. 浏览器待验证清单（待主控/父级浏览器验证，本 QA 未做）

> 执行方须在真实浏览器中逐项操作并记录通过/失败与截图或录屏；任一项失败即冻结合并，交对应 Agent 修复后复评。

| # | 操作步骤 | 期望结果 | 对应模块 |
|---|---|---|---|
| B1 | 打开静态页，等待首屏加载完成 | 3D 场景出现（非空白），星空与行星可见；若 CDN 失败则 `cdn-fallback` 提示条出现而非静默空白 | Rendering |
| B2 | 点击地球 | 相机 1.2 s 缓动聚焦地球，信息面板显示地球中英名、与太阳距离、卫星 1/1、EMB 说明 | Interaction / UI |
| B3 | 地球面板内点击月球链接，再点“返回母天体”，再点“返回全景” | 聚焦链 地球→月球→地球→全景 连续无跳变；面包屑三级齐全 | Interaction |
| B4 | 点击空白处 | 取消选中，面板回全景，不报错 | Interaction |
| B5 | 搜索框输入“星”，用 ↑↓ 选择后回车；再输入一个歧义词直接回车 | 下拉出现多候选（含中英名/类型/母天体），高亮项被选中；歧义时不静默跳首个，提示选择 | UI / Interaction |
| B6 | 点击土星，放大观察环 | 土星环可见卡西尼缝示意间隙，环不残留旧比例尺寸（切换科学/视觉模式后环尺寸跟随变化） | Rendering / Model |
| B7 | 观察太阳与地球 | 太阳有辉光且泛光不漫到标签/星空；地球有菲涅尔边缘大气辉光与昼夜差异；云层跟随轴倾自转 | Rendering |
| B8 | 切换科学比例模式，滚轮缩放到最远 | 能缩放到阋神星附近（maxDistance ≥ 2500 生效），天体按真实比例显小属正常 | Rendering |
| B9 | 点击全屏按钮，再按 Esc | 进入全屏且按钮文案/aria-pressed 同步；Esc 回总览（或退出全屏，行为须与界面说明一致） | UI |
| B10 | 拖动速度滑杆与预设档位（0.1 / 1 / 10 / 100 天/秒），再以高速跳过多日 | 位置与事件面板跟随变化；高速跳日不漏事件（事件面板应出现区间扫结果） | Time / Events |
| B11 | 把模拟日期调到 1799 年与 2100 年 | 精度警告横幅（range-banner）出现，文案为“超出适用期，精度无保证”；调回 2026 年后横幅消失 | UI / Physics |
| B12 | 桌面端连续运行 5 分钟，记录 FPS | 桌面 FPS 达标（目标 60 FPS，见 README“未在目标硬件上实测”——执行方须写明实测硬件与 FPS 数值，不得沿用本报告的任何数字） | Performance |
| B13 | 移动端（窄屏 / 真机或模拟器）打开，检查布局与触屏 | 单列布局无 96px 溢出，导航项与按钮触屏目标 ≥44px，拖拽/缩放可用，记录移动端 FPS | UI / Performance |
| B14 | 长时间运行（≥30 分钟）与反复切换模式 | 无内存/显存持续攀升、无模式切换后残留旧尺寸、无标签大面积重叠遮挡 | Performance / Rendering |
| B15 | 彗星（哈雷 / 67P）聚焦观察 | 彗发与彗尾可见，尾方向远离太阳且随日心距变化；小行星无彗发/彗尾 | Model |

## 5. 评分表（100 分制）

| 分项（满分） | 得分 | 扣分理由与证据 |
|---|---|---|
| 精度（25） | **21** | −4：无 Horizons 数值对比（README 自认未做，本报告亦未做）；SBDB 固定椭圆外推误差未量化；卫星简化模型无进动改正；EMB 非地心。扣分针对“精度未实测验证”，而非计算错误——TT、求解器残差、事件对照本身全部通过 |
| 范围（15） | **13** | −2：20/21 卫星无可用相位故不绘制；阋神/妊神/鸟神卫星总数未建模。均已如实标注且总数/已建模分开展示，故只扣 2 分而非按缺失计 |
| 渲染（20） | **17** | −3：浏览器视觉完全未验证（土星环观感、泛光漫延、阴影、标签重叠、彗星尾方向，见 B1/B6/B7/B15）。代码走查项（ACES、decay=2、bloom 阈值 1.5、Fresnel、setMode 全覆盖、共享几何）全部通过，故其余 17 分保留 |
| UI 交互（20） | **17** | −3：浏览器交互完全未验证（点击拾取、聚焦缓动、搜索下拉键盘、移动端布局、全屏，见 B2–B5/B9/B13）。纯函数与假 DOM 测试（32 + 探针搜索/面板项）全部通过，故其余 17 分保留 |
| 性能（10） | **8** | −2：无实测 FPS（桌面与移动端均无，见 B12/B13）。代码项通过：governor 迟滞分档、refreshOrbits 原地更新、无 InstancedMesh 滥用、无求解器降级。启动分帧未实现列为已知取舍（2.5），按集成决议不另扣分，但须保留在合并说明中 |
| 测试与诚实标注（10） | **9** | −1：5 处过期/不符注释（D1–D3），功能无影响；其余标注诚实：Kepler 非 DE441、程序化非实测、SBDB 适用期未知、5° 为展示阈值、卫星示意标注 |
| **合计** | **85 / 100** | — |

## 6. 是否建议合并 main：明确结论

**当前结论：不建议仅凭本报告直接合并 main。未达到“全部关键测试通过且 ≥90/100”的硬门槛。**

- 代码层关键测试：**全部通过**（213 项仓库测试 + 107 项独立探针，0 失败；`node --check` 8/8）——此为上一轮 QA 当时的快照口径，独立探针本轮未重跑（脚本已丢失且从未入仓），见文末附录历史标注；本树当前可复现口径为 297 项 + `node --check` 10/10。
- 综合评分：**85/100，差 5 分**。差分全部来自“未做的浏览器实测”（渲染 3 + UI 交互 3 + 性能 2 = 8 分待确认）与精度未实测对比、范围未全建模、过期注释——其中浏览器部分的 8 分是唯一可通过复评补回的分数。
- **达标路径（由主控执行，不由本 QA 补写）**：第 4 节 B1–B15 全部通过后，渲染 +3、UI 交互 +3、性能 +2，复评分为 **93/100**，届时达到 ≥90 门槛，**方可合并**（合并说明须保留第 3 节“已知取舍”与 D5 限制）。若 B1–B15 任一项失败，复评仍不达标：失败项交对应 Agent 修复（渲染→Rendering/Model，交互→UI/Interaction，FPS→Performance，事件→Physics），修复后重新跑本报告第 1 节全部命令 + 失败的浏览器项，方可再次复评。
- **不得做的事**：不得以本报告的 85 分、或以 artifact 公开页（orbital-3d，Three.js 本地副本衍生版）的任何实测结果，背书本次模块化源码的浏览器表现；两者已分叉，须以本地源码为准。

---

## Phase 2 基建附录（phase2/infra，2026-10-31，审计 P0-2 / P0-4）

本附录由 Phase 2 修复组 A（基建与文档）追加；上文原 QA 结论（85/100 快照分、
B1–B15 待浏览器验证、合并门槛）原样保留，本附录不重新评分、不改动
任何源码逻辑（`git diff` 本提交仅含 package.json、.github/workflows/test.yml、
package-lock.json、TEST_REPORT.md、AUDIT_REPORT.md、README.md、PHASE2_PR1_REVIEW.md，
`src/` 零改动）。

### A1. P0-2 三项修复在集成线内的核对记录（只核对，未改逻辑）

基线为 `phase2/integration-redesign`（= visual-redesign `f046e90`），三项
均已在本工作树源码中确认存在，无一缺失，故未补改任何一处逻辑：

| 项 | 核对证据（grep / 读代码，2026-10-31） | 结论 |
|---|---|---|
| B5 搜索无预选 | `src/main.js:35` `searchHighlight: -1`（初始值）；`src/main.js:158-162` 输入事件注释“歧义不得静默取首项”并置 `state.searchHighlight = -1`；`src/main.js:169` 首次 ArrowDown 才落到 0，`src/main.js:176` 首次 ArrowUp 才落到最后一项；`src/main.js:183` 仅当 `searchHighlight >= 0` 时 Enter 选中高亮项；`src/main.js:200` 歧义提示后仍置 `-1`、下拉保持展开 | 已在集成线内 |
| label 归一化 | `src/ui.js:105-135` `validityFor()`：checker 返回对象无 `label` 时补 `label: r.outOfRange ? "超出适用期，精度无保证" : ""`；布尔型 checker 同理；`src/main.js:22` 注释“ui.js normalises the checker's verdict with a label”；文案语义未改动，仍为原有“超出适用期，精度无保证”类文案 | 已在集成线内 |
| B11 横幅刷新 | `src/main.js:477-479` 主循环“`if (dayChanged) refreshRangeBanner(jd)`”，注释明示“无条件按日刷新、有无选中均刷新”；`src/main.js:326`（`applyStepperDate`，日期步进器路径）与 `src/main.js:381`（“回到现在”路径）均立即调用 `refreshRangeBanner(jdFromDate(clock.date))`；`src/main.js:80-91` `refreshRangeBanner` 本体（含 earth 兜底文案）未动 | 已在集成线内 |

另：`test_redesign.mjs` §1（B11 生产接线）与 §2（搜索消歧）在本轮
实测中全部通过（见 A3），与上述源码核对一致；但 main.js 本身因顶部
触 document 而无法在 Node import，故横幅主循环路径的“执行”结论仍以
源码走查 + test_redesign 复刻/面板项为准，不得谎称为 Node 直接执行了
main.js（见 A2 分类脚注）。

### A2. test_redesign 84 项分类（实数复核，固定口径）

逐项数 `test_redesign.mjs` 的运行时断言（循环展开后）：§1 21 项、§2 日期
13 项、§2 搜索 5 项、§3 20 项、§4 19 项、§5 6 项，合计 84 项，与实测
`84 PASS, 0 FAIL` 一致。分类口径固定为 **26 直接执行 / 52 静态 / 6 复刻**，
分法如下（分类约定见脚注）：

| 类 | 数量 | 构成 |
|---|---|---|
| 直接执行（真实被测函数） | 26 | §1 15 项（earth 生产接线 5、横幅-面板一致性 5、面板穿越 1、面板文案 2、renderInfo 警告行 1、无 checker 对照 1）+ §2 日期 parseDateInput 6 项 + §2 搜索 5 项 |
| 静态（源码/文本锚点） | 52 | §2 日期走查 5 项 + §2 日期公式佐证 2 项 + §3 设计系统 20 项 + §4 移动端 19 项 + §5 B6/B15 锚点 6 项 |
| 复刻（本地复现生产逻辑，非生产代码本身） | 6 | §1 6 项（全景 earth 兜底 3 项、横幅文案 2 项、ceres 设计内差异 1 项），均依赖测试文件内 `bannerFor()` 对 `src/main.js:80-91` `refreshRangeBanner` 的逐字复刻 |

脚注（分类边界，须如实保留）：§1 的 5 项“横幅-面板一致性”同时用了
真实 `updateInfoValidity` 与复刻 `bannerFor`，按“执行了真实被测函数即
计直接执行”的约定计入直接执行；§2 的 2 项日期公式佐证（`dim()` 月末
天数、钳制算式）是本地公式复算，按走查类计入静态。静态与复刻项均
不是浏览器行为证明：点击、聚焦缓动、真实视口/触屏、FPS 一律未验证，
仍属第 4 节 B1–B15 待验证清单。

### A3. 本轮实测命令与结果（Node v24.22.1，2026-10-31）

| 命令 | 结果 |
|---|---|
| `node --check src/*.js`（astro, data, events, interaction, main, mobile, render, time, time-float, ui 共 10 个文件） | 10/10 OK |
| `node test_kepler.mjs` | 181 PASS，0 FAIL |
| `node test_ui.mjs` | 32 PASS，0 FAIL |
| `node test_redesign.mjs` | 84 PASS，0 FAIL |
| `npm test`（新增入口，依次跑上述三文件，任一失败即整体失败） | 297 PASS（181 + 32 + 84），0 FAIL |

本轮未放宽任何阈值、未删除任何断言、未改求解器精度；未引入
InstancedMesh、未引入 Worker（`src/` grep 两者均为 0 处）。

### A4. 工程化基建（P0-4）

- `package.json`：新增 `"scripts": {"test": "node test_kepler.mjs && node test_ui.mjs && node test_redesign.mjs"}`（另附 `test_kepler` / `test_ui` / `test_redesign` 单项入口）与 `"engines": {"node": ">=20"}`（与实测 Node v24.22.1 兼容，未写死单一版本）；依赖仍为 `three@0.160.0`。
- `.github/workflows/test.yml`：checkout 后以 Node 24（本地已验证版本；
  engines 要求 >= 20）运行 `node --check src/*.js` 与 `npm test`；不要求
  浏览器、不安装 three、不联网取 three（见 A5）。
- `package-lock.json`：本轮以 `npm install --package-lock-only --ignore-scripts`
  成功生成（非伪造），lockfileVersion 3，`three@0.160.0` 解析自
  `registry.npmjs.org`，含完整 integrity；故不存在“lockfile 待联网生成”
  的未完成项。CI 仍不跑 `npm install`，因为 Node 测试本身不依赖已安装
  的 three（见 A5），lockfile 仅用于依赖可复现性。

### A5. three 加载限定声明（不得声称测试覆盖了 three）

**Node 测试不 import `src/render.js` / `src/main.js`，不验证 three 加载。**
`three@0.160.0` 仅在浏览器运行时加载：`index.html:9-10` 的 jsdelivr
CDN importmap（`three` 与 `three/addons/`），失败时走 `index.html:176`
的 `cdn-fallback` 提示条与 15 秒兜底；`package.json` 的 three 声明与
importmap 版本一致（0.160.0），但仓库内无 three vendor 副本、无
node_modules，Node 下直接 import render.js 会报 `ERR_MODULE_NOT_FOUND`。
因此本报告及 CI 的“全绿”结论只覆盖 Node 可执行的纯函数/静态检查，
three 在浏览器中是否成功加载、场景是否渲染，仍属第 4 节 B1/B6/B7/B15
待浏览器验证，不得以测试全绿背书。

### A6. 诚实标注保留清单（本提交未删除、未淡化）

Kepler 近似非 DE441（README 明示“未做 Kepler 与 Horizons 的数值对比”）、
地球为 EMB 非地心（约 4670 km）、科学模式半径最小显示下限 0.004
（`src/render.js:492`）、4 巨行星环 profile 全为 schematic 示意、SBDB
模型事件（固定椭圆外推、适用期未知、5° 展示阈值、EMB 基准）——以上
均原样保留。

### A7. 历史标注（上一轮总数口径纠正）

上一轮报告曾以“仓库测试 + 独立探针 = 320 项”作为总数引用；该总数
**上一轮不可复现，不得引用**：独立探针 `/tmp/qa_probe.mjs` 已丢失且从未
入仓，静态服务器 curl 未重跑（Phase 1 审计报告 §6 亦已确认）。本附录
已把正文两处原 320 结论句改写为本树当前可复现口径（297 项 +
`node --check` 10/10），并在 §6 快照句加注说明；除本段标注外，全文
不再以 320 作为本轮结论出现（grep 核对见提交说明）。
