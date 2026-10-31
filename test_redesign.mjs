// test_redesign.mjs — 回归 QA（feature/visual-redesign，QA 只读 + 本文件）
// Run: node test_redesign.mjs
// 范围（REDESIGN_PLAN.md §4，QA 无 live browser 权限）：
//   ① B11 逻辑：validityFor + updateInfoValidity，跨 1800–2050 边界；
//   ② 自定义控件逻辑：parseDateInput + main.js 日期步进走查 + 搜索消歧；
//   ③ 设计系统静态检查：tokens/motion/mobile.css 与 index.html 真实元素；
//   ④ 移动端静态检查：媒体查询、抽屉/底部面板/悬浮条钩子、触屏目标；
//   ⑤ B6/B15 等代码锚点存在性（仅锚点，非浏览器行为证明）。
// 明确不是浏览器实测：点击、聚焦缓动、真实视口/触屏/FPS 一律未验证，见最终报告。
// 失败如实退出码 1，不放宽断言。main.js 顶部触 document，Node 无法 import，
// 故 main.js 相关项一律以源码走查（静态断言）为准，并在断言名中注明“走查”。

import { readFileSync } from "node:fs";
import { validityFor, setOutOfRangeChecker, updateInfoValidity, renderInfo, parseDateInput } from "./src/ui.js";
import { jdFromDate, isOutOfRange } from "./src/astro.js";
import { findBody, ALL_BODIES } from "./src/data.js";
import { Interaction, searchCandidates } from "./src/interaction.js";

let failures = 0;
let passes = 0;
// Classification counts, computed from check names at runtime (not a
// hand-written tally): 锚点 = source-anchor existence, 走查 = source
// walkthrough, 复刻 = re-implementation of untestable main.js logic,
// 混合 = replica verdict compared against a directly executed panel,
// 设计/移动 = static file checks, everything else = direct execution.
// Anchors/walkthroughs/replicas are NOT behaviour proof; see the §5
// header and the final summary print.
const kinds = { direct: 0, replica: 0, mixed: 0, walkthrough: 0, static: 0, anchor: 0 };
function kindOf(name) {
  if (name.includes("锚点")) return "anchor";
  if (name.includes("走查")) return "walkthrough";
  if (name.includes("混合")) return "mixed";
  if (name.includes("复刻")) return "replica";
  if (name.startsWith("设计") || name.startsWith("移动")) return "static";
  return "direct";
}
function check(name, cond, extra = "") {
  kinds[kindOf(name)]++;
  if (cond) passes++;
  else failures++;
  console.log(`${cond ? "PASS" : "FAIL"} ${name} ${extra}`);
}

// ---------------------------------------------------------------- 最小 DOM 桩
// updateInfoValidity 只用：el.dataset.bodyId、el.querySelector、
// document.createElement("p")、anchor.before(p)、el.prepend(p)、warn.remove()。
class FakeNode {
  constructor(tag = "div", className = "") {
    this.tag = tag;
    this.className = className;
    this.textContent = "";
    this.children = [];
    this.parent = null;
    this.attrs = {};
  }
  setAttribute(k, v) { this.attrs[k] = v; }
  getAttribute(k) { return this.attrs[k]; }
  remove() {
    if (!this.parent) return;
    this.parent.children = this.parent.children.filter((c) => c !== this);
    this.parent = null;
  }
  before(node) {
    if (!this.parent) return;
    const i = this.parent.children.indexOf(this);
    node.parent = this.parent;
    this.parent.children.splice(i, 0, node);
  }
  prepend(node) {
    node.parent = this;
    this.children.unshift(node);
  }
}
class FakePanel {
  constructor(bodyId) {
    this.dataset = { bodyId };
    this.innerHTML = "";
    this.h2 = new FakeNode("h2");
    this.actions = new FakeNode("div", "panel-actions");
    this.children = [this.h2, this.actions];
    this.h2.parent = this;
    this.actions.parent = this;
  }
  querySelector(sel) {
    if (sel === ".range-warning") return this.children.find((c) => c.className === "range-warning") || null;
    if (sel === ".panel-actions") return this.actions;
    if (sel === "h2") return this.h2;
    if (sel === "dl") return null;
    return null;
  }
  querySelectorAll() { return []; }
}
globalThis.document = {
  createElement: (tag) => new FakeNode(tag),
};
const panelWarn = (panel) => panel.querySelector(".range-warning");

