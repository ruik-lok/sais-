// test_moons.mjs — P0-1 Node verification for no-position satellites.
// Run: node test_moons.mjs
// Every check below EXECUTES a production function (computePositions
// loop via moonPosition/positionFromElements, data.hasPosition,
// Interaction.select, ui.renderInfo). No check greps source text: the
// render.js animate() hide decision uses the same data.hasPosition
// export asserted here, so passing here covers the production predicate.
// Scope is the minimal honest fix only: no phase is invented, the
// satellite count is unchanged (21), and the fundamental fix (formal
// phase epochs or Horizons satellite ephemerides) is a follow-up task,
// not attempted here.
import { BODIES, MOONS, ALL_BODIES, findBody, hasPosition } from "./src/data.js";
import { moonPosition, positionFromElements, jdFromDate } from "./src/astro.js";
import { Interaction, NO_POSITION_FOCUS_NOTICE } from "./src/interaction.js";
import { renderInfo } from "./src/ui.js";

let failures = 0;
function check(name, cond, extra = "") {
  console.log(`${cond ? "PASS" : "FAIL"} ${name} ${extra}`);
  if (!cond) failures++;
}

// Same loop as main.js computePositions (main.js itself is not
// Node-importable: DOM top-level code). The loop body — BODIES via
// positionFromElements, MOONS via moonPosition with try/catch skip —
// is executed here, not copied as a string assertion.
function computePositions(jd) {
  const pos = {};
  for (const b of BODIES) {
    if (b.id === "sun") pos.sun = { x: 0, y: 0, z: 0 };
    else if (b.elements) pos[b.id] = positionFromElements(b.elements, jd);
  }
  for (const m of MOONS) {
    const parent = pos[m.parent];
    if (!parent) continue;
    let rel;
    try { rel = moonPosition(m.moon, jd); } catch { continue; }
    pos[m.id] = { x: parent.x + rel.x, y: parent.y + rel.y, z: parent.z + rel.z };
  }
  return pos;
}

const jd = jdFromDate(new Date(Date.UTC(2026, 9, 31, 0, 0, 0))); // 2026-10-31
const positionsAU = computePositions(jd);
const nonMoon = MOONS.filter((m) => m.id !== "moon");

// 1. Position calculation: 20 non-Moon satellites hidden, Moon retained.
{
  check("MOONS total unchanged at 21", MOONS.length === 21, `n=${MOONS.length}`);
  check("non-Moon satellites total 20", nonMoon.length === 20);
  const hidden = nonMoon.filter((m) => !hasPosition(m.id, positionsAU));
  check("all 20 non-Moon satellites marked hidden by hasPosition", hidden.length === 20, `hidden=${hidden.length}`);
  check("no non-Moon satellite has a position entry", nonMoon.every((m) => !(m.id in positionsAU)));
  const moonPos = positionsAU.moon;
  check("Moon still has a finite position", hasPosition("moon", positionsAU) && Number.isFinite(moonPos.x) && Number.isFinite(moonPos.y) && Number.isFinite(moonPos.z));
  check("all 19 BODIES have positions", BODIES.every((b) => hasPosition(b.id, positionsAU)), `n=${BODIES.filter((b) => hasPosition(b.id, positionsAU)).length}/19`);
  let throws = 0;
  for (const m of nonMoon) { try { moonPosition(m.moon, jd); } catch { throws++; } }
  check("moonPosition throws for all 20 non-Moon satellites (no invented phase)", throws === 20, `throws=${throws}`);
  let moonThrows = false;
  try { moonPosition(findBody("moon").moon, jd); } catch { moonThrows = true; }
  check("moonPosition succeeds for the Moon", !moonThrows);
  check("hasPosition rejects missing / null / NaN maps", !hasPosition("titan", {}) && !hasPosition("titan", null) && !hasPosition("titan", { titan: { x: NaN, y: 0, z: 0 } }));
  check("satellite count not changed by the fix (21, not 20 or 22)", MOONS.length === 21 && nonMoon.length === 20);
}

