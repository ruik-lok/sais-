// main.js — glue: clock -> positions -> renderer + UI. No heavy work per
// frame beyond position updates for ~40 bodies and a throttled LOD pass.
//
// Single state source (INTERFACE_CONTRACTS.md v1, §8): `state` below is the
// one place UI state lives. The clock remains the time authority; state
// mirrors it (playing/reversed/speed/currentJdTT) on every refresh so UI
// modules never keep their own copies. Info-panel updates are split:
// selection change -> renderInfo (full render); simulated-day change ->
// updateInfoDistances (two rows only, scroll/focus preserved).
import { jdFromDate, positionFromElements, moonPosition, distanceAU } from "./astro.js";
import * as astroNS from "./astro.js";
import { ALL_BODIES, BODIES, MOONS, findBody } from "./data.js";
import { Renderer } from "./render.js";
import { SimClock } from "./time.js";
import { Interaction, searchCandidates } from "./interaction.js";
import { buildNav, renderInfo, updateInfoDistances, setNavActive, renderSearchDropdown, validityFor, setOutOfRangeChecker, parseDateInput, breadcrumbFor } from "./ui.js";
import { detectEvents } from "./events.js";

Interaction._data.ALL_BODIES = ALL_BODIES;

// Validity-flag call point (task item 7): when Physics lands
// astro.isOutOfRange(body, jdTT), this wires it into ui.validityFor().
// astro.js currently does NOT export it, so the provisional JPL-branch
// rule inside validityFor() applies until Physics aligns the interface.
if (typeof astroNS.isOutOfRange === "function") setOutOfRangeChecker(astroNS.isOutOfRange);

const container = document.getElementById("scene");
const renderer = new Renderer(container);
const clock = new SimClock();

const state = {
  selectedId: null,
  breadcrumb: breadcrumbFor(null),
  searchQuery: "",
  searchCandidates: [],
  searchHighlight: -1,
  playing: clock.playing,
  reversed: clock.reverse,
  speedDaysPerSec: clock.daysPerSecond,
  currentJdTT: jdFromDate(clock.date),
  mode: "visual",
  fullscreen: false,
};

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

const infoEl = document.getElementById("info");
const rangeBanner = document.getElementById("range-banner");

function parentDistFor(id) {
  const b = findBody(id);
  if (!b || !b.parent) return null;
  const p = positionsAU[id];
  const pp = positionsAU[b.parent];
  if (!p || !pp) return null;
  return Math.hypot(p.x - pp.x, p.y - pp.y, p.z - pp.z);
}

function refreshRangeBanner(jd) {
  if (!rangeBanner) return;
  const sel = state.selectedId ? findBody(state.selectedId) : null;
  let v = sel ? validityFor(sel, jd) : { outOfRange: false, label: "" };
  if (!v.outOfRange) {
    const gv = validityFor(findBody("earth"), jd);
    if (gv.outOfRange) v = { outOfRange: true, label: "当前模拟日期超出 JPL 近似星历适用期（约 1800–2050），位置精度无保证" };
  }
  rangeBanner.hidden = !v.outOfRange;
  if (v.outOfRange) rangeBanner.textContent = `⚠ ${v.label}`;
}

function renderPanel(id) {
  const p = id ? positionsAU[id] : null;
  const sunDist = p ? distanceAU(p) : null;
  renderInfo(infoEl, id, p, sunDist, {
    parentDistAU: id ? parentDistFor(id) : null,
    jdTT: jdFromDate(clock.date),
    onSelect: (next) => interaction.select(next),
    onOverview: () => interaction.overview(),
  });
  refreshRangeBanner(jdFromDate(clock.date));
}

const interaction = new Interaction({
  renderer,
  getScenePos: (id) => {
    const o = renderer.bodies.get(id);
    return o ? { x: o.group.position.x, y: o.group.position.y, z: o.group.position.z } : null;
  },
  onSelect: (id) => {
    state.selectedId = id;
    state.breadcrumb = breadcrumbFor(id);
    renderPanel(id);
    setNavActive(document.getElementById("nav"), id);
  },
});

// Canvas keyboard reachability + blank-click deselect (render.js's pick()
// only fires onPick on a hit, so a miss is detected here: our pointerup
// listener is registered after the renderer's, so a hit sets pickFired
// before this handler runs).
const canvas = renderer.renderer.domElement;
canvas.tabIndex = 0;
canvas.setAttribute("aria-label", "3D 太阳系画布：拖拽旋转，滚轮缩放，点击天体聚焦，点击空白处取消选中；Esc 回总览，空格播放/暂停，方向键调速");
let downX = 0, downY = 0, pickFired = false;
canvas.addEventListener("pointerdown", (e) => { downX = e.clientX; downY = e.clientY; pickFired = false; });
renderer.onPick = (id) => { pickFired = true; interaction.select(id); };
canvas.addEventListener("pointerup", (e) => {
  if (Math.hypot(e.clientX - downX, e.clientY - downY) > 6) return;
  if (pickFired) return;
  if (interaction.selectedId) interaction.deselect();
});

