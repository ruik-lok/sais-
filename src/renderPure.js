// renderPure.js — pure render math extracted from render.js (Phase 2,
// audit P0-3 / P1-12). No three.js import, no DOM, no WebGL: this module
// is Node-importable and covered by test_render_pure.mjs. Renderer
// methods in render.js delegate to these functions, so the formulas live
// in exactly one place; the class keeps only WebGL construction, state
// and the animate() loop, which are NOT covered here and must never be
// claimed as covered (browser verification only).
//
// Scope discipline: only pure computation was extracted. Texture
// generation, scene construction, composer/bloom setup, pick/focus
// tweens and animate() stay in render.js.

const AU_KM = 149597870.7;

// --- Scale conversions (Renderer.radiusUnits / distUnits, verbatim) --------
export function radiusUnitsFor(body, mode) {
  if (mode === "scientific") {
    const rAU = (body.diameterKm / 2) / AU_KM;
    return Math.max(rAU * 30, 0.004);
  }
  return 0.35 * Math.pow(Math.max(body.diameterKm, 10) / 12742, 0.4);
}

export function distUnitsFor(au, mode) {
  if (mode === "scientific") return au * 30;
  return 2 + 14 * Math.pow(Math.max(au, 0.01), 0.55);
}

// Ecliptic AU position -> three.js scene position (Renderer._posFromAU).
// Distances are radial: direction preserved, radius remapped. The origin
// maps to the origin (the Sun); (x, y, z) ecliptic -> (x, z, -y) three.
export function posFromAUFor(p, mode) {
  const r = Math.hypot(p.x, p.y, p.z);
  if (r === 0) return { x: 0, y: 0, z: 0 };
  const d = distUnitsFor(r, mode);
  return { x: (p.x / r) * d, y: (p.z / r) * d, z: (-p.y / r) * d };
}

// Scene position (Renderer.scenePos, verbatim, parameterised so it stays
// pure): ctx = { mode, findBody, moonOrder (Map id -> order), radiusUnits
// (body -> scene radius) }. Unknown id and missing-parent moons fall back
// to the plain AU mapping, exactly as the method does.
export function scenePosPure(id, posAU, allPosAU, ctx) {
  const b = ctx.findBody(id);
  if (b && b.moon) {
    const parent = allPosAU[b.parent];
    if (!parent) return posFromAUFor(posAU, ctx.mode);
    const rel = { x: posAU.x - parent.x, y: posAU.y - parent.y, z: posAU.z - parent.z };
    const len = Math.hypot(rel.x, rel.y, rel.z) || 1;
    // Same ecliptic -> three mapping as _posFromAU (P0-2 fix): the
    // satellite direction must use (dx, dz, -dy), not raw ecliptic
    // components, or every satellite orbit plane rotates 90 deg.
    const dir = { x: rel.x / len, y: rel.z / len, z: -rel.y / len };
    const pp = scenePosPure(b.parent, parent, allPosAU, ctx);
    if (ctx.mode === "scientific") {
      const d = len * 30;
      return { x: pp.x + dir.x * d, y: pp.y + dir.y * d, z: pp.z + dir.z * d };
    }
    const order = ctx.moonOrder.get(id) ?? 0;
    const d = ctx.radiusUnits(ctx.findBody(b.parent)) * 2.6 + order * 0.9 + 0.6;
    return { x: pp.x + dir.x * d, y: pp.y + dir.y * d, z: pp.z + dir.z * d };
  }
  return posFromAUFor(posAU, ctx.mode);
}

// --- FPS governor state machine (Renderer._updateGovernor, verbatim) -----
// state = { tier, caps, frames, elapsed, fps, goodSeconds }. One call is
// one animate() frame (dt seconds). Sampling is per elapsed second:
// below 30 fps steps down at once; above 55 fps needs TWO consecutive
// good seconds to step back up (hysteresis, no oscillation); 30-55 fps
// resets the good streak without moving the tier. Returns a new state
// object plus tierChanged (the caller applies the tier side effect only
// when it changed, as the method does).
export function governorStep(state, dt) {
  const frames = state.frames + 1;
  const elapsed = state.elapsed + dt;
  if (elapsed < 1) {
    return { tier: state.tier, caps: state.caps, frames, elapsed, fps: state.fps, goodSeconds: state.goodSeconds, tierChanged: false };
  }
  const fps = frames / elapsed;
  let tier = state.tier;
  let goodSeconds = state.goodSeconds;
  let tierChanged = false;
  if (fps < 30) {
    goodSeconds = 0;
    if (tier < state.caps.length - 1) { tier++; tierChanged = true; }
  } else if (fps > 55) {
    goodSeconds++;
    if (goodSeconds >= 2 && tier > 0) { tier--; goodSeconds = 0; tierChanged = true; }
  } else {
    goodSeconds = 0;
  }
  return { tier, caps: state.caps, frames: 0, elapsed: 0, fps, goodSeconds, tierChanged };
}

// Pixel-ratio cap for a tier (Renderer._applyGovernorTier).
export function governorPixelRatioCap(basePixelRatio, tier, caps) {
  return Math.min(basePixelRatio, caps[tier]);
}

// Governor visibility allowances (Renderer._applyGovernorVisibility).
// Lowest tier hides orbit lines entirely; labels survive only for the
// focused body or within hideDist. User toggles stay authoritative.
export function governorHideDist(mode) {
  return mode === "scientific" ? 1000 : 80;
}
export function governorOrbitsVisible(showOrbits, lowest) {
  return showOrbits && !lowest;
}
export function governorLabelVisible(showLabels, lowest, isFocused, distance, hideDist) {
  return showLabels && (!lowest || isFocused || distance <= hideDist);
}

// --- LOD rules (Renderer.applyLod, pure parts only) -----------------------
// Geometry tier: high when closer than max(radius*30, 1.5) (strict <).
// The 1.5 floor is the P1-4 decoupling: without it a clamped/tiny body
// (e.g. scientific Earth radius 0.004 -> threshold 0.12) could never be
// high at its focus distance max(radius*6, 1.2) = 1.2. The Sun is
// excluded by the caller, not here.
export function lodTier(distance, radius) {
  return distance < Math.max(radius * 30, 1.5) ? "high" : "low";
}

// Label scale/layout: factor clamped to [0.35, 25] of distance/50.
export function lodLabelLayout(distance, radius) {
  const s = Math.min(25, Math.max(0.35, distance / 50));
  return { scaleX: 3 * s, scaleY: 0.75 * s, y: radius + 0.375 * s + 0.25 };
}

// Ring visibility: hidden when its projected outer radius is sub-pixel
// (< 3 px). viewportHeight in px, fovDeg in degrees.
export function ringVisible(radius, ringOuter, distance, viewportHeight, fovDeg) {
  const projFactor = (viewportHeight / 2) / Math.tan((fovDeg * Math.PI) / 180 / 2);
  const projPx = ((radius * ringOuter) / Math.max(distance, 1e-6)) * projFactor;
  return projPx >= 3;
}
