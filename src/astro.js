// astro.js — Keplerian orbital mechanics (no DOM, Node-compatible).
// Coordinates: heliocentric ecliptic J2000, positions in AU, angles in degrees.
// Time: INTERNAL TIME IS TT (Terrestrial Time), approximated from UTC input.
//   jdFromDate(date) takes a UTC JS Date and returns a TT Julian Day:
//   JD(TT) = JD(UTC) + deltaTSeconds/86400. J2000 = 2451545.0 TT exactly.
//   This is a Keplerian approximation, NOT a full Horizons DE441 SPK
//   ephemeris. See README.md for accuracy limits.
//
// Delta-T approximation (deltaTSeconds):
//   Piecewise-linear interpolation over published anchor values. Anchors
//   1972-2026 follow the leap-second chain / IERS values (TT-UTC = TAI-UTC
//   + 32.184 s, plus UT1-UTC of at most ~0.9 s, which this table absorbs):
//   2000: 64.2 s, 2010: 66.2 s, 2020: 69.2 s, 2026: 69.2 s (the 2026 value
//   is the task-given ~69.2 s; observed Delta-T has sat within ~0.5 s of
//   69 s since early 2017, so the 2020-2026 plateau is real, not a copy
//   error). Older anchors follow the NASA Espenak / Morrison & Stephenson
//   historical table (1800: ~14 s, 1850: ~7 s, 1900: ~-3 s, 1950: ~29 s).
//   The Espenak & Meeus 2005-2050 polynomial (62.92 + 0.32217*t +
//   0.005589*t^2, t = year-2000) is DELIBERATELY NOT used: it predicts
//   ~75 s for 2026, contradicting the observed ~69.2 s plateau.
//   After 2026 the table extrapolates at ~0.5 s/yr; that leg is a guess
//   with ten-second-scale uncertainty and must not be quoted as measured.
//   Overall Delta-T error here is seconds-scale; at planetary speeds that
//   is hundreds of km, far below this model's arcminute-class Kepler
//   error (tens of thousands of km at 1 AU). Delta-T is NEVER 0 in this
//   code: the old "UTC JD, TT approx." comment was wrong and is fixed.
//
// Apparent-place corrections (positionWithLightTime):
//   - Light time: ONE iteration (geometric position at jdTT, tau from the
//     observer distance, re-solve at jdTT - tau). NOT iterated to
//     convergence; the second-order term is < 1 s of light time.
//   - Precession: IAU 2000 precession angles (Capitaine et al. 2003),
//     J2000 mean ecliptic -> mean ecliptic of date. Applied AFTER the
//     light-time step, and only when opts.precess is true (default).
//   - NOT implemented: nutation and stellar aberration. They are listed
//     as not implemented in README.md and must never be claimed.
//   - Note for event work: a common rotation (precession) does not change
//     the angle between two geocentric vectors, so events.js uses the
//     light-time step with precession OFF for its angle math.
//
// Validity guard (isOutOfRange):
//   - JPL-form branch (elements with L + rates): valid 1800-2050 TT,
//     i.e. JD 2378496.5 (1800-01-01) through 2470172.5 (2051-01-01).
//     Outside, positions are still computed (linear rate extrapolation)
//     but flagged: accuracy is NOT guaranteed there.
//   - Osculating branch (SBDB elements): validity comes from
//     body.accuracy.validFromJd / validToJd. SBDB returns
//     not_valid_before/after = null for all nine small bodies fetched
//     2026-10-31, so their validity is UNKNOWN (validityKnown: false),
//     never silently "in range".

export const J2000 = 2451545.0; // 2000-01-01 12:00 TT (NOT 12:00 UTC).

// JPL approximate-elements validity window, TT Julian Days.
export const JPL_VALID_FROM_JD = 2378496.5; // 1800-01-01 00:00 TT
export const JPL_VALID_TO_JD = 2470172.5;   // 2051-01-01 00:00 TT (i.e. through 2050)

// Speed of light in AU/day: 299792.458 km/s * 86400 s / 149597870.7 km.
export const C_AU_PER_DAY = 173.1446326742406;

