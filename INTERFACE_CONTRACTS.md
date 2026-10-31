# ORBITAL — INTERFACE_CONTRACTS.md（主控锁定版，开发阶段唯一接口规范）

> 状态：v1，2026-10-31，由主控制定。所有 Agent 必须遵循。接口不匹配先报主控协调，不许擅自改他人模块。
> 诚实底线：未知字段一律 `null` → UI 显示“未知”，不得编造；位置不得用无解释的固定圆轨道；开普勒近似与 DE441 的区别、程序化纹理与实测影像的区别必须在 UI 和文档里如实标注。

## 1. 天体数据结构（src/data.js）

- `BODIES[]`（行星/矮行星/小行星/彗星）与 `MOONS[]`（卫星）保持现有 id 命名（`earth`、`moon`、`titan`、`67p` 等），不得重命名已存在 id，不得删除已存在天体。
- 每个 BODIES 条目必填：`id, name, nameEn, type, diameterKm, parent, elements`（JPL 支：`a, e, i, Om, w, M0, rate*`；密切轨道支：`a, e, i, Om, w, M0, epochJd`，另加 `periodDays` 仅作展示/轨道线采样，计算以根数为准）。
- 可空字段（缺失 = `null`，禁止用 0 或整数占位冒充）：`massKg, density, tempK, rotationDays, axialTiltDeg, perihelionAU, aphelionAU, moonsTotal, moonsModelled, albedo, flattening, axesKm[3]（三轴）, ring{inner,outer,color,profile:'measured'|'schematic'}, atmosphere, orbitSolution{orbitId, epochJd, arcDays, uncertainty, conditionCode, source}, accuracy{level:'kepler'|'sbdb'|'horizons'|'schematic', validFromJd, validToJd, note}`。
- 卫星条目必填：`id, name, nameEn, parent（必须在 BODIES 中）, aKm, periodDays, e, iDeg, phaseDeg, phaseEpochJd`；可空同上。**相位必须带历元**，不再允许无历元整数占位相位存入数据层；无法核实的相位置 `phaseDeg: null` 并在 UI 标“示意/未知”。
- 死字段删除：`moonsList` 不再使用；`ALL_BODIES` 不得再给卫星强加 `elements: null, moons: 0` 混淆语义，卫星统一走 MOONS 结构，面板用 `moonsOf(parentId)` 计数，已建模数与总数分开显示。
- 新增数据必须附 `source` 与 `updated`（数据源发布/历元日期，不是文件整理日期）。

## 2. 坐标系统

- 内部基准：日心黄道 J2000，单位 AU，角度为度。太阳固定在原点仅为当前简化假设，`sunLight.position` 必须显式跟随太阳位置，不得依赖默认值。
- 卫星位置：默认母天体赤道系换算到日心黄道 J2000；若某卫星仍用黄道系示意，必须在 `accuracy.level='schematic'` 中明示，不得与正式解混用。
- 视位置改正链（分阶段）：本轮必须实现光行时（迭代 1 次）与岁差（IAU 2000 近似，J2000→当日平黄道）；章动/光行差列为可选增强，未实现时在文档注明，不得声称已实现。
- 地球条目是地月系质心（EMB）时，必须在数据与面板中注明；地心事件计算不得直接用 EMB 位置冒充地心，差值约 4670 km 必须在事件文档中说明。

## 3. 时间系统

- 内部时间：TT/TDB 近似。`jdFromDate(date)` 输入 UTC，输出 TT 儒略日：`TT = UTC + ΔT`，ΔT 采用分段查表/多项式近似（2026 年约 69.2 s，必须在代码注释中写明近似来源与量级，不得写死为 0）。`J2000 = 2451545.0 TT`。
- `SimClock` 接口不变：`play/pause/reverse/speedUp/speedDown/setDate(date)/now()/label()/dateInputValue()`，新增 guard：非法日期（Invalid Date）不得抛错，不得产生 NaN，必须保持上一有效日期并返回 false；年份超出 0001–9999 时 `label()` 不得截断乱码。
- 有效期护栏：JPL 支适用期 1800–2050（TT），超出时 UI 必须显示精度警告横幅，位置仍可算但标注“超出适用期，精度无保证”；密切轨道支适用期以各条目 `accuracy.validFromJd/validToJd` 为准，缺失则标“适用期未知”。
- 日期输入框必须回填当前模拟日期（`dateInputValue()` 已存在，必须在主循环中调用）；指定日期保留时刻，不得一律截断到 T00:00:00Z；“回到现在”必须同时恢复正向播放（除非用户随后手动改动）。

