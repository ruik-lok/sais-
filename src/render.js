// render.js — Three.js scene. Procedural textures only, labelled as such.
// Scale modes:
//  - scientific: true AU distances (x30 units/AU) and true radii (AU x30).
//    Planets will look tiny next to AU distances. That is correct.
//  - visual: artistic compression, separated from physical data (see README).
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { positionFromElements, jdFromDate } from "./astro.js";
import { BODIES, MOONS, findBody, shapeKindFor } from "./data.js";

const DEG = Math.PI / 180;

// Shared unit-sphere geometries (performance, zero precision impact).
// One geometry per LOD tier, reused by every body instead of 3 per body.
// Label sprites keep per-body textures (their text content differs), but
// sprites carry no geometry, so nothing else needs per-body geometry.
// These are module-lifetime: never dispose them on LOD swaps or mode
// switches; disposing a shared geometry would break every body using it.
let SHARED_SPHERES = null;
function sharedSpheres() {
  if (!SHARED_SPHERES) {
    SHARED_SPHERES = {
      mid: new THREE.SphereGeometry(1, 32, 24),
      high: new THREE.SphereGeometry(1, 48, 32),
      low: new THREE.SphereGeometry(1, 20, 14),
      hit: new THREE.SphereGeometry(1, 8, 8),
    };
  }
  return SHARED_SPHERES;
}

