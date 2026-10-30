// test_kepler.mjs — Node verification for the Kepler solver + catalogue.
// Run: node test_kepler.mjs
import { jdFromDate, solveKepler, positionFromElements, moonPosition, distanceAU, J2000 } from "./src/astro.js";
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
