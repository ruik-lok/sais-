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
//  - "卫星总数 vs 已建模数" are shown separately. The data layer HAS
//    landed moonsTotal/moonsModelled fields (see moonCounts()): total
//    prefers `moonsTotal`, modelled prefers `moonsModelled`, and the
//    ?? chain only falls back to the legacy `moons` field and to
//    moonsOf(id).length when a field is absent.
//  - Small-body source text must never read as "already from SBDB" unless
//    SBDB is actually connected; formatSource() reframes any
//    "尚未接入" source to lead with that fact.
//  - Validity: validityFor() first honours an injected Physics checker
//    (setOutOfRangeChecker, wired by main.js to astro.isOutOfRange),
//    then per-body accuracy.validFromJd/validToJd, then the provisional
//    JPL-branch rule (approx. 1800-2050, JD 2378497-2470173). The JPL rule
//    is a UI-side provisional fallback, NOT a Physics verdict.
import { ALL_BODIES, findBody, moonsOf, shapeKindFor, shapeFallbackFor } from "./data.js";
import { distanceAU } from "./astro.js";
import { NO_POSITION_FOCUS_NOTICE } from "./interaction.js";

const fmt = (v, digits = 2) => (v === null || v === undefined || Number.isNaN(v) ? "未知" : Number(v).toLocaleString("en-US", { maximumFractionDigits: digits }));
const fmtSci = (v) => (v === null || v === undefined ? "未知" : Number(v).toExponential(2));

// Escape text interpolated into innerHTML (e.g. an unknown id typed by a user).
export function esc(s) {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

// --- Pure helpers (Node-testable) -------------------------------------------

// Satellite counts: [total, modelled]. See header note: fields landed,
// ?? fallback only.
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
// Used for every body that has elements a/e but no stored
// perihelionAU/aphelionAU (all 8 planets + Pluto); SBDB bodies use their
// stored values, displayed at 3 decimals (display-only, see renderInfo).
export function periApFromElements(el) {
  if (!el || !Number.isFinite(el.a) || !Number.isFinite(el.e)) return null;
  return { perihelionAU: el.a * (1 - el.e), aphelionAU: el.a * (1 + el.e) };
}

// [P1-5] Panel position note — wording matches the README sentence
// exactly, so the panel and the docs cannot drift apart.
export const POSITION_NOTE = "面板位置为 J2000 几何位置，非当日视位置：场景坐标为日心黄道 J2000 几何位置，未换算为当日视位置。";

// TT calendar date/time from a TT Julian Day. JD 2440587.5 is
// 1970-01-01T00:00 in the JD scale, so reading the JD as a UTC instant
// yields the TT calendar date. Do NOT use astro.dateFromJd here: it
// subtracts Delta-T and lands on the previous UTC evening for .5 epochs
// (2461200.5 would read 2026-06-08 instead of the documented SBDB epoch
// date 2026-06-09). Labels that use these helpers say TT explicitly.
export function ttDateString(jd) {
  if (!Number.isFinite(jd)) return "未知";
  const d = new Date((jd - 2440587.5) * 86400000);
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())}`;
}
export function ttDateTimeString(jd) {
  if (!Number.isFinite(jd)) return "未知";
  const d = new Date((jd - 2440587.5) * 86400000);
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}（TT）`;
}

// [P1-8] Axial tilt: null means UNKNOWN, never 0 degrees. The explicit
// == null check (never `|| 0` / `|| "未知"` on a numeric value) keeps a
// genuine 0° tilt, if one ever lands, distinct from unknown.
export function axialTiltText(body) {
  const v = body?.axialTiltDeg;
  return v === null || v === undefined ? "未知" : `${fmt(v, 3)}°`;
}

// [P1-8/P2-19] Shape line, reusing the data layer's shapeKindFor /
// shapeFallbackFor. Fallback spheres are labelled, not silently drawn;
// triaxial bodies show both the axes and the geometric-mean diameter
// next to the catalogue diameter (different estimates, never merged).
export function shapeText(body) {
  if (!body) return "未知";
  const kind = shapeKindFor(body);
  const label = { sphere: "球体", oblate: "扁球体", triaxial: "三轴椭球体", irregular: "不规则体（示意）" }[kind] || kind;
  let text = label;
  if (kind === "oblate" && typeof body.flattening === "number") text += `（扁率 ${body.flattening}）`;
  if (kind === "triaxial" && Array.isArray(body.axesKm)) {
    text += `（三轴 ${body.axesKm.join(" × ")} km`;
    const geo = Math.cbrt(body.axesKm[0] * body.axesKm[1] * body.axesKm[2]);
    if (body.diameterKm) text += `；三轴几何平均直径约 ${fmt(geo, 0)} km，与目录直径 ${fmt(body.diameterKm, 0)} km 为不同估计，并列展示不取一`;
    text += "）";
  }
  if (shapeFallbackFor(body)) text += "；形状未知，按球体示意";
  return text;
}

