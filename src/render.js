// render.js — Three.js scene. Procedural textures only, labelled as such.
// Scale modes:
//  - scientific: true AU distances (x30 units/AU) and true radii (AU x30).
//    Planets will look tiny next to AU distances. That is correct.
//  - visual: artistic compression, separated from physical data (see README).
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { positionFromElements, jdFromDate } from "./astro.js";
import { BODIES, MOONS, findBody, shapeKindFor } from "./data.js";

const DEG = Math.PI / 180;

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

// [MODEL] Ring texture: colour and Cassini gap now come from the data
// layer (b.ring) instead of a hardcoded beige for every planet. The gap is
// a schematic gap (ring.profile 'schematic'), not a measured profile.
function ringTexture(colorHex, cassini) {
  const rgb = hexToRgb(colorHex) || [220, 200, 160];
  return canvasTexture((ctx, w, h) => {
    ctx.clearRect(0, 0, w, h);
    for (let x = 0; x < w; x++) {
      const t = x / w;
      let a = 0.15 + 0.6 * Math.abs(Math.sin(t * 22));
      if (cassini && t > 0.58 && t < 0.68) a = 0.02; // Cassini division (schematic gap)
      ctx.fillStyle = `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${a.toFixed(2)})`;
      ctx.fillRect(x, 0, 1, h);
    }
  }, 512, 8);
}

