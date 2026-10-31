// ui.js — navigation, info panel, search dropdown, settings helpers.
// Unknown values (null/undefined) are always rendered as "未知".
// Pure helpers in this file (no DOM at module top level) are Node-testable
// and covered by test_ui.mjs; renderInfo/updateInfoDistances only touch the
// element passed in, so they run against a minimal stub element in Node.
//
// Contract notes (INTERFACE_CONTRACTS.md v1, §8):
//  - Full render on selection change; simulated-day changes must ONLY call
//    updateInfoDistances (never re-render), so scroll/focus are preserved.
//  - Unknown id renders "未找到该天体", never throws.
//  - "卫星总数 vs 已建模数" are shown separately. The data layer has not yet
//    landed moonsTotal/moonsModelled fields (see placeholder logic in
//    moonCounts()): total falls back to the legacy `moons` field, modelled
//    falls back to moonsOf(id).length. When Model lands the fields, this
//    file needs no change — the ?? chain picks them up first.
//  - Small-body source text must never read as "already from SBDB" unless
//    SBDB is actually connected; formatSource() reframes any
//    "尚未接入" source to lead with that fact.
//  - Validity: validityFor() first honours an injected Physics checker
//    (setOutOfRangeChecker, wired by main.js when astro.isOutOfRange lands),
//    then per-body accuracy.validFromJd/validToJd, then the provisional
//    JPL-branch rule (approx. 1800-2050, JD 2378497-2470173). The JPL rule
//    is a UI-side provisional fallback, NOT a Physics verdict — pending
//    alignment with Physics on astro.isOutOfRange.
import { ALL_BODIES, findBody, moonsOf } from "./data.js";
import { distanceAU } from "./astro.js";

const fmt = (v, digits = 2) => (v === null || v === undefined || Number.isNaN(v) ? "未知" : Number(v).toLocaleString("en-US", { maximumFractionDigits: digits }));
const fmtSci = (v) => (v === null || v === undefined ? "未知" : Number(v).toExponential(2));

// Escape text interpolated into innerHTML (e.g. an unknown id typed by a user).
export function esc(s) {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

// --- Pure helpers (Node-testable) -------------------------------------------

// Satellite counts: [total, modelled]. See header note on placeholder logic.
export function moonCounts(body) {
  if (!body || body.type === "卫星") return [null, null];
  const total = body.moonsTotal ?? body.moons ?? null;
  const modelled = body.moonsModelled ?? moonsOf(body.id).length;
  return [total, modelled];
}

export function moonCountsText(body) {
  const [total, modelled] = moonCounts(body);
  if (total === null && modelled === null) return "—";
  if (total === null) return `未知（已建模 ${modelled} 颗）`;
  if (total === modelled) return `${total} / ${modelled}（全部已建模）`;
  if (modelled === 0) return `${total} / 0（相关卫星尚未建模）`;
  return `${total} / ${modelled}（场景中仅建模 ${modelled} 颗）`;
}

// Perihelion/aphelion from orbital elements: q = a(1-e), Q = a(1+e).
// Used for Pluto, whose data row lacks perihelionAU/aphelionAU.
export function periApFromElements(el) {
  if (!el || !Number.isFinite(el.a) || !Number.isFinite(el.e)) return null;
  return { perihelionAU: el.a * (1 - el.e), aphelionAU: el.a * (1 + el.e) };
}

// Source text: never present an unconnected SBDB as the data origin.
export function formatSource(body) {
  const src = body?.source || "未知";
  if (/尚未接入|未接入/.test(src)) {
    const name = src.replace(/（尚未接入[^）]*）/g, "").replace(/\(尚未接入[^)]*\)/g, "").trim();
    return `尚未接入 ${name}（近似轨道，见 README）`;
  }
  return src;
}

// Accuracy value: current data uses a plain string; the contract's future
// shape is an object {level, validFromJd, validToJd, note}. Render both.
export function accuracyText(body) {
  const a = body?.accuracy;
  if (a && typeof a === "object") {
    const level = a.level || "未知";
    return a.note ? `${level}：${a.note}` : level;
  }
  return a || "未知";
}

