// test_ui.mjs — Node verification for UI-agent work (no browser, no DOM).
// Run: node test_ui.mjs
// renderInfo/updateInfoDistances only touch the element passed in, so a
// minimal stub element suffices. SimClock itself lives in time.js, which is
// OUTSIDE this agent's authorised files, so its guard is not changed here;
// what IS covered is the UI-side guard main.js applies at every call site
// (parseDateInput: invalid input -> null, valid input keeps time-of-day).
import { renderInfo, updateInfoDistances, moonCountsText, periApFromElements, formatSource, breadcrumbFor, validityFor, setOutOfRangeChecker, parseDateInput } from "./src/ui.js";
import { Interaction, searchCandidates } from "./src/interaction.js";
import { ALL_BODIES, findBody } from "./src/data.js";

let failures = 0;
function check(name, cond, extra = "") {
  console.log(`${cond ? "PASS" : "FAIL"} ${name} ${extra}`);
  if (!cond) failures++;
}

// Minimal stub element for renderInfo / updateInfoDistances.
function fakeEl(rows = {}) {
  return {
    innerHTML: "",
    dataset: {},
    querySelector: (sel) => rows[sel] || null,
    querySelectorAll: () => [],
  };
}

// 1. renderInfo: unknown id renders "未找到该天体", never throws.
{
  const el = fakeEl();
  let threw = null;
  try { renderInfo(el, "no-such-body", null, null); } catch (e) { threw = e; }
  check("renderInfo unknown id does not throw", threw === null);
  check("renderInfo unknown id shows not-found", el.innerHTML.includes("未找到该天体") && el.innerHTML.includes("no-such-body"));
}

// 2. renderInfo: known bodies — Pluto peri/ap computed, moons total/modelled,
//    moon parent distance, SBDB source reframing, eris modelled-0 honesty.
{
  const pluto = fakeEl();
  renderInfo(pluto, "pluto", { x: 30, y: 0, z: 0 }, 30, {});
  check("pluto has perihelion/aphelion rows", pluto.innerHTML.includes("近日点距离") && pluto.innerHTML.includes("远日点距离"));
  const pa = periApFromElements(findBody("pluto").elements);
  check("pluto peri/ap from elements", Math.abs(pa.perihelionAU - 29.657) < 0.01 && Math.abs(pa.aphelionAU - 49.307) < 0.01, `q=${pa.perihelionAU.toFixed(3)} Q=${pa.aphelionAU.toFixed(3)}`);

  const jupiter = fakeEl();
  renderInfo(jupiter, "jupiter", null, 5.2, {});
  check("jupiter total vs modelled shown", jupiter.innerHTML.includes("95 / 4"));

  const moon = fakeEl();
  renderInfo(moon, "moon", null, 1.0, { parentDistAU: 0.00257 });
  check("moon shows parent distance + aKm", moon.innerHTML.includes("与母天体距离") && moon.innerHTML.includes("384,400"));

  const eris = fakeEl();
  renderInfo(eris, "eris", null, 68, {});
  check("eris total 1 / modelled 0 is explicit, not '无' contradiction", eris.innerHTML.includes("1 / 0") && eris.innerHTML.includes("尚未建模"));

  // INTEGRATION: SBDB is now actually connected (Physics, 2026-10-31), so
  // Ceres source must NOT lead with "尚未接入" any more.
  check("small-body source no longer claims not-connected", !formatSource(findBody("ceres")).startsWith("尚未接入") && formatSource(findBody("ceres")).includes("SBDB"));
  check("moonCountsText jupiter", moonCountsText(findBody("jupiter")) === "95 / 4（场景中仅建模 4 颗）");
}

// 3. updateInfoDistances: only the two rows change, suffix preserved.
{
  const sunRow = { textContent: "1.000 AU" };
  const parentRow = { textContent: "0.002570 AU （轨道半长轴 384,400 km）" };
  const el = fakeEl({ "#info-sun-dist": sunRow, "#info-parent-dist": parentRow });
  const ok = updateInfoDistances(el, { sunDistAU: 1.001, parentDistAU: 0.0026 });
  check("updateInfoDistances updates rows", ok && sunRow.textContent === "1.001 AU" && parentRow.textContent.startsWith("0.0026 AU") && parentRow.textContent.includes("轨道半长轴"));
  check("updateInfoDistances no-ops without rows", updateInfoDistances(fakeEl(), { sunDistAU: 1 }) === false);
}