function glowTexture() {
  return canvasTexture((ctx, w, h) => {
    const g = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
    g.addColorStop(0, "rgba(255,220,120,1)"); g.addColorStop(0.35, "rgba(255,160,40,0.55)");
    g.addColorStop(1, "rgba(255,120,0,0)");
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
  }, 256, 256);
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
    container.appendChild(this.renderer.domElement);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true; this.controls.dampingFactor = 0.08;
    this.controls.minDistance = 0.5; this.controls.maxDistance = 800;

    this.scene.add(new THREE.AmbientLight(0x334455, 0.6));
    this.sunLight = new THREE.PointLight(0xffffff, 2, 0, 0);
    this.scene.add(this.sunLight);

    // Starfield.
    const starGeo = new THREE.BufferGeometry();
    const N = 4000, pos = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) {
      const v = new THREE.Vector3().randomDirection().multiplyScalar(1800);
      pos.set([v.x, v.y, v.z], i * 3);
    }
    starGeo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    this.scene.add(new THREE.Points(starGeo, new THREE.PointsMaterial({ color: 0xffffff, size: 1.6, sizeAttenuation: false, transparent: true, opacity: 0.9 })));

    this.mode = "visual";
    this.showLabels = true; this.showOrbits = true; this.showClouds = true;
    this.bodies = new Map(); // id -> {group, tilt, mesh, hit, label, radius}
    this.orbitLines = new Map();
    this.tween = null;
    this.focusedId = null;
    this.onPick = null;
    this.buildBodies();
    this.buildOrbits();
    this.resize();
    this.renderer.domElement.addEventListener("pointerdown", (e) => { this.downX = e.clientX; this.downY = e.clientY; });
    this.renderer.domElement.addEventListener("pointerup", (e) => {
      if (Math.hypot(e.clientX - this.downX, e.clientY - this.downY) > 6) return;
      this.pick(e);
    });
    this.lodTimer = 0;
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
      const rel = { x: posAU.x - parent.x, y: posAU.y - parent.y, z: posAU.z - parent.z };
      const len = Math.hypot(rel.x, rel.y, rel.z) || 1;
      const dir = { x: rel.x / len, y: rel.y / len, z: rel.z / len };
      if (this.mode === "scientific") {
        const relAU = len;
        return { x: this.scenePos(b.parent, parent, allPosAU).x + dir.x * relAU * 30,
                 y: this.scenePos(b.parent, parent, allPosAU).y + dir.y * relAU * 30,
                 z: this.scenePos(b.parent, parent, allPosAU).z + dir.z * relAU * 30 };
      }
      const order = MOONS.filter(m => m.parent === b.parent).findIndex(m => m.id === id);
      const pr = this.radiusUnits(findBody(b.parent));
      const d = pr * 2.6 + order * 0.9 + 0.6;
      const pp = this.scenePos(b.parent, parent, allPosAU);
      return { x: pp.x + dir.x * d, y: pp.y + dir.y * d, z: pp.z + dir.z * d };
    }
    return { x: this.distUnits(posAU.x) * Math.sign(posAU.x) * 0 + this._posFromAU(posAU).x,
             y: this._posFromAU(posAU).y, z: this._posFromAU(posAU).z };
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
        ? new THREE.MeshBasicMaterial({ map: surfaceTex })
        : new THREE.MeshStandardMaterial({ map: surfaceTex, roughness: 0.95, metalness: 0, flatShading: shapeKind === "irregular" });
      const mesh = new THREE.Mesh(shapeGeometry(b, shapeKind, texSeed, "initial"), mat);
      mesh.scale.setScalar(r);
      tilt.add(mesh); group.add(tilt);
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
      }
      if (b.id === "sun") {
        const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), transparent: true, depthWrite: false }));
        glow.scale.setScalar(r * 7); group.add(glow);
      }
      if (b.id === "earth") {
        const atm = new THREE.Mesh(new THREE.SphereGeometry(1.12, 32, 24),
          new THREE.MeshBasicMaterial({ color: 0x3d7ddb, transparent: true, opacity: 0.22, side: THREE.BackSide, blending: THREE.AdditiveBlending, depthWrite: false }));
        atm.scale.setScalar(r); atm.name = "atmosphere"; group.add(atm);
        // [MODEL] Cloud layer reuses the rock-noise generator on a different
        // seed; it is not a surface texture.
        const clouds = new THREE.Mesh(new THREE.SphereGeometry(1.03, 32, 24),
          new THREE.MeshStandardMaterial({ map: rockNoiseTexture("#ffffff", "#c8d8e8", (texSeed ^ 0x9e3779b9) >>> 0), transparent: true, opacity: 0.55, depthWrite: false }));
        clouds.scale.setScalar(r); clouds.name = "clouds"; group.add(clouds);
        this.earthClouds = clouds;
      }
      // [MODEL] Rings come from the data layer (b.ring), never hardcoded
      // per planet here. profile is 'schematic' for all four (see data.js);
      // Saturn's Cassini gap is a schematic gap, not a measured profile.
      // NOTE for the Rendering Agent: ring.scale is not refreshed in
      // setMode (pre-existing gap, same as the sun glow); that fix stays
      // with the setMode owner — this change only parameterises the ring.
      if (b.ring) {
        const ring = new THREE.Mesh(new THREE.RingGeometry(b.ring.inner, b.ring.outer, 96, 1),
          new THREE.MeshBasicMaterial({ map: ringTexture(b.ring.color, !!b.ring.cassiniGap), transparent: true, side: THREE.DoubleSide, depthWrite: false }));
        ring.scale.setScalar(r); ring.rotation.x = -Math.PI / 2; tilt.add(ring);
      }
      const hit = new THREE.Mesh(new THREE.SphereGeometry(1, 8, 8), new THREE.MeshBasicMaterial({ visible: false }));
      hit.scale.setScalar(Math.max(r, 0.6)); hit.userData.bodyId = b.id; group.add(hit);
      const label = labelSprite(b.zh); label.position.y = r + 1.2; label.userData.bodyId = b.id; group.add(label);
      this.scene.add(group);
      this.bodies.set(b.id, { body: b, group, tilt, mesh, hit, label, radius: r, high: shapeGeometry(b, shapeKind, texSeed, "high"), low: shapeGeometry(b, shapeKind, texSeed, "low"), axialTiltKnown, axialTiltDeg: axialTiltKnown ? b.axialTiltDeg : null, cometComa, cometTail, cometDir: new THREE.Vector3() });
    }
  }

  buildOrbits() {
    const jd0 = jdFromDate(new Date());
    for (const b of BODIES) {
      if (!b.elements || !b.orbitalPeriodDays) continue;
      const pts = [];
      for (let k = 0; k <= 128; k++) {
        const p = positionFromElements(b.elements, jd0 + (k / 128) * b.orbitalPeriodDays);
        const sp = this._posFromAU(p); pts.push(new THREE.Vector3(sp.x, sp.y, sp.z));
      }
      const line = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(pts),
        new THREE.LineBasicMaterial({ color: 0x2a4a7a, transparent: true, opacity: 0.55 }));
      this.scene.add(line); this.orbitLines.set(b.id, line);
    }
  }
  refreshOrbits() {
    for (const line of this.orbitLines.values()) { this.scene.remove(line); line.geometry.dispose(); }
    this.orbitLines.clear(); this.buildOrbits();
  }

  setMode(mode) {
    this.mode = mode;
    for (const [id, o] of this.bodies) {
      const r = this.radiusUnits(o.body); o.radius = r; o.mesh.scale.setScalar(r);
      o.hit.scale.setScalar(Math.max(r, 0.6)); o.label.position.y = r + 1.2;
      if (o.body.id === "earth") {
        o.group.traverse(ch => { if (ch.name === "clouds" || ch.name === "atmosphere") ch.scale.setScalar(r); });
      }
    }
    this.refreshOrbits();
  }
  setLabels(v) { this.showLabels = v; for (const o of this.bodies.values()) o.label.visible = v; }
  setOrbits(v) { this.showOrbits = v; for (const l of this.orbitLines.values()) l.visible = v; }
  setClouds(v) { this.showClouds = v; if (this.earthClouds) this.earthClouds.visible = v; }

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
    for (const [bid, o] of this.bodies) {
      o.mesh.material.emissive = o.mesh.material.emissive || new THREE.Color(0);
      if (o.mesh.material.emissive) o.mesh.material.emissive.setHex(bid === id ? 0x332200 : 0x000000);
    }
  }

  resize() {
    const w = this.container.clientWidth, h = this.container.clientHeight;
    this.renderer.setSize(w, h); this.camera.aspect = w / h; this.camera.updateProjectionMatrix();
  }

  animate(dt, simDaysDelta, positionsAU) {
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
        const delta = new THREE.Vector3().subVectors(this.camera.position, this.controls.target);
        const p = o.group.position;
        this.camera.position.set(p.x + delta.x, p.y + delta.y, p.z + delta.z);
      }
    }
    // LOD, throttled.
    this.lodTimer += dt;
    if (this.lodTimer > 0.4) {
      this.lodTimer = 0;
      for (const o of this.bodies.values()) {
        const d = this.camera.position.distanceTo(o.group.position);
        const want = d < o.radius * 30 ? o.high : o.low;
        if (o.mesh.geometry !== want && o.body.id !== "sun") o.mesh.geometry = want;
      }
    }
    this.renderer.render(this.scene, this.camera);
  }
}