// Breadcrumb chain: [overview, parent?, selected]. Null id = overview only.
export function breadcrumbFor(id) {
  const chain = [{ id: null, label: "太阳系全景" }];
  if (!id) return chain;
  const b = findBody(id);
  if (!b) return chain;
  if (b.parent) {
    const p = findBody(b.parent);
    if (p) chain.push({ id: p.id, label: `${p.zh} ${p.en}` });
  }
  chain.push({ id: b.id, label: `${b.zh} ${b.en}` });
  return chain;
}

// Validity / out-of-range flag. Returns { outOfRange: true|false|null, label }.
// outOfRange null means "适用期未知" (osculating branch without validity dates).
let outOfRangeChecker = null;
export function setOutOfRangeChecker(fn) { outOfRangeChecker = typeof fn === "function" ? fn : null; }
export function getOutOfRangeChecker() { return outOfRangeChecker; }

const JPL_VALID_FROM_JD = 2378497; // approx. 1800-01-01
const JPL_VALID_TO_JD = 2470173; // approx. 2050-12-31
export function validityFor(body, jdTT) {
  if (!body || jdTT === null || jdTT === undefined || Number.isNaN(jdTT)) {
    return { outOfRange: null, label: "适用期未知" };
  }
  if (outOfRangeChecker) {
    try {
      const r = outOfRangeChecker(body, jdTT);
      if (r && typeof r === "object") return r;
      if (typeof r === "boolean") {
        return r
          ? { outOfRange: true, label: "超出适用期，精度无保证" }
          : { outOfRange: false, label: "" };
      }
    } catch { /* fall through to provisional rules */ }
  }
  const acc = body.accuracy;
  if (acc && typeof acc === "object" && (acc.validFromJd !== undefined || acc.validToJd !== undefined)) {
    if ((acc.validFromJd !== undefined && jdTT < acc.validFromJd) ||
        (acc.validToJd !== undefined && jdTT > acc.validToJd)) {
      return { outOfRange: true, label: "超出适用期，精度无保证" };
    }
    return { outOfRange: false, label: "" };
  }
  // Provisional UI-side rule for the JPL branch (elements in L/lp form).
  // Pending Physics alignment on astro.isOutOfRange — see header note.
  if (body.elements && body.elements.L !== undefined) {
    if (jdTT < JPL_VALID_FROM_JD || jdTT > JPL_VALID_TO_JD) {
      return { outOfRange: true, label: "超出 JPL 近似星历适用期（约 1800–2050），精度无保证" };
    }
    return { outOfRange: false, label: "" };
  }
  return { outOfRange: null, label: "适用期未知" };
}

// Date-input helper (used by main.js): parse a yyyy-mm-dd value, keeping the
// current simulated time-of-day (contract: 指定日期保留时刻). Returns a Date
// or null for an invalid/empty value — never throws, never yields NaN.
export function parseDateInput(value, currentDate) {
  if (!value || typeof value !== "string") return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!m) return null;
  const base = currentDate instanceof Date && !Number.isNaN(currentDate.getTime())
    ? currentDate
    : new Date();
  const d = new Date(Date.UTC(
    Number(m[1]), Number(m[2]) - 1, Number(m[3]),
    base.getUTCHours(), base.getUTCMinutes(), base.getUTCSeconds(), base.getUTCMilliseconds(),
  ));
  // Guard against overflow normalisation (e.g. 2026-02-30 -> 2026-03-02).
  if (d.getUTCFullYear() !== Number(m[1]) || d.getUTCMonth() !== Number(m[2]) - 1 || d.getUTCDate() !== Number(m[3])) return null;
  return d;
}

