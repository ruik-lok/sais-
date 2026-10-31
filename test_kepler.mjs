// test_kepler.mjs — Node verification for the Kepler solver + catalogue.
// Run: node test_kepler.mjs
import { jdFromDate, dateFromJd, solveKepler, positionFromElements, moonPosition, distanceAU, J2000, deltaTSeconds, isOutOfRange, positionWithLightTime, precessJ2000ToMeanOfDate, eclipticLongitude, C_AU_PER_DAY } from "./src/astro.js";
import { BODIES, MOONS, findBody } from "./src/data.js";
import { SimClock } from "./src/time.js";

let failures = 0;
function check(name, cond, extra = "") {
  console.log(`${cond ? "PASS" : "FAIL"} ${name} ${extra}`);
  if (!cond) failures++;
}
function approx(a, b, tol) { return Math.abs(a - b) <= tol; }

// 1. TT Julian Day: 2000-01-01 12:00 UTC is NOT 2451545.0 (that is 12:00
// TT). TT-UTC at 2000 is 64.2 s (TAI-UTC 32 s + 32.184 s), so the TT JD
// is 2451545.0 + 64.2/86400. 2026-01-01 00:00 UTC uses the ~69.2 s plateau.
check("JD TT 2000-01-01 12:00 UTC", approx(jdFromDate(new Date(Date.UTC(2000, 0, 1, 12))), 2451545.0 + 64.2 / 86400, 1e-6));
check("Delta-T 2000 ~64.2 s", approx(deltaTSeconds(2000), 64.2, 0.01));
check("Delta-T 2026 ~69.2 s", approx(deltaTSeconds(2026), 69.2, 0.01));
check("JD TT 2026-01-01 00:00 UTC", approx(jdFromDate(new Date(Date.UTC(2026, 0, 1, 0))), 2461041.5 + 69.2 / 86400, 1e-5));

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
    if (m.moon.phaseDeg === null) {
      // Schematic/unknown phase: moonPosition must throw, never plot a placeholder.
      let threw = false;
      try { moonPosition(m.moon, jd); } catch { threw = true; }
      check(`schematic moon ${m.en} throws (no plotted placeholder) @ JD ${jd}`, threw);
    } else {
      const p = moonPosition(m.moon, jd);
      check(`finite moon ${m.en} @ JD ${jd}`, Number.isFinite(p.x) && Number.isFinite(p.y) && Number.isFinite(p.z));
    }
  }
}

// 5. Comets at their SBDB perihelion-passage times: r ≈ q.
// (Old test used the perihelion epoch as epochJd; epochJd is now the
// SBDB orbit-solution epoch and perihelionJd is recorded separately.)
const halley = findBody("halley");
const hp = positionFromElements(halley.elements, halley.elements.perihelionJd);
check("Halley perihelion distance (SBDB q)", approx(distanceAU(hp), 0.5749, 0.01), `r=${distanceAU(hp).toFixed(3)} AU`);
const p67 = findBody("67p");
const pp67 = positionFromElements(p67.elements, p67.elements.perihelionJd);
check("67P perihelion distance (SBDB q)", approx(distanceAU(pp67), 1.2433, 0.01), `r=${distanceAU(pp67).toFixed(3)} AU`);

// 5b. SBDB orbit solutions: all nine small bodies carry a formal solution
// (no rounded placeholder M0 survives: Ceres 95 / Eris 180 / Haumea 210 /
// Makemake 150 / Vesta 120 / Pallas 200 / Eros 60 are gone).
{
  const sbdbIds = ["ceres", "eris", "haumea", "makemake", "vesta", "pallas", "eros", "halley", "67p"];
  for (const id of sbdbIds) {
    const b = findBody(id);
    const o = b.orbitSolution;
    check(`SBDB orbitSolution present for ${id}`,
      !!o && typeof o.orbitId === "string" && Number.isFinite(o.epochJd) && Number.isFinite(o.arcDays)
      && Number.isFinite(o.conditionCode) && typeof o.source === "string"
      && o.epochJd === b.elements.epochJd && b.accuracy.level === "sbdb"
      && b.accuracy.validFromJd === null && b.accuracy.validToJd === null);
  }
  check("Ceres M0 is the SBDB value, not the old 95 placeholder",
    approx(findBody("ceres").elements.M0, 274.4193463761342, 1e-9));
  check("Eros M0 is the SBDB value, not the old 60 placeholder",
    approx(findBody("eros").elements.M0, 62.51145501986792, 1e-9));
  // Satellite phase rule: non-null phases always carry an epoch.
  const badPhase = MOONS.filter(m => m.moon.phaseDeg !== null && !Number.isFinite(m.moon.phaseEpochJd));
  check("every non-null satellite phase carries phaseEpochJd", badPhase.length === 0);
  check("20 of 21 satellite phases are null/schematic (only the Moon kept)",
    MOONS.filter(m => m.moon.phaseDeg === null).length === 20);
}