// ------------------------------------------------------------ §1 B11：生产接线
// main.js 的真实接线：typeof astroNS.isOutOfRange === "function" 时注入
// astro.isOutOfRange（main.js:24）。以下先用该生产接线测，再用无 checker
// 的 UI 兜底规则对照，定位缺口到底在哪一层。
const JD = (y, m, d) => jdFromDate(new Date(Date.UTC(y, m - 1, d)));
const DATES = [
  ["1799-06-01", JD(1799, 6, 1), true],
  ["1800-01-01边界", JD(1800, 1, 1), false],
  ["2026-06-01", JD(2026, 6, 1), false],
  ["2050-12-31边界内", JD(2050, 12, 31), false],
  ["2100-01-01", JD(2100, 1, 1), true],
];
// main.js refreshRangeBanner (main.js:81-91) 的逐字逻辑复刻：main.js 本身
// 无法在 Node import（顶部触 document），复刻体只复用真实 validityFor，
// 因此“开关”结论可信，“文案”结论同样可信（文案来自同一 validityFor）。
function bannerFor(selectedId, jd) {
  const sel = selectedId ? findBody(selectedId) : null;
  let v = sel ? validityFor(sel, jd) : { outOfRange: false, label: "" };
  if (!v.outOfRange) {
    const gv = validityFor(findBody("earth"), jd);
    if (gv.outOfRange) v = { outOfRange: true, label: "当前模拟日期超出 JPL 近似星历适用期（约 1800–2050），位置精度无保证" };
  }
  return { visible: !!v.outOfRange, text: v.outOfRange ? `⚠ ${v.label}` : "" };
}