buildNav(document.getElementById("nav"), (id) => interaction.select(id));
renderInfo(infoEl, null);

// Top search + suggestions dropdown.
const searchEl = document.getElementById("search");
const searchDropdown = document.getElementById("search-dropdown");
const searchMsg = document.getElementById("search-msg");
function closeDropdown() {
  state.searchCandidates = [];
  state.searchHighlight = -1;
  renderSearchDropdown(searchDropdown, [], -1, () => {});
  searchEl.setAttribute("aria-expanded", "false");
}
function showDropdown() {
  renderSearchDropdown(searchDropdown, state.searchCandidates, state.searchHighlight, (id) => {
    interaction.select(id);
    searchMsg.textContent = `已定位：${findBody(id).zh} ${findBody(id).en}`;
    closeDropdown();
  });
  searchEl.setAttribute("aria-expanded", state.searchCandidates.length ? "true" : "false");
}
searchEl.addEventListener("input", () => {
  state.searchQuery = searchEl.value;
  state.searchCandidates = searchCandidates(searchEl.value, ALL_BODIES);
  state.searchHighlight = state.searchCandidates.length ? 0 : -1;
  showDropdown();
});
searchEl.addEventListener("keydown", (e) => {
  if (e.key === "ArrowDown" && state.searchCandidates.length) {
    e.preventDefault();
    state.searchHighlight = (state.searchHighlight + 1) % state.searchCandidates.length;
    showDropdown();
    return;
  }
  if (e.key === "ArrowUp" && state.searchCandidates.length) {
    e.preventDefault();
    state.searchHighlight = (state.searchHighlight - 1 + state.searchCandidates.length) % state.searchCandidates.length;
    showDropdown();
    return;
  }
  if (e.key === "Escape") { closeDropdown(); return; }
  if (e.key !== "Enter") return;
  e.preventDefault();
  if (state.searchHighlight >= 0 && state.searchCandidates[state.searchHighlight]) {
    const hit = state.searchCandidates[state.searchHighlight];
    interaction.select(hit.id);
    searchMsg.textContent = `已定位：${hit.zh} ${hit.en}`;
    closeDropdown();
    return;
  }
  const hit = interaction.search(searchEl.value);
  if (hit) {
    searchMsg.textContent = `已定位：${hit.zh} ${hit.en}`;
    closeDropdown();
  } else if (interaction.searchError) {
    searchMsg.textContent = interaction.searchError;
  } else if (interaction.ambiguousCandidates.length) {
    state.searchCandidates = interaction.ambiguousCandidates;
    state.searchHighlight = 0;
    showDropdown();
    searchMsg.textContent = `找到 ${state.searchCandidates.length} 个候选，请用 ↑↓ 选择后回车`;
  } else {
    searchMsg.textContent = "未找到该天体，请试中文名、英文名或 id";
  }
});
searchEl.addEventListener("blur", () => { setTimeout(closeDropdown, 150); });

// Fullscreen (task item 1): whole app element, with exit + state sync.
const fullscreenBtn = document.getElementById("fullscreen-btn");
function syncFullscreenBtn() {
  state.fullscreen = !!document.fullscreenElement;
  fullscreenBtn.textContent = state.fullscreen ? "⛶ 退出全屏" : "⛶ 全屏";
  fullscreenBtn.setAttribute("aria-pressed", state.fullscreen ? "true" : "false");
}
fullscreenBtn.addEventListener("click", () => {
  if (document.fullscreenElement) {
    document.exitFullscreen().catch((err) => console.warn("[ORBITAL] exitFullscreen failed", err));
  } else {
    document.getElementById("app").requestFullscreen()
      .catch((err) => { console.warn("[ORBITAL] requestFullscreen failed", err); searchMsg.textContent = "全屏请求被浏览器拒绝"; });
  }
});
document.addEventListener("fullscreenchange", syncFullscreenBtn);
syncFullscreenBtn();

document.getElementById("overview-btn").addEventListener("click", () => interaction.overview());
const modeEl = document.getElementById("scale-mode");
modeEl.addEventListener("change", () => {
  state.mode = modeEl.value;
  renderer.setMode(modeEl.value);
  document.getElementById("mode-badge").textContent = modeEl.value === "scientific" ? "科学比例 · 真实 AU / 半径（天体看起来很小是正确的）" : "视觉探索 · 艺术放大，与物理数据分离";
});
document.getElementById("toggle-labels").addEventListener("change", (e) => renderer.setLabels(e.target.checked));
document.getElementById("toggle-orbits").addEventListener("change", (e) => renderer.setOrbits(e.target.checked));
document.getElementById("toggle-clouds").addEventListener("change", (e) => renderer.setClouds(e.target.checked));