## 4. 物理引擎接口（src/astro.js）

- `solveKepler(M, e)`：仅接受 `0 <= e < 1`，非法输入（e≥1、e<0、NaN）必须抛出可识别 Error，不得返回静默 NaN；收敛后必须复核残差，失败抛错。
- `positionFromElements(el, jdTT)` → `{x, y, z}`（AU，日心黄道 J2000，几何位置）；新增 `positionWithLightTime(el, jdTT)`（光行时迭代版）供事件与面板使用；旧调用路径不得被悄悄改语义。
- `moonPosition(moon, jdTT, parentPosAU)` → `{x, y, z}`，父体位置由调用方传入，不得在函数内重复求解父体；缺 `aKm/periodDays` 时抛错而非 NaN。
- 统一返回结构（新增函数适用，旧函数保持兼容）：`{posAU, credibility: 'kepler'|'sbdb'|'horizons'|'schematic', validRange}`。
- 事件判定（src/events.js）输入必须是三维位置，不得只用黄经；输出 `{type:'conjunction'|'opposition', bodies:[a,b], jdTT, minAngleDeg, credibility}`，必须做极值 bracketing（不得只凭当日快照 <3°），阈值与出处写进注释；内行星永不报冲日；高速跳日不得漏检（按模拟日步进逐日扫，不得只在 floor(jd) 变化时刷新一次）。

## 5. 模型资源接口（src/render.js 纹理/几何部分）

- 纹理分三档标注：`measured`（实测影像，附来源与分辨率）、`procedural`（程序化，附生成器名与种子）、`schematic`（示意）。每体种子必须独立，不得全用种子 42 同一张图只换色；气态巨行星条带生成器与岩石体噪声生成器分开。
- 几何分档：`sphere`（球体）、`oblate`（扁球，flattening）、`triaxial`（三轴椭球，axesKm）、`irregular`（不规则低多边形体，用于小行星/彗星核）。缺失形状参数时用球体兜底并在面板注明“形状未知，按球体示意”。
- 彗星：必须有彗发（透明球壳/粒子）与彗尾（方向 = 远离太阳方向，随日心方向动态计算，长度随日心距变化）；彗星与小行星不得再走同一渲染分支。
- 环：`ring.profile` 为 `measured` 时用实测亮度剖面，为 `schematic` 时标注示意；环内外径与颜色按天体取自数据层，不得全行星硬编码 1.4–2.0 米色。

## 6. 材质接口

- 材质组合统一为可选字段：`{map, roughnessMap, normalMap, bumpMap, emissiveMap, roughness, metalness}`；`MeshBasicMaterial` 不得再被赋予 `emissive` 等不存在属性（太阳高亮改用 scale/颜色或专用辉光强度）。
- 大气/云层/环的透明度、混合模式、深度写入必须按天体显式声明；地球大气必须实现菲涅尔边缘辉光（昼夜侧差异），云层必须跟随轴倾并自转。
- 加载失败兜底：任何纹理/资源加载失败必须回退到程序化纹理并在 UI 给出提示，不得静默空白。

## 7. 渲染接口（src/render.js）