// [P1-8/P2-19] Ring line, or null when the panel must show no ring row.
// A null ring is ambiguous in general, but only Haumea is flagged here:
// its data row carries the explicit not-modelled comment (audit P2-19).
// Other ringless bodies get no row rather than a possibly false "无环".
export function ringText(body) {
  if (!body) return null;
  if (body.ring) {
    const gap = body.ring.cassiniGap === true ? "含卡西尼缝示意间隙"
      : body.ring.cassiniGap === false ? "无卡西尼缝示意" : "卡西尼缝未知";
    return `内径 ${body.ring.inner} 体半径 – 外径 ${body.ring.outer} 体半径；剖面 ${body.ring.profile}（示意，非实测亮度剖面）；${gap}`;
  }
  if (body.id === "haumea") return "环未建模（ring 为 null 表示未建模，非已确认无环）";
  return null;
}

// [P1-8] Small-body orbit-solution line. The solution date is labelled
// as the ORBIT-SOLUTION date, distinct from the panel's data-date rows
// (for SBDB bodies the legacy updated value happens to equal solnDate;
// that coincidence is stated in the data layer, not hidden by merging
// the two rows into one).
export function orbitSolutionText(body) {
  const os = body?.orbitSolution;
  if (!os) return null;
  return `orbitId ${os.orbitId}；历元 JD ${os.epochJd}（${ttDateString(os.epochJd)}，TT 日期）；观测弧长 ${fmt(os.arcDays, 0)} 天；解算日期 ${os.solnDate}`;
}

// [P1-9] Data-date rows. Split-branch bodies (JPL + satellites) show
// source date (null -> 未知, never the file date) and file date
// separately; SBDB bodies keep the legacy single updated row unchanged.
export function dateRows(body) {
  if (!body) return [["数据更新时间", "未知"]];
  if (body.fileUpdated !== undefined || body.sourceDate !== undefined) {
    return [
      ["数据源日期", body.sourceDate || "未知"],
      ["数据整理日期", body.fileUpdated || "未知"],
    ];
  }
  return [["数据更新时间", body.updated || "未知"]];
}
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
      // Visual-redesign QA fix: astro.isOutOfRange returns
      // {outOfRange, validityKnown, validFromJd, validToJd, branch} with
      // NO label, and passing it through verbatim rendered "⚠ undefined"
      // in the banner and panel warning. Normalise the label here so
      // every out-of-range verdict carries copy, without changing the
      // checker's verdict itself.
      if (r && typeof r === "object") {
        if (typeof r.label === "string") return r;
        return {
          ...r,
          label: r.outOfRange ? "超出适用期，精度无保证" : "",
        };
      }
      if (typeof r === "boolean") {
        return r
          ? { outOfRange: true, label: "超出适用期，精度无保证" }
          : { outOfRange: false, label: "" };
      }
    } catch { /* fall through to provisional rules */ }
  }
  const acc = body.accuracy;
  if (acc && typeof acc === "object") {
    // INTEGRATION fix: accuracy with both bounds null (SBDB bodies: SBDB
    // gives no validity window) means "适用期未知", NOT "in range".
    // The old check (validFromJd !== undefined) was true for null and
    // wrongly returned outOfRange:false for SBDB bodies.
    const hasFrom = typeof acc.validFromJd === "number" && Number.isFinite(acc.validFromJd);
    const hasTo = typeof acc.validToJd === "number" && Number.isFinite(acc.validToJd);
    if (!hasFrom && !hasTo) return { outOfRange: null, label: "适用期未知" };
    if ((hasFrom && jdTT < acc.validFromJd) || (hasTo && jdTT > acc.validToJd)) {
      return { outOfRange: true, label: "超出适用期，精度无保证" };
    }
    return { outOfRange: false, label: "" };
  }
  // Provisional UI-side rule for the JPL branch (elements in L/lp form).
  // Fallback only: reached when no injected checker verdict applies and
  // the body has no accuracy window; the injected astro.isOutOfRange
  // checker (wired in main.js) takes precedence above.
  if (body.elements && body.elements.L !== undefined) {
    if (jdTT < JPL_VALID_FROM_JD || jdTT > JPL_VALID_TO_JD) {
      return { outOfRange: true, label: "超出 JPL 近似星历适用期（约 1800–2050），精度无保证" };
    }
    return { outOfRange: false, label: "" };
  }
  return { outOfRange: null, label: "适用期未知" };
}

// --- Range-banner verdict + panel-sync guard (Phase 2, audit P0-3) --------
// Extracted verbatim from main.js refreshRangeBanner() and the main-loop
// panel/camera sync guard, so main.js keeps only DOM wiring (hidden /
// textContent / renderPanel calls). Pure: no DOM, no render side effect.