// Bottom time controls.
const dateLabel = document.getElementById("sim-date");
const speedLabel = document.getElementById("sim-speed");
const dateInput = document.getElementById("date-input");
const speedSlider = document.getElementById("speed-slider");
const playBtn = document.getElementById("play-btn");
const reverseBtn = document.getElementById("reverse-btn");
function refreshTimeUI() {
  state.playing = clock.playing;
  state.reversed = clock.reverse;
  state.speedDaysPerSec = clock.daysPerSecond;
  dateLabel.textContent = clock.label();
  speedLabel.textContent = `速度：${clock.daysPerSecond} 天/秒${clock.reverse ? "（倒退）" : ""}${clock.playing ? "" : "（已暂停）"}`;
  playBtn.textContent = clock.playing ? "⏸ 暂停" : "▶ 播放";
  playBtn.setAttribute("aria-pressed", clock.playing ? "true" : "false");
  reverseBtn.textContent = clock.reverse ? "⇄ 倒退中" : "⇄ 倒退";
  reverseBtn.setAttribute("aria-pressed", clock.reverse ? "true" : "false");
  if (speedSlider) speedSlider.value = String(Math.min(6, Math.max(0, Math.round(Math.log10(clock.daysPerSecond)) + 2)));
  // Backfill the date input with the current simulated date — but never
  // while the user is editing it.
  if (dateInput && document.activeElement !== dateInput) dateInput.value = clock.dateInputValue();
}
playBtn.addEventListener("click", () => { clock.playing = !clock.playing; refreshTimeUI(); });
reverseBtn.addEventListener("click", () => { clock.reverse = !clock.reverse; refreshTimeUI(); });
document.getElementById("faster-btn").addEventListener("click", () => { clock.speedUp(); refreshTimeUI(); });
document.getElementById("slower-btn").addEventListener("click", () => { clock.speedDown(); refreshTimeUI(); });
if (speedSlider) speedSlider.addEventListener("input", () => {
  clock.daysPerSecond = Math.pow(10, Number(speedSlider.value) - 2);
  refreshTimeUI();
});
document.querySelectorAll(".speed-preset").forEach((btn) => {
  btn.addEventListener("click", () => { clock.daysPerSecond = Number(btn.dataset.speed); refreshTimeUI(); });
});
// "回到现在" restores forward playback as well (contract §3).
document.getElementById("now-btn").addEventListener("click", () => { clock.now(); clock.reverse = false; clock.playing = true; refreshTimeUI(); });
// Specified date keeps the current simulated time-of-day (contract §3);
// invalid input is ignored and the input is restored to the current date.
dateInput.addEventListener("change", (e) => {
  const d = parseDateInput(e.target.value, clock.date);
  if (d) { clock.setDate(d); refreshTimeUI(); }
  else dateInput.value = clock.dateInputValue();
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
  state.currentJdTT = jd;
  if (jd !== lastJd) { positionsAU = computePositions(jd); lastJd = jd; }
  renderer.animate(dt, simDaysDelta, positionsAU);
  const dayChanged = Math.floor(jd) !== Math.floor(jdFromDate(new Date(prevDate)));
  // Incremental panel update only: two distance rows, no re-render.
  if (interaction.selectedId && dayChanged) {
    const p = positionsAU[interaction.selectedId];
    if (p) {
      updateInfoDistances(infoEl, { sunDistAU: distanceAU(p), parentDistAU: parentDistFor(interaction.selectedId) });
      refreshRangeBanner(jd);
    }
  }
  if (dayChanged) refreshTimeUI();
  refreshEvents();
}
window.addEventListener("resize", () => renderer.resize());
positionsAU = computePositions(jdFromDate(clock.date));
lastJd = jdFromDate(clock.date);
refreshEvents();
requestAnimationFrame(loop);

// Keyboard: arrows adjust speed, space toggles play, Esc returns to overview.
// Guard excludes INPUT / BUTTON / SELECT / TEXTAREA so a focused control's
// own key handling (e.g. Space clicking a button) never double-triggers.
window.addEventListener("keydown", (e) => {
  const tag = e.target && e.target.tagName;
  if (tag === "INPUT" || tag === "BUTTON" || tag === "SELECT" || tag === "TEXTAREA") return;
  if (e.code === "Space") { e.preventDefault(); clock.playing = !clock.playing; refreshTimeUI(); }
  if (e.key === "Escape") { interaction.overview(); }
  if (e.key === "ArrowRight") { clock.speedUp(); refreshTimeUI(); }
  if (e.key === "ArrowLeft") { clock.speedDown(); refreshTimeUI(); }
});
