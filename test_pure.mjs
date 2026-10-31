// test_pure.mjs — Phase 2 tests group C (audit P0-3): direct-execution
// tests for the pure functions extracted from main.js.
// Run: node test_pure.mjs
// npm-test note: package.json currently carries no scripts (audit P0-4,
// owned by the infra workstream). When a test script lands, this file
// belongs in it alongside test_kepler.mjs / test_ui.mjs /
// test_redesign.mjs / test_data.mjs / test_render_pure.mjs. Until then
// it is run directly, as here.
// Every check below DIRECTLY executes the function under test (no source
// string anchors, no replicas): nextHighlight / resolveEnter from
// interaction.js, rangeBannerVerdict / panelSyncAction from ui.js, plus
// the unknown-id panel path through renderInfo itself.

import { nextHighlight, resolveEnter, Interaction, searchCandidates } from "./src/interaction.js";
import { rangeBannerVerdict, panelSyncAction, setOutOfRangeChecker, renderInfo } from "./src/ui.js";
import { jdFromDate, isOutOfRange } from "./src/astro.js";
import { findBody, ALL_BODIES } from "./src/data.js";

let failures = 0;
let passes = 0;
function check(name, cond, extra = "") {
  if (cond) passes++;
  else failures++;
  console.log(`${cond ? "PASS" : "FAIL"} ${name} ${extra}`);
}

const JD = (y, m, d) => jdFromDate(new Date(Date.UTC(y, m - 1, d)));

// ------------------------------------------------------- nextHighlight
{
  check("nextHighlight 下移无高亮落0", nextHighlight(-1, 5, +1) === 0);
  check("nextHighlight 上移无高亮落末项", nextHighlight(-1, 5, -1) === 4);
  check("nextHighlight 下移中项+1", nextHighlight(2, 5, +1) === 3);
  check("nextHighlight 上移中项-1", nextHighlight(2, 5, -1) === 1);
  check("nextHighlight 下移末项wrap到0", nextHighlight(4, 5, +1) === 0);
  check("nextHighlight 上移首项wrap到末项", nextHighlight(0, 5, -1) === 4);
  check("nextHighlight 空列表恒-1", nextHighlight(-1, 0, +1) === -1 && nextHighlight(2, 0, -1) === -1);
  check("nextHighlight 单项列表下移/上移均停留0", nextHighlight(0, 1, +1) === 0 && nextHighlight(0, 1, -1) === 0);
  check("nextHighlight 越界current按方向复位", nextHighlight(9, 3, +1) === 0 && nextHighlight(9, 3, -1) === 2);
}

// ------------------------------------------------------- resolveEnter
{
  const cands = searchCandidates("星", ALL_BODIES);
  check("resolveEnter 前置 歧义候选多于1项", cands.length > 1, `n=${cands.length}`);
  const ambOutcome = { hit: null, searchError: null, ambiguousCandidates: cands };
  const first = resolveEnter(-1, cands, ambOutcome);
  check("resolveEnter 歧义回车不跳（首按）", first.action === "ambiguous" && !first.body && first.candidates.length === cands.length);
  const second = resolveEnter(-1, cands, ambOutcome);
  check("resolveEnter 歧义回车两次仍不跳（B5双回车）", second.action === "ambiguous" && !second.body, `second=${second.action}`);
  const hl = resolveEnter(1, cands, null);
  check("resolveEnter 高亮项回车选中该项", hl.action === "highlight" && hl.body === cands[1]);
  check("resolveEnter 高亮越界不取项、走搜索分支（无结果）",
    resolveEnter(99, cands, { hit: null, searchError: null, ambiguousCandidates: [] }).action === "notFound");
  const earth = findBody("earth");
  check("resolveEnter 搜索命中返回searchHit",
    resolveEnter(-1, cands, { hit: earth, searchError: null, ambiguousCandidates: [] }).action === "searchHit");
  check("resolveEnter 搜索错误返回searchError",
    resolveEnter(-1, cands, { hit: null, searchError: "搜索数据未注入", ambiguousCandidates: [] }).action === "searchError");
  check("resolveEnter 无候选返回notFound",
    resolveEnter(-1, [], { hit: null, searchError: null, ambiguousCandidates: [] }).action === "notFound");
  // End-to-end through Interaction.search (still pure of DOM): ambiguous
  // search leaves selectedId null, so a following Enter has no highlight
  // and no hit to jump to.
  const ix = new Interaction({ renderer: { bodies: new Map(), highlight() {}, focusTo() {}, overview() {} }, getScenePos: () => null, onSelect: () => {} });
  Interaction._data.ALL_BODIES = ALL_BODIES;
  check("resolveEnter 配套 Interaction.search歧义不选中", ix.search("星") === null && ix.selectedId === null && ix.ambiguousCandidates.length > 1);
}

