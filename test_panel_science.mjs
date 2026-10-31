// test_panel_science.mjs — Phase 2.5 science panel tests (P1-5, P1-8,
// P1-9, P2-16, P2-17, P2-18, P2-19, P2-20, P2-22). Node only: renderInfo
// runs against the same minimal stub element as test_ui.mjs.
// Run: node test_panel_science.mjs
import { renderInfo, periApFromElements, axialTiltText, shapeText, ringText, orbitSolutionText, dateRows, ttDateString, POSITION_NOTE } from "./src/ui.js";
import { findBody, ALL_BODIES } from "./src/data.js";

let failures = 0;
function check(name, cond, extra = "") {
  console.log(`${cond ? "PASS" : "FAIL"} ${name} ${extra}`);
  if (!cond) failures++;
}
function fakeEl() {
  return { innerHTML: "", dataset: {}, querySelector: () => null, querySelectorAll: () => [] };
}
function render(id) {
  const el = fakeEl();
  renderInfo(el, id, null, 1.0, {});
  return el.innerHTML;
}
// Extract the <dd> text following a given <dt> label, or null.
function dd(html, label) {
  const m = new RegExp(`<dt>${label}</dt><dd>([^<]*)</dd>`).exec(html);
  return m ? m[1] : null;
}
function num(s) { return s === null ? NaN : Number(s.replace(/,/g, "").replace(" AU", "")); }

// 0. TT epoch dates (NOT astro.dateFromJd, which subtracts Delta-T and
// lands on the previous UTC evening for .5 epochs).
check("ttDateString 2461200.5 -> 2026-06-09", ttDateString(2461200.5) === "2026-06-09");
check("ttDateString 2439875.5 -> 1968-01-20", ttDateString(2439875.5) === "1968-01-20");
check("ttDateString 2457305.5 -> 2015-10-10", ttDateString(2457305.5) === "2015-10-10");

// 1. J2000 geometric-position note: overview + body panels, same wording.
{
  const ov = fakeEl();
  renderInfo(ov, null, null, null, {});
  check("overview carries J2000 geometric note", ov.innerHTML.includes(POSITION_NOTE));
  check("earth panel carries same note", render("earth").includes(POSITION_NOTE));
}

// 2. Saturn: tilt, oblate shape, ring (radii + profile + Cassini gap),
// computed q/Q matching a(1∓e), split date rows.
{
  const html = render("saturn");
  check("saturn axial tilt 26.73°", dd(html, "自转轴倾角") === "26.73°");
  check("saturn shape oblate with flattening", (dd(html, "形状") || "").includes("扁球体") && (dd(html, "形状") || "").includes("0.09796"));
  const ring = dd(html, "行星环") || "";
  check("saturn ring radii in body radii", ring.includes("1.24") && ring.includes("2.27") && ring.includes("体半径"));
  check("saturn ring schematic + Cassini gap note", ring.includes("schematic") && ring.includes("卡西尼缝示意间隙"));
  const b = findBody("saturn");
  const q = num(dd(html, "近日点距离（由轨道根数计算）"));
  const Q = num(dd(html, "远日点距离（由轨道根数计算）"));
  check("saturn q matches a(1-e)", Math.abs(q - b.elements.a * (1 - b.elements.e)) < 0.001, `q=${q}`);
  check("saturn Q matches a(1+e)", Math.abs(Q - b.elements.a * (1 + b.elements.e)) < 0.001, `Q=${Q}`);
  check("saturn source date unknown (not file date)", dd(html, "数据源日期") === "未知");
  check("saturn file date 2026-10-31", dd(html, "数据整理日期") === "2026-10-31");
  check("saturn has no legacy updated row", !html.includes("数据更新时间"));
  check("saturn moons snapshot note", html.includes("卫星总数为目录快照值") && html.includes("未收录该总数的独立统计日期"));
}

// 3. Haumea: unknown tilt (never 0°), triaxial + geomean diameter,
// ring not modelled, orbit solution row.
{
  const html = render("haumea");
  check("haumea axial tilt unknown", dd(html, "自转轴倾角") === "未知" && axialTiltText(findBody("haumea")) === "未知");
  const shape = dd(html, "形状") || "";
  check("haumea triaxial axes shown", shape.includes("三轴椭球体") && shape.includes("1960") && shape.includes("1518") && shape.includes("996"));
  check("haumea geomean ~1436 km alongside catalogue 1632 km", shape.includes("1,436") && shape.includes("1,632") && shape.includes("不同估计"));
  check("haumea ring not modelled, not no-ring", (dd(html, "行星环") || "").includes("环未建模"));
  const orbit = dd(html, "轨道解（SBDB）") || "";
  check("haumea orbitId 132 + epoch 2026-06-09", orbit.includes("orbitId 132") && orbit.includes("2026-06-09"));
  check("haumea arc 25956 + solnDate 2026-06-06", orbit.includes("25,956") && orbit.includes("2026-06-06"));
  check("haumea has no invented ring params", ringText(findBody("haumea")) !== null && !ringText(findBody("haumea")).includes("体半径"));
}

