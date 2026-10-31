// test_render_pure.mjs — Phase 2 tests group C (audit P1-12): direct
// execution tests for the pure render math in src/renderPure.js.
// Run: node test_render_pure.mjs
// npm-test note: package.json currently carries no scripts (audit P0-4,
// owned by the infra workstream). When a test script lands, this file
// belongs in it alongside test_kepler.mjs / test_ui.mjs /
// test_redesign.mjs / test_pure.mjs / test_data.mjs.
// Scope honesty: this file covers ONLY pure computation (scale
// conversions, scene positions, governor state machine, LOD rules).
// WebGL construction, composer/bloom setup, pick/focus tweens and
// animate() live in render.js, cannot run under Node (three.js comes
// from a browser CDN importmap), and are NOT covered here — no check
// below claims otherwise. Expected numbers are hardcoded from the
// formulas (not recomputed by the same code), with tolerance 1e-9
// relative, so a formula change turns the test red instead of following it.

import {
  radiusUnitsFor, distUnitsFor, posFromAUFor, scenePosPure,
  governorStep, governorPixelRatioCap, governorHideDist,
  governorOrbitsVisible, governorLabelVisible,
  lodTier, lodLabelLayout, ringVisible,
} from "./src/renderPure.js";
import { findBody } from "./src/data.js";

let failures = 0;
let passes = 0;
function check(name, cond, extra = "") {
  if (cond) passes++;
  else failures++;
  console.log(`${cond ? "PASS" : "FAIL"} ${name} ${extra}`);
}
const close = (a, b, tol = 1e-9) => Math.abs(a - b) <= tol * Math.max(1, Math.abs(b));
const closeVec = (v, e) => close(v.x, e.x) && close(v.y, e.y) && close(v.z, e.z);

const EARTH = findBody("earth");
const MERCURY = findBody("mercury");
const JUPITER = findBody("jupiter");

// ------------------------------------------------------- radius / dist
{
  check("radius 视觉地球0.35", close(radiusUnitsFor(EARTH, "visual"), 0.35));
  check("radius 视觉水星约0.2384", close(radiusUnitsFor(MERCURY, "visual"), 0.23839949510462405));
  check("radius 科学地球钳制0.004", radiusUnitsFor(EARTH, "scientific") === 0.004);
  check("radius 科学木星约0.01402", close(radiusUnitsFor(JUPITER, "scientific"), 0.014019584571533612));
  check("dist 视觉1AU为16", close(distUnitsFor(1, "visual"), 16));
  check("dist 科学1AU为30", distUnitsFor(1, "scientific") === 30);
  check("dist 科学30AU为900", distUnitsFor(30, "scientific") === 900);
  check("dist 视觉0AU约3.1121", close(distUnitsFor(0, "visual"), 3.112059528613994));
  check("dist 视觉5AU约35.9283", close(distUnitsFor(5, "visual"), 35.928256132997156));
  check("dist 科学0AU为0", distUnitsFor(0, "scientific") === 0);
}

// ------------------------------------------------------- posFromAU
{
  check("posFromAU 视觉(1,0,0)->(16,0,0)", closeVec(posFromAUFor({ x: 1, y: 0, z: 0 }, "visual"), { x: 16, y: 0, z: 0 }));
  check("posFromAU 黄道y映射为three负z", closeVec(posFromAUFor({ x: 0, y: 1, z: 0 }, "visual"), { x: 0, y: 0, z: -16 }));
  check("posFromAU 黄道z映射为three正y", closeVec(posFromAUFor({ x: 0, y: 0, z: 1 }, "visual"), { x: 0, y: 16, z: 0 }));
  check("posFromAU 原点映射原点", closeVec(posFromAUFor({ x: 0, y: 0, z: 0 }, "visual"), { x: 0, y: 0, z: 0 }));
  const v = posFromAUFor({ x: 3, y: 4, z: 0 }, "visual");
  check("posFromAU 径向保距(3,4,0)模为dist(5)",
    close(Math.hypot(v.x, v.y, v.z), distUnitsFor(5, "visual")) && closeVec(v, { x: 0.6 * distUnitsFor(5, "visual"), y: 0, z: -0.8 * distUnitsFor(5, "visual") }),
    `v=${JSON.stringify(v)}`);
}