// ------------------------------------------------------- rangeBannerVerdict
// Production wiring: main.js injects astro.isOutOfRange as the checker.
setOutOfRangeChecker(isOutOfRange);
{
  const earth = findBody("earth");
  const pano = (jd) => rangeBannerVerdict(null, earth, jd);
  const sel = (jd) => rangeBannerVerdict(earth, earth, jd);
  check("banner 全景1799可见", pano(JD(1799, 6, 1)).visible === true);
  check("banner 全景2026隐藏", pano(JD(2026, 6, 1)).visible === false);
  check("banner 全景2100可见", pano(JD(2100, 1, 1)).visible === true);
  check("banner 选中earth1799可见", sel(JD(1799, 6, 1)).visible === true);
  check("banner 选中earth2026隐藏", sel(JD(2026, 6, 1)).visible === false);
  check("banner 选中earth2100可见", sel(JD(2100, 1, 1)).visible === true);
  check("banner 边界1800-01-01隐藏", sel(JD(1800, 1, 1)).visible === false, `jd=${JD(1800, 1, 1)}`);
  check("banner 边界2050-12-31隐藏", sel(JD(2050, 12, 31)).visible === false, `jd=${JD(2050, 12, 31)}`);
  const v1799 = sel(JD(1799, 6, 1));
  check("banner 越界文案含超出适用期且无undefined", v1799.text.includes("超出适用期") && !v1799.text.includes("undefined"), `text=${JSON.stringify(v1799.text)}`);
  check("banner 隐藏时文本为空", sel(JD(2026, 6, 1)).text === "");
  // LOCK (audit P2-12, not fixed here): a selected SBDB body at 1799 has
  // validity null, so the Earth fallback shows the JPL copy. This locks
  // current behaviour; a P2-12 fix must change this check with the fix.
  const ceres = rangeBannerVerdict(findBody("ceres"), earth, JD(1799, 6, 1));
  check("banner LOCK P2-12 SBDB选中越界仍走earth兜底显JPL文案",
    ceres.visible === true && ceres.text.includes("JPL"), `text=${JSON.stringify(ceres.text)}`);
}
setOutOfRangeChecker(null);

// ------------------------------------------------------- panelSyncAction
{
  check("panel守卫 一致时不渲染且闩锁复位", (() => {
    const r = panelSyncAction("earth", "earth", "earth");
    return r.action === "none" && r.latch === null;
  })());
  check("panel守卫 失配首现渲染一次", (() => {
    const r = panelSyncAction("", "earth", null);
    return r.action === "render" && r.latch === "earth";
  })());
  check("panel守卫 已闩锁失配不再渲染", (() => {
    const r = panelSyncAction("", "earth", "earth");
    return r.action === "none" && r.latch === "earth";
  })());
  check("panel守卫 一致后闩锁复位、再次失配可再渲染", (() => {
    const reset = panelSyncAction("earth", "earth", "earth");
    const again = panelSyncAction("", "earth", reset.latch);
    return reset.latch === null && again.action === "render";
  })());
  check("panel守卫 全景失配渲染一次（闩锁为空串）", (() => {
    const r = panelSyncAction("earth", null, null);
    return r.action === "render" && r.latch === "";
  })());
  check("panel守卫 全景一致不渲染", (() => {
    const r = panelSyncAction("", null, "");
    return r.action === "none" && r.latch === null;
  })());
  // Unknown id: the panel stays "" (renderInfo not-found) while the
  // selection holds the unknown id — 100 simulated frames must render
  // exactly once, never loop.
  let latch = null;
  let renders = 0;
  for (let i = 0; i < 100; i++) {
    const r = panelSyncAction("", "no-such-body", latch);
    latch = r.latch;
    if (r.action === "render") renders++;
  }
  check("panel守卫 未知id百帧仅渲染一次（不死循环）", renders === 1, `renders=${renders}`);
  // The not-found render itself (direct): unknown id never throws and
  // leaves bodyId "" so the guard above can latch on it.
  const el = { innerHTML: "", dataset: {}, querySelector: () => null, querySelectorAll: () => [] };
  let threw = false;
  try { renderInfo(el, "no-such-body", null, null, {}); } catch { threw = true; }
  check("panel守卫 未知id渲染不抛错且bodyId为空", !threw && el.dataset.bodyId === "" && el.innerHTML.includes("未找到该天体"));
  // Interaction.select on an unknown id: same contract, no throw, false.
  const ix = new Interaction({ renderer: { bodies: new Map(), highlight() {}, focusTo() {}, overview() {} }, getScenePos: () => null, onSelect: () => {} });
  let threw2 = false;
  let ret = null;
  try { ret = ix.select("no-such-body"); } catch { threw2 = true; }
  check("panel守卫 Interaction未知id不抛错返回false", !threw2 && ret === false && ix.selectedId === "no-such-body");
}

console.log(`\n${passes} PASS, ${failures} FAIL`);
console.log(failures === 0 ? "ALL PURE TESTS PASSED" : `${failures} PURE TEST(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