// 4. Ceres: shape fallback, SBDB q/Q at 3 decimals (display only),
// orbit row, SBDB legacy date row unchanged, full-precision data intact.
{
  const html = render("ceres");
  check("ceres shape fallback labelled", (dd(html, "形状") || "").includes("形状未知，按球体示意"));
  check("ceres axial tilt unknown", dd(html, "自转轴倾角") === "未知");
  const qText = dd(html, "近日点距离") || "";
  check("ceres q displayed at 3 decimals", qText === "2.545 AU", qText);
  check("ceres q display is not full precision", !html.includes("2.545159361382861"));
  check("ceres data-layer full precision untouched", findBody("ceres").perihelionAU === 2.545159361382861);
  const orbit = dd(html, "轨道解（SBDB）") || "";
  check("ceres orbitId 48 + arc 9520", orbit.includes("orbitId 48") && orbit.includes("9,520"));
  check("ceres SBDB legacy updated row kept", dd(html, "数据更新时间") === "2021-04-13");
  check("ceres updated still equals solnDate", findBody("ceres").updated === findBody("ceres").orbitSolution.solnDate);
  check("ceres sourceDetail names SBDB query", (dd(html, "来源详情") || "").includes("SBDB API"));
}

// 5. Halley: comet orbit solution (distinct epoch, not perihelion jd).
{
  const html = render("halley");
  const orbit = dd(html, "轨道解（SBDB）") || "";
  check("halley orbitId 75 + epoch 1968-01-20", orbit.includes("orbitId 75") && orbit.includes("1968-01-20"));
  check("halley arc 57852 + solnDate 2025-11-21", orbit.includes("57,852") && orbit.includes("2025-11-21"));
  check("halley shape irregular", (dd(html, "形状") || "").includes("不规则体"));
}

// 6. Earth: computed q/Q, split dates, JPL period display-only label.
{
  const html = render("earth");
  const b = findBody("earth");
  const q = num(dd(html, "近日点距离（由轨道根数计算）"));
  const Q = num(dd(html, "远日点距离（由轨道根数计算）"));
  check("earth q matches a(1-e)", Math.abs(q - b.elements.a * (1 - b.elements.e)) < 0.001, `q=${q}`);
  check("earth Q matches a(1+e)", Math.abs(Q - b.elements.a * (1 + b.elements.e)) < 0.001, `Q=${Q}`);
  check("earth axial tilt 23.44°", dd(html, "自转轴倾角") === "23.44°");
  check("earth JPL period labelled display/sampling only", (dd(html, "公转周期") || "").includes("展示/采样用"));
  check("earth sourceDate null in data", findBody("earth").sourceDate === null && findBody("earth").fileUpdated === "2026-10-31");
}

// 7. Jupiter: oblate shape, ring without Cassini gap, computed q/Q,
// moons snapshot note, no legacy updated row.
{
  const html = render("jupiter");
  check("jupiter shape oblate", (dd(html, "形状") || "").includes("扁球体"));
  check("jupiter ring no Cassini gap note", (dd(html, "行星环") || "").includes("无卡西尼缝示意"));
  const b = findBody("jupiter");
  check("jupiter q matches a(1-e)", Math.abs(num(dd(html, "近日点距离（由轨道根数计算）")) - b.elements.a * (1 - b.elements.e)) < 0.001);
  check("jupiter Q matches a(1+e)", Math.abs(num(dd(html, "远日点距离（由轨道根数计算）")) - b.elements.a * (1 + b.elements.e)) < 0.001);
  check("jupiter totals not silently updated", html.includes("95 / 4") && html.includes("卫星总数为目录快照值"));
}

// 8. Mercury: genuine small tilt shown as degrees (not unknown), q/Q.
{
  const html = render("mercury");
  check("mercury axial tilt 0.034° shown", dd(html, "自转轴倾角") === "0.034°", dd(html, "自转轴倾角") || "");
  const b = findBody("mercury");
  check("mercury q matches a(1-e)", Math.abs(num(dd(html, "近日点距离（由轨道根数计算）")) - b.elements.a * (1 - b.elements.e)) < 0.001);
  check("mercury Q matches a(1+e)", Math.abs(num(dd(html, "远日点距离（由轨道根数计算）")) - b.elements.a * (1 + b.elements.e)) < 0.001);
}

// 9. Moon: satellite ecliptic-frame note + phase-epoch anchor (P2-17).
{
  const html = render("moon");
  check("moon panel names 黄道系示意", html.includes("黄道系示意"));
  check("moon phase epoch J2000 shown", (dd(html, "相位历元") || "").includes("J2000"));
}

// 10. Pure helpers: dateRows split vs legacy; no JPL/satellite body
// still carries the old single 'updated' masquerade field.
{
  check("dateRows split branch", JSON.stringify(dateRows(findBody("saturn"))) === JSON.stringify([["数据源日期", "未知"], ["数据整理日期", "2026-10-31"]]));
  check("dateRows SBDB legacy branch", JSON.stringify(dateRows(findBody("ceres"))) === JSON.stringify([["数据更新时间", "2021-04-13"]]));
  const offenders = ALL_BODIES.filter((b) => b.sourceDate === undefined && b.fileUpdated === undefined && b.orbitSolution === undefined && b.updated !== undefined);
  check("no non-SBDB body still uses single updated field", offenders.length === 0, offenders.map((b) => b.id).join(","));
  const split = ALL_BODIES.filter((b) => b.fileUpdated !== undefined);
  check("split-branch bodies all have sourceDate null", split.every((b) => b.sourceDate === null), `n=${split.length}`);
}

console.log(failures === 0 ? "\nALL PANEL SCIENCE TESTS PASSED" : `\n${failures} PANEL SCIENCE TEST(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