// --- Navigation -------------------------------------------------------------
// Grouped by parent body: solar-system bodies first, then one subgroup per
// parent that has modelled moons. Active item is marked by main.js via
// setNavActive(); buildNav only builds the structure.
export function buildNav(el, onSelect) {
  el.innerHTML = "";
  const appendGroup = (title, list) => {
    if (!list.length) return;
    const h = document.createElement("div"); h.className = "nav-group"; h.textContent = title; el.appendChild(h);
    for (const b of list) {
      const btn = document.createElement("button");
      btn.className = "nav-item"; btn.dataset.id = b.id;
      btn.textContent = `${b.zh} ${b.en}`;
      btn.setAttribute("aria-current", "false");
      btn.addEventListener("click", () => onSelect(b.id));
      el.appendChild(btn);
    }
  };
  const byType = (t) => ALL_BODIES.filter((b) => b.type === t && !b.moon);
  appendGroup("恒星", byType("恒星"));
  appendGroup("行星", byType("行星"));
  appendGroup("矮行星 · 小行星 · 彗星", ALL_BODIES.filter((b) => ["矮行星", "小行星", "彗星"].includes(b.type)));
  for (const parent of ALL_BODIES.filter((b) => !b.moon)) {
    const moons = moonsOf(parent.id);
    if (moons.length) appendGroup(`${parent.zh}的卫星`, moons);
  }
}

// Mark the active nav item (class + aria-current) without rebuilding the nav,
// so focus is never lost on selection change.
export function setNavActive(root, id) {
  if (!root || !root.querySelectorAll) return;
  root.querySelectorAll(".nav-item").forEach((item) => {
    const active = item.dataset.id === id;
    item.classList.toggle("active", active);
    item.setAttribute("aria-current", active ? "true" : "false");
  });
}

// --- Search dropdown --------------------------------------------------------
// candidates: bodies from searchCandidates(); rendered as a listbox.
// The dropdown element itself is created by main.js (index.html container).
export function renderSearchDropdown(el, candidates, highlightIndex, onPick) {
  if (!candidates || !candidates.length) {
    el.innerHTML = ""; el.hidden = true; return;
  }
  el.hidden = false;
  el.innerHTML = "";
  candidates.forEach((b, i) => {
    const btn = document.createElement("button");
    btn.type = "button"; btn.className = "search-item" + (i === highlightIndex ? " highlighted" : "");
    btn.setAttribute("role", "option");
    btn.setAttribute("aria-selected", i === highlightIndex ? "true" : "false");
    const parent = b.parent ? findBody(b.parent) : null;
    btn.textContent = `${b.zh} ${b.en} · ${b.type}${parent ? ` · 母天体：${parent.zh}` : ""}`;
    btn.addEventListener("click", () => onPick(b.id));
    // mousedown fires before input blur closes the list; keep click working.
    btn.addEventListener("mousedown", (e) => e.preventDefault());
    el.appendChild(btn);
  });
}

// --- Info panel -------------------------------------------------------------

function breadcrumbHTML(id, onSelect, onOverview) {
  const chain = breadcrumbFor(id);
  const parts = chain.map((c, i) => {
    const last = i === chain.length - 1;
    if (last) return `<span aria-current="true">${esc(c.label)}</span>`;
    const action = c.id === null ? "overview" : `select:${c.id}`;
    return `<button type="button" class="crumb" data-crumb="${esc(action)}">${esc(c.label)}</button>`;
  });
  void onSelect; void onOverview; // wiring is done by delegation in renderInfo
  return `<nav class="breadcrumb" aria-label="探索链">${parts.join(" <span aria-hidden=\"true\">›</span> ")}</nav>`;
}