setOutOfRangeChecker(isOutOfRange); // 生产接线
{
  for (const [label, jd, wantOut] of DATES) {
    const v = validityFor(findBody("earth"), jd);
    check(`B11生产接线 earth ${label} outOfRange=${wantOut}`, v.outOfRange === wantOut, `jd=${jd} got=${v.outOfRange}`);
  }
  // 选中地球：横幅开关与面板警告开关在全部 5 个日期上一致。
  for (const [label, jd] of DATES) {
    const panel = new FakePanel("earth");
    updateInfoValidity(panel, jd);
    const b = bannerFor("earth", jd);
    check(`B11混合复刻/直接一致性 earth ${label} 横幅可见==面板警告`, b.visible === (panelWarn(panel) !== null), `banner=${b.visible} panel=${panelWarn(panel) !== null}`);
  }
  // 全景（无选中）：横幅靠 earth 兜底，1799/2100 可见、2026 隐藏。
  check("B11复刻全景 1799 横幅可见（earth兜底）", bannerFor(null, JD(1799, 6, 1)).visible === true);
  check("B11复刻全景 2026 横幅隐藏", bannerFor(null, JD(2026, 6, 1)).visible === false);
  check("B11复刻全景 2100 横幅可见（earth兜底）", bannerFor(null, JD(2100, 1, 1)).visible === true);
  // 同一面板连续穿越边界：2026（无警告）→1799（出现）→2026（消失）。
  {
    const panel = new FakePanel("earth");
    updateInfoValidity(panel, JD(2026, 6, 1));
    const s0 = panelWarn(panel) === null;
    updateInfoValidity(panel, JD(1799, 6, 1));
    const s1 = panelWarn(panel) !== null;
    updateInfoValidity(panel, JD(2026, 6, 1));
    const s2 = panelWarn(panel) === null;
    check("B11面板穿越 2026→1799→2026 警告出现再消失", s0 && s1 && s2, `states=${s0},${s1},${s2}`);
  }
  // 文案：生产接线下，选中 JPL 天体越界时的横幅与面板文案必须含中文说明、
  // 不含 "undefined"。astro.isOutOfRange 返回对象无 label 字段，ui.js
  // validityFor 原样返回该对象——此处如实断言，不放宽。
  {
    const b = bannerFor("earth", JD(1799, 6, 1));
    check("B11复刻横幅文案 选中earth越界含超出适用期", b.text.includes("超出适用期"), `text=${JSON.stringify(b.text)}`);
    check("B11复刻横幅文案 选中earth越界不含undefined", !b.text.includes("undefined"), `text=${JSON.stringify(b.text)}`);
    const panel = new FakePanel("earth");
    updateInfoValidity(panel, JD(1799, 6, 1));
    const t = panelWarn(panel) ? panelWarn(panel).textContent : "";
    check("B11生产接线 面板警告文案含超出适用期", t.includes("超出适用期"), `text=${JSON.stringify(t)}`);
    check("B11生产接线 面板警告文案不含undefined", !t.includes("undefined"), `text=${JSON.stringify(t)}`);
    // 全量渲染同一缺口：renderInfo 的警告行同样取 validity.label。
    const el = { innerHTML: "", dataset: {}, querySelector: () => null, querySelectorAll: () => [] };
    renderInfo(el, "earth", null, 1.0, { jdTT: JD(1799, 6, 1) });
    check("B11生产接线 renderInfo警告行不含undefined", !el.innerHTML.includes("undefined"), "见 FAIL 则与上同根因");
  }
  // 设计内差异（非失败）：SBDB 天体适用期未知，面板无警告；横幅因 earth
  // 兜底仍可见。两者分工不同（面板按天体、横幅按全局），如实记录。
  {
    const v = validityFor(findBody("ceres"), JD(1799, 6, 1));
    const panel = new FakePanel("ceres");
    updateInfoValidity(panel, JD(1799, 6, 1));
    const b = bannerFor("ceres", JD(1799, 6, 1));
    // 兜底文案为“超出 JPL 近似星历适用期”，故断言两个关键词而非连续词组。
    check("B11混合复刻/直接 ceres适用期未知面板无警告但横幅可见",
      v.outOfRange === null && panelWarn(panel) === null && b.visible === true && b.text.includes("超出") && b.text.includes("适用期"),
      `validity=${v.outOfRange} panelWarn=${panelWarn(panel) !== null} banner=${b.visible} text=${JSON.stringify(b.text)}`);
  }
  // 对照：无 checker 时 UI 兜底规则自带 label，文案完整——证明缺口在
  // checker 对象直通（ui.js validityFor），不在警告开关逻辑本身。
  setOutOfRangeChecker(null);
  {
    const v = validityFor(findBody("earth"), JD(1799, 6, 1));
    check("B11对照 无checker时label完整", v.outOfRange === true && v.label.includes("超出适用期"), `label=${JSON.stringify(v.label)}`);
  }
  setOutOfRangeChecker(isOutOfRange); // 恢复生产接线，供后文 renderInfo 使用
}

