// main.js — glue: clock -> positions -> renderer + UI. No heavy work per
// frame beyond position updates for ~40 bodies and a throttled LOD pass.
import { jdFromDate, positionFromElements, moonPosition, distanceAU } from "./astro.js";
import { ALL_BODIES, BODIES, MOONS, findBody } from "./data.js";
import { Renderer } from "./render.js";
import { SimClock } from "./time.js";
import { Interaction } from "./interaction.js";
import { buildNav, renderInfo } from "./ui.js";
import { detectEvents } from "./events.js";

Interaction._data.ALL_BODIES = ALL_BODIES;

const container = document.getElementById("scene");
const renderer = new Renderer(container);
const clock = new SimClock();
let positionsAU = {};
let lastJd = null;

function computePositions(jd) {
  const pos = {};
  for (const b of BODIES) {
    if (b.id === "sun") pos.sun = { x: 0, y: 0, z: 0 };
    else if (b.elements) pos[b.id] = positionFromElements(b.elements, jd);
  }
  for (const m of MOONS) {
    const parent = pos[m.parent];
    if (!parent) continue;
    const rel = moonPosition(m.moon, jd);
    pos[m.id] = { x: parent.x + rel.x, y: parent.y + rel.y, z: parent.z + rel.z };
  }
  return pos;
}

const interaction = new Interaction({
  renderer,
  getScenePos: (id) => {
    const o = renderer.bodies.get(id);
    return o ? { x: o.group.position.x, y: o.group.position.y, z: o.group.position.z } : null;
  },
  onSelect: (id) => {
    const p = id ? positionsAU[id] : null;
    const sunDist = p ? distanceAU(p) : null;
    renderInfo(document.getElementById("info"), id, p, sunDist);
    document.querySelectorAll(".nav-item").forEach(el => el.classList.toggle("active", el.dataset.id === id));
  },
});
renderer.onPick = (id) => interaction.select(id);

buildNav(document.getElementById("nav"), (id) => interaction.select(id));
renderInfo(document.getElementById("info"), null);

// Top search + settings.
const searchEl = document.getElementById("search");
searchEl.addEventListener("keydown", (e) => {
  if (e.key !== "Enter") return;
  const hit = interaction.search(searchEl.value);
  document.getElementById("search-msg").textContent = hit ? `已定位：${hit.zh} ${hit.en}` : "未找到该天体，请试中文名、英文名或编号";
});
document.getElementById("overview-btn").addEventListener("click", () => {
  interaction.overview(); renderInfo(document.getElementById("info"), null);
});
const modeEl = document.getElementById("scale-mode");
modeEl.addEventListener("change", () => {
  renderer.setMode(modeEl.value);
  document.getElementById("mode-badge").textContent = modeEl.value === "scientific" ? "科学比例 · 真实 AU / 半径（天体看起来很小是正确的）" : "视觉探索 · 艺术放大，与物理数据分离";
});
document.getElementById("toggle-labels").addEventListener("change", (e) => renderer.setLabels(e.target.checked));
document.getElementById("toggle-orbits").addEventListener("change", (e) => renderer.setOrbits(e.target.checked));
document.getElementById("toggle-clouds").addEventListener("change", (e) => renderer.setClouds(e.target.checked));

// Bottom time controls.
const dateLabel = document.getElementById("sim-date");
const speedLabel = document.getElementById("sim-speed");
function refreshTimeUI() {
  dateLabel.textContent = clock.label();
  speedLabel.textContent = `速度：${clock.daysPerSecond} 天/秒${clock.reverse ? "（倒退）" : ""}${clock.playing ? "" : "（已暂停）"}`;
  document.getElementById("play-btn").textContent = clock.playing ? "⏸ 暂停" : "▶ 播放";
}
document.getElementById("play-btn").addEventListener("click", () => { clock.playing = !clock.playing; refreshTimeUI(); });
document.getElementById("reverse-btn").addEventListener("click", () => { clock.reverse = !clock.reverse; refreshTimeUI(); });
document.getElementById("faster-btn").addEventListener("click", () => { clock.speedUp(); refreshTimeUI(); });
document.getElementById("slower-btn").addEventListener("click", () => { clock.speedDown(); refreshTimeUI(); });
document.getElementById("now-btn").addEventListener("click", () => { clock.now(); refreshTimeUI(); });
document.getElementById("date-input").addEventListener("change", (e) => {
  const d = new Date(e.target.value + "T00:00:00Z");
  if (!Number.isNaN(d.getTime())) { clock.setDate(d); refreshTimeUI(); }
});
refreshTimeUI();

// Events panel, refreshed when the simulated day changes.
let lastEventDay = null;
function refreshEvents() {
  const day = Math.floor(jdFromDate(clock.date));
  if (day === lastEventDay) return;
  lastEventDay = day;
  const jd = jdFromDate(clock.date);
  const evs = detectEvents(jd);
  const el = document.getElementById("events");
  el.innerHTML = evs.length
    ? evs.map(e => `<div>${e.body.zh} ${e.body.en}：${e.kind}（偏差 ${e.delta.toFixed(2)}°）</div>`).join("")
    : `<div class="muted">当日无合相 / 冲日（阈值 3°，由开普勒模型计算）</div>`;
  el.innerHTML += `<div class="muted">日食、月食、凌日、掩食与小天体接近事件尚未实现，见 README。</div>`;
}

let last = performance.now();
function loop(now) {
  requestAnimationFrame(loop);
  const dt = Math.min((now - last) / 1000, 0.1); last = now;
  const prevDate = clock.date.getTime();
  clock.step();
  const simDaysDelta = (clock.date.getTime() - prevDate) / 86400000;
  const jd = jdFromDate(clock.date);
  if (jd !== lastJd) { positionsAU = computePositions(jd); lastJd = jd; }
  renderer.animate(dt, simDaysDelta, positionsAU);
  // Info panel distance refresh (cheap, once per simulated day change).
  if (interaction.selectedId && Math.floor(jd) !== Math.floor(jdFromDate(new Date(prevDate)))) {
    const p = positionsAU[interaction.selectedId];
    if (p) renderInfo(document.getElementById("info"), interaction.selectedId, p, distanceAU(p));
  }
  if (Math.floor(jd) !== Math.floor(jdFromDate(new Date(prevDate)))) refreshTimeUI();
  refreshEvents();
}
window.addEventListener("resize", () => renderer.resize());
positionsAU = computePositions(jdFromDate(clock.date));
lastJd = jdFromDate(clock.date);
refreshEvents();
requestAnimationFrame(loop);

// Keyboard: arrows adjust speed, space toggles play.
window.addEventListener("keydown", (e) => {
  if (e.target.tagName === "INPUT") return;
  if (e.code === "Space") { e.preventDefault(); clock.playing = !clock.playing; refreshTimeUI(); }
  if (e.key === "ArrowRight") { clock.speedUp(); refreshTimeUI(); }
  if (e.key === "ArrowLeft") { clock.speedDown(); refreshTimeUI(); }
});