// ------------------------------------------------------- scenePosPure
{
  const ctx = (mode) => ({
    mode,
    findBody,
    moonOrder: new Map([["moon", 0]]),
    radiusUnits: (b) => radiusUnitsFor(b, mode),
  });
  const all = { earth: { x: 1, y: 0, z: 0 }, moon: { x: 1, y: 0.00257, z: 0 } };
  check("scenePos 视觉地球(1,0,0)->(16,0,0)",
    closeVec(scenePosPure("earth", all.earth, all, ctx("visual")), { x: 16, y: 0, z: 0 }));
  check("scenePos 科学地球(1,0,0)->(30,0,0)",
    closeVec(scenePosPure("earth", all.earth, all, ctx("scientific")), { x: 30, y: 0, z: 0 }));
  // Moon rel is ecliptic +y: three dir is (0,0,-1) (P0-2 mapping), so the
  // moon sits at parent scene pos minus the visual/scientific offset on z.
  check("scenePos 视觉月球父位+方向偏移(16,0,-1.51)",
    closeVec(scenePosPure("moon", all.moon, all, ctx("visual")), { x: 16, y: 0, z: -1.51 }));
  check("scenePos 科学月球父位+方向偏移(30,0,-0.0771)",
    closeVec(scenePosPure("moon", all.moon, all, ctx("scientific")), { x: 30, y: 0, z: -0.0771 }));
  check("scenePos 未知id回落AU映射",
    closeVec(scenePosPure("no-such", { x: 1, y: 0, z: 0 }, all, ctx("visual")), { x: 16, y: 0, z: 0 }));
  // Missing-parent fallback must equal the plain AU mapping (the
  // mapping formula itself is pinned by the posFromAU checks above).
  check("scenePos 母天体缺失回落AU映射",
    closeVec(scenePosPure("moon", all.moon, { moon: all.moon }, ctx("visual")), posFromAUFor(all.moon, "visual")),
    `got=${JSON.stringify(scenePosPure("moon", all.moon, { moon: all.moon }, ctx("visual")))}`);
}

// ------------------------------------------------------- governor
const freshGov = (tier = 0) => ({ tier, caps: [2, 1.5, 1], frames: 0, elapsed: 0, fps: null, goodSeconds: 0 });
// Drive one governor SAMPLE (not a fixed frame count): production samples
// when accumulated elapsed crosses 1 s, and 30 x (1/30) sums to just under
// 1 in floating point, so a frame-count driver can miss the sample
// entirely. Loop until elapsed resets to 0, i.e. a sample fired.
const runSample = (state, fps) => {
  let s = state;
  let guard = 0;
  do { s = governorStep(s, 1 / fps); guard++; } while (s.elapsed !== 0 && guard < 10000);
  return s;
};
{
  let s = freshGov(0);
  s = runSample(s, 60);
  check("governor 60fps1秒0档不动、好秒1", s.tier === 0 && s.goodSeconds === 1, `tier=${s.tier} good=${s.goodSeconds} fps=${s.fps}`);
  s = runSample(s, 60);
  check("governor 60fps2秒0档仍不动", s.tier === 0 && s.goodSeconds === 2);
  s = runSample(s, 20);
  check("governor 20fps1秒降至1档、好秒清零", s.tier === 1 && s.goodSeconds === 0);
  s = runSample(s, 20);
  check("governor 20fps再1秒降至最低2档", s.tier === 2);
  s = runSample(s, 20);
  check("governor 最低档再差不降档", s.tier === 2);
  s = runSample(s, 60);
  check("governor 最低档好1秒不回升（迟滞）", s.tier === 2 && s.goodSeconds === 1);
  s = runSample(s, 60);
  check("governor 最低档连续好2秒回升1档、好秒清零", s.tier === 1 && s.goodSeconds === 0);
  // Hysteresis reset by a mid-band second: good, mid, good, good -> up.
  s = runSample(s, 60);
  check("governor 回升前好1秒", s.tier === 1 && s.goodSeconds === 1);
  s = runSample(s, 40);
  check("governor 中段40fps好秒清零、不动档", s.tier === 1 && s.goodSeconds === 0, `fps=${s.fps}`);
  s = runSample(s, 60);
  s = runSample(s, 60);
  check("governor 中段打断后需重新连续好2秒才回升", s.tier === 0 && s.goodSeconds === 0);
  // Band edges: exactly 30 and 55 fall in the middle band (code uses
  // fps<30 / fps>55); 29 steps down, 56 counts as good.
  let e = freshGov(1);
  e = runSample(e, 30);
  check("governor 30fps属中段不动档", e.tier === 1 && e.goodSeconds === 0, `fps=${e.fps}`);
  e = runSample(e, 55);
  check("governor 55fps属中段不动档", e.tier === 1 && e.goodSeconds === 0, `fps=${e.fps}`);
  e = runSample(e, 29);
  check("governor 29fps降档", e.tier === 2);
  e = runSample(e, 56);
  e = runSample(e, 56);
  check("governor 56fps连续好2秒回升", e.tier === 1 && e.goodSeconds === 0);
  check("governor 像素比档位min(base,cap)", governorPixelRatioCap(2, 0, [2, 1.5, 1]) === 2
    && governorPixelRatioCap(1.8, 1, [2, 1.5, 1]) === 1.5
    && governorPixelRatioCap(2, 2, [2, 1.5, 1]) === 1
    && governorPixelRatioCap(0.8, 0, [2, 1.5, 1]) === 0.8);
  check("governor 隐藏距离科学1000/视觉80", governorHideDist("scientific") === 1000 && governorHideDist("visual") === 80);
}