- 光照：点光源 `decay = 2`（物理衰减），强度按距离重标；环境光降至 0.15–0.25；开启阴影（PCFSoft，带开关，低端设备可关）；色调映射 `ACESFilmicToneMapping`；泛光后期（UnrealBloomPass）仅当不漫到标签/星空时启用，否则只开 ACES。
- `setMode(mode)` 必须覆盖全部可缩放对象：mesh、hit、label、环、太阳辉光、大气、云层；切换后不得残留旧比例尺寸，并有回归测试覆盖。
- 相机：`controls.maxDistance` 必须按当前模式最远天体动态适配（科学模式 ≥ 最远天体距离 × 1.2，至少 2500 单位）；初始相机与聚焦跟随逻辑不变；聚焦缓动 1.2 s 保持。
- LOD：几何 + 纹理 + 标签 + 环四维，节流 0.4 s 保持；几何必须共享单位球体（3 档共享，不得每体 3 套）；纹理显存与 draw call 不得因 LOD 上升。
- Three.js 依赖：写入 `package.json`（three@0.160.0），并加 CDN 失败降级提示；不得再只靠 importmap 且无 fallback。本地副本方案（artifact 曾用）仅作发布衍生参考，源码仓库以 npm 依赖 + CDN fallback 为准。

## 8. UI 状态接口（src/ui.js + src/interaction.js + index.html）

- 单一状态源（main.js 持有）：`{selectedId, breadcrumb[], searchQuery, searchCandidates[], searchHighlight, playing, reversed, speedDaysPerSec, currentJdTT, mode, fullscreen}`；各模块不得各自用 innerHTML 全量重绘。
- 信息面板：选中切换时全量渲染，模拟日变化时只增量更新“与太阳距离/与母天体距离”行，不得重置滚动与焦点；未知 id 渲染“未找到该天体”而非抛错。
- 面板字段：必须区分“卫星总数 vs 已建模数”；卫星面板必须显示“与母天体距离”（moon.aKm 实际值），不得只显示日心距离；冥王星必须有近日点/远日点行（从根数算出，不得缺失）；小天体来源栏不得写成“已来自 SBDB”除非真正接入。
- 搜索：输入时给出联想下拉（中英名 + 类型 + 母天体），Enter 选中高亮项，歧义不再静默取首个；占位语只能写实际支持的范围（中英名/id），未补编号字段前不得宣称支持编号。
- 导航：左侧按母天体分组（行星组 + 各行星卫星子组），面板内卫星可点击跳转，面包屑 + “返回母天体” + “返回全景”三级齐全；点击空白处取消选中。
- 全屏：必须补全屏按钮（`requestFullscreen`，带退出），键盘 Esc 回总览；画布设 `tabindex`，快捷键说明写进界面；播放/倒退按钮带 `aria-pressed`，导航带 `aria-current`，`:focus-visible` 样式齐全。
- 底部时间条：移动端行高改为 auto，不得固定 96px 溢出；加速度滑杆/预设档位；触屏目标 ≥44px（导航项与按钮内边距相应放大）。

## 9. 摄像机控制接口

- `focusTo(id)`（1.2 s 缓动，聚焦后跟随）、`overview()`（返回全景）、`focusParent()`（返回母天体）三者统一经摄像机控制器，禁止各模块自写缓动。
- 点击拾取：`pick(x, y)` 返回命中天体 id 或 null，命中球半径与标签重叠问题必须处理（密集卫星区按最近角距/距离排序，不得只取首个）；点击空白返回 null 并取消选中。
- 键盘：Space 播放/暂停（按钮聚焦时不得双重触发）、Esc 回总览、方向键调速，守卫排除 INPUT/BUTTON/SELECT。

## 10. 性能与测试契约（所有 Agent 共守）

- 位置求解频率不得与帧率挂钩；降级只降渲染（像素比、标签、轨道线、阴影），绝不降位置精度。
- `scenePos` 不得重复计算同一位置 3 次；`refreshOrbits` 不得全量重建，必须原地更新几何并同时 dispose 几何与材质；`detectEvents` 必须复用 `computePositions` 已算位置，不得重解 18 体。
- 启动阻塞：纹理生成必须分帧/懒加载或共享，首帧不得同步画 104,000 次圆弧；FPS governor：每秒采样，带迟滞分档降像素比（2→1.5→1），低档隐藏远处标签/轨道线，恢复同样迟滞。
- 每个 Agent 提交前必须跑：`node --check` 全部 src 文件 + `node test_kepler.mjs`（及自己新增测试），并在提交信息里写测试结果；不得以“自洽测试通过”声称精度达标，精度结论一律以 Horizons 对照为准。