// ------------------------------------------------------- §2 自定义控件：日期
{
  const now = new Date(Date.UTC(2026, 9, 31, 15, 30, 45));
  const d = parseDateInput("2026-11-05", now);
  check("日期 parseDateInput指定日期保留时刻", d && d.toISOString() === "2026-11-05T15:30:45.000Z", d ? d.toISOString() : "null");
  check("日期 parseDateInput拒绝2026-02-30", parseDateInput("2026-02-30", now) === null);
  check("日期 parseDateInput拒绝2026-13-01", parseDateInput("2026-13-01", now) === null);
  check("日期 parseDateInput闰年2028-02-29有效", parseDateInput("2028-02-29", now) !== null);
  check("日期 parseDateInput拒绝非闰年2026-02-29", parseDateInput("2026-02-29", now) === null);
  check("日期 parseDateInput拒绝垃圾与空", parseDateInput("not-a-date", now) === null && parseDateInput("", now) === null);
}
// 走查（main.js 无法 Node import，源码断言 + 公式复算佐证，非执行证明）：
{
  const main = readFileSync(new URL("./src/main.js", import.meta.url), "utf-8");
  const applyBody = main.slice(main.indexOf("function applyStepperDate"), main.indexOf("function stepDate"));
  check("日期走查 applyStepperDate先钳制再解析", applyBody.includes("Math.min(d, daysInMonthUTC(y, m))") && applyBody.includes("parseDateInput("), "");
  check("日期走查 daysInMonthUTC用Date.UTC(y,month1,0)取月末", main.includes("new Date(Date.UTC(y, month1, 0)).getUTCDate()"), "");
  check("日期走查 步进即应用且立即刷横幅（B11日期路径）", applyBody.includes("refreshRangeBanner(jdFromDate(clock.date))"), "");
  check("日期走查 月步进用总月数换算（跨年正确）", main.includes("const total = (y * 12 + (m - 1)) + delta;"), "");
  check("日期走查 日步进用86400000日期算术（跨月正确）", main.includes("new Date(clock.date.getTime() + delta * 86400000)"), "");
  // 公式复算：daysInMonthUTC 公式本身在 2026-02 得 28、2028-02 得 29，
  // 故 Jan 31 月+1 的钳制结果为 Feb 28 / Feb 29。结论：main.js:305-308
  // 的钳制语义为“月底钳制到目标月月末”，不是溢出进下月，也不是拒绝。
  const dim = (y, m1) => new Date(Date.UTC(y, m1, 0)).getUTCDate();
  check("日期走查佐证 2026-02月末28天、2028-02月末29天", dim(2026, 2) === 28 && dim(2028, 2) === 29, `2026-02=${dim(2026, 2)} 2028-02=${dim(2028, 2)}`);
  check("日期走查结论 2026-01-31月+1钳制为02-28", Math.min(31, dim(2026, 2)) === 28, "");
}

// ------------------------------------------------------- §2 自定义控件：搜索
{
  const cands = searchCandidates("星", ALL_BODIES);
  check("搜索 星返回多候选非单项", cands.length > 1, `n=${cands.length}`);
  const ix = new Interaction({ renderer: { bodies: new Map(), highlight() {}, focusTo() {}, overview() {} }, getScenePos: () => null, onSelect: () => {} });
  Interaction._data.ALL_BODIES = ALL_BODIES;
  const amb = ix.search("星");
  check("搜索歧义不静默取首个", amb === null && ix.selectedId === null && ix.ambiguousCandidates.length > 1, `amb=${ix.ambiguousCandidates.length} selected=${ix.selectedId}`);
  const exact = ix.search("mars");
  check("搜索精确mars选中", exact && exact.id === "mars" && ix.selectedId === "mars");
  const single = ix.search("venus");
  check("搜索单候选venus选中", single && single.id === "venus" && ix.selectedId === "venus");
  check("搜索空串返回空", searchCandidates("  ", ALL_BODIES).length === 0);
}

