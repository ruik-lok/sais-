// render.js — Three.js scene. Procedural textures only, labelled as such.
// Scale modes:
//  - scientific: true AU distances (x30 units/AU) and true radii (AU x30).
//    Planets will look tiny next to AU distances. That is correct.
//  - visual: artistic compression, separated from physical data (see README).
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { positionFromElements, jdFromDate } from "./astro.js";
import { BODIES, MOONS, findBody } from "./data.js";

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

function noiseTexture(c1, c2, bands) {
  return canvasTexture((ctx, w, h) => {
    ctx.fillStyle = c1; ctx.fillRect(0, 0, w, h);
    let seed = 42;
    const rnd = () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; };
    for (let i = 0; i < 2600; i++) {
      ctx.fillStyle = rnd() > 0.5 ? c2 : c1;
      ctx.globalAlpha = 0.12 + rnd() * 0.25;
      const x = rnd() * w, y = rnd() * h, r = 2 + rnd() * 14;
      ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
    }
    if (bands) {
      ctx.globalAlpha = 0.22;
      for (let y = 0; y < h; y += 18) {
        ctx.fillStyle = y % 36 ? c2 : c1;
        ctx.fillRect(0, y, w, 6 + rnd() * 8);
      }
    }
    ctx.globalAlpha = 1;
  });
}

function ringTexture(cassini) {
  return canvasTexture((ctx, w, h) => {
    ctx.clearRect(0, 0, w, h);
    for (let x = 0; x < w; x++) {
      const t = x / w;
      let a = 0.15 + 0.6 * Math.abs(Math.sin(t * 22));
      if (cassini && t > 0.58 && t < 0.68) a = 0.02; // Cassini division (schematic gap)
      ctx.fillStyle = `rgba(220,200,160,${a.toFixed(2)})`;
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
      tilt.rotation.z = (b.axialTiltDeg || 0) * DEG;
      const bands = ["jupiter", "saturn", "uranus", "neptune"].includes(b.id);
      // Surface texture is queued, not painted now (see textureQueue).
      // Interim flat color = body color; on apply, color resets to white
      // so the final map x color product is exactly the old rendering.
      const mat = b.id === "sun"
        ? new THREE.MeshBasicMaterial({ color: new THREE.Color(b.color || "#888888") })
        : new THREE.MeshStandardMaterial({ color: new THREE.Color(b.color || "#888888"), roughness: 0.95, metalness: 0 });
      this.textureQueue.push({
        bodyId: b.id,
        make: () => noiseTexture(b.color, b.color2, bands),
        apply: (tex) => { if (mat.color) mat.color.set(0xffffff); mat.map = tex; mat.needsUpdate = true; },
      });
      const mesh = new THREE.Mesh(this.sharedSpheres.mid, mat);
      mesh.scale.setScalar(r);
      tilt.add(mesh); group.add(tilt);
      if (b.id === "sun") {
        const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), transparent: true, depthWrite: false }));
        glow.scale.setScalar(r * 7); group.add(glow);
      }
      if (b.id === "earth") {
        // Shared unit sphere; the old 1.12 / 1.03 radii now live in scale.
        const atm = new THREE.Mesh(this.sharedSpheres.mid,
          new THREE.MeshBasicMaterial({ color: 0x3d7ddb, transparent: true, opacity: 0.22, side: THREE.BackSide, blending: THREE.AdditiveBlending, depthWrite: false }));
        atm.scale.setScalar(r * 1.12); atm.name = "atmosphere"; group.add(atm);
        const cloudsMat = new THREE.MeshStandardMaterial({ transparent: true, opacity: 0.55, depthWrite: false });
        this.textureQueue.push({
          bodyId: "earth",
          make: () => noiseTexture("#ffffff", "#c8d8e8", false),
          apply: (tex) => { cloudsMat.map = tex; cloudsMat.needsUpdate = true; },
        });
        const clouds = new THREE.Mesh(this.sharedSpheres.mid, cloudsMat);
        clouds.scale.setScalar(r * 1.03); clouds.name = "clouds"; group.add(clouds);
        this.earthClouds = clouds;
      }
      if (["saturn", "jupiter", "uranus", "neptune"].includes(b.id)) {
        const inner = b.id === "saturn" ? 1.24 : 1.4, outer = b.id === "saturn" ? 2.27 : 2.0;
        const ring = new THREE.Mesh(new THREE.RingGeometry(inner, outer, 96, 1),
          new THREE.MeshBasicMaterial({ map: ringTexture(b.id === "saturn"), transparent: true, side: THREE.DoubleSide, depthWrite: false }));
        ring.scale.setScalar(r); ring.rotation.x = -Math.PI / 2; tilt.add(ring);
      }
      const hit = new THREE.Mesh(this.sharedSpheres.hit, new THREE.MeshBasicMaterial({ visible: false }));
      hit.scale.setScalar(Math.max(r, 0.6)); hit.userData.bodyId = b.id; group.add(hit);
      const label = labelSprite(b.zh); label.position.y = r + 1.2; label.userData.bodyId = b.id; group.add(label);
      this.scene.add(group);
      this.bodies.set(b.id, { body: b, group, tilt, mesh, hit, label, radius: r });
    }
  }

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
    this.mode = mode;
    for (const [id, o] of this.bodies) {
      const r = this.radiusUnits(o.body); o.radius = r; o.mesh.scale.setScalar(r);
      o.hit.scale.setScalar(Math.max(r, 0.6)); o.label.position.y = r + 1.2;
      if (o.body.id === "earth") {
        // Shared unit sphere: the 1.12 atmosphere / 1.03 cloud factors live in scale.
        o.group.traverse(ch => { if (ch.name === "atmosphere") ch.scale.setScalar(r * 1.12); else if (ch.name === "clouds") ch.scale.setScalar(r * 1.03); });
      }
    }
    this.refreshOrbits();
    this.needsRender = true;
  }
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
    for (const [bid, o] of this.bodies) {
      o.mesh.material.emissive = o.mesh.material.emissive || new THREE.Color(0);
      if (o.mesh.material.emissive) o.mesh.material.emissive.setHex(bid === id ? 0x332200 : 0x000000);
    }
  }

  resize() {
    const w = this.container.clientWidth, h = this.container.clientHeight;
    this.renderer.setSize(w, h); this.camera.aspect = w / h; this.camera.updateProjectionMatrix();
    this.needsRender = true;
  }

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
    // Deferred textures drain here, time-sliced, so the first frame
    // never blocks on texture painting.
    this.pumpTextureQueue();
    // LOD, throttled.
    this.lodTimer += dt;
    if (this.lodTimer > 0.4) {
      this.lodTimer = 0;
      for (const o of this.bodies.values()) {
        const d = this.camera.position.distanceTo(o.group.position);
        const want = d < o.radius * 30 ? this.sharedSpheres.high : this.sharedSpheres.low;
        if (o.mesh.geometry !== want && o.body.id !== "sun") o.mesh.geometry = want;
      }
      // Re-evaluate governor label/orbit visibility as the camera moves.
      this._applyGovernorVisibility();
    }
    this.renderer.render(this.scene, this.camera);
    this.needsRender = false;
  }
}