// 6. Earth-Sun distance stays in [0.98, 1.02] AU over a year (sampled monthly).
let ok = true;
for (let k = 0; k < 12; k++) {
  const r = distanceAU(positionFromElements(earth.elements, J2000 + k * 30));
  if (r < 0.98 || r > 1.02) ok = false;
}
check("Earth-Sun distance in [0.98, 1.02] AU", ok);

// 7. Solver / JD / moon guards: illegal input throws, never silent NaN.
function throws(name, fn) {
  let ok = false;
  try { fn(); } catch (e) { ok = e instanceof Error && e.message.length > 0; }
  check(name, ok);
}
throws("solveKepler rejects e=1", () => solveKepler(1.0, 1.0));
throws("solveKepler rejects e<0", () => solveKepler(1.0, -0.1));
throws("solveKepler rejects e=NaN", () => solveKepler(1.0, NaN));
throws("solveKepler rejects M=NaN", () => solveKepler(NaN, 0.1));
throws("jdFromDate rejects Invalid Date (no NaN)", () => jdFromDate(new Date(NaN)));
throws("positionFromElements rejects missing periodDays", () => positionFromElements({ a: 1, e: 0.1, i: 0, Om: 0, w: 0, M0: 0, epochJd: J2000 }, J2000));
throws("moonPosition rejects missing aKm", () => moonPosition({ periodDays: 27.3, phaseDeg: 0 }, J2000));
throws("moonPosition rejects missing periodDays", () => moonPosition({ aKm: 384400, phaseDeg: 0 }, J2000));
throws("moonPosition rejects null phaseDeg", () => moonPosition({ aKm: 384400, periodDays: 27.3, phaseDeg: null, phaseEpochJd: J2000 }, J2000));

// 8. SimClock Invalid-Date guard: keeps the previous valid date, returns false.
{
  const c = new SimClock();
  c.setDate(new Date(Date.UTC(2026, 5, 9, 12)));
  const before = c.date.getTime();
  check("SimClock.setDate(Invalid Date) returns false", c.setDate(new Date(NaN)) === false);
  check("SimClock keeps previous date on Invalid Date", c.date.getTime() === before);
  check("SimClock.setDate(valid) returns true", c.setDate(new Date(Date.UTC(2026, 5, 10, 12))) === true);
  const c2 = new SimClock();
  c2.date = new Date(Date.UTC(10000, 0, 1, 12));
  check("SimClock.label() does not truncate year 10000", c2.label().startsWith("10000-"));
  check("SimClock.dateInputValue() is empty outside 0001-9999", c2.dateInputValue() === "");
}

// 9. Validity guard: JPL branch in range 2026, out of range 2100 / 1700.
{
  const jd2026 = jdFromDate(new Date(Date.UTC(2026, 0, 1)));
  const vIn = isOutOfRange(earth, jd2026);
  check("JPL branch in range in 2026", vIn.validityKnown === true && vIn.outOfRange === false && vIn.branch === "jpl");
  const vOut = isOutOfRange(earth, 2488070.0); // ~2100
  check("JPL branch out of range in 2100", vOut.validityKnown === true && vOut.outOfRange === true);
  const vOld = isOutOfRange(earth, 2300000.0); // ~1582
  check("JPL branch out of range before 1800", vOld.validityKnown === true && vOld.outOfRange === true);
}

// 10. Light time (1 iteration) + precession: finite, consistent tau, scale right.
{
  const jd = jdFromDate(new Date(Date.UTC(2026, 0, 1)));
  const mars = findBody("mars");
  const ep = positionFromElements(earth.elements, jd);
  const mp = positionFromElements(mars.elements, jd);
  const lt = positionWithLightTime(mars.elements, jd, ep, { precess: false });
  const dist = Math.hypot(mp.x - ep.x, mp.y - ep.y, mp.z - ep.z);
  check("light-time tau = observer distance / c", approx(lt.lightTimeDays * C_AU_PER_DAY, dist, 1e-9));
  check("light-time position finite and shifted", Number.isFinite(lt.x) && Math.hypot(lt.x - mp.x, lt.y - mp.y, lt.z - mp.z) > 0);
  check("light-time without observer flags heliocentric-approx", positionWithLightTime(mars.elements, jd).observer === "heliocentric-approx");
  const pp = precessJ2000ToMeanOfDate(mp, jd);
  const ang = Math.acos((mp.x * pp.x + mp.y * pp.y + mp.z * pp.z) / (Math.hypot(mp.x, mp.y, mp.z) * Math.hypot(pp.x, pp.y, pp.z))) / (Math.PI / 180);
  check("precession 2026 shift ~0.36 deg (general precession)", ang > 0.30 && ang < 0.45, `shift=${ang.toFixed(3)} deg`);
  const idp = precessJ2000ToMeanOfDate(mp, J2000);
  check("precession identity at J2000", Math.hypot(idp.x - mp.x, idp.y - mp.y, idp.z - mp.z) < 1e-12);
  const lamShift = ((eclipticLongitude(pp) - eclipticLongitude(mp) + 540) % 360) - 180;
  check("precession longitude shift positive (equinox regresses)", lamShift > 0, `dLon=${lamShift.toFixed(3)} deg`);
}

