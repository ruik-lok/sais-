// events.js — conjunction / opposition detector, computed from the
// Keplerian model only. NOT a prediction service and NOT Horizons data.
// Geocentric ecliptic longitudes: conjunction = planet within 3° of the Sun
// as seen from Earth; opposition = planet ~180° from the Sun as seen from Earth.
import { eclipticLongitude, positionFromElements } from "./astro.js";
import { BODIES, findBody } from "./data.js";

export function detectEvents(jd) {
  const earthPos = positionFromElements(findBody("earth").elements, jd);
  const sunLon = eclipticLongitude({ x: -earthPos.x, y: -earthPos.y, z: -earthPos.z });
  const out = [];
  for (const b of BODIES) {
    if (!b.elements || b.id === "earth" || b.id === "sun") continue;
    const p = positionFromElements(b.elements, jd);
    const lon = eclipticLongitude({ x: p.x - earthPos.x, y: p.y - earthPos.y, z: p.z - earthPos.z });
    const signed = ((lon - sunLon + 540) % 360) - 180; // -180..180
    // signed near 0 => conjunction; signed near ±180 => opposition.
    const conj = Math.abs(signed);
    const opp = 180 - Math.abs(signed);
    if (conj < 3) out.push({ kind: "合相", body: b, delta: conj });
    else if (opp < 3) out.push({ kind: "冲日", body: b, delta: opp });
  }
  return out;
}
