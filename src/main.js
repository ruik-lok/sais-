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
import { ALL_BODIES, BODIES, MOONS, findBody, hasPosition } from "./data.js";
import { Renderer } from "./render.js";
import { SimClock } from "./time.js";
import { Interaction, searchCandidates, nextHighlight, resolveEnter } from "./interaction.js";
import { buildNav, renderInfo, updateInfoDistances, updateInfoValidity, setNavActive, renderSearchDropdown, validityFor, setOutOfRangeChecker, parseDateInput, breadcrumbFor, ttDateTimeString, rangeBannerVerdict, panelSyncAction } from "./ui.js";
import { detectEvents, detectEventsInRange } from "./events.js";

Interaction._data.ALL_BODIES = ALL_BODIES;

// Validity-flag call point: astro.isOutOfRange(body, jdTT) is wired into
// ui.validityFor(); ui.js normalises the checker's verdict with a label
// (the checker object itself carries no label field).
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
    // INTEGRATION (Physics legacy #1): 20 satellites have phaseDeg null
    // (schematic, no verified phase) and moonPosition() now throws for
    // them by design. Skip those moons instead of crashing the loop;
    // render.js already skips bodies with no position, and the panel
    // shows their distance as 未知. Only the Moon has a usable phase.
    let rel;
    try { rel = moonPosition(m.moon, jd); } catch { continue; }
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
  // Verdict is the pure rangeBannerVerdict() (ui.js); this is DOM wiring only.
  const v = rangeBannerVerdict(state.selectedId ? findBody(state.selectedId) : null, findBody("earth"), jd);
  rangeBanner.hidden = !v.visible;
  if (v.visible) rangeBanner.textContent = v.text;
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
    // P0-1: a body with no AU position has no meaningful scene position;
    // returning its group default (0,0,0) is exactly the pre-fix bug, so
    // return null instead and let Interaction redirect to the parent.
    if (!hasPosition(id, positionsAU)) return null;
    const o = renderer.bodies.get(id);
    return o ? { x: o.group.position.x, y: o.group.position.y, z: o.group.position.z } : null;
  },
  // hasPosition reads the live positionsAU binding (reassigned on every
  // jd change), not a snapshot taken at construction time.
  hasPosition: (id) => hasPosition(id, positionsAU),
  onSelect: (id) => {
    state.selectedId = id;
    state.breadcrumb = breadcrumbFor(id);
    renderPanel(id);
    // P0-1: surface the focus-redirect notice in the search-message area
    // as well as the panel, so it stays visible even when the info panel
    // is collapsed. This callback only runs on user selections, i.e.
    // after the whole module (including searchMsg below) has evaluated.
    if (interaction.focusNotice) searchMsg.textContent = interaction.focusNotice;
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
  // Phase 2 P2-25: no highlighted option remains, so drop the pointer.
  searchEl.removeAttribute("aria-activedescendant");
}
// P0-1: after a select, interaction.focusNotice (if set) replaces the
// misleading "已定位" message: a no-position body is focused on its
// parent, not located itself. onSelect already wrote the notice; these
// three sites must not overwrite it with "已定位".
function locatedMsgFor(hit) {
  return interaction.focusNotice || `已定位：${hit.zh} ${hit.en}`;
}
function showDropdown() {
  renderSearchDropdown(searchDropdown, state.searchCandidates, state.searchHighlight, (id) => {
    interaction.select(id);
    searchMsg.textContent = locatedMsgFor(findBody(id));
    closeDropdown();
  });
  searchEl.setAttribute("aria-expanded", state.searchCandidates.length ? "true" : "false");
  // Phase 2 P2-25: point the combobox at the highlighted option (ids
  // assigned in ui.js renderSearchDropdown); with no highlight (-1,
  // including the ambiguous-input state) remove the attribute so a
  // screen reader is never pointed at a stale option.
  var hit = state.searchHighlight >= 0
    ? state.searchCandidates[state.searchHighlight]
    : null;
  if (hit) searchEl.setAttribute("aria-activedescendant", "search-opt-" + hit.id);
  else searchEl.removeAttribute("aria-activedescendant");
}
searchEl.addEventListener("input", () => {
  state.searchQuery = searchEl.value;
  state.searchCandidates = searchCandidates(searchEl.value, ALL_BODIES);
  // 歧义不得静默取首项：输入时不预选任何候选（highlight 保持 -1），
  // 只有方向键明确移动后 Enter 才会选中高亮项；否则 Enter 走
  // interaction.search() 的精确/单候选/歧义分支。旧代码在此置 0，
  // 导致输入“星”后直接 Enter 静默定位到首项水星（冻结缺陷）。
  state.searchHighlight = -1;
  showDropdown();
});
searchEl.addEventListener("keydown", (e) => {
  if (e.key === "ArrowDown" && state.searchCandidates.length) {
    e.preventDefault();
    // 未高亮时首次下移落到第 0 项（明确的方向键选择），而非输入时预选。
    state.searchHighlight = nextHighlight(state.searchHighlight, state.searchCandidates.length, +1);
    showDropdown();
    return;
  }
  if (e.key === "ArrowUp" && state.searchCandidates.length) {
    e.preventDefault();
    // 未高亮时首次上移落到最后一项。
    state.searchHighlight = nextHighlight(state.searchHighlight, state.searchCandidates.length, -1);
    showDropdown();
    return;
  }
  if (e.key === "Escape") { closeDropdown(); return; }
  if (e.key !== "Enter") return;
  e.preventDefault();
  // Highlight branch first (pure resolveEnter); search() runs only when
  // no highlight applies, exactly as before. Messages go through
  // locatedMsgFor so a no-position body's focus notice (P0-1) is never
  // overwritten by a misleading "已定位".
  const first = resolveEnter(state.searchHighlight, state.searchCandidates, null);
  if (first.action === "highlight") {
    interaction.select(first.body.id);
    searchMsg.textContent = locatedMsgFor(first.body);
    closeDropdown();
    return;
  }
  const hit = interaction.search(searchEl.value);
  const decision = resolveEnter(-1, state.searchCandidates, {
    hit, searchError: interaction.searchError, ambiguousCandidates: interaction.ambiguousCandidates,
  });
  if (decision.action === "searchHit") {
    searchMsg.textContent = locatedMsgFor(decision.body);
    closeDropdown();
  } else if (decision.action === "searchError") {
    searchMsg.textContent = decision.message;
  } else if (decision.action === "ambiguous") {
    state.searchCandidates = decision.candidates;
    // 歧义提示后仍不预选：否则紧接着再按一次 Enter 又会静默跳首项，
    // 绕过“请用 ↑↓ 选择后回车”的要求。下拉保持展开（candidates 非空）。
    state.searchHighlight = -1;
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

// Collapsible side panels (desktop): the collapse button doubles as the
// 40px trigger strip when its panel is collapsed (see index.html CSS).
function setupCollapse(btnId, wrapId, expandIcon, collapseIcon, expandLabel, collapseLabel) {
  const btn = document.getElementById(btnId);
  const wrap = document.getElementById(wrapId);
  if (!btn || !wrap) return;
  const setCollapsed = (collapsed) => {
    wrap.classList.toggle("collapsed", collapsed);
    btn.setAttribute("aria-expanded", collapsed ? "false" : "true");
    btn.setAttribute("aria-label", collapsed ? expandLabel : collapseLabel);
    btn.textContent = collapsed ? expandIcon : collapseIcon;
  };
  btn.addEventListener("click", () => setCollapsed(!wrap.classList.contains("collapsed")));
  setCollapsed(false);
}
setupCollapse("nav-collapse-btn", "nav-wrap", "›", "‹", "展开天体导航", "折叠天体导航");
setupCollapse("info-collapse-btn", "info-wrap", "‹", "›", "展开天体信息", "折叠天体信息");

// Scale mode: two-segment control (replaces the native <select>). The
// container keeps id="scale-mode"; each segment is a button with
// data-scale-mode + aria-pressed.
const modeEl = document.getElementById("scale-mode");
function syncScaleModeUI() {
  if (!modeEl) return;
  modeEl.querySelectorAll("[data-scale-mode]").forEach((btn) => {
    btn.setAttribute("aria-pressed", btn.dataset.scaleMode === state.mode ? "true" : "false");
  });
}
function applyScaleMode(value) {
  if (value !== "visual" && value !== "scientific") return;
  state.mode = value;
  renderer.setMode(value);
  document.getElementById("mode-badge").textContent = value === "scientific" ? "科学比例 · 距离按真实 AU，半径设最小显示下限（小于下限的天体按同一最小尺寸显示，相对大小不真实）" : "视觉探索 · 艺术放大，与物理数据分离";
  syncScaleModeUI();
  // Panel sync guard (mode switch): with no selection the panel must be
  // in overview state; only re-render when it is not already overview,
  // so a normal mode switch never loses panel scroll for no reason.
  if (interaction.selectedId === null && infoEl.dataset.bodyId !== "") renderPanel(null);
}
if (modeEl) modeEl.querySelectorAll("[data-scale-mode]").forEach((btn) => {
  btn.addEventListener("click", () => applyScaleMode(btn.dataset.scaleMode));
});
syncScaleModeUI();

// Display switches: <button role="switch" aria-checked> (replaces native
// checkboxes). The button ids keep the original toggle-* semantics.
function bindSwitch(id, apply) {
  const el = document.getElementById(id);
  if (!el) return;
  el.addEventListener("click", () => {
    const next = el.getAttribute("aria-checked") !== "true";
    el.setAttribute("aria-checked", next ? "true" : "false");
    apply(next);
  });
}
bindSwitch("toggle-labels", (v) => renderer.setLabels(v));
bindSwitch("toggle-orbits", (v) => renderer.setOrbits(v));
bindSwitch("toggle-clouds", (v) => renderer.setClouds(v));

// Bottom time controls.
const dateLabel = document.getElementById("sim-date");
const speedLabel = document.getElementById("sim-speed");
// Custom date stepper (replaces <input type="date">; the container keeps
// id="date-input" so the "specified date" semantics stay addressable).
// Three read-only numeric displays + −/+ buttons; every step applies
// immediately, keeping the current simulated time-of-day (contract §3,
// via parseDateInput, which also rejects overflow dates like 2026-02-30).
const dateYearEl = document.getElementById("date-year");
const dateMonthEl = document.getElementById("date-month");
const dateDayEl = document.getElementById("date-day");
const p2 = (n) => String(n).padStart(2, "0");
function syncDateStepper() {
  const d = clock.date;
  const y = d.getUTCFullYear();
  if (dateYearEl) dateYearEl.textContent = (y >= 1 && y <= 9999) ? String(y).padStart(4, "0") : String(y);
  if (dateMonthEl) dateMonthEl.textContent = p2(d.getUTCMonth() + 1);
  if (dateDayEl) dateDayEl.textContent = p2(d.getUTCDate());
}
function daysInMonthUTC(y, month1) {
  return new Date(Date.UTC(y, month1, 0)).getUTCDate();
}
function applyStepperDate(y, m, d) {
  if (y >= 1 && y <= 9999) {
    // Clamp first (e.g. Jan 31 -> Feb 28) so parseDateInput never has to
    // reject a step; an unparseable value leaves the date untouched.
    const dd = Math.min(d, daysInMonthUTC(y, m));
    const parsed = parseDateInput(`${String(y).padStart(4, "0")}-${p2(m)}-${p2(dd)}`, clock.date);
    if (!parsed) { syncDateStepper(); return; }
    clock.setDate(parsed);
  } else {
    clock.setDate(new Date(Date.UTC(y, m - 1, d,
      clock.date.getUTCHours(), clock.date.getUTCMinutes(),
      clock.date.getUTCSeconds(), clock.date.getUTCMilliseconds())));
  }
  refreshTimeUI();
  // B11: a date application must show/hide the banner immediately,
  // not wait for the next selected day change in the main loop.
  refreshRangeBanner(jdFromDate(clock.date));
}
function stepDate(field, delta) {
  const y = clock.date.getUTCFullYear();
  const m = clock.date.getUTCMonth() + 1;
  const d = clock.date.getUTCDate();
  if (field === "year") {
    applyStepperDate(y + delta, m, d);
  } else if (field === "month") {
    const total = (y * 12 + (m - 1)) + delta;
    const ny = Math.floor(total / 12);
    const nm = ((total % 12) + 12) % 12 + 1;
    applyStepperDate(ny, nm, d);
  } else if (field === "day") {
    const next = new Date(clock.date.getTime() + delta * 86400000);
    applyStepperDate(next.getUTCFullYear(), next.getUTCMonth() + 1, next.getUTCDate());
  }
}
const dateStepperEl = document.getElementById("date-input");
if (dateStepperEl) dateStepperEl.querySelectorAll("[data-step-field]").forEach((btn) => {
  btn.addEventListener("click", () => stepDate(btn.dataset.stepField, Number(btn.dataset.step)));
});
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
  // Stepper displays are read-only (no text editing state to protect),
  // so they always follow the simulated date, including while playing.
  syncDateStepper();
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
document.getElementById("now-btn").addEventListener("click", () => {
  clock.now(); clock.reverse = false; clock.playing = true; refreshTimeUI();
  // B11: refresh the banner immediately after jumping to now.
  refreshRangeBanner(jdFromDate(clock.date));
});
// Date changes now arrive via the stepper buttons above (step = apply);
// there is no <input type="date"> left to listen to.
refreshTimeUI();

// Events panel, refreshed when the simulated day changes.
// innerHTML writes are throttled to ~4 Hz (performance): if the last
// write was under 250 ms ago, lastEventDay is left untouched so the
// next frame retries — the current day's events land at most 250 ms
// late and are never dropped by the throttle. Positions are reused
// from computePositions (detectEvents no longer re-solves 18 bodies).
let lastEventDay = null;
let lastEventsWriteMs = 0;
function refreshEvents() {
  const jd = jdFromDate(clock.date);
  const day = Math.floor(jd);
  if (day === lastEventDay) return;
  if (performance.now() - lastEventsWriteMs < 250) return;
  // INTEGRATION (Physics legacy #3): at high speed the simulated day can
  // jump by more than one day per frame; sweeping the skipped interval
  // with detectEventsInRange prevents events on skipped days being lost.
  // The single-day detectEvents() call is kept for the normal 1-day step.
  const prevDay = lastEventDay;
  lastEventDay = day;
  lastEventsWriteMs = performance.now();
  const evs = (prevDay !== null && day - prevDay > 1)
    ? detectEventsInRange(prevDay, day + 1)
    : detectEvents(jd, positionsAU);
  const el = document.getElementById("events");
  // [P1-6] Event rows carry what the detector already outputs but the
  // panel used to drop: credibility, the parabolically refined jdTT
  // date, and the EMB basis; SBDB rows are labelled model events, not
  // forecasts. Detection itself is unchanged (see src/events.js).
  const credLabel = { kepler: "JPL 近似根数", sbdb: "SBDB 正式轨道解", horizons: "Horizons", schematic: "示意模型" };
  el.innerHTML = evs.length
    ? evs.map(e => `<div>${e.body.zh} ${e.body.en}：${e.kind}（偏差 ${e.delta.toFixed(2)}°；可信度 ${credLabel[e.credibility] || e.credibility}；细化日期 ${ttDateTimeString(e.jdTT)}；以地月系质心（EMB）位置计算${e.credibility === "sbdb" ? "；模型事件，非预报" : ""}）</div>`).join("")
    : `<div class="muted">当日无合相 / 冲日（三维角距阈值 5°，由开普勒模型计算，见 events.js 注释）</div>`;
  el.innerHTML += `<div class="muted">日食、月食、凌日、掩食与小天体接近事件尚未实现，见 README。</div>`;
  el.innerHTML += `<div class="muted">事件以地月系质心（EMB）位置计算，非地心；SBDB 相关事件为模型事件，非预报；已验证对照口径仅为 JPL 三行星、2025 年、3D 定义、2.5 天容差，见 events.js 注释。</div>`;
}

let last = performance.now();
let lastGuardFor = null; // panel-sync guard latch (see loop below)
let rafId = null;
let lastRenderedCamPos = null;
let lastRenderedCamTarget = null;
let lastRenderMs = 0;
// Last user pointer/wheel interaction: while the user is dragging, the
// camera is driven through controls.update() inside animate(), so a
// static camera snapshot alone must not gate rendering.
let lastInteractMs = 0;
for (const type of ["pointerdown", "pointermove", "wheel", "touchstart"]) {
  container.addEventListener(type, () => { lastInteractMs = performance.now(); }, { passive: true });
}
function scheduleLoop() {
  if (rafId === null && !document.hidden) rafId = requestAnimationFrame(loop);
}
function loop(now) {
  rafId = null;
  if (document.hidden) return; // visibilitychange already cancelled us; do not reschedule
  const dt = Math.min((now - last) / 1000, 0.1); last = now;
  const prevDate = clock.date.getTime();
  clock.step();
  const simDaysDelta = (clock.date.getTime() - prevDate) / 86400000;
  const jd = jdFromDate(clock.date);
  state.currentJdTT = jd;
  const jdChanged = jd !== lastJd;
  if (jdChanged) { positionsAU = computePositions(jd); lastJd = jd; }
  const dayChanged = Math.floor(jd) !== Math.floor(jdFromDate(new Date(prevDate)));
  // Idle rule: paused, simulated day unchanged, no camera tween, camera
  // bit-static since the last render, no recent interaction, and no
  // renderer change pending -> skip the render, except for a slow
  // ~2 Hz repaint heartbeat while otherwise idle. (Phase 2 render P1-1:
  // the old comment claimed this heartbeat let "deferred textures keep
  // arriving"; that was false — the deferred queue was dead code and has
  // been deleted, and textures are synchronous. The heartbeat itself is
  // kept only as a cheap repaint guard.)
  // Position state is never dropped: positionsAU/lastJd are updated
  // above before any skip, and playing/tween/interaction re-enables
  // full-rate rendering on the very next frame.
  const cam = renderer.camera.position, tgt = renderer.controls.target;
  const camStatic = lastRenderedCamPos !== null &&
    cam.x === lastRenderedCamPos.x && cam.y === lastRenderedCamPos.y && cam.z === lastRenderedCamPos.z &&
    tgt.x === lastRenderedCamTarget.x && tgt.y === lastRenderedCamTarget.y && tgt.z === lastRenderedCamTarget.z;
  const idle = !clock.playing && !jdChanged && !renderer.tween && camStatic &&
    !renderer.needsRender && (now - lastInteractMs > 300);
  if (!idle || now - lastRenderMs >= 500) {
    renderer.animate(dt, simDaysDelta, positionsAU);
    lastRenderedCamPos = { x: cam.x, y: cam.y, z: cam.z };
    lastRenderedCamTarget = { x: tgt.x, y: tgt.y, z: tgt.z };
    lastRenderMs = now;
  }
  // Incremental panel update only: two distance rows, no re-render.
  if (interaction.selectedId && dayChanged) {
    const p = positionsAU[interaction.selectedId];
    if (p) {
      updateInfoDistances(infoEl, { sunDistAU: distanceAU(p), parentDistAU: parentDistFor(interaction.selectedId) });
      // Visual-redesign B11 follow-up: keep the in-panel validity warning
      // in sync on day change without a full re-render.
      updateInfoValidity(infoEl, jd);
    }
  }
  // B11: refresh the range banner on EVERY simulated-day change, with or
  // without a selection (previously only inside the selected branch, so
  // in overview the banner never appeared and while paused it never
  // updated until the next selected day change). refreshRangeBanner
  // itself and validityFor() are untouched.
  if (dayChanged) refreshRangeBanner(jd);
  // Panel/camera sync guard (defensive): if the panel's bodyId disagrees
  // with the current selection, re-render the panel once to correct it.
  // Pure guard step (ui.js panelSyncAction); this is DOM wiring only.
  // The once-per-selection latch prevents a per-frame re-render for the
  // not-found case, where renderInfo sets dataset.bodyId to "" while
  // selectedId still holds the unknown id. Normal path: zero triggers.
  const guard = panelSyncAction(infoEl.dataset.bodyId, interaction.selectedId, lastGuardFor);
  lastGuardFor = guard.latch;
  if (guard.action === "render") renderPanel(interaction.selectedId);
  if (dayChanged) refreshTimeUI();
  refreshEvents();
  scheduleLoop();
}
// Pause the frame loop when the tab is hidden; resume on return.
document.addEventListener("visibilitychange", () => {
  if (document.hidden) {
    if (rafId !== null) { cancelAnimationFrame(rafId); rafId = null; }
  } else {
    last = performance.now(); // avoid a dt spike on return (also clamped above)
    scheduleLoop();
  }
});
window.addEventListener("resize", () => renderer.resize());
positionsAU = computePositions(jdFromDate(clock.date));
lastJd = jdFromDate(clock.date);
refreshEvents();
scheduleLoop();

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