// 4. Search: ranking + ambiguity (never silently takes the first hit).
{
  const cands = searchCandidates("星", ALL_BODIES);
  check("search '星' returns many candidates, not one silent hit", cands.length > 1, `n=${cands.length}`);
  check("search exact id wins", searchCandidates("67p", ALL_BODIES)[0].id === "67p");
  check("search exact english wins", searchCandidates("mars", ALL_BODIES)[0].id === "mars");
  check("search empty -> []", searchCandidates("  ", ALL_BODIES).length === 0);

  const rendererStub = { bodies: new Map(), highlight() {}, focusTo() {}, overview() {} };
  const seen = [];
  const ix = new Interaction({ renderer: rendererStub, getScenePos: () => null, onSelect: (id) => seen.push(id) });
  Interaction._data.ALL_BODIES = ALL_BODIES;
  const amb = ix.search("星");
  check("ambiguous search returns null, does not move", amb === null && ix.selectedId === null && ix.ambiguousCandidates.length > 1);
  const exact = ix.search("mars");
  check("exact search selects", exact && exact.id === "mars" && ix.selectedId === "mars");

  // Injection missing: warns instead of silently returning null.
  Interaction._data.ALL_BODIES = [];
  const warned = [];
  const origWarn = console.warn;
  console.warn = (msg) => warned.push(String(msg));
  const missing = ix.search("mars");
  console.warn = origWarn;
  check("missing injection warns, not silent null", missing === null && warned.length === 1 && ix.searchError !== null);
  Interaction._data.ALL_BODIES = ALL_BODIES; // restore for other runs
}

// 5. Interaction: focusParent + deselect.
{
  const rendererStub = { bodies: new Map(), highlight() {}, focusTo() {}, overview() {} };
  const ix = new Interaction({ renderer: rendererStub, getScenePos: () => null, onSelect: () => {} });
  Interaction._data.ALL_BODIES = ALL_BODIES;
  ix.select("moon");
  check("focusParent moon -> earth", ix.focusParent() === true && ix.selectedId === "earth");
  ix.select("sun");
  check("focusParent sun -> false (no parent)", ix.focusParent() === false);
  ix.deselect();
  check("deselect clears selection", ix.selectedId === null);
}

// 6. Breadcrumb chains.
{
  const chain = breadcrumbFor("moon").map((c) => c.id);
  check("breadcrumb moon", JSON.stringify(chain) === JSON.stringify([null, "earth", "moon"]), chain.join(","));
  check("breadcrumb unknown -> overview only", breadcrumbFor("nope").length === 1);
}

// 7. Validity: JPL branch out-of-range, osculating unknown, Physics hook.
{
  check("earth 2026 in range", validityFor(findBody("earth"), 2461000.5).outOfRange === false);
  check("earth 2132 out of range (provisional JPL rule)", validityFor(findBody("earth"), 2500000).outOfRange === true);
  check("ceres osculating -> unknown", validityFor(findBody("ceres"), 2461000.5).outOfRange === null);
  setOutOfRangeChecker(() => true);
  check("injected Physics checker wins", validityFor(findBody("earth"), 2461000.5).outOfRange === true);
  setOutOfRangeChecker(null);
  check("checker cleared restores provisional rule", validityFor(findBody("earth"), 2461000.5).outOfRange === false);
}

// 8. UI-side SimClock guard: parseDateInput (main.js call-site guard).
{
  const now = new Date(Date.UTC(2026, 9, 31, 15, 30, 45));
  const d = parseDateInput("2026-11-05", now);
  check("specified date keeps time-of-day", d && d.toISOString() === "2026-11-05T15:30:45.000Z", d ? d.toISOString() : "null");
  check("invalid calendar date -> null", parseDateInput("2026-02-30", now) === null);
  check("garbage -> null", parseDateInput("not-a-date", now) === null);
  check("empty -> null", parseDateInput("", now) === null);
}

// 9. P2-31 null-renderer: known-id select() and overview() must not throw.
//    Directly executes the functions under test with renderer: null
//    (production main.js always passes a Renderer, so this guards the
//    test/future-caller path, not a claimed production bug).
{
  const seen = [];
  const ix = new Interaction({ renderer: null, getScenePos: () => ({ x: 1, y: 0, z: 0 }), onSelect: (id) => seen.push(id) });
  Interaction._data.ALL_BODIES = ALL_BODIES;
  let threw = null;
  let ret = null;
  try { ret = ix.select("mars"); } catch (e) { threw = e; }
  check("null-renderer select known does not throw", threw === null);
  check("null-renderer select known returns true and notifies", ret === true && ix.selectedId === "mars" && seen.includes("mars"));
  threw = null;
  try { ix.overview(); } catch (e) { threw = e; }
  check("null-renderer overview does not throw and clears", threw === null && ix.selectedId === null);
  check("null-renderer overview notifies null", seen.includes(null));
  threw = null;
  let found = null;
  try { found = ix.search("mars"); } catch (e) { threw = e; }
  check("null-renderer exact search selects without throwing", threw === null && found && found.id === "mars" && ix.selectedId === "mars");
  const ix2 = new Interaction({ renderer: null, getScenePos: () => null, onSelect: () => {} });
  ix2.select("moon");
  check("null-renderer focusParent moon -> earth", ix2.focusParent() === true && ix2.selectedId === "earth");
}

console.log(failures === 0 ? "\nALL UI TESTS PASSED" : `\n${failures} UI TEST(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