function canvasTexture(draw, w = 512, h = 256) {
  const c = document.createElement("canvas"); c.width = w; c.height = h;
  draw(c.getContext("2d"), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// [MODEL] Seeded RNG (LCG). The old code used one fixed seed 42 for every
// body, so all bodies shared one noise pattern recoloured. Seeds now come
// from the data layer (textureSeed, one per body).
function seededRng(seed) {
  let s = seed >>> 0;
  return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; };
}
// Fallback seed for bodies without a data-layer textureSeed: FNV-1a of the
// id, still per-body, never the old shared 42.
function seedForBody(b) {
  if (typeof b.textureSeed === "number") return b.textureSeed;
  let h = 2166136261;
  for (let i = 0; i < b.id.length; i++) { h ^= b.id.charCodeAt(i); h = Math.imul(h, 16777619); }
  return (h >>> 0) || 1;
}

// [MODEL] Rocky/icy-body noise generator — separate from the gas-band
// generator below. Procedural only (textureKind 'procedural' in data.js);
// it is not measured imagery and must not be labelled as such.
function rockNoiseTexture(c1, c2, seed) {
  return canvasTexture((ctx, w, h) => {
    ctx.fillStyle = c1; ctx.fillRect(0, 0, w, h);
    const rnd = seededRng(seed);
    for (let i = 0; i < 2600; i++) {
      ctx.fillStyle = rnd() > 0.5 ? c2 : c1;
      ctx.globalAlpha = 0.12 + rnd() * 0.25;
      const x = rnd() * w, y = rnd() * h, r = 2 + rnd() * 14;
      ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalAlpha = 1;
  });
}

// [MODEL] Gas-giant band generator — horizontal bands with seeded widths,
// wavy edges and stretched turbulence streaks. Bands only: no invented
// surface features (no Great Red Spot, no continent shapes) are painted.
function gasBandTexture(c1, c2, seed) {
  return canvasTexture((ctx, w, h) => {
    ctx.fillStyle = c1; ctx.fillRect(0, 0, w, h);
    const rnd = seededRng(seed);
    let y = 0;
    while (y < h) {
      const bh = 8 + rnd() * 22;
      ctx.fillStyle = rnd() > 0.45 ? c2 : c1;
      ctx.globalAlpha = 0.55 + rnd() * 0.45;
      ctx.fillRect(0, y, w, bh);
      ctx.globalAlpha = 0.18;
      for (let s = 0; s < 6; s++) {
        ctx.fillStyle = rnd() > 0.5 ? c2 : c1;
        ctx.fillRect(rnd() * w, y + bh - 3 + rnd() * 6, 20 + rnd() * 80, 1 + rnd() * 3);
      }
      y += bh;
    }
    for (let i = 0; i < 500; i++) {
      ctx.fillStyle = rnd() > 0.5 ? c2 : c1;
      ctx.globalAlpha = 0.05 + rnd() * 0.12;
      ctx.fillRect(rnd() * w, rnd() * h, 10 + rnd() * 60, 1 + rnd() * 2);
    }
    ctx.globalAlpha = 1;
  });
}

function hexToRgb(hex) {
  if (typeof hex !== "string") return null;
  const m = /^#([0-9a-fA-F]{6})$/.exec(hex);
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

// [MODEL+RENDERING] Ring texture: colour and Cassini gap come from the data
// layer (b.ring); the texture itself is RENDERING's 512x512 radial image
// (RingGeometry UVs are planar, so the old 512x8 horizontal stripe texture
// painted bands across the disc instead of rings). Gap is schematic.
function ringTexture(colorHex, cassini, inner, outer) {
  const S = 512, innerFrac = inner / outer;
  return canvasTexture((ctx, w, h) => {
    const img = ctx.createImageData(S, S);
    const col = new THREE.Color(colorHex);
    const r8 = Math.round(col.r * 255), g8 = Math.round(col.g * 255), b8 = Math.round(col.b * 255);
    for (let y = 0; y < S; y++) {
      for (let x = 0; x < S; x++) {
        const rr = Math.hypot((x - S / 2) / (S / 2), (y - S / 2) / (S / 2));
        const k = (y * S + x) * 4;
        if (rr < innerFrac || rr > 1) { img.data[k + 3] = 0; continue; }
        const tt = (rr - innerFrac) / (1 - innerFrac);
        let a = 0.15 + 0.6 * Math.abs(Math.sin(tt * 22));
        if (cassini && tt > 0.58 && tt < 0.68) a = 0.02; // Cassini division (schematic gap)
        a *= Math.min(1, tt * 10) * Math.min(1, (1 - tt) * 10); // soft edges
        img.data[k] = r8; img.data[k + 1] = g8; img.data[k + 2] = b8; img.data[k + 3] = Math.round(a * 255);
      }
    }
    ctx.putImageData(img, 0, 0);
  }, S, S);
}

// RENDERING: ring parameters come from the data layer when present
// (b.ring: {inner, outer, color, profile} per INTERFACE_CONTRACTS §5).
// The current data layer has no ring field yet (Model Agent's scope), so
// this fallback table keeps the old radii but gives each planet its own
// colour instead of one beige for all; it must be deleted once Model
// lands b.ring. Interface conflict reported to main.
function ringParamsFor(b) {
  if (b.ring) return { inner: b.ring.inner, outer: b.ring.outer, color: b.ring.color || "#d8c49a", cassini: b.id === "saturn" && b.ring.profile !== "measured" };
  const fallback = {
    saturn: { inner: 1.24, outer: 2.27, color: "#d8c49a", cassini: true },
    jupiter: { inner: 1.4, outer: 2.0, color: "#8a7a68", cassini: false },
    uranus: { inner: 1.4, outer: 2.0, color: "#6a8a90", cassini: false },
    neptune: { inner: 1.4, outer: 2.0, color: "#5a6a8a", cassini: false },
  };
  return fallback[b.id] || null;
}

function glowTexture() {
  return canvasTexture((ctx, w, h) => {
    const g = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
    g.addColorStop(0, "rgba(255,220,120,1)"); g.addColorStop(0.35, "rgba(255,160,40,0.55)");
    g.addColorStop(1, "rgba(255,120,0,0)");
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
  }, 256, 256);
}

// RENDERING: Earth atmosphere as a Fresnel rim shader (not the old uniform
// transparent shell). Brightness peaks at the limb and is scaled by a day
// factor from the world-space normal vs sun direction, so the night limb
// stays faint instead of glowing uniformly (and the night side is no
// longer washed by ambient light alone).
function atmosphereMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: {
      sunDirection: { value: new THREE.Vector3(1, 0, 0) },
      dayColor: { value: new THREE.Color(0x4d9fff) },
      nightColor: { value: new THREE.Color(0x0a1a33) },
      intensity: { value: 1.0 },
    },
    vertexShader: `
      varying vec3 vNormalV; varying vec3 vNormalW; varying vec3 vViewDir;
      void main() {
        vNormalV = normalize(normalMatrix * normal);
        vNormalW = normalize(mat3(modelMatrix) * normal);
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vViewDir = normalize(-mv.xyz);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: `
      uniform vec3 sunDirection; uniform vec3 dayColor; uniform vec3 nightColor; uniform float intensity;
      varying vec3 vNormalV; varying vec3 vNormalW; varying vec3 vViewDir;
      void main() {
        float fres = pow(1.0 - abs(dot(normalize(vNormalV), normalize(vViewDir))), 3.0);
        float dayF = clamp(dot(normalize(vNormalW), normalize(sunDirection)) * 1.2 + 0.15, 0.0, 1.0);
        vec3 col = mix(nightColor, dayColor, dayF);
        float a = fres * (0.08 + 0.92 * dayF) * intensity;
        gl_FragColor = vec4(col * a, a);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
    transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.FrontSide,
  });
}

function labelSprite(text) {
  const t = canvasTexture((ctx, w, h) => {
    ctx.font = "bold 44px sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillStyle = "rgba(0,0,0,0.55)"; ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = "#eaf2ff"; ctx.fillText(text, w / 2, h / 2);
  }, 256, 64);
  const m = new THREE.SpriteMaterial({ map: t, transparent: true, depthWrite: false });
  const s = new THREE.Sprite(m); s.scale.set(3, 0.75, 1); return s;
}

// [MODEL] Geometry tiers (contract section 5). Shape is BAKED INTO the
// geometry, not into mesh.scale: setMode() only rescales the mesh by a
// scalar (Rendering Agent's area), so a baked shape survives mode switches
// and LOD swaps unchanged. High/low variants are built from the same tier.
function scaleGeometryPositions(geo, sx, sy, sz) {
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) pos.setXYZ(i, pos.getX(i) * sx, pos.getY(i) * sy, pos.getZ(i) * sz);
}
function irregularDisplacement(x, y, z, seed) {
  // Deterministic hash of the (quantised) direction: duplicated polyhedron
  // vertices share a direction, so they move together and faces don't crack.
  const qx = Math.round(x * 24), qy = Math.round(y * 24), qz = Math.round(z * 24);
  let h = Math.imul(seed | 0, 974711);
  h = Math.imul(h ^ Math.imul(qx, 374761393), 668265263);
  h = Math.imul(h ^ Math.imul(qy, 2246822519), 3266489917);
  h = Math.imul(h ^ Math.imul(qz, 3266489917), 668265263);
  h ^= h >>> 13; h = Math.imul(h, 1274126177); h ^= h >>> 16;
  return 0.72 + ((h >>> 0) / 4294967296) * 0.5; // 0.72–1.22
}
function shapeGeometry(b, kind, seed, level) {
  if (kind === "irregular") {
    // Low-poly nucleus/asteroid: icosahedron detail 1 (initial/high), 0 (low).
    // Exact shape is schematic — a seeded lump, not a measured shape model.
    const geo = new THREE.IcosahedronGeometry(1, level === "low" ? 0 : 1);
    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const v = new THREE.Vector3(pos.getX(i), pos.getY(i), pos.getZ(i)).normalize();
      const d = irregularDisplacement(v.x, v.y, v.z, seed);
      pos.setXYZ(i, v.x * d, v.y * d, v.z * d);
    }
    geo.computeVertexNormals();
    return geo;
  }
  const seg = level === "high" ? [48, 32] : level === "low" ? [20, 14] : [32, 24];
  const geo = new THREE.SphereGeometry(1, seg[0], seg[1]);
  if (kind === "oblate" && typeof b.flattening === "number" && b.flattening > 0 && b.flattening < 1) {
    scaleGeometryPositions(geo, 1, 1 - b.flattening, 1);
    geo.computeVertexNormals();
  } else if (kind === "triaxial" && Array.isArray(b.axesKm) && b.axesKm.length === 3 && b.diameterKm > 0) {
    // Axes used for RATIOS only (see data.js Haumea note).
    scaleGeometryPositions(geo, b.axesKm[0] / b.diameterKm, b.axesKm[1] / b.diameterKm, b.axesKm[2] / b.diameterKm);
    geo.computeVertexNormals();
  }
  // Missing shape parameters fall through to a plain sphere; the panel
  // flags that case via shapeFallbackFor() ("形状未知，按球体示意").
  return geo;
}

