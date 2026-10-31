// events.js — conjunction / opposition detection from the Keplerian model.
// NOT a prediction service and NOT Horizons data.
//
// Method (INTERFACE_CONTRACTS §4, audit P8 fix):
//   - Input is a THREE-DIMENSIONAL separation angle, not ecliptic
//     longitude alone: for a body at heliocentric position p and the
//     Earth (EMB) at e, the geocentric separation from the Sun is the
//     angle between (p - e) and (-e). A longitude-only test misfires
//     badly for inclined bodies (Pluto i = 17.14 deg is the classic case).
//   - Apparent places: each body's position is light-time corrected
//     (one iteration, astro.positionWithLightTime with precession OFF —
//     a common rotation cannot change the angle between two vectors, so
//     precession is irrelevant to the angle and is skipped here).
//   - Extremum bracketing, not a single-day snapshot: the angle is
//     sampled on a daily grid, a local extremum below threshold is
//     refined by parabolic interpolation through its three bracketing
//     samples, and only the refined extremum is reported with its
//     refined jdTT and extremal angle.
//   - High-speed jumps cannot skip an event: detectEventsInRange sweeps
//     EVERY day in the interval (main.js currently refreshes only when
//     floor(jd) changes — the UI/Performance agents own that call site;
//     they should call detectEventsInRange over any skipped interval
//     instead of a single-day detectEvents).
//   - Threshold: 5 deg on the 3D angle. This is a DISPLAY choice, not
//     a cited standard (there is no IAU/almanac "3D conjunction"
//     threshold — almanac conjunctions/oppositions are defined by
//     equal ecliptic longitude/RA, which is a DIFFERENT definition).
//     Why 5 and not the inherited 3: a 3D threshold of 3 deg MISSES
//     genuine oppositions because geocentric latitude is amplified at
//     opposition (Mars, Jan 2025: the model's extremum falls exactly
//     on the known opposition date 2025-01-16, but the 3D deviation is
//     4.29 deg, so a 3 deg cut drops it). 5 deg keeps Mars 2025
//     (4.29), Saturn 2025 (2.53), Uranus 2025 (0.55) and Neptune 2025
//     (1.36), while still excluding wide-latitude cases such as the
//     Venus inferior conjunction of 2025-03-23 (3D minimum 8.42 deg —
//     an almanac conjunction by longitude, NOT a close 3D approach).
//     Extreme perihelic Mars oppositions can exceed even 5 deg and
//     will still be missed: that is the inherent trade-off of a 3D
//     definition, stated here rather than hidden. Panel copy agrees:
//     main.js:413 already says "三维角距阈值 5°", consistent with the
//     5 deg threshold above.
//   - Inner planets NEVER report opposition: a body with a < Earth's
//     semi-major axis can never reach a Sun-Earth-body angle near 180
//     deg, so Mercury/Venus opposition candidates are skipped by
//     construction, not by threshold luck.
//   - Credibility names the ELEMENTS source (kepler = JPL approximate
//     elements, sbdb = SBDB formal solution); the positions themselves
//     are still fixed-Kepler propagations in both cases, never DE441.
//   - EMB vs geocentre: the Earth position used here is the Earth-Moon
//     barycentre (data.js earth entry), NOT the geocentre. The
//     geocentre differs by ~4670 km (0.00003 AU, about 0.002 deg at
//     1 AU as seen from the Sun's direction — negligible against the
//     3 deg display threshold, but a systematic offset that makes
//     these events unsuitable for eclipse/occultation geometry, where
//     the distinction is decisive). Events are therefore EMB-based
//     and labelled as model events, not geocentric predictions.
//   - 已验证对照口径（Phase 2.5，P1-7——唯一可引为“已验证”的范围）
//     ：仅 JPL 三行星（火星、土星、天王星）、2025 年、3D 角距定义、
//     2.5 天容差。SBDB 天体的事件无历书对照，不得引为已验证预报；
//     面板对 SBDB 行标注“模型事件，非预报”。面板（main.js
//     refreshEvents）渲染每件事件的可信度、抛物线细化 jdTT 日期与
//     EMB 基准，均取自下述输出字段——不得为迎合面板改动检测器。
import { positionFromElements, positionWithLightTime } from "./astro.js";
import { BODIES, findBody } from "./data.js";

/** Display threshold in degrees on the 3D angle (display choice, NOT a cited standard — see header). */
export const ANGLE_THRESHOLD_DEG = 5;

const EARTH = findBody("earth");
const EARTH_A_AU = 1.00000261; // Earth J2000 semi-major axis (JPL branch)

function separationDeg(bodyPos, earthPos) {
  const bx = bodyPos.x - earthPos.x, by = bodyPos.y - earthPos.y, bz = bodyPos.z - earthPos.z;
  const sx = -earthPos.x, sy = -earthPos.y, sz = -earthPos.z;
  const nb = Math.hypot(bx, by, bz), ns = Math.hypot(sx, sy, sz);
  if (nb === 0 || ns === 0) return NaN;
  const c = Math.max(-1, Math.min(1, (bx * sx + by * sy + bz * sz) / (nb * ns)));
  return Math.acos(c) * 180 / Math.PI;
}