// 11. Events: 3D angle + bracketing, known-date对照, inner-planet rule,
// high-speed (range-scan) no-miss. Known dates are almanac dates; the
// model is Kepler-only, so agreement is checked within ±2 days, and the
// Mars case additionally checks the 3D deviation (4.29 deg) that a
// longitude-only method would have hidden.
import { detectEvents, detectEventsInRange, ANGLE_THRESHOLD_DEG } from "./src/events.js";
{
  const jdT = (y, m, d) => jdFromDate(new Date(Date.UTC(y, m, d)));
  const dayOf = (j) => dateFromJd(j).toISOString().slice(0, 10);
  const yr = detectEventsInRange(jdT(2025, 0, 1), jdT(2026, 0, 1));
  const find = (id, type) => yr.find(e => e.bodies[0] === id && e.type === type);
  const marsOpp = find("mars", "opposition");
  check("Mars opposition 2025 found (3D, 5 deg threshold)", !!marsOpp, marsOpp ? `date=${dayOf(marsOpp.jdTT)} dev=${marsOpp.delta.toFixed(2)}` : "");
  check("Mars opposition 2025 within ±2 days of 2025-01-16", !!marsOpp && Math.abs(marsOpp.jdTT - jdT(2025, 0, 16)) <= 2.5);
  check("Mars opposition 2025 3D deviation ~4.29 deg (latitude amplification, not 0)", !!marsOpp && marsOpp.delta > 3.5 && marsOpp.delta < 5.0);
  check("Mars opposition output shape", !!marsOpp && marsOpp.minAngleDeg > 170 && marsOpp.credibility === "kepler" && marsOpp.bodies[1] === "sun");
  const satOpp = find("saturn", "opposition");
  check("Saturn opposition 2025 within ±2 days of 2025-09-21", !!satOpp && Math.abs(satOpp.jdTT - jdT(2025, 8, 21)) <= 2.5, satOpp ? `date=${dayOf(satOpp.jdTT)}` : "");
  const uraOpp = find("uranus", "opposition");
  check("Uranus opposition 2025 within ±2 days of 2025-11-21", !!uraOpp && Math.abs(uraOpp.jdTT - jdT(2025, 10, 21)) <= 2.5, uraOpp ? `date=${dayOf(uraOpp.jdTT)}` : "");
  check("inner planets never report opposition in 2025",
    !yr.some(e => e.type === "opposition" && (e.bodies[0] === "mercury" || e.bodies[0] === "venus")));
  check("Venus inferior conjunction 2025-03-23 NOT a 3D conjunction (min angle 8.42 deg)",
    !detectEventsInRange(jdT(2025, 2, 1), jdT(2025, 3, 1)).some(e => e.bodies[0] === "venus"));
  check("single-day panel finds Mars opposition on its day",
    detectEvents(jdT(2025, 0, 16)).some(e => e.bodies[0] === "mars" && e.type === "opposition"));
  check("range scan finds Mars opposition that a single far day misses (high-speed jump)",
    detectEventsInRange(jdT(2025, 0, 1), jdT(2025, 0, 31)).some(e => e.bodies[0] === "mars" && e.type === "opposition")
    && !detectEvents(jdT(2025, 0, 5)).some(e => e.bodies[0] === "mars" && e.type === "opposition"));
  check("threshold is the documented 5 deg 3D cut", ANGLE_THRESHOLD_DEG === 5);
  let threwEv = false;
  try { detectEventsInRange(NaN, 1); } catch { threwEv = true; }
  check("detectEventsInRange throws on NaN bounds", threwEv);
}

// 12. Solver robustness: high eccentricity near M = ±π (Halley aphelion
// region) — the old Newton-only solver silently diverged here.
{
  let ok = true;
  for (const e of [0.9, 0.967, 0.9679359956953211, 0.99]) {
    for (let k = 0; k <= 360; k++) {
      const M = -Math.PI + (2 * Math.PI * k) / 360;
      const E = solveKepler(M, e);
      let r = E - e * Math.sin(E) - M;
      r = ((r + Math.PI) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI) - Math.PI;
      if (Math.abs(r) > 1e-9) ok = false;
    }
  }
  check("solveKepler converges for high e across all M incl. ±π", ok);
  check("Halley near-aphelion M=3.22 e=0.968 solves", Number.isFinite(solveKepler(3.2201787319919237, 0.9679359956953211)));
}

console.log(failures === 0 ? "\nALL TESTS PASSED" : `\n${failures} TEST(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