// [MODEL] Comet coma (radial glow) and tail (lengthwise fade) textures.
function comaTexture() {
  return canvasTexture((ctx, w, h) => {
    const g = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
    g.addColorStop(0, "rgba(230,245,255,0.9)");
    g.addColorStop(0.4, "rgba(190,225,255,0.35)");
    g.addColorStop(1, "rgba(190,225,255,0)");
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
  }, 256, 256);
}
function tailTexture() {
  return canvasTexture((ctx, w, h) => {
    // Canvas top (v=1, cone apex / far end) fades to transparent; canvas
    // bottom (v=0, cone base at the nucleus) is strongest.
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, "rgba(255,255,255,0)");
    g.addColorStop(0.7, "rgba(255,255,255,0.45)");
    g.addColorStop(1, "rgba(255,255,255,0.7)");
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
  }, 64, 256);
}
const MODEL_UP_Y = new THREE.Vector3(0, 1, 0);

export class Renderer {
  constructor(container) {
    this.container = container;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x020409);
    this.camera = new THREE.PerspectiveCamera(45, 1, 0.01, 5000);
    this.camera.position.set(0, 60, 120);
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    // RENDERING: ACES tone mapping + sRGB output (explicit; previously unset).
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.15;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    container.appendChild(this.renderer.domElement);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true; this.controls.dampingFactor = 0.08;
    this.controls.minDistance = 0.5; this.controls.maxDistance = 800;

    // RENDERING: physical lighting. Ambient 0.2 (contract range 0.15–0.25)
    // so the night side is no longer washed flat by the old 0.6; the point
    // light uses decay=2 with intensity rescaled per mode (see
    // sunLightIntensity()). Shadow map is PCFSoft with a runtime toggle.
    this.ambientLight = new THREE.AmbientLight(0x334455, 0.2);
    this.scene.add(this.ambientLight);
    this.sunLight = new THREE.PointLight(0xffffff, this.sunLightIntensity(), 0, 2);
    this.sunLight.position.set(0, 0, 0); // explicit; re-followed every frame in animate()
    this.sunLight.castShadow = true;
    this.sunLight.shadow.mapSize.set(1024, 1024);
    this.sunLight.shadow.camera.near = 0.5;
    this.sunLight.shadow.camera.far = 5000;
    this.sunLight.shadow.bias = -0.0002; // acne mitigation; browser-check item for QA
    this.sunLight.shadow.normalBias = 0.02;
    this.scene.add(this.sunLight);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.shadowsEnabled = true;