function credibilityOf(body) {
  const lvl = body?.accuracy?.level;
  if (lvl === "sbdb" || lvl === "kepler" || lvl === "horizons") return lvl;
  return body?.elements?.L !== undefined ? "kepler" : "schematic";
}

function isInnerPlanet(body) {
  return Number.isFinite(body?.elements?.a) && body.elements.a < EARTH_A_AU;
}

// Parabolic vertex through (-1, y0), (0, y1), (1, y2). Returns
// { offset, value } or null when the parabola opens downward / flat.
function parabolicVertex(y0, y1, y2) {
  const denom = y0 - 2 * y1 + y2;
  if (!(denom > 0)) return null;
  const offset = (y0 - y2) / (2 * denom);
  if (offset < -1 || offset > 1) return null;
  return { offset, value: y1 - ((y2 - y0) * (y2 - y0)) / (8 * denom) };
}

/**
 * Sweep [jdStartTT, jdEndTT] day by day and return every refined event
 * whose extremum falls in the interval. Output per event:
 *   { type: 'conjunction'|'opposition', bodies: [bodyId, 'sun'],
 *     jdTT, minAngleDeg, credibility,
 *     kind: '合相'|'冲日', body: <body record>, delta: <deviation from
 *       exact in degrees> }
 * minAngleDeg is the EXTREMAL separation angle itself (≈0 deg for
 * conjunction, ≈180 deg for opposition); delta is the deviation from
 * exact (angle for conjunction, 180-angle for opposition) and is the
 * field the old main.js panel renders. kind/body/delta are kept so the
 * existing main.js panel keeps working until the UI Agent migrates it
 * to the new fields (flagged to the controller).
 */
export function detectEventsInRange(jdStartTT, jdEndTT) {
  if (!Number.isFinite(jdStartTT) || !Number.isFinite(jdEndTT)) {
    throw new Error("detectEventsInRange: jdStartTT and jdEndTT must be finite");
  }
  let start = jdStartTT, end = jdEndTT;
  if (start > end) { const t = start; start = end; end = t; }
  const firstGrid = Math.floor(start) - 1;
  const lastGrid = Math.ceil(end) + 1;
  // Earth (EMB) positions on the grid, computed once per grid day.
  const earthAt = new Map();
  for (let k = firstGrid; k <= lastGrid; k++) earthAt.set(k, positionFromElements(EARTH.elements, k));
  const out = [];
  for (const b of BODIES) {
    if (!b.elements || b.id === "earth" || b.id === "sun") continue;
    const inner = isInnerPlanet(b);
    // Daily samples of the separation angle on the grid.
    const ang = new Map();
    for (let k = firstGrid; k <= lastGrid; k++) {
      const e = earthAt.get(k);
      const p = positionWithLightTime(b.elements, k, e, { precess: false });
      ang.set(k, separationDeg(p, e));
    }
    const cred = credibilityOf(b);
    for (let k = firstGrid + 1; k <= lastGrid - 1; k++) {
      const a0 = ang.get(k - 1), a1 = ang.get(k), a2 = ang.get(k + 1);
      if (!Number.isFinite(a1)) continue;
      // Conjunction: local minimum of the angle.
      if (a1 < ANGLE_THRESHOLD_DEG && a1 <= a0 && a1 <= a2 && (a1 < a0 || a1 < a2)) {
        const v = parabolicVertex(a0, a1, a2);
        const jdTT = v ? k + v.offset : k;
        const minAngle = v ? Math.max(0, v.value) : a1;
        if (minAngle < ANGLE_THRESHOLD_DEG && jdTT >= start && jdTT <= end) {
          out.push({ type: "conjunction", bodies: [b.id, "sun"], jdTT, minAngleDeg: minAngle, credibility: cred, kind: "合相", body: b, delta: minAngle });
        }
      }
      // Opposition: local maximum of the angle (minimum of 180-angle).
      // Inner planets are skipped outright (see header).
      if (!inner) {
        const d0 = 180 - a0, d1 = 180 - a1, d2 = 180 - a2;
        if (d1 < ANGLE_THRESHOLD_DEG && d1 <= d0 && d1 <= d2 && (d1 < d0 || d1 < d2)) {
          const v = parabolicVertex(d0, d1, d2);
          const jdTT = v ? k + v.offset : k;
          const dev = v ? Math.max(0, v.value) : d1;
          if (dev < ANGLE_THRESHOLD_DEG && jdTT >= start && jdTT <= end) {
            out.push({ type: "opposition", bodies: [b.id, "sun"], jdTT, minAngleDeg: 180 - dev, credibility: cred, kind: "冲日", body: b, delta: dev });
          }
        }
      }
    }  }
  out.sort((p, q) => p.jdTT - q.jdTT);
  return out;
}

/**
 * Events on the TT calendar day containing jdTT (day = [floor(jdTT),
 * floor(jdTT)+1)). Same output shape as detectEventsInRange. This is
 * the function main.js calls for its "当日" panel.
 */
export function detectEvents(jdTT) {
  if (!Number.isFinite(jdTT)) throw new Error("detectEvents: jdTT must be finite");
  const day = Math.floor(jdTT);
  return detectEventsInRange(day, day + 1).filter(e => e.jdTT >= day && e.jdTT < day + 1);
}