// Banner verdict for one simulated date. selectedBody may be null
// (panorama). Rules, exactly as in main.js:
//  - With a selection, its validityFor() verdict governs first.
//  - Otherwise (no selection, or verdict not out-of-range — including
//    outOfRange === null, "适用期未知"), the Earth verdict is the global
//    fallback: if Earth is out of range, the banner shows the JPL copy.
// LOCK (audit P2-12, NOT fixed here): a selected SBDB body at e.g. 2100
// therefore shows the JPL copy via the Earth fallback even though the
// body itself is not a JPL body. A P2-12 fix must update the test that
// locks this behaviour (test_pure.mjs) together with this function.
export function rangeBannerVerdict(selectedBody, earthBody, jdTT) {
  let v = selectedBody ? validityFor(selectedBody, jdTT) : { outOfRange: false, label: "" };
  if (!v.outOfRange) {
    const gv = earthBody ? validityFor(earthBody, jdTT) : { outOfRange: false, label: "" };
    if (gv.outOfRange) {
      v = { outOfRange: true, label: "当前模拟日期超出 JPL 近似星历适用期（约 1800–2050），位置精度无保证" };
    }
  }
  return { visible: !!v.outOfRange, text: v.outOfRange ? `⚠ ${v.label}` : "" };
}

// Panel/camera sync guard, one step of the main-loop latch. panelBodyId is
// infoEl.dataset.bodyId ("" for overview / not-found renders); selectedId
// is the current selection (null for overview); latch is the previous
// lastGuardFor value. Returns { action, latch }:
//  - panel already matches the selection: { action: "none", latch: null }
//    (latch resets, so a later mismatch renders again);
//  - mismatch, first time for this selection: { action: "render", latch }
//    (caller re-renders the panel once);
//  - mismatch, already latched for this selection: { action: "none" }
//    with the latch held — this is what stops an unknown id (panel stays
//    "" while selectedId holds the unknown id) from re-rendering forever.
export function panelSyncAction(panelBodyId, selectedId, latch) {
  const expected = selectedId || "";
  if (panelBodyId === expected) return { action: "none", latch: null };
  if (latch !== expected) return { action: "render", latch: expected };
  return { action: "none", latch };
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
    // Phase 2 P1-15 step 1 / P2-28: nav group titles migrate to the token
    // class .orb-group-title (colour --text-2). .nav-group is kept
    // transitionally for its margin; no other component migrates here.
    const h = document.createElement("div"); h.className = "nav-group orb-group-title"; h.textContent = title; el.appendChild(h);
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
    // Phase 2 P2-25: stable option ids so the input can point at the
    // highlighted option via aria-activedescendant (body ids are
    // ASCII slugs, safe to use in an id).
    btn.id = "search-opt-" + b.id;
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
    <p class="muted">位置为开普勒近似模型计算，非完整 Horizons DE441 星历。纹理为程序化生成，非实测影像。科学比例模式下距离按真实 AU，半径设最小显示下限（小于下限的天体按同一最小尺寸显示，相对大小不真实）。</p>
    <p class="muted">${POSITION_NOTE}</p>
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
  // [P2-16] q/Q: SBDB rows keep their stored values but are DISPLAYED
  // at 3 decimals (data-layer full precision is never truncated — fmt
  // is display-only); every other body with elements a/e gets q/Q
  // computed from the elements, labelled as computed, not stored.
  const periRow = (b.perihelionAU !== null && b.perihelionAU !== undefined)
    ? `<dt>近日点距离</dt><dd>${fmt(b.perihelionAU, 3)} AU</dd><dt>远日点距离</dt><dd>${fmt(b.aphelionAU, 3)} AU</dd>`
    : (() => {
        const pa = periApFromElements(b.elements);
        return pa
          ? `<dt>近日点距离（由轨道根数计算）</dt><dd>${fmt(pa.perihelionAU, 3)} AU</dd><dt>远日点距离（由轨道根数计算）</dt><dd>${fmt(pa.aphelionAU, 3)} AU</dd>`
          : "";
      })();
  const shapeRow = `<dt>形状</dt><dd>${esc(shapeText(b))}</dd>`;
  const ringRowText = ringText(b);
  const ringRow = ringRowText ? `<dt>行星环</dt><dd>${esc(ringRowText)}</dd>` : "";
  const orbitRowText = orbitSolutionText(b);
  const orbitRow = orbitRowText ? `<dt>轨道解（SBDB）</dt><dd>${esc(orbitRowText)}</dd>` : "";
  const dateRowHtml = dateRows(b).map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join("");
  const sourceDetailRow = b.sourceDetail ? `<dt>来源详情</dt><dd>${esc(b.sourceDetail)}</dd>` : "";
  const phaseRow = b.type === "卫星" && b.moon
    ? `<dt>相位历元</dt><dd>${b.moon.phaseEpochJd ? `J2000（JD ${b.moon.phaseEpochJd}）` : "未知"}</dd>` : "";
  const moonAKm = b.moon && b.moon.aKm ? `（轨道半长轴 ${fmt(b.moon.aKm, 0)} km）` : "";
  // P0-1 panel notice: a satellite whose phase was never verified
  // (phaseDeg null) has no AU position, so the panel must say so in the
  // same words as the focus logic, and must not imply a plotted position.
  // Distances for such a body already render as "未知" (posAU / parentDist
  // null from main.js); this line is the explicit statement of why.
  const noPhase = b.type === "卫星" && b.moon && !Number.isFinite(b.moon.phaseDeg);
  el.innerHTML = `
    ${breadcrumbHTML(id)}
    <h2>${esc(b.zh)} <span class="en">${esc(b.en)}</span></h2>
    ${noPhase ? `<p class="position-notice" role="note">${esc(NO_POSITION_FOCUS_NOTICE)}</p>` : ""}
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
      <dt>公转周期</dt><dd>${b.orbitalPeriodDays ? fmt(b.orbitalPeriodDays, 1) + " 天" : "未知"}${b.elements && b.elements.L !== undefined ? "（展示/采样用；位置计算用根数 L 变化率）" : ""}</dd>
      <dt>轨道偏心率</dt><dd>${fmt(b.eccentricity, 4)}</dd>
      <dt>轨道倾角</dt><dd>${b.inclinationDeg !== null && b.inclinationDeg !== undefined ? b.inclinationDeg + "°" : "未知"}</dd>
      <dt>自转轴倾角</dt><dd>${axialTiltText(b)}</dd>
      ${shapeRow}
      ${ringRow}
      ${orbitRow}
      ${phaseRow}
      <dt>与太阳距离</dt><dd id="info-sun-dist">${dist}</dd>
      ${b.type === "卫星" ? `<dt>与母天体距离</dt><dd id="info-parent-dist">${parentDist} ${moonAKm}</dd>` : ""}
      <dt>卫星（总数 / 已建模）</dt><dd>${b.type === "卫星" ? "—" : moonCountsText(b)}</dd>
      <dt>母天体</dt><dd>${parent ? `${esc(parent.zh)} ${esc(parent.en)}` : "无（太阳系中心）"}</dd>
      <dt>相关卫星</dt><dd>${moonsHTML}</dd>
      <dt>数据来源</dt><dd>${esc(formatSource(b))}</dd>
      ${sourceDetailRow}
      ${dateRowHtml}
      <dt>位置精度</dt><dd>${esc(accuracyText(b))}${validity.outOfRange === null ? "（适用期未知）" : ""}</dd>
      ${periRow}
      ${(b.orbitSolution?.uncertainty || b.uncertainty) ? `<dt>不确定性说明</dt><dd>${esc(b.orbitSolution?.uncertainty || b.uncertainty)}</dd>` : ""}
    </dl>
    ${b.type !== "卫星" && b.moonsTotal ? `<p class="muted">卫星总数为目录快照值：本仓库未收录该总数的独立统计日期与统计口径，总数数值未在本轮更新；已建模数为场景实际条目数。</p>` : ""}
    ${b.type === "卫星" ? `<p class="muted">卫星位置为简化开普勒模型（黄道系示意，非母天体赤道系），非完整月球/行星卫星理论。</p>` : ""}
    <p class="muted">${POSITION_NOTE}</p>
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

// Incremental validity update — ONLY the .range-warning row, on
// simulated-day change (visual-redesign B11 follow-up). The top banner is
// refreshed separately by main.js; this keeps the in-panel warning in sync
// without a full re-render, so scroll position and focus are preserved.
// No-ops when the panel is not showing a body render.
export function updateInfoValidity(el, jdTT) {
  if (!el || !el.querySelector) return false;
  const id = el.dataset && el.dataset.bodyId;
  if (!id) return false;
  const body = findBody(id);
  if (!body) return false;
  const v = validityFor(body, jdTT);
  const warn = el.querySelector(".range-warning");
  if (!v.outOfRange) {
    if (warn) warn.remove();
    return !!warn;
  }
  const text = `⚠ ${v.label}`;
  if (warn) {
    if (warn.textContent !== text) { warn.textContent = text; return true; }
    return false;
  }
  const p = document.createElement("p");
  p.className = "range-warning";
  p.setAttribute("role", "alert");
  p.textContent = text;
  const anchor = el.querySelector(".panel-actions") || el.querySelector("dl") || el.querySelector("h2");
  if (anchor) anchor.before(p);
  else el.prepend(p);
  return true;
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