    // RENDERING: selective bloom. Threshold 1.5 sits above lit-planet HDR
    // (Mercury dayside in scientific mode ~1.2 by estimate) and below the
    // sun disc (bright texture x 2.6/2.4/2.1 colour multiplier -> luminance
    // ~1.8), while labels (<=0.9) and stars (0.9) never reach it, so bloom
    // does not spill onto labels/starfield. If composer setup fails, fall
    // back to direct ACES rendering (bloom off, never a blank page).
    this.bloomPass = null; this.composer = null; this.bloomEnabled = false;
    try {
      this.composer = new EffectComposer(this.renderer);
      this.composer.addPass(new RenderPass(this.scene, this.camera));
      this.bloomPass = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.55, 0.5, 1.5);
      this.composer.addPass(this.bloomPass);
      this.composer.addPass(new OutputPass());
      this.bloomEnabled = true;
    } catch (err) {
      console.warn("[ORBITAL rendering] EffectComposer unavailable, bloom disabled:", err);
      this.composer = null;
    }

    // Starfield.
    const starGeo = new THREE.BufferGeometry();
    const N = 4000, pos = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) {
      const v = new THREE.Vector3().randomDirection().multiplyScalar(1800);
      pos.set([v.x, v.y, v.z], i * 3);
    }
    starGeo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    this.scene.add(new THREE.Points(starGeo, new THREE.PointsMaterial({ color: 0xffffff, size: 1.6, sizeAttenuation: false, transparent: true, opacity: 0.9 })));

    // Set by setters/resize when the scene changed without a camera
    // move; main.js uses it to force one repaint while otherwise idle.
    this.needsRender = false;
    this.mode = "visual";
    // FPS governor (performance): samples the real frame rate once per
    // second inside animate() and steps the pixel-ratio cap down
    // (2 -> 1.5 -> 1) when slow, back up only after sustained good
    // frames, so it cannot oscillate. It touches rendering only
    // (pixel ratio, distant-label / orbit-line visibility) and never
    // the position-solving rate or precision. This is the mobile
    // adaptation: previously the pixel ratio was pinned at
    // min(devicePixelRatio, 2) with no fallback at all.
    this.basePixelRatio = Math.min(typeof devicePixelRatio !== "undefined" ? devicePixelRatio : 1, 2);
    this.govTierCaps = [2, 1.5, 1];
    this.govTier = 0;
    this.govFrames = 0;
    this.govElapsed = 0;
    this.govFps = null; // last sampled fps; null before the first sample
    this.govGoodSeconds = 0; // consecutive good seconds (step-up hysteresis)
    this.sharedSpheres = sharedSpheres();
    // Moon render order per parent, precomputed once. Previously every
    // satellite paid MOONS.filter(...).findIndex(...) on every frame.
    this.moonOrder = new Map();
    {
      const perParent = new Map();
      for (const m of MOONS) {
        const n = perParent.get(m.parent) || 0;
        this.moonOrder.set(m.id, n);
        perParent.set(m.parent, n + 1);
      }
    }
    this._scratchDelta = new THREE.Vector3();
    this.showLabels = true; this.showOrbits = true; this.showClouds = true;
    // Deferred surface-texture queue (performance): body textures are
    // NOT generated in the constructor. Each job paints the exact same
    // texture as before (same generator, same colors); only the timing
    // changes, so the first frame never synchronously paints ~106,600
    // arcs (41 textures x 2600 arcs). Jobs drain in build order (inner
    // system first, distant small bodies last) inside animate(), a few
    // milliseconds per frame, and focusing a body promotes its jobs to
    // the front of the queue. Until a texture arrives, the body renders
    // in its flat base color.
    this.textureQueue = [];
    this.bodies = new Map(); // id -> {group, tilt, mesh, hit, label, radius}
    this.orbitLines = new Map();
    // Cached heliocentric AU samples per orbit line, solved exactly once
    // in buildOrbits. Mode switches only remap these through _posFromAU;
    // they never re-solve Kepler and never rebuild geometry/material.
    this.orbitPointsAU = new Map();
    this.tween = null;
    this.focusedId = null;
    this.highlightedId = null; // RENDERING: re-applied by setMode after rescaling
    this.onPick = null;
    // RENDERING (LOD): three shared unit-sphere geometries (high/med/low)
    // for ALL bodies — previously every body owned its own high/low pair
    // (~120 geometries). Meshes differ only by scale/material, so sharing
    // is exact. The initial geometry is the shared medium档.
    this.sharedGeo = {
      high: new THREE.SphereGeometry(1, 48, 32),
      med: new THREE.SphereGeometry(1, 32, 24),
      low: new THREE.SphereGeometry(1, 20, 14),
    };
    this.sharedHitGeo = new THREE.SphereGeometry(1, 8, 8);
    this.buildBodies();
    this.buildOrbits();
    this.resize();
    this.updateMaxDistance(); // RENDERING (P0): initial limit for the default (visual) mode.
    this.renderer.domElement.addEventListener("pointerdown", (e) => { this.downX = e.clientX; this.downY = e.clientY; });
    this.renderer.domElement.addEventListener("pointerup", (e) => {
      if (Math.hypot(e.clientX - this.downX, e.clientY - this.downY) > 6) return;
      this.pick(e);
    });
    this.lodTimer = 0.5; // RENDERING: first animate() frame runs the LOD pass immediately
  }

  radiusUnits(b) {
    if (this.mode === "scientific") {
      const rAU = (b.diameterKm / 2) / 149597870.7;
      return Math.max(rAU * 30, 0.004);
    }
    return 0.35 * Math.pow(Math.max(b.diameterKm, 10) / 12742, 0.4);
  }
  distUnits(au) {
    if (this.mode === "scientific") return au * 30;
    return 2 + 14 * Math.pow(Math.max(au, 0.01), 0.55);
  }
  scenePos(id, posAU, allPosAU) {
    const b = findBody(id);
    if (b && b.moon) {
      const parent = allPosAU[b.parent];
      // Defensive fallback: previously this threw on parent.x when the
      // parent position was missing. main.js already skips such moons,
      // so this path is not expected in practice.
      if (!parent) return this._posFromAU(posAU);
      const rel = { x: posAU.x - parent.x, y: posAU.y - parent.y, z: posAU.z - parent.z };
      const len = Math.hypot(rel.x, rel.y, rel.z) || 1;
      const dir = { x: rel.x / len, y: rel.y / len, z: rel.z / len };
      // Parent scene position is computed exactly once (previously 3x in
      // scientific mode), then reused for all three components.
      const pp = this.scenePos(b.parent, parent, allPosAU);
      if (this.mode === "scientific") {
        const d = len * 30;
        return { x: pp.x + dir.x * d, y: pp.y + dir.y * d, z: pp.z + dir.z * d };
      }
      const order = this.moonOrder.get(id) ?? 0;
      const d = this.radiusUnits(findBody(b.parent)) * 2.6 + order * 0.9 + 0.6;
      return { x: pp.x + dir.x * d, y: pp.y + dir.y * d, z: pp.z + dir.z * d };
    }
    // Single _posFromAU call (previously 3x, plus a dead distUnits term).
    return this._posFromAU(posAU);
  }
  _posFromAU(p) {
    // Distances are radial: preserve direction, map radius.
    const r = Math.hypot(p.x, p.y, p.z);
    if (r === 0) return { x: 0, y: 0, z: 0 };
    const d = this.distUnits(r);
    return { x: p.x / r * d, y: p.z / r * d, z: -p.y / r * d }; // ecliptic -> three (y up)
  }

  buildBodies() {
    for (const b of [...BODIES, ...MOONS.map(m => ({ ...m, type: "卫星" }))]) {
      const r = this.radiusUnits(b);
      const group = new THREE.Group();
      const tilt = new THREE.Group();
      // [MODEL] Axial tilt: null is UNKNOWN, never 0 degrees. Render with a
      // neutral 0-degree fallback so the scene stays stable, but record
      // axialTiltKnown on the entry: the panel (UI Agent) must label
      // unknown-tilt bodies "轴倾未知", not "0°". Never write `|| 0` here.
      const axialTiltKnown = b.axialTiltDeg !== null && b.axialTiltDeg !== undefined;
      tilt.rotation.z = (axialTiltKnown ? b.axialTiltDeg : 0) * DEG;
      // [MODEL] Texture tier from the data layer: gas-band generator for
      // gas giants, rock-noise generator for everything else, each body on
      // its own seed (data.js textureSeed; id-hash fallback, never shared 42).
      const texSeed = seedForBody(b);
      const surfaceTex = b.textureGenerator === "gasBands"
        ? gasBandTexture(b.color, b.color2, texSeed)
        : rockNoiseTexture(b.color, b.color2, texSeed);
      // [MODEL] Geometry tier from the data layer (shapeKindFor): baked
      // into the geometry so setMode scalar rescaling cannot flatten it.
      const shapeKind = shapeKindFor(b);
      const mat = b.id === "sun"
        ? new THREE.MeshBasicMaterial({ map: surfaceTex, color: new THREE.Color(2.6, 2.4, 2.1) })
        : new THREE.MeshStandardMaterial({ map: surfaceTex, roughness: 0.95, metalness: 0, flatShading: shapeKind === "irregular" });
      // RENDERING: sun colour multiplier >1 puts the disc into HDR
      // (luminance ~1.8) so it alone exceeds the bloom threshold 1.5;
      // OutputPass tone-maps it back to a hot (not clipped-white) disc.
      const mesh = new THREE.Mesh(shapeGeometry(b, shapeKind, texSeed, "initial"), mat);      mesh.scale.setScalar(r);
      // RENDERING: shadow casters/receivers (sun excluded: it is the light).
      if (b.id !== "sun") { mesh.castShadow = true; mesh.receiveShadow = true; }      tilt.add(mesh); group.add(tilt);
      // RENDERING (P0): keep refs to every scalable object so setMode can
      // rescale all of them (ring/glow were previously left stale).
      let sunGlowRef = null, ringRef = null, ringOuterRef = 0, earthAtmRef = null, earthCloudsRef = null;
      // [MODEL] Comet branch — separate from asteroids: nucleus (irregular
      // tier) + coma + tail. Asteroids get the irregular tier only, never
      // a coma or tail.
      let cometComa = null, cometTail = null;
      if (b.type === "彗星") {
        // Coma: child of the mesh, so setMode's scalar mesh rescale keeps
        // it proportional; a sphere is unaffected by the nucleus spin.
        cometComa = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 18),
          new THREE.MeshBasicMaterial({ map: comaTexture(), transparent: true, opacity: 0.35, depthWrite: false, blending: THREE.AdditiveBlending }));
        cometComa.scale.setScalar(2.6); cometComa.name = "coma"; mesh.add(cometComa);
        // Tail: child of the group (unrotated, translated only), so its
        // orientation can be set in world/sun direction every frame in
        // animate(). Cone base at the nucleus, apex at the far end.
        const tailGeo = new THREE.ConeGeometry(1, 1, 16, 1, true);
        tailGeo.translate(0, 0.5, 0);
        cometTail = new THREE.Mesh(tailGeo,
          new THREE.MeshBasicMaterial({ map: tailTexture(), color: 0xaad4ff, transparent: true, opacity: 0.55, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending }));
        cometTail.name = "tail"; group.add(cometTail);
      }      if (b.id === "sun") {
        const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), transparent: true, depthWrite: false, opacity: 0.95 }));
        glow.scale.setScalar(r * 7); group.add(glow);
        this.sunGlow = glow; sunGlowRef = glow;
      }
      if (b.id === "earth") {
        // RENDERING: Fresnel rim atmosphere (day/night via the sunDirection
        // uniform, updated in animate()); FrontSide sphere just outside the
        // surface so the rim sits on the limb, not over the disc.
        const atm = new THREE.Mesh(this.sharedGeo.med, atmosphereMaterial());
        atm.scale.setScalar(r * 1.18); atm.name = "atmosphere"; group.add(atm);
        // RENDERING: clouds live under the tilt group so they follow the
        // 23.44 deg axial tilt, and spin on their own in animate().
        // [MODEL] Cloud layer reuses the rock-noise generator on a different
        // seed; it is not a surface texture.
        const clouds = new THREE.Mesh(this.sharedGeo.med,
          new THREE.MeshStandardMaterial({ map: rockNoiseTexture("#ffffff", "#c8d8e8", (texSeed ^ 0x9e3779b9) >>> 0), transparent: true, opacity: 0.55, depthWrite: false }));
        clouds.scale.setScalar(r * 1.03); clouds.name = "clouds"; tilt.add(clouds);
        this.earthClouds = clouds; earthAtmRef = atm; earthCloudsRef = clouds;      }
      // RENDERING: rings are lit (MeshStandardMaterial, not Basic) so they
      // show day/night and planet shadow; colour/radii come from
      // ringParamsFor() (data layer first, per-planet fallback otherwise).
      // phiSegments 32 lets the concentric texture interpolate radially.
      const rp = ringParamsFor(b);
      if (rp) {
        const ring = new THREE.Mesh(new THREE.RingGeometry(rp.inner, rp.outer, 96, 32),
          new THREE.MeshStandardMaterial({ map: ringTexture(rp.color, rp.cassini, rp.inner, rp.outer), transparent: true, side: THREE.DoubleSide, depthWrite: false, roughness: 1, metalness: 0 }));
        ring.scale.setScalar(r); ring.rotation.x = -Math.PI / 2; tilt.add(ring);
        ring.receiveShadow = true; ring.castShadow = true;
        ringRef = ring; ringOuterRef = rp.outer;
      }
      const hit = new THREE.Mesh(this.sharedHitGeo, new THREE.MeshBasicMaterial({ visible: false }));      hit.scale.setScalar(Math.max(r, 0.6)); hit.userData.bodyId = b.id; group.add(hit);
      hit.castShadow = false; hit.receiveShadow = false; // RENDERING: pick proxy never shadows
      const label = labelSprite(b.zh); label.position.y = r + 1.2; label.userData.bodyId = b.id; group.add(label);
      this.scene.add(group);
      this.bodies.set(b.id, { body: b, group, tilt, mesh, hit, label, radius: r, high: shapeGeometry(b, shapeKind, texSeed, "high"), low: shapeGeometry(b, shapeKind, texSeed, "low"), axialTiltKnown, axialTiltDeg: axialTiltKnown ? b.axialTiltDeg : null, cometComa, cometTail, cometDir: new THREE.Vector3(), glow: sunGlowRef, ring: ringRef, ringOuter: ringOuterRef, atmosphere: earthAtmRef, clouds: earthCloudsRef });    }  }

  buildOrbits() {
    const jd0 = jdFromDate(new Date());
    for (const b of BODIES) {
      if (!b.elements || !b.orbitalPeriodDays) continue;
      const auPts = [];
      for (let k = 0; k <= 128; k++) {
        auPts.push(positionFromElements(b.elements, jd0 + (k / 128) * b.orbitalPeriodDays));
      }
      this.orbitPointsAU.set(b.id, auPts);
      const pts = auPts.map(p => { const sp = this._posFromAU(p); return new THREE.Vector3(sp.x, sp.y, sp.z); });
      const geo = new THREE.BufferGeometry().setFromPoints(pts);
      const attr = geo.attributes.position;
      if (attr.setUsage) attr.setUsage(THREE.DynamicDrawUsage);
      const line = new THREE.LineLoop(geo,
        new THREE.LineBasicMaterial({ color: 0x2a4a7a, transparent: true, opacity: 0.55 }));
      line.frustumCulled = false; // points are remapped in place on mode switch
      this.scene.add(line); this.orbitLines.set(b.id, line);
    }
  }
  refreshOrbits() {
    // In-place update: remap the cached AU samples through the current
    // mode's _posFromAU into the existing position attribute. No Kepler
    // re-solve, no new geometry, no new material — so the old per-switch
    // material leak (geometry disposed, material never disposed) cannot
    // recur on this path.
    for (const [id, line] of this.orbitLines) {
      const auPts = this.orbitPointsAU.get(id);
      if (!auPts) continue;
      const attr = line.geometry.attributes.position;
      for (let k = 0; k < auPts.length; k++) {
        const sp = this._posFromAU(auPts[k]);
        attr.setXYZ(k, sp.x, sp.y, sp.z);
      }
      attr.needsUpdate = true;
    }
  }
  disposeOrbitLines() {
    // Teardown path (not used by mode switches, which are in place):
    // removes lines and disposes BOTH geometry and material.
    for (const line of this.orbitLines.values()) {
      this.scene.remove(line);
      line.geometry.dispose();
      line.material.dispose();
    }
    this.orbitLines.clear();
    this.orbitPointsAU.clear();
  }

  setMode(mode) {
    // RENDERING (P0): rescale EVERY scalable object — mesh, hit, label,
    // ring, sun glow, atmosphere, clouds — so no stale size survives a
    // mode switch (rings/glow were previously left at the old scale).
    this.mode = mode;
    this.sunLight.intensity = this.sunLightIntensity(); // RENDERING: decay=2 intensity follows mode scale
    for (const [id, o] of this.bodies) {
      const r = this.radiusUnits(o.body); o.radius = r; o.mesh.scale.setScalar(r);
      o.hit.scale.setScalar(Math.max(r, 0.6)); o.label.position.y = r + 1.2;
      if (o.glow) o.glow.scale.setScalar(r * 7);
      if (o.ring) o.ring.scale.setScalar(r);
      // RENDERING: atmosphere/cloud radii are scale factors (1.18/1.03),
      // not geometry radii, so setMode must keep the factor.
      if (o.atmosphere) o.atmosphere.scale.setScalar(r * 1.18);
      if (o.clouds) o.clouds.scale.setScalar(r * 1.03);    }
    this.updateMaxDistance();
    this.refreshOrbits();
    this.highlight(this.highlightedId); // RENDERING: restore glow boost after rescale
    this.applyLod(); // RENDERING: labels/rings consistent immediately, not after 0.4 s
  }

  // RENDERING: with decay=2, illuminance at distance d is I/d^2. Anchor I
  // so Earth (1 AU scene distance) receives ~1.0: I = distUnits(1)^2.
  // Visual: 16^2 = 256; scientific: 30^2 = 900. Outer planets are then
  // physically dimmer than inner ones (previously identical brightness);
  // the 0.2 ambient floor keeps them faintly visible.
  sunLightIntensity() { return Math.pow(this.distUnits(1), 2); }

  // RENDERING: shadow toggle for low-end devices (default on). Toggling
  // shadowMap.enabled needs material recompile, hence needsUpdate.
  setShadows(v) {
    this.shadowsEnabled = !!v;
    this.renderer.shadowMap.enabled = !!v;
    this.sunLight.castShadow = !!v;
    this.scene.traverse(o => { if (o.material) o.material.needsUpdate = true; });
  }

  // RENDERING: bloom toggle (pass.enabled skips it; ACES via OutputPass stays).
  setBloom(v) {
    this.bloomEnabled = !!v;
    if (this.bloomPass) this.bloomPass.enabled = !!v;
  }

  // RENDERING (P0): camera far limit follows the current mode's farthest
  // body (aphelion distance), so Neptune (~900 units) and Eris (~2925
  // units) stay reachable in scientific mode. Scientific floor is 2500
  // units per INTERFACE_CONTRACTS §7; visual keeps the old 800 floor so
  // existing zoom-out freedom does not regress.
  updateMaxDistance() {
    let far = 0;
    for (const b of BODIES) {
      if (!b.elements || !b.elements.a) continue;
      const ap = b.elements.a * (1 + Math.abs(b.elements.e || 0));
      far = Math.max(far, this.distUnits(ap));
    }
    if (this.mode === "scientific") this.controls.maxDistance = Math.max(2500, far * 1.2);
    else this.controls.maxDistance = Math.max(800, far * 1.2);
    const needFar = Math.max(5000, this.controls.maxDistance * 2);
    if (this.camera.far !== needFar) { this.camera.far = needFar; this.camera.updateProjectionMatrix(); }
    this.needsRender = true;  }
  pendingTextureCount() { return this.textureQueue.length; }
  pumpTextureQueue(budgetMs = 6) {
    // Time-sliced: paint queued textures until the per-frame budget is
    // spent. A single texture always runs to completion (it cannot be
    // interrupted mid-paint), so a frame may exceed the budget by one
    // texture, never by the whole queue.
    if (!this.textureQueue.length) return;
    const deadline = performance.now() + budgetMs;
    while (this.textureQueue.length) {
      const job = this.textureQueue[0];
      const tex = job.make();
      this.textureQueue.shift();
      job.apply(tex);
      if (performance.now() >= deadline) break;
    }
  }
  prioritizeTexture(id) {
    // Focusing a body promotes its pending textures (surface, and for
    // earth its clouds) to the front, preserving their relative order.
    if (!this.textureQueue.length) return;
    const front = [], rest = [];
    for (const job of this.textureQueue) (job.bodyId === id ? front : rest).push(job);
    if (front.length) this.textureQueue = front.concat(rest);
  }
  _updateGovernor(dt) {
    this.govFrames++;
    this.govElapsed += dt;
    if (this.govElapsed < 1) return;
    const fps = this.govFrames / this.govElapsed;
    this.govFps = fps;
    this.govFrames = 0; this.govElapsed = 0;
    if (fps < 30) {
      // Step down after a single bad second; recovery needs patience.
      this.govGoodSeconds = 0;
      if (this.govTier < this.govTierCaps.length - 1) { this.govTier++; this._applyGovernorTier(); }
    } else if (fps > 55) {
      this.govGoodSeconds++;
      if (this.govGoodSeconds >= 2 && this.govTier > 0) {
        this.govTier--; this.govGoodSeconds = 0; this._applyGovernorTier();
      }
    } else {
      this.govGoodSeconds = 0;
    }
  }
  _applyGovernorTier() {
    this.renderer.setPixelRatio(Math.min(this.basePixelRatio, this.govTierCaps[this.govTier]));
    this._applyGovernorVisibility();
  }
  _applyGovernorVisibility() {
    // Lowest tier hides orbit lines entirely and labels of distant
    // bodies (the focused body's label always stays visible, so the
    // selection context is never lost). User toggles stay authoritative:
    // visibility is always showX && governor-allowance.
    const lowest = this.govTier === this.govTierCaps.length - 1;
    for (const l of this.orbitLines.values()) l.visible = this.showOrbits && !lowest;
    const hideDist = this.mode === "scientific" ? 1000 : 80;
    for (const [id, o] of this.bodies) {
      const d = this.camera.position.distanceTo(o.group.position);
      o.label.visible = this.showLabels && (!lowest || id === this.focusedId || d <= hideDist);
    }
  }
  setLabels(v) { this.showLabels = v; this._applyGovernorVisibility(); this.needsRender = true; }
  setOrbits(v) { this.showOrbits = v; this._applyGovernorVisibility(); this.needsRender = true; }
  setClouds(v) { this.showClouds = v; if (this.earthClouds) this.earthClouds.visible = v; this.needsRender = true; }

  // RENDERING (LOD, throttled 0.4 s from animate(), forced from setMode):
  // geometry档 (shared spheres) + distance-scaled labels + screen-space
  // label de-overlap + ring visibility. Labels scale with camera distance
  // (factor clamp(d/50, 0.35, 25)) so a fixed 3-unit sprite no longer
  // dwarfs tiny scientific-mode bodies or vanishes at system scale; in
  // crowded moon systems, labels within 38 px of a higher-priority label
  // (focused first, then planets, then nearer bodies) are hidden.
  // Rings hide when their projected outer radius is sub-pixel (< 3 px):
  // invisible at that size anyway, so this only saves overdraw.
  applyLod() {
    const w = this.container.clientWidth || 1, h = this.container.clientHeight || 1;
    const projFactor = (h / 2) / Math.tan(this.camera.fov * DEG / 2);
    const cands = [];
    for (const [id, o] of this.bodies) {
      const d = this.camera.position.distanceTo(o.group.position);
      if (o.body.id !== "sun") {
        const want = d < o.radius * 30 ? (o.high || this.sharedGeo.high) : (o.low || this.sharedGeo.low); // INTEGRATION: preserve Model shape tiers (oblate/triaxial/irregular), not shared spheres
        if (o.mesh.geometry !== want) o.mesh.geometry = want;
      }
      const s = Math.min(25, Math.max(0.35, d / 50));
      o.label.scale.set(3 * s, 0.75 * s, 1);
      o.label.position.y = o.radius + 0.375 * s + 0.25;
      if (o.ring) {
        const projPx = (o.radius * o.ringOuter / Math.max(d, 1e-6)) * projFactor;
        o.ring.visible = projPx >= 3;
      }
      const v = new THREE.Vector3(o.group.position.x, o.group.position.y + o.label.position.y, o.group.position.z).project(this.camera);
      cands.push({ id, o, d, x: (v.x * 0.5 + 0.5) * w, y: (-v.y * 0.5 + 0.5) * h, behind: v.z > 1 });
    }
    cands.sort((a, b) => ((a.id === this.focusedId ? -1 : 0) - (b.id === this.focusedId ? -1 : 0))
      || ((a.o.body.moon ? 1 : 0) - (b.o.body.moon ? 1 : 0)) || (a.d - b.d));
    const kept = [];
    for (const c of cands) {
      let show = this.showLabels && !c.behind;
      if (show) {
        for (const k of kept) { if (Math.hypot(c.x - k.x, c.y - k.y) < 38) { show = false; break; } }
      }
      if (show) kept.push(c);
      c.o.label.visible = show;
    }
  }

  pick(e) {
    const rect = this.renderer.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
    const ray = new THREE.Raycaster(); ray.setFromCamera(ndc, this.camera);
    const hits = [];
    for (const o of this.bodies.values()) hits.push(o.hit);
    const found = ray.intersectObjects(hits, false);
    if (found.length && this.onPick) this.onPick(found[0].object.userData.bodyId);
  }

  focusTo(id, scenePos, radius) {
    this.prioritizeTexture(id);
    const dist = Math.max(radius * 6, 1.2);
    const dir = new THREE.Vector3(0.6, 0.45, 1).normalize();
    const toPos = new THREE.Vector3(scenePos.x + dir.x * dist, scenePos.y + dir.y * dist, scenePos.z + dir.z * dist);
    this.tween = { t: 0, dur: 1.2, fromPos: this.camera.position.clone(), toPos, fromTarget: this.controls.target.clone(), toTarget: new THREE.Vector3(scenePos.x, scenePos.y, scenePos.z) };
    this.focusedId = id;
  }
  overview() {
    this.tween = { t: 0, dur: 1.2, fromPos: this.camera.position.clone(), toPos: new THREE.Vector3(0, 60, 120), fromTarget: this.controls.target.clone(), toTarget: new THREE.Vector3(0, 0, 0) };
    this.focusedId = null;
  }
  highlight(id) {
    // RENDERING: MeshBasicMaterial (the sun) has no emissive uniform, so
    // assigning .emissive to it was a silent no-op (audit P1). Standard
    // bodies keep the emissive tint (guarded by existence); the sun
    // highlights via its glow sprite (scale + opacity), which are real
    // visible properties. highlight(null) clears everything.
    this.highlightedId = id || null;
    for (const [bid, o] of this.bodies) {
      if (o.mesh.material.emissive) o.mesh.material.emissive.setHex(bid === id ? 0x332200 : 0x000000);
      if (o.glow) {
        const on = bid === id;
        o.glow.scale.setScalar(o.radius * (on ? 8.75 : 7));
        o.glow.material.opacity = on ? 1 : 0.95;
      }
    }
  }

  resize() {
    const w = this.container.clientWidth, h = this.container.clientHeight;
    this.renderer.setSize(w, h); this.camera.aspect = w / h; this.camera.updateProjectionMatrix();
    if (this.composer) { this.composer.setPixelRatio(Math.min(devicePixelRatio, 2)); this.composer.setSize(w, h); }
    this.needsRender = true;  }

  animate(dt, simDaysDelta, positionsAU) {
    this._updateGovernor(dt);
    if (this.tween) {
      this.tween.t += dt / this.tween.dur;
      const k = this.tween.t >= 1 ? 1 : (this.tween.t < 0.5 ? 4 * this.tween.t ** 3 : 1 - Math.pow(-2 * this.tween.t + 2, 3) / 2);
      this.camera.position.lerpVectors(this.tween.fromPos, this.tween.toPos, k);
      this.controls.target.lerpVectors(this.tween.fromTarget, this.tween.toTarget, k);
      if (this.tween.t >= 1) this.tween = null;
    }
    this.controls.update();
    // Positions + rotation from simulated time.
    for (const [id, o] of this.bodies) {
      const p = positionsAU[id]; if (!p) continue;
      const sp = this.scenePos(id, p, positionsAU);
      o.group.position.set(sp.x, sp.y, sp.z);
      // [MODEL] Comet coma/tail dynamics (kept out of setMode, so mode
      // switches stay correct via o.radius): the tail points away from the
      // Sun — the scene Sun sits at the origin, so the anti-sun direction
      // is the body's scene-position direction. Tail length and coma
      // opacity grow as heliocentric distance shrinks (activity ~ 1.5/rAU,
      // clamped); asteroids never enter this branch.
      if (o.cometTail) {
        const pAU = positionsAU[id];
        const rAU = pAU ? Math.hypot(pAU.x, pAU.y, pAU.z) : 1;
        const activity = Math.min(3, Math.max(0.15, 1.5 / Math.max(rAU, 0.1)));
        if (o.group.position.lengthSq() > 1e-12) {
          o.cometDir.copy(o.group.position).normalize();
          o.cometTail.quaternion.setFromUnitVectors(MODEL_UP_Y, o.cometDir);
        }
        o.cometTail.scale.set(o.radius * 0.7, o.radius * (2 + activity * 4), o.radius * 0.7);
        if (o.cometComa) o.cometComa.material.opacity = 0.18 + 0.12 * activity;
      }
      const rot = o.body.rotationDays;
      if (rot) o.mesh.rotation.y += (2 * Math.PI * simDaysDelta) / rot;
      if (this.focusedId === id) {
        // Keep camera target glued to a moving body after tween finishes.
        if (!this.tween) this.controls.target.set(sp.x, sp.y, sp.z);
      }
    }
    if (this.focusedId && !this.tween) {
      const o = this.bodies.get(this.focusedId);
      if (o) {
        const delta = this._scratchDelta.subVectors(this.camera.position, this.controls.target);
        const p = o.group.position;
        this.camera.position.set(p.x + delta.x, p.y + delta.y, p.z + delta.z);
      }
    }
    // RENDERING: sun light explicitly follows the sun body every frame
    // (never relies on the (0,0,0) default coinciding with the sun).
    const sunRec = this.bodies.get("sun");
    if (sunRec) this.sunLight.position.copy(sunRec.group.position);
    // RENDERING: atmosphere day/night (sun direction in world space) and
    // cloud self-rotation (slightly faster than the surface, under tilt).
    const earthRec = this.bodies.get("earth");
    if (earthRec && earthRec.atmosphere && sunRec) {
      const sd = new THREE.Vector3().subVectors(sunRec.group.position, earthRec.group.position);
      if (sd.lengthSq() > 0) earthRec.atmosphere.material.uniforms.sunDirection.value.copy(sd.normalize());
    }
    if (this.earthClouds && simDaysDelta && earthRec) {
      const rot = earthRec.body.rotationDays || 1;
      this.earthClouds.rotation.y += (2 * Math.PI * simDaysDelta) / rot * 1.2;
    }
    // LOD, throttled (0.4 s, per contract); see applyLod().
    this.lodTimer += dt;
    if (this.lodTimer > 0.4) { this.lodTimer = 0; this.applyLod(); }
    // RENDERING: composer path (RenderPass -> selective bloom -> OutputPass
    // for ACES/sRGB); direct ACES rendering if the composer is unavailable.
    if (this.composer) this.composer.render();
    else this.renderer.render(this.scene, this.camera);  }
}