// ------------------------------------------------------- governor visibility
{
  check("governor可见 轨道线非最低档跟随开关", governorOrbitsVisible(true, false) === true && governorOrbitsVisible(false, false) === false);
  check("governor可见 轨道线最低档恒隐藏", governorOrbitsVisible(true, true) === false);
  check("governor可见 标签非最低档跟随开关", governorLabelVisible(true, false, false, 9999, 80) === true);
  check("governor可见 标签最低档聚焦体仍可见", governorLabelVisible(true, true, true, 9999, 80) === true);
  check("governor可见 标签最低档近处可见（80内）", governorLabelVisible(true, true, false, 80, 80) === true);
  check("governor可见 标签最低档远处隐藏（80外）", governorLabelVisible(true, true, false, 81, 80) === false);
  check("governor可见 标签开关关则恒隐藏", governorLabelVisible(false, false, true, 0, 80) === false);
}

// ------------------------------------------------------- LOD
{
  check("LOD 距离小于半径30倍为high", lodTier(29.9, 1) === "high" && lodTier(10.49, 0.35) === "high");
  check("LOD 距离等于半径30倍为low（严格小于）", lodTier(30, 1) === "low" && lodTier(10.5, 0.35) === "low");
  check("LOD 距离大于半径30倍为low", lodTier(30.1, 1) === "low");
  check("LOD P1-4下限: 钳制小半径聚焦距离为high", lodTier(1.2, 0.004) === "high" && lodTier(1.5, 0.004) === "low");
  const l1 = lodLabelLayout(25, 1);
  check("LOD 标签布局d=25", close(l1.scaleX, 1.5) && close(l1.scaleY, 0.375) && close(l1.y, 1.4375), JSON.stringify(l1));
  const l2 = lodLabelLayout(10, 2);
  check("LOD 标签因子下限0.35", close(l2.scaleX, 1.05) && close(l2.scaleY, 0.2625) && close(l2.y, 2.38125), JSON.stringify(l2));
  const l3 = lodLabelLayout(2000, 1);
  check("LOD 标签因子上限25", close(l3.scaleX, 75) && close(l3.scaleY, 18.75), JSON.stringify(l3));
  check("LOD 环近处可见", ringVisible(1, 2.27, 100, 800, 45) === true);
  check("LOD 环远处亚像素隐藏", ringVisible(1, 2.27, 100000, 800, 45) === false);
  check("LOD 环阈值附近730可见、732隐藏", ringVisible(1, 2.27, 730, 800, 45) === true && ringVisible(1, 2.27, 732, 800, 45) === false);
}

console.log(`\n${passes} PASS, ${failures} FAIL`);
console.log(failures === 0 ? "ALL RENDER-PURE TESTS PASSED" : `${failures} RENDER-PURE TEST(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