// Full render — ONLY on selection change. opts: { parentDistAU, jdTT,
// onSelect, onOverview } (onSelect: moon-link / crumb clicks; onOverview:
// overview crumb). Breadcrumb + parent/overview buttons are delegated here
// so a rebuilt panel keeps working.
export function renderInfo(el, id, posAU, sunDistAU, opts = {}) {
  if (!id) {
    el.innerHTML = `<h2>太阳系全景</h2><p class="muted">点击任意天体，或从左侧导航选择，进入连续聚焦：太阳系 → 地球 → 月球、太阳系 → 土星 → 土卫六、太阳系 → 木星 → 木卫二。</p>
    <p class="muted">位置为开普勒近似模型计算，非完整 Horizons DE441 星历。纹理为程序化生成，非实测影像。</p>
    <p class="muted">快捷键：Esc 回总览 · Space 播放/暂停 · ←/→ 调速 · 点击空白处取消选中。拖拽旋转，滚轮缩放。</p>`;
    el.dataset.bodyId = "";
    return;
  }
  const b = findBody(id);
  if (!b) {
    el.innerHTML = `<h2>未找到该天体</h2><p class="muted">没有 id 为“${esc(id)}”的天体，请从左侧导航或搜索中选择。</p>`;
    el.dataset.bodyId = "";
    return;
  }
  const modelled = moonsOf(id);
  const moonsHTML = b.type === "卫星"
    ? "—"
    : modelled.length
      ? modelled.map((m) => `<button type="button" class="moon-link" data-moon-id="${esc(m.id)}">${esc(m.zh)} ${esc(m.en)}</button>`).join("、")
      : (moonCounts(b)[0] > 0 ? "尚未建模" : "无");
  const parent = b.parent ? findBody(b.parent) : null;
  const dist = sunDistAU !== undefined && sunDistAU !== null ? `${fmt(sunDistAU, 3)} AU` : "未知";
  const parentDist = opts.parentDistAU !== undefined && opts.parentDistAU !== null
    ? `${fmt(opts.parentDistAU, 6)} AU`
    : "未知";
  const rot = b.rotationDays === null || b.rotationDays === undefined ? "未知" : `${Math.abs(b.rotationDays)} 天${b.rotationDays < 0 ? "（逆向）" : ""}`;
  const validity = validityFor(b, opts.jdTT);
  const periRow = b.perihelionAU
    ? `<dt>近日点距离</dt><dd>${b.perihelionAU} AU</dd><dt>远日点距离</dt><dd>${b.aphelionAU} AU</dd>`
    : (() => {
        const pa = b.id === "pluto" ? periApFromElements(b.elements) : null;
        return pa
          ? `<dt>近日点距离（由轨道根数计算）</dt><dd>${fmt(pa.perihelionAU, 3)} AU</dd><dt>远日点距离（由轨道根数计算）</dt><dd>${fmt(pa.aphelionAU, 3)} AU</dd>`
          : "";
      })();
  const moonAKm = b.moon && b.moon.aKm ? `（轨道半长轴 ${fmt(b.moon.aKm, 0)} km）` : "";
  el.innerHTML = `
    ${breadcrumbHTML(id)}
    <h2>${esc(b.zh)} <span class="en">${esc(b.en)}</span></h2>
    ${validity.outOfRange ? `<p class="range-warning" role="alert">⚠ ${esc(validity.label)}</p>` : ""}
    <div class="panel-actions">
      ${parent ? `<button type="button" id="parent-btn" data-parent-id="${esc(parent.id)}">↑ 返回母天体：${esc(parent.zh)}</button>` : ""}
      <button type="button" id="panel-overview-btn">返回全景</button>
    </div>
    <dl>
      <dt>天体类型</dt><dd>${esc(b.type)}</dd>
      <dt>直径</dt><dd>${b.diameterKm ? fmt(b.diameterKm, 0) + " km" : "未知"}</dd>
      <dt>质量</dt><dd>${fmtSci(b.massKg)} kg</dd>
      <dt>密度</dt><dd>${b.density ? b.density + " g/cm³" : "未知"}</dd>
      <dt>平均温度</dt><dd>${b.tempK ? b.tempK + " K" : "未知"}</dd>
      <dt>自转周期</dt><dd>${rot}</dd>
      <dt>公转周期</dt><dd>${b.orbitalPeriodDays ? fmt(b.orbitalPeriodDays, 1) + " 天" : "未知"}</dd>
      <dt>轨道偏心率</dt><dd>${fmt(b.eccentricity, 4)}</dd>
      <dt>轨道倾角</dt><dd>${b.inclinationDeg !== null && b.inclinationDeg !== undefined ? b.inclinationDeg + "°" : "未知"}</dd>
      <dt>与太阳距离</dt><dd id="info-sun-dist">${dist}</dd>
      ${b.type === "卫星" ? `<dt>与母天体距离</dt><dd id="info-parent-dist">${parentDist} ${moonAKm}</dd>` : ""}
      <dt>卫星（总数 / 已建模）</dt><dd>${b.type === "卫星" ? "—" : moonCountsText(b)}</dd>
      <dt>母天体</dt><dd>${parent ? `${esc(parent.zh)} ${esc(parent.en)}` : "无（太阳系中心）"}</dd>
      <dt>相关卫星</dt><dd>${moonsHTML}</dd>
      <dt>数据来源</dt><dd>${esc(formatSource(b))}</dd>
      <dt>数据更新时间</dt><dd>${b.updated || "未知"}</dd>
      <dt>位置精度</dt><dd>${esc(accuracyText(b))}${validity.outOfRange === null ? "（适用期未知）" : ""}</dd>
      ${periRow}
      ${b.uncertainty ? `<dt>不确定性说明</dt><dd>${esc(b.uncertainty)}</dd>` : ""}
    </dl>
    ${b.type === "卫星" ? `<p class="muted">卫星位置为简化开普勒模型，非完整月球/行星卫星理论。</p>` : ""}
    <p class="muted">表面纹理为程序化生成，非实测影像。</p>`;
  el.dataset.bodyId = id;
  // Delegated wiring for this render (panel is rebuilt, so re-bind each time).
  el.querySelectorAll(".moon-link").forEach((btn) => {
    btn.addEventListener("click", () => opts.onSelect && opts.onSelect(btn.dataset.moonId));
  });
  el.querySelectorAll(".crumb").forEach((btn) => {
    btn.addEventListener("click", () => {
      const action = btn.dataset.crumb;
      if (action === "overview") { if (opts.onOverview) opts.onOverview(); }
      else if (action.startsWith("select:")) { if (opts.onSelect) opts.onSelect(action.slice(7)); }
    });
  });
  const parentBtn = el.querySelector("#parent-btn");
  if (parentBtn) parentBtn.addEventListener("click", () => opts.onSelect && opts.onSelect(parentBtn.dataset.parentId));
  const ovBtn = el.querySelector("#panel-overview-btn");
  if (ovBtn) ovBtn.addEventListener("click", () => opts.onOverview && opts.onOverview());
  void posAU; void distanceAU;
}

// Incremental update — ONLY the two distance rows, on simulated-day change.
// Never touches innerHTML, scroll position or focus. No-ops if the panel is
// not showing a full render (e.g. overview / not-found) or rows are absent.
export function updateInfoDistances(el, { sunDistAU, parentDistAU } = {}) {
  if (!el || !el.querySelector) return false;
  let updated = false;
  const sunRow = el.querySelector("#info-sun-dist");
  if (sunRow && sunDistAU !== undefined && sunDistAU !== null) {
    const text = `${fmt(sunDistAU, 3)} AU`;
    if (sunRow.textContent !== text) { sunRow.textContent = text; updated = true; }
  }
  const parentRow = el.querySelector("#info-parent-dist");
  if (parentRow && parentDistAU !== undefined && parentDistAU !== null) {
    // Preserve the "(轨道半长轴 …)" suffix rendered by renderInfo.
    const suffix = parentRow.textContent.includes("（轨道半长轴")
      ? parentRow.textContent.slice(parentRow.textContent.indexOf("（轨道半长轴"))
      : "";
    const text = `${fmt(parentDistAU, 6)} AU ${suffix}`.trimEnd();
    if (parentRow.textContent !== text) { parentRow.textContent = text; updated = true; }
  }
  return updated;
}