// [UTC year, TT-UTC in seconds] anchors for deltaTSeconds(). See header.
const DELTA_T_ANCHORS = [
  [1800, 14.0], [1850, 7.0], [1900, -3.0], [1920, 21.0], [1950, 29.0],
  [1972, 42.2], [1990, 57.2], [2000, 64.2], [2010, 66.2], [2020, 69.2],
  [2026, 69.2], [2030, 71.0], [2050, 81.0],
];

/** Approximate TT-UTC in seconds for a UTC year (fractional allowed). */
export function deltaTSeconds(year) {
  if (!Number.isFinite(year)) throw new Error("deltaTSeconds: year must be finite");
  const a = DELTA_T_ANCHORS;
  if (year <= a[0][0]) return a[0][1]; // Pre-1800: clamped, NOT extrapolated.
  for (let k = 1; k < a.length; k++) {
    if (year <= a[k][0]) {
      const [y0, v0] = a[k - 1], [y1, v1] = a[k];
      return v0 + (v1 - v0) * ((year - y0) / (y1 - y0));
    }
  }
  // Past 2050: continue the final segment slope (~0.5 s/yr), flagged
  // in the header as a guess with ten-second-scale uncertainty.
  const [y0, v0] = a[a.length - 2], [y1, v1] = a[a.length - 1];
  return v1 + (v1 - v0) * ((year - y1) / (y1 - y0));
}

function jdFromUtcParts(y, m, d, hh) {
  let yy = y, mm = m;
  if (mm <= 2) { yy -= 1; mm += 12; }
  const A = Math.floor(yy / 100);
  const B = 2 - A + Math.floor(A / 4);
  return Math.floor(365.25 * (yy + 4716)) + Math.floor(30.6001 * (mm + 1)) + d + B - 1524.5 + hh / 24;
}

/**
 * UTC JS Date -> TT Julian Day. Throws an identifiable Error on an
 * Invalid Date (or a non-Date) instead of ever returning NaN.
 */
export function jdFromDate(date) {
  let ms;
  try { ms = date.getTime(); } catch {
    throw new Error("jdFromDate: expected a JS Date, got an unreadable value");
  }
  if (!Number.isFinite(ms)) throw new Error("jdFromDate: Invalid Date (NaN time) is not convertible to a Julian Day");
  const y = date.getUTCFullYear();
  const m = date.getUTCMonth() + 1;
  const d = date.getUTCDate();
  const hh = date.getUTCHours() + date.getUTCMinutes() / 60 + date.getUTCSeconds() / 3600 + date.getUTCMilliseconds() / 3600000;
  const yearFrac = y + (date.getUTCMonth() + d / 31) / 12;
  const jdUtc = jdFromUtcParts(y, m, d, hh);
  return jdUtc + deltaTSeconds(yearFrac) / 86400;
}

/** TT Julian Day -> JS Date (UTC clock reading closest to that TT instant). */
export function dateFromJd(jd) {
  if (!Number.isFinite(jd)) throw new Error("dateFromJd: jd must be finite");
  // Invert jdFromDate approximately: subtract Delta-T at the UTC estimate.
  const utcGuess = new Date((jd - 2440587.5) * 86400000);
  const y = utcGuess.getUTCFullYear();
  return new Date((jd - deltaTSeconds(y) / 86400 - 2440587.5) * 86400000);
}

export const DEG = Math.PI / 180;
export function normDeg(x) { let v = x % 360; if (v < 0) v += 360; return v; }
export function normRad(x) { let v = x % (2 * Math.PI); if (v < -Math.PI) v += 2 * Math.PI; if (v > Math.PI) v -= 2 * Math.PI; return v; }

/**
 * Solve Kepler's equation E - e*sin(E) = M (radians) by Newton iteration.
 * Only 0 <= e < 1 is accepted. Illegal input (e >= 1, e < 0, NaN) throws
 * an identifiable Error, and a failed convergence (residual check after
 * the loop) also throws instead of returning a silent near-answer.
 */
export function solveKepler(M, e) {
  if (!Number.isFinite(M)) throw new Error(`solveKepler: mean anomaly M must be finite (got ${M})`);
  if (!Number.isFinite(e)) throw new Error(`solveKepler: eccentricity e must be finite (got ${e})`);
  if (e < 0 || e >= 1) throw new Error(`solveKepler: eccentricity e must satisfy 0 <= e < 1 (got ${e}); hyperbolic/parabolic orbits are not supported`);
  const m = normRad(M);
  let E = e < 0.8 ? m : Math.PI;
  const iters = e < 0.8 ? 50 : 100;
  for (let i = 0; i < iters; i++) {
    const step = (E - e * Math.sin(E) - m) / (1 - e * Math.cos(E));
    E -= step;
    if (Math.abs(step) < 1e-12) break;
  }
  let residual = Math.abs(E - e * Math.sin(E) - m);
  if (residual > 1e-9 || !Number.isFinite(E)) {
    // Newton diverges for high eccentricity near M ≈ ±π (the old code
    // silently returned garbage there — e.g. Halley, e = 0.968, near
    // aphelion — because the derivative 1 - e*cos(E) collapses and a
    // single step can throw E tens of radians off). Fall back to
    // bisection, which is guaranteed: f(E) = E - e*sin(E) - m is
    // strictly increasing (f' >= 1 - e > 0) and the root lies in
    // [m - e, m + e] since |E - m| = |e*sin(E)| <= e.
    let lo = m - e, hi = m + e;
    const flo = lo - e * Math.sin(lo) - m; // <= 0 by construction
    let fhi = hi - e * Math.sin(hi) - m;   // >= 0 by construction
    if (flo > 0 || fhi < 0) throw new Error(`solveKepler: bisection bracket failed for M=${M}, e=${e}`);
    for (let i = 0; i < 200; i++) {
      const mid = 0.5 * (lo + hi);
      const fm = mid - e * Math.sin(mid) - m;
      if (fm < 0) lo = mid; else hi = mid;
      if (hi - lo < 1e-15) break;
    }
    E = 0.5 * (lo + hi);
    residual = Math.abs(E - e * Math.sin(E) - m);
  }
  if (residual > 1e-9) throw new Error(`solveKepler: failed to converge for M=${M}, e=${e} (residual ${residual})`);
  return E;
}

function assertFiniteJd(jd, fn) {
  if (!Number.isFinite(jd)) throw new Error(`${fn}: jdTT must be finite (got ${jd})`);
}

/**
 * Elements in JPL approximate-ephemeris form:
 * { a, e, i, L, lp, Om, rates: {a,e,i,L,lp,Om} }  (angles deg, a AU, rates /century)
 * or in osculating form: { a, e, i, Om, w, M0, periodDays, epochJd }
 * jdTT: TT Julian Day. Returns { x, y, z } in AU, heliocentric ecliptic
 * J2000, GEOMETRIC position (no light-time / precession correction).
 * Missing or non-positive periodDays in the osculating branch throws
 * instead of producing NaN; a null elements object throws.
 */
export function positionFromElements(el, jdTT) {
  assertFiniteJd(jdTT, "positionFromElements");
  if (!el || typeof el !== "object") throw new Error("positionFromElements: elements must be an object (got null/undefined)");
  const T = (jdTT - J2000) / 36525; // centuries since J2000
  let a, e, i, Om, w, Mdeg;
  if (el.L !== undefined) {
    const r = el.rates || {};
    a = el.a + (r.a || 0) * T;
    e = el.e + (r.e || 0) * T;
    i = el.i + (r.i || 0) * T;
    const L = normDeg(el.L + (r.L || 0) * T);
    const lp = normDeg(el.lp + (r.lp || 0) * T);
    Om = normDeg(el.Om + (r.Om || 0) * T);
    w = normDeg(lp - Om);
    Mdeg = normDeg(L - lp);
  } else {
    if (!Number.isFinite(el.periodDays) || el.periodDays <= 0) {
      throw new Error(`positionFromElements: osculating elements require a finite positive periodDays (got ${el.periodDays})`);
    }
    for (const k of ["a", "e", "i", "Om", "w", "M0"]) {
      if (!Number.isFinite(el[k])) throw new Error(`positionFromElements: osculating elements require finite ${k} (got ${el[k]})`);
    }
    a = el.a; e = el.e; i = el.i; Om = el.Om; w = el.w;
    const n = 360 / el.periodDays; // deg/day
    Mdeg = normDeg(el.M0 + n * (jdTT - (el.epochJd ?? J2000)));
  }
  const E = solveKepler(Mdeg * DEG, e);
  const xv = a * (Math.cos(E) - e);
  const yv = a * Math.sqrt(1 - e * e) * Math.sin(E);
  const wR = w * DEG, oR = Om * DEG, iR = i * DEG;
  const cw = Math.cos(wR), sw = Math.sin(wR);
  const co = Math.cos(oR), so = Math.sin(oR);
  const ci = Math.cos(iR), si = Math.sin(iR);
  return {
    x: (cw * co - sw * so * ci) * xv + (-sw * co - cw * so * ci) * yv,
    y: (cw * so + sw * co * ci) * xv + (-sw * so + cw * co * ci) * yv,
    z: (sw * si) * xv + (cw * si) * yv,
  };
}

/**
 * IAU 2000 precession, J2000 mean ecliptic -> mean ecliptic of date.
 * Chain (a common rotation applied to every vector, so it does not
 * change angles between vectors — see the events.js note):
 *   1. J2000 ecliptic -> J2000 mean equator (rotate by mean obliquity
 *      eps0 = 84381.448 arcsec),
 *   2. IAU 2000 precession angles (Capitaine et al. 2003) applied as
 *      the J2000->date direction (the textbook matrix in its usual
 *      form maps date->J2000; the code applies its transpose — see
 *      the sign-check note at step 2),
 *        zeta_A  = 2306.2181*T + 0.30188*T^2 + 0.017998*T^3
 *        z_A     = 2306.2181*T + 1.09468*T^2 + 0.018203*T^3
 *        theta_A = 2004.3109*T - 0.42665*T^2 - 0.041833*T^3,
 *      T centuries since J2000 (TT),
 *   3. mean equator of date -> mean ecliptic of date (rotate by the
 *      mean obliquity of date, eps = 84381.448 - 46.8150*T
 *      - 0.00059*T^2 + 0.001813*T^3 arcsec).
 * Applying P directly to ecliptic coordinates would be a frame error
 * (P is an equatorial matrix); the two obliquity rotations are what
 * make the result a mean-ecliptic-of-date vector. Nutation is NOT
 * applied. Returns a new {x, y, z}; identity at J2000.
 * Sanity scale: a fixed direction's ecliptic longitude advances by
 * general precession ~50.3"/yr, i.e. ~0.36 deg over 2000->2026.
 */
export function precessJ2000ToMeanOfDate(p, jdTT) {
  assertFiniteJd(jdTT, "precessJ2000ToMeanOfDate");
  const T = (jdTT - J2000) / 36525;
  const as2r = (Math.PI / 180) / 3600;
  const eps0 = 84381.448 * as2r;
  const eps = (84381.448 - 46.8150 * T - 0.00059 * T * T + 0.001813 * T * T * T) * as2r;
  const zeta = (2306.2181 * T + 0.30188 * T * T + 0.017998 * T * T * T) * as2r;
  const z = (2306.2181 * T + 1.09468 * T * T + 0.018203 * T * T * T) * as2r;
  const theta = (2004.3109 * T - 0.42665 * T * T - 0.041833 * T * T * T) * as2r;
  // Step 1: ecliptic J2000 -> equatorial J2000 (rotation about x by eps0).
  const c0 = Math.cos(eps0), s0 = Math.sin(eps0);
  let x = p.x, y = c0 * p.y - s0 * p.z, zq = s0 * p.y + c0 * p.z;
  // Step 2: precession. The Capitaine matrix in the usual textbook
  // form P = R3(-z_A) R2(theta_A) R3(-zeta_A) (with R3/R2 in the
  // "coordinate-rotation" convention) maps vectors FROM the mean
  // system of date TO J2000; what is needed here is its transpose,
  // applied as: R3v(z_A), then R2v(-theta_A), then R3v(zeta_A),
  // where R3v(a): x' = cos a*x - sin a*y, y' = sin a*x + cos a*y,
  // and R2v(a): x' = cos a*x - sin a*z, z' = sin a*x + cos a*z.
  // Sign check (2026, T = 0.26): a fixed direction's ecliptic
  // longitude must INCREASE by general precession ~50.3"/yr
  // (~+0.363 deg over 2000->2026, ~+1.397 deg over 2000->2100);
  // the untransposed matrix gives the opposite sign and is wrong.
  const cz = Math.cos(z), sz = Math.sin(z);
  const ct = Math.cos(theta), st = Math.sin(theta);
  const cZ = Math.cos(zeta), sZ = Math.sin(zeta);
  const x1 = cz * x - sz * y;
  const y1 = sz * x + cz * y;
  const z1 = zq;
  const x2 = ct * x1 - st * z1;
  const y2 = y1;
  const z2 = st * x1 + ct * z1;
  const x3 = cZ * x2 - sZ * y2;
  const y3 = sZ * x2 + cZ * y2;
  const z3 = z2;
  // Step 3: equatorial of date -> ecliptic of date (rotation about x by -eps).
  const ce = Math.cos(eps), se = Math.sin(eps);
  return { x: x3, y: ce * y3 + se * z3, z: -se * y3 + ce * z3 };
}