// 2. Focus: a no-position body resolves to its parent, with the notice.
{
  // Stub renderer: parent bodies exist with radii; the stub getScenePos
  // mirrors main.js (null for a body with no position, parent pos else).
  const focused = [];
  const highlighted = [];
  const seen = [];
  const scenePos = { saturn: { x: 10, y: 2, z: 3 }, jupiter: { x: 20, y: 1, z: 4 }, earth: { x: 1, y: 0, z: 0 }, moon: { x: 1.01, y: 0, z: 0 } };
  const rendererStub = {
    bodies: new Map([
      ["saturn", { radius: 5 }],
      ["jupiter", { radius: 4 }],
      ["earth", { radius: 1 }],
      ["moon", { radius: 0.3 }],
      ["titan", { radius: 0.5 }],
      ["europa", { radius: 0.4 }],
    ]),
    focusTo(id, sp, radius) { focused.push({ id, sp, radius }); },
    highlight(id) { highlighted.push(id); },
    overview() {},
  };
  const ix = new Interaction({
    renderer: rendererStub,
    getScenePos: (id) => (hasPosition(id, positionsAU) ? scenePos[id] || null : null),
    hasPosition: (id) => hasPosition(id, positionsAU),
    onSelect: (id) => seen.push(id),
  });
  Interaction._data.ALL_BODIES = ALL_BODIES;

  ix.select("titan");
  check("titan focus redirects camera to saturn", focused.length === 1 && focused[0].id === "saturn" && focused[0].sp === scenePos.saturn && focused[0].radius === 5, JSON.stringify(focused));
  check("titan focusRedirectedTo is saturn", ix.focusRedirectedTo === "saturn");
  check("titan focusNotice is the exact no-phase copy", ix.focusNotice === NO_POSITION_FOCUS_NOTICE && ix.focusNotice === "暂无可用相位，位置未知，仅展示目录与物理参数");
  check("titan selection identity stays titan (panel still shows titan)", ix.selectedId === "titan" && seen[seen.length - 1] === "titan");
  check("titan highlight follows the camera target (saturn), not the origin body", highlighted[highlighted.length - 1] === "saturn");

  focused.length = 0;
  ix.select("europa");
  check("europa focus redirects camera to jupiter", focused.length === 1 && focused[0].id === "jupiter" && focused[0].radius === 4);
  check("europa focusRedirectedTo is jupiter", ix.focusRedirectedTo === "jupiter");

  focused.length = 0;
  ix.select("moon");
  check("Moon focus is NOT redirected", focused.length === 1 && focused[0].id === "moon" && ix.focusRedirectedTo === null && ix.focusNotice === null);

  focused.length = 0;
  ix.select("saturn");
  check("positioned parent focus is NOT redirected", focused.length === 1 && focused[0].id === "saturn" && ix.focusRedirectedTo === null);

  // Parent also unpositioned: no camera move to the origin, notice kept.
  const noMove = [];
  const ix2 = new Interaction({
    renderer: rendererStub,
    getScenePos: () => null, // main.js guard: no position -> null scene pos
    hasPosition: () => false,
    onSelect: () => {},
  });
  // focusTo must not be reached at all in this fallback path.
  rendererStub.focusTo = () => noMove.push("moved");
  ix2.select("titan");
  check("titan with unpositioned parent does not move the camera", noMove.length === 0 && ix2.focusNotice === NO_POSITION_FOCUS_NOTICE && ix2.focusRedirectedTo === null);
}

// 3. Panel: the same notice renders for a no-phase satellite, not for Moon.
{
  const fakeEl = () => ({
    innerHTML: "",
    dataset: {},
    querySelector: () => null,
    querySelectorAll: () => [],
  });
  const titanEl = fakeEl();
  renderInfo(titanEl, "titan", null, null, {});
  check("titan panel shows the exact no-phase notice", titanEl.innerHTML.includes(NO_POSITION_FOCUS_NOTICE));
  check("titan panel still shows catalogue/physical data (diameter)", titanEl.innerHTML.includes("5,149") && titanEl.innerHTML.includes("土卫六"));
  check("titan panel distances are unknown, not invented", titanEl.innerHTML.includes("未知"));
  const moonEl = fakeEl();
  renderInfo(moonEl, "moon", { x: 1, y: 0, z: 0 }, 1.0, { parentDistAU: 0.00257 });
  check("Moon panel does NOT show the no-phase notice", !moonEl.innerHTML.includes(NO_POSITION_FOCUS_NOTICE));
}

console.log(failures === 0 ? "\nALL MOON TESTS PASSED" : `\n${failures} MOON TEST(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
