// test_kepler.mjs — Node verification for the Kepler solver + catalogue.
// Run: node test_kepler.mjs
import { jdFromDate, solveKepler, positionFromElements, moonPosition, distanceAU, normRad, J2000 } from "./src/astro.js";
import { BODIES, MOONS, findBody } from "./src/data.js";

let failures = 0;
function check(name, cond, extra = "") {
  console.log(`${cond ? "PASS" : "FAIL"} ${name} ${extra}`);
  if (!cond) failures++;
}
function approx(a, b, tol) { return Math.abs(a - b) <= tol; }

// 1. Known Julian Day: 2000-01-01 12:00 UTC = 2451545.0
check("JD 2000-01-01 12:00 UTC", approx(jdFromDate(new Date(Date.UTC(2000, 0, 1, 12))), 2451545.0, 1e-6));

// 2. Kepler solver residual across eccentricities / anomalies.
for (const [M, e] of [[0, 0.1], [1.0, 0.2], [2.5, 0.5], [4.0, 0.9], [5.5, 0.967], [0.3, 0.0]]) {
  const E = solveKepler(M, e);
  check(`Kepler residual M=${M} e=${e}`, Math.abs(E - e * Math.sin(E) - ((M + Math.PI) % (2 * Math.PI) - Math.PI)) < 1e-9, `residual=${Math.abs(E - e * Math.sin(E) - (((M + Math.PI) % (2 * Math.PI)) - Math.PI)).toExponential(2)}`);
}

// 2b. High eccentricity near aphelion (P0 regression).
// Newton alone diverged for e≈0.97, M≈π and silently returned a wrong E
// (Halley's aphelion came out at r≈0.89 AU instead of ≈35 AU).
for (const e of [0.9, 0.968, 0.99, 0.999]) {
  for (const M of [Math.PI - 0.01, Math.PI, Math.PI + 0.01, Math.PI + 0.5]) {
    const E = solveKepler(M, e);
    const res = Math.abs(E - e * Math.sin(E) - normRad(M));
    check(`Kepler aphelion residual e=${e} M=${M.toFixed(3)}`, Number.isFinite(E) && res < 1e-9, `residual=${res.toExponential(2)}`);
  }
}

// 2c. Halley at aphelion: a=17.834 AU, e=0.96714 → r = a(1+e) ≈ 35.1 AU.
{
  // M0=179.9° (not exactly 180°): Newton converges trivially at E=π, so the
  // exact aphelion would not catch the divergence this test exists for.
  // Physical sanity check: Halley's aphelion distance is a(1+e) ≈ 35 AU.
  // (The divergence itself is regression-covered by the residual loop above;
  // whether Newton fails at one specific M is chaotic, so an end-to-end
  // radius assertion alone would not be a reliable regression test.)
  const halley = { a: 17.834, e: 0.96714, i: 162.26, Om: 58.42, w: 111.33, M0: 180.48, periodDays: 27509, epochJd: J2000 };
  const p = positionFromElements(halley, J2000);
  const r = distanceAU(p);
  check("Halley aphelion radius ≈ 35 AU", r > 30 && r < 40, `r=${r.toFixed(2)} AU`);
}

// 2d. Illegal eccentricity must throw instead of returning NaN silently.
for (const e of [-0.1, 1, 1.5, NaN]) {
  let threw = false;
  try { solveKepler(1, e); } catch { threw = true; }
  check(`illegal eccentricity e=${e} throws`, threw);
}

// 3. Earth returns near its starting position after one sidereal year.
const earth = findBody("earth");
const p0 = positionFromElements(earth.elements, J2000);
const p1 = positionFromElements(earth.elements, J2000 + 365.256);
const drift = Math.hypot(p1.x - p0.x, p1.y - p0.y, p1.z - p0.z);
check("Earth after one sidereal year", drift < 0.02, `drift=${drift.toFixed(4)} AU`);

// 4. All catalogued heliocentric bodies finite at 1900 / 2026 / 2100.
for (const jd of [2415020.0, 2461000.5, 2488070.0]) {
  for (const b of BODIES) {
    if (!b.elements) continue;
    const p = positionFromElements(b.elements, jd);
    check(`finite ${b.en} @ JD ${jd}`, Number.isFinite(p.x) && Number.isFinite(p.y) && Number.isFinite(p.z));
  }
  for (const m of MOONS) {
    const p = moonPosition(m.moon, jd);
    check(`finite moon ${m.en} @ JD ${jd}`, Number.isFinite(p.x) && Number.isFinite(p.y) && Number.isFinite(p.z));
  }
}

// 5. Halley perihelion distance ~0.586 AU at its 1986 perihelion epoch.
const halley = findBody("halley");
const hp = positionFromElements(halley.elements, halley.elements.epochJd);
check("Halley perihelion distance", approx(distanceAU(hp), 0.586, 0.01), `r=${distanceAU(hp).toFixed(3)} AU`);

// 6. Earth-Sun distance stays in [0.98, 1.02] AU over a year (sampled monthly).
let ok = true;
for (let k = 0; k < 12; k++) {
  const r = distanceAU(positionFromElements(earth.elements, J2000 + k * 30));
  if (r < 0.98 || r > 1.02) ok = false;
}
check("Earth-Sun distance in [0.98, 1.02] AU", ok);

console.log(failures === 0 ? "\nALL TESTS PASSED" : `\n${failures} TEST(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);