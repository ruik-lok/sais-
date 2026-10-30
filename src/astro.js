// astro.js — Keplerian orbital mechanics (no DOM, Node-compatible).
// Coordinates: heliocentric ecliptic J2000, positions in AU, angles in degrees.
// Time: Julian Day from UTC. This is a Keplerian approximation, NOT a full
// Horizons DE441 SPK ephemeris. See README.md for accuracy limits.

export const J2000 = 2451545.0; // 2000-01-01 12:00 UTC (TT approx.)

export function jdFromDate(date) {
  // date: JS Date (UTC). Fliegel-Van Flandern / standard JD formula.
  const y = date.getUTCFullYear();
  let m = date.getUTCMonth() + 1;
  const d = date.getUTCDate();
  const hh = date.getUTCHours() + date.getUTCMinutes() / 60 + date.getUTCSeconds() / 3600 + date.getUTCMilliseconds() / 3600000;
  let yy = y;
  if (m <= 2) { yy -= 1; m += 12; }
  const A = Math.floor(yy / 100);
  const B = 2 - A + Math.floor(A / 4);
  return Math.floor(365.25 * (yy + 4716)) + Math.floor(30.6001 * (m + 1)) + d + B - 1524.5 + hh / 24;
}

export function dateFromJd(jd) {
  return new Date((jd - 2440587.5) * 86400000);
}

export const DEG = Math.PI / 180;
export function normDeg(x) { let v = x % 360; if (v < 0) v += 360; return v; }
export function normRad(x) { let v = x % (2 * Math.PI); if (v < -Math.PI) v += 2 * Math.PI; if (v > Math.PI) v -= 2 * Math.PI; return v; }

/** Solve Kepler's equation E - e*sin(E) = M (radians) by Newton iteration. */
export function solveKepler(M, e) {
  const m = normRad(M);
  if (e < 0.8) {
    let E = m;
    for (let i = 0; i < 50; i++) {
      const d = (E - e * Math.sin(E) - m) / (1 - e * Math.cos(E));
      E -= d;
      if (Math.abs(d) < 1e-12) break;
    }
    return E;
  }
  // High eccentricity: start from pi.
  let E = Math.PI;
  for (let i = 0; i < 100; i++) {
    const d = (E - e * Math.sin(E) - m) / (1 - e * Math.cos(E));
    E -= d;
    if (Math.abs(d) < 1e-12) break;
  }
  return E;
}

/**
 * Elements in JPL approximate-ephemeris form:
 * { a, e, i, L, lp, Om, rates: {a,e,i,L,lp,Om} }  (angles deg, a AU, rates /century)
 * or in osculating form: { a, e, i, Om, w, M0, periodDays, epochJd }
 * Returns { x, y, z } in AU, heliocentric ecliptic J2000.
 */
export function positionFromElements(el, jd) {
  const T = (jd - J2000) / 36525; // centuries since J2000
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
    a = el.a; e = el.e; i = el.i; Om = el.Om; w = el.w;
    const n = 360 / el.periodDays; // deg/day
    Mdeg = normDeg(el.M0 + n * (jd - (el.epochJd || J2000)));
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

/** Moon / satellite position relative to its parent, in AU.
 *  el: { aKm, e, i, Om, w, periodDays, phaseDeg } — simplified Keplerian,
 *  orientation in the ecliptic frame (not the parent's equatorial frame).
 *  Labelled "simplified" in the UI; not a full lunar/planetary theory. */
export function moonPosition(el, jd) {
  const aAU = el.aKm / 149597870.7;
  const n = 360 / el.periodDays;
  const Mdeg = normDeg((el.phaseDeg || 0) + n * (jd - J2000));
  const E = solveKepler(Mdeg * DEG, el.e || 0);
  const xv = aAU * (Math.cos(E) - (el.e || 0));
  const yv = aAU * Math.sqrt(1 - (el.e || 0) * (el.e || 0)) * Math.sin(E);
  const wR = (el.w || 0) * DEG, oR = (el.Om || 0) * DEG, iR = (el.i || 0) * DEG;
  const cw = Math.cos(wR), sw = Math.sin(wR);
  const co = Math.cos(oR), so = Math.sin(oR);
  const ci = Math.cos(iR), si = Math.sin(iR);
  return {
    x: (cw * co - sw * so * ci) * xv + (-sw * co - cw * so * ci) * yv,
    y: (cw * so + sw * co * ci) * xv + (-sw * so + cw * co * ci) * yv,
    z: (sw * si) * xv + (cw * si) * yv,
  };
}

export function eclipticLongitude(p) {
  return normDeg(Math.atan2(p.y, p.x) / DEG);
}

export function distanceAU(p) {
  return Math.hypot(p.x, p.y, p.z);
}