/**
 * Light-time-corrected position (ONE iteration) with optional precession.
 *   el: orbital elements (as for positionFromElements)
 *   jdTT: TT Julian Day of the observation (reception) time
 *   observerPosAU: {x,y,z} of the observer in the same J2000 frame, or
 *     null. For a true geocentric apparent place pass the Earth (EMB)
 *     position; with null the light time falls back to the heliocentric
 *     distance (Sun-centred approximation) and the result is flagged
 *     observer: 'heliocentric-approx' — do NOT present that as a
 *     geocentric apparent place.
 *   opts.precess (default true): also rotate J2000 -> mean of date.
 * Returns {x, y, z} (the corrected position, same fields as
 * positionFromElements for caller compatibility) plus:
 *   posAU (same vector), lightTimeDays (the tau actually used),
 *   frame ('mean-of-date' | 'J2000'), observer ('provided' |
 *   'heliocentric-approx').
 * The old geometric path is unchanged: positionFromElements still
 * returns the uncorrected J2000 geometric position.
 */
export function positionWithLightTime(el, jdTT, observerPosAU = null, opts = {}) {
  assertFiniteJd(jdTT, "positionWithLightTime");
  const p0 = positionFromElements(el, jdTT);
  let distAU;
  let observerFlag = "heliocentric-approx";
  if (observerPosAU && Number.isFinite(observerPosAU.x) && Number.isFinite(observerPosAU.y) && Number.isFinite(observerPosAU.z)) {
    distAU = Math.hypot(p0.x - observerPosAU.x, p0.y - observerPosAU.y, p0.z - observerPosAU.z);
    observerFlag = "provided";
  } else {
    distAU = Math.hypot(p0.x, p0.y, p0.z);
  }
  const tau = distAU / C_AU_PER_DAY; // days; exactly ONE iteration below.
  let p = positionFromElements(el, jdTT - tau);
  const precess = opts.precess !== false;
  if (precess) p = precessJ2000ToMeanOfDate(p, jdTT);
  return {
    x: p.x, y: p.y, z: p.z,
    posAU: { x: p.x, y: p.y, z: p.z },
    lightTimeDays: tau,
    frame: precess ? "mean-of-date" : "J2000",
    observer: observerFlag,
  };
}

/**
 * Validity flag for a body record (or a bare {elements, accuracy} object).
 * Returns { outOfRange: boolean|null, validityKnown: boolean,
 *   validFromJd, validToJd, branch }.
 *   - JPL branch: validityKnown always true, window 1800-2050 TT.
 *   - Osculating branch: window from accuracy.validFromJd/validToJd;
 *     either missing -> validityKnown false and outOfRange null
 *     ("适用期未知", NOT "in range").
 *   - No elements (e.g. the Sun): validityKnown false, outOfRange null.
 * The UI (owned by the UI Agent) renders the warning banner from this
 * flag; astro.js only computes it. Callers must not treat
 * outOfRange === null as "safe".
 */