// ------------------------------------------------------- §3 设计系统静态检查
const stripComments = (t) => t.replace(/<!--[\s\S]*?-->/g, "").replace(/\/\*[\s\S]*?\*\//g, "");
const hasEmoji = (t) => /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\uFE0F]/u.test(t);
{
  for (const f of ["src/tokens.css", "src/motion.css", "src/mobile.css"]) {
    const css = readFileSync(new URL(`./${f}`, import.meta.url), "utf-8");
    check(`设计 ${f}无linear-gradient`, !/linear-gradient/i.test(css));
    check(`设计 ${f}无#6ba8ff`, !css.toLowerCase().includes("#6ba8ff"));
    check(`设计 ${f}无Emoji`, !hasEmoji(css));
  }
  const html = readFileSync(new URL("./index.html", import.meta.url), "utf-8");
  const real = stripComments(html);
  check("设计 index.html无真实<select>元素（注释不算）", !/<select[\s>]/.test(real));
  check("设计 index.html无真实type=date元素（注释不算）", !/type=["']date["']/.test(real));
  check("设计 index.html无真实type=checkbox元素", !/type=["']checkbox["']/.test(real));
  check("设计 index.html分段控件存在（2段）", (real.match(/data-scale-mode=/g) || []).length >= 2, `n=${(real.match(/data-scale-mode=/g) || []).length}`);
  check("设计 index.html开关为role=switch（3个）", (real.match(/role="switch"/g) || []).length >= 3, `n=${(real.match(/role="switch"/g) || []).length}`);
  check("设计 index.html日期步进按钮存在（6个）", (real.match(/data-step-field=/g) || []).length >= 6, `n=${(real.match(/data-step-field=/g) || []).length}`);
  for (const f of ["src/tokens.css", "src/motion.css", "src/mobile.css", "src/mobile.js", "src/time-float.js"]) {
    check(`设计 index.html引用${f}`, html.includes(f));
  }
}

// ------------------------------------------------------- §4 移动端静态检查
{
  const css = readFileSync(new URL("./src/mobile.css", import.meta.url), "utf-8");
  const html = readFileSync(new URL("./index.html", import.meta.url), "utf-8");
  const mjs = readFileSync(new URL("./src/mobile.js", import.meta.url), "utf-8");
  const tf = readFileSync(new URL("./src/time-float.js", import.meta.url), "utf-8");
  check("移动 媒体查询max-width:900px存在", css.includes("@media (max-width: 900px)"));
  for (const hook of ["#nav-toggle", "#nav-scrim", "#info-sheet", "#sheet-handle", "#time-float"]) {
    check(`移动 mobile.css含钩子${hook}`, css.includes(hook));
    check(`移动 index.html含钩子${hook.slice(1)}`, html.includes(`id="${hook.slice(1)}"`));
  }
  check("移动 抽屉状态body[data-nav-open]存在", css.includes("body[data-nav-open]") && mjs.includes("data-nav-open"));
  check("移动 底部面板三档body[data-sheet]存在", css.includes('body[data-sheet="half"]') && css.includes('body[data-sheet="full"]') && mjs.includes("data-sheet"));
  check("移动 底部面板收起96px/半开45vh/全开85vh", css.includes("96px") && css.includes("85vh") && css.includes("translateY(40vh)"), "85vh面板+40vh位移=可见45vh");
  check("移动 触屏目标min-height:44px多处声明", (css.match(/min-height:\s*44px/g) || []).length >= 5, `n=${(css.match(/min-height:\s*44px/g) || []).length}`);
  check("移动 抽屉拖动/点击接线（mobile.js）", mjs.includes("pointerdown") && mjs.includes("pointermove") && mjs.includes("pointerup"));
  check("移动 悬浮条移入/移回函数存在（time-float.js）", tf.includes("moveToFloat") && tf.includes("moveToFooter") && tf.includes('matchMedia("(max-width: 900px)")'));
  check("移动 悬浮条第二排展开态data-expanded存在", css.includes('#time-float[data-expanded="false"]') && mjs.includes("data-expanded"));
  check("移动 悬浮条遮挡防护：footer在float有控件时隐藏", css.includes("body:has(#time-float button") && css.includes("#app footer"));
  // 静态检查到此为止：真实视口/触屏/FPS、抽屉拖动体感、移入移回联调
  // 均需浏览器，见最终报告，测试文件不谎称覆盖。
}

// ------------------------------------------- §5 B6/B15 代码锚点（存在性，非行为）
// Tightened (Phase 2, audit P0-3): every anchor is now scoped to the
// function/statement it claims, not a whole-file substring — a bare
// "1.5" or "o.glow" anywhere in the file used to satisfy the old checks.
// These are STILL anchors, not behaviour proof: they pin that the code
// shape survives refactors; only a browser run proves the visual result.
{
  const render = readFileSync(new URL("./src/render.js", import.meta.url), "utf-8");
  // setMode body only: from its definition to the next setter method.
  const setModeBody = render.slice(render.indexOf("  setMode(mode)"), render.indexOf("  setShadows(v)"));
  check("锚点 B6 setMode体内覆盖mesh/hit/label/glow/ring/大气/云层",
    setModeBody.includes("o.mesh.scale.setScalar(r)") && setModeBody.includes("o.hit.scale.setScalar") &&
    setModeBody.includes("o.glow") && setModeBody.includes("o.ring") &&
    setModeBody.includes("o.atmosphere") && setModeBody.includes("o.clouds") &&
    setModeBody.includes("this.updateMaxDistance()") && setModeBody.includes("this.refreshOrbits()") &&
    setModeBody.includes("this.applyLod()"));
  // Bloom: the single UnrealBloomPass construction statement, with its
  // exact (strength, radius, threshold) args, inside the composer setup
  // window (EffectComposer before it, OutputPass after it).
  const bloomIdx = render.indexOf("new UnrealBloomPass");
  const bloomWindow = render.slice(bloomIdx - 400, bloomIdx + 200);
  check("锚点 B7 泛光构造行参数0.55/0.5/1.5且在composer窗口内",
    /new UnrealBloomPass\(new THREE\.Vector2\(1, 1\), 0\.55, 0\.5, 1\.5\)/.test(render) &&
    bloomWindow.includes("new EffectComposer(this.renderer)") && bloomWindow.includes("new OutputPass()"));
  check("锚点 B7 ACES色调映射与点光源decay=2为精确行",
    render.includes("this.renderer.toneMapping = THREE.ACESFilmicToneMapping") &&
    render.includes("new THREE.PointLight(0xffffff, this.sunLightIntensity(), 0, 2)"));
  check("锚点 B7 setMode体内大气1.18/云层1.03缩放因子未变",
    setModeBody.includes("r * 1.18") && setModeBody.includes("r * 1.03"));
  // Comet branch only: the buildBodies 彗星 branch and the 1200 chars
  // after it must hold both coma and tail; the asteroid comment must
  // sit immediately before the same branch.
  const cometIdx = render.indexOf('if (b.type === "彗星")');
  const cometBody = render.slice(cometIdx, cometIdx + 1200);
  check("锚点 B15 彗发彗尾仅彗星分支内（分支体1200字符内）",
    cometBody.includes('name = "coma"') && cometBody.includes('name = "tail"'));
  check("锚点 B15 小行星不进彗星分支（注释紧邻同一分支）",
    render.slice(cometIdx - 400, cometIdx).includes("Asteroids get the irregular tier only"));
  // Tail dynamics only: the animate() cometTail block must hold both the
  // anti-sun direction line and the 1.5/rAU activity formula.
  const tailIdx = render.indexOf("if (o.cometTail) {");
  const tailBody = render.slice(tailIdx, tailIdx + 900);
  check("锚点 B15 彗尾块内远离太阳方向与1.5/rAU活动公式",
    tailBody.includes("o.cometDir.copy(o.group.position).normalize()") &&
    tailBody.includes("1.5 / Math.max(rAU, 0.1)"));
}

setOutOfRangeChecker(null);
console.log(`\n${passes} PASS, ${failures} FAIL`);
console.log(`分类（按测试名运行时统计）: 直接执行 ${kinds.direct} / 复刻 ${kinds.replica} / 混合复刻-直接 ${kinds.mixed} / 走查 ${kinds.walkthrough} / 静态 ${kinds.static} / 锚点 ${kinds.anchor}（合计须等于 ${passes + failures}；锚点/走查/复刻不是行为证明）`);
console.log(failures === 0 ? "ALL REDESIGN TESTS PASSED" : `${failures} REDESIGN TEST(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
