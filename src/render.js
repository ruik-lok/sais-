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
import { BODIES, MOONS, findBody } from "./data.js";

const DEG = Math.PI / 180;

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

// RENDERING: ring texture as CONCENTRIC bands. RingGeometry UVs are planar
// (uv = position/outerRadius mapped to 0..1), so the old 512x8 horizontal
// stripe texture painted bands across the disc instead of rings. This
// version builds a 512x512 radial image: texture radius 1 == outerRadius,
// so the annulus inner..outer maps to texture radius inner/outer..1.
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
        const t = (rr - innerFrac) / (1 - innerFrac);
        let a = 0.15 + 0.6 * Math.abs(Math.sin(t * 22));
        if (cassini && t > 0.58 && t < 0.68) a = 0.02; // Cassini division (schematic gap)
        a *= Math.min(1, t * 10) * Math.min(1, (1 - t) * 10); // soft edges
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

    this.mode = "visual";
    this.showLabels = true; this.showOrbits = true; this.showClouds = true;
    this.bodies = new Map(); // id -> {group, tilt, mesh, hit, label, radius}
    this.orbitLines = new Map();
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
      tilt.rotation.z = (b.axialTiltDeg || 0) * DEG;
      const bands = ["jupiter", "saturn", "uranus", "neptune"].includes(b.id);
      const mat = b.id === "sun"
        ? new THREE.MeshBasicMaterial({ map: noiseTexture(b.color, b.color2, false), color: new THREE.Color(2.6, 2.4, 2.1) })
        : new THREE.MeshStandardMaterial({ map: noiseTexture(b.color, b.color2, bands), roughness: 0.95, metalness: 0 });
      // RENDERING: sun colour multiplier >1 puts the disc into HDR
      // (luminance ~1.8) so it alone exceeds the bloom threshold 1.5;
      // OutputPass tone-maps it back to a hot (not clipped-white) disc.
      const mesh = new THREE.Mesh(this.sharedGeo.med, mat);
      mesh.scale.setScalar(r);
      // RENDERING: shadow casters/receivers (sun excluded: it is the light).
      if (b.id !== "sun") { mesh.castShadow = true; mesh.receiveShadow = true; }
      tilt.add(mesh); group.add(tilt);
      // RENDERING (P0): keep refs to every scalable object so setMode can
      // rescale all of them (ring/glow were previously left stale).
      let sunGlowRef = null, ringRef = null, ringOuterRef = 0, earthAtmRef = null, earthCloudsRef = null;
      if (b.id === "sun") {
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
        const clouds = new THREE.Mesh(this.sharedGeo.med,
          new THREE.MeshStandardMaterial({ map: noiseTexture("#ffffff", "#c8d8e8", false), transparent: true, opacity: 0.55, depthWrite: false }));
        clouds.scale.setScalar(r * 1.03); clouds.name = "clouds"; tilt.add(clouds);
        this.earthClouds = clouds; earthAtmRef = atm; earthCloudsRef = clouds;
      }
      // RENDERING: rings are lit (MeshStandardMaterial, not Basic) so they
      // show day/night and planet shadow; colour/radii come from
      // ringParamsFor() (data layer first, per-planet fallback otherwise).
      // phiSegments 32 lets the concentric texture interpolate radially;
      // the old 1-segment ring could not carry radial bands.
      const rp = ringParamsFor(b);
      if (rp) {
        const ring = new THREE.Mesh(new THREE.RingGeometry(rp.inner, rp.outer, 96, 32),
          new THREE.MeshStandardMaterial({ map: ringTexture(rp.color, rp.cassini, rp.inner, rp.outer), transparent: true, side: THREE.DoubleSide, depthWrite: false, roughness: 1, metalness: 0 }));
        ring.scale.setScalar(r); ring.rotation.x = -Math.PI / 2; tilt.add(ring);
        ring.receiveShadow = true; ring.castShadow = true;
        ringRef = ring; ringOuterRef = rp.outer;
      }
      const hit = new THREE.Mesh(this.sharedHitGeo, new THREE.MeshBasicMaterial({ visible: false }));
      hit.scale.setScalar(Math.max(r, 0.6)); hit.userData.bodyId = b.id; group.add(hit);
      hit.castShadow = false; hit.receiveShadow = false; // RENDERING: pick proxy never shadows
      const label = labelSprite(b.zh); label.position.y = r + 1.2; label.userData.bodyId = b.id; group.add(label);
      this.scene.add(group);
      this.bodies.set(b.id, { body: b, group, tilt, mesh, hit, label, radius: r, glow: sunGlowRef, ring: ringRef, ringOuter: ringOuterRef, atmosphere: earthAtmRef, clouds: earthCloudsRef });
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
      if (o.clouds) o.clouds.scale.setScalar(r * 1.03);
    }
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
  }
  setLabels(v) { this.showLabels = v; for (const o of this.bodies.values()) o.label.visible = v; }
  setOrbits(v) { this.showOrbits = v; for (const l of this.orbitLines.values()) l.visible = v; }
  setClouds(v) { this.showClouds = v; if (this.earthClouds) this.earthClouds.visible = v; }

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
        const want = d < o.radius * 30 ? this.sharedGeo.high : this.sharedGeo.low;
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
    else this.renderer.render(this.scene, this.camera);
  }
}