export function isOutOfRange(body, jdTT) {
  assertFiniteJd(jdTT, "isOutOfRange");
  const el = body?.elements;
  if (!el) {
    return { outOfRange: null, validityKnown: false, validFromJd: null, validToJd: null, branch: "none" };
  }
  if (el.L !== undefined) {
    return {
      outOfRange: jdTT < JPL_VALID_FROM_JD || jdTT > JPL_VALID_TO_JD,
      validityKnown: true,
      validFromJd: JPL_VALID_FROM_JD, validToJd: JPL_VALID_TO_JD, branch: "jpl",
    };
  }
  const acc = body?.accuracy;
  const from = (acc && Number.isFinite(acc.validFromJd)) ? acc.validFromJd : null;
  const to = (acc && Number.isFinite(acc.validToJd)) ? acc.validToJd : null;
  if (from === null || to === null) {
    return { outOfRange: null, validityKnown: false, validFromJd: from, validToJd: to, branch: "osculating" };
  }
  return { outOfRange: jdTT < from || jdTT > to, validityKnown: true, validFromJd: from, validToJd: to, branch: "osculating" };
}

/**
 * Moon / satellite position RELATIVE to its parent, in AU.
 * el: { aKm, e, i, Om, w, periodDays, phaseDeg, phaseEpochJd }.
 *   phaseDeg is the mean anomaly AT phaseEpochJd (J2000 if the field is
 *   absent, for backward compatibility with old caller objects only;
 *   data.js entries always carry phaseEpochJd explicitly).
 *   Orientation is the ecliptic frame, NOT the parent's equatorial
 *   frame, and there is NO nodal regression / perigee precession:
 *   this is a simplified model, labelled as such in the UI.
 * Missing aKm / periodDays (or a null/unknown phaseDeg) throws an
 * identifiable Error instead of returning NaN — a schematic/unknown
 * phase must be surfaced by the caller (skip or label "示意"), never
 * silently plotted at phase 0.
 * If parentPosAU ({x,y,z}) is supplied, the return is the ABSOLUTE
 * position (parent + relative); the parent position is used as given
 * and is never re-solved inside this function. Without it the return
 * is the relative vector (the historical call shape, used by main.js).
 */
export function moonPosition(el, jdTT, parentPosAU = null) {
  assertFiniteJd(jdTT, "moonPosition");
  if (!el || typeof el !== "object") throw new Error("moonPosition: moon elements must be an object (got null/undefined)");
  if (!Number.isFinite(el.aKm) || el.aKm <= 0) throw new Error(`moonPosition: missing or invalid aKm (got ${el.aKm}); refusing to return NaN`);
  if (!Number.isFinite(el.periodDays) || el.periodDays <= 0) throw new Error(`moonPosition: missing or invalid periodDays (got ${el.periodDays}); refusing to return NaN`);
  if (!Number.isFinite(el.phaseDeg)) throw new Error("moonPosition: phaseDeg is null/unknown (schematic phase); no verified phase exists for this satellite, so no position is plotted");
  const aAU = el.aKm / 149597870.7;
  const n = 360 / el.periodDays;
  const epoch = Number.isFinite(el.phaseEpochJd) ? el.phaseEpochJd : J2000;
  const Mdeg = normDeg(el.phaseDeg + n * (jdTT - epoch));
  const e = el.e || 0;
  const E = solveKepler(Mdeg * DEG, e);
  const xv = aAU * (Math.cos(E) - e);
  const yv = aAU * Math.sqrt(1 - e * e) * Math.sin(E);
  const wR = (el.w || 0) * DEG, oR = (el.Om || 0) * DEG, iR = (el.i || 0) * DEG;
  const cw = Math.cos(wR), sw = Math.sin(wR);
  const co = Math.cos(oR), so = Math.sin(oR);
  const ci = Math.cos(iR), si = Math.sin(iR);
  const rel = {
    x: (cw * co - sw * so * ci) * xv + (-sw * co - cw * so * ci) * yv,
    y: (cw * so + sw * co * ci) * xv + (-sw * so + cw * co * ci) * yv,
    z: (sw * si) * xv + (cw * si) * yv,
  };
  if (parentPosAU && Number.isFinite(parentPosAU.x) && Number.isFinite(parentPosAU.y) && Number.isFinite(parentPosAU.z)) {
    return { x: parentPosAU.x + rel.x, y: parentPosAU.y + rel.y, z: parentPosAU.z + rel.z };
  }
  return rel;
}

export function eclipticLongitude(p) {
  return normDeg(Math.atan2(p.y, p.x) / DEG);
}

export function distanceAU(p) {
  return Math.hypot(p.x, p.y, p.z);
}
