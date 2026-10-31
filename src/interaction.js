// interaction.js — focus chains and search, decoupled from rendering.
// A focus chain is just successive focusTo calls; the renderer tweens
// smoothly, so Solar System -> Earth -> Moon never teleports.
//
// P0-1: a body with no position (20 non-Moon satellites: phaseDeg null, so
// computePositions skips them) must never be focused at the scene origin.
// select() redirects the CAMERA to the parent body while keeping the
// original body as the selection identity, so its panel still shows its
// catalogue + physical parameters with the no-phase notice below. No
// position is ever invented for the redirected body.
//
// Search contract (INTERFACE_CONTRACTS.md v1, §8):
//  - Input-time suggestions via searchCandidates(): matches Chinese name,
//    English name and id (substring, case-insensitive for Latin text).
//    Ranking: exact match first, then prefix match, then substring, keeping
//    catalogue order inside each tier. The placeholder text in index.html
//    only promises Chinese name / English name / id — there is no MPC
//    number field in the data layer, so numbers must not be advertised.
//  - Ambiguity is NEVER resolved silently to the first hit: search() only
//    auto-selects on an exact match or a single candidate; otherwise it
//    returns null and exposes the candidate list (this.ambiguousCandidates)
//    so the UI can show the dropdown instead of moving the camera.
//  - If the catalogue was never injected (Interaction._data empty), search()
//    warns via console.warn and sets this.searchError instead of silently
//    returning null (audit Q10).
import { findBody } from "./data.js";

// P0-1 shared copy: the panel (ui.js renderInfo) and this focus logic
// both render this exact string, from this single constant, so the two
// surfaces can never drift apart.
export const NO_POSITION_FOCUS_NOTICE = "暂无可用相位，位置未知，仅展示目录与物理参数";

export function normalizeQuery(query) {
  return (query || "").trim().toLowerCase();
}

// Pure, Node-testable: rank candidates for a query over a body list.
export function searchCandidates(query, bodies) {
  const q = normalizeQuery(query);
  const raw = (query || "").trim();
  if (!q || !Array.isArray(bodies)) return [];
  const scored = [];
  for (const b of bodies) {
    const zh = b.zh || "";
    const en = (b.en || "").toLowerCase();
    const id = (b.id || "").toLowerCase();
    let tier = -1;
    if (id === q || en === q || zh === raw) tier = 0; // exact
    else if (id.startsWith(q) || en.startsWith(q) || (raw && zh.startsWith(raw))) tier = 1; // prefix
    else if (id.includes(q) || en.includes(q) || (raw && zh.includes(raw))) tier = 2; // substring
    if (tier >= 0) scored.push({ body: b, tier });
  }
  scored.sort((a, b) => a.tier - b.tier); // stable: catalogue order within a tier
  return scored.map((s) => s.body);
}

// --- Search-dropdown state machine (Phase 2, audit P0-3) -------------------
// Extracted verbatim from main.js search key handlers (input/ArrowDown/
// ArrowUp/Enter), so main.js keeps only DOM wiring. Pure: no DOM, no
// selection side effect — the caller performs the select/message/close
// steps the returned action describes. Behaviour is unchanged, including
// the two rules that froze B5: input never preselects (highlight stays
// -1), and an ambiguous Enter never jumps to the first candidate.

// Next highlight for an arrow key. dir must be +1 (down) or -1 (up).
// From no highlight, down lands on item 0 and up on the last item;
// otherwise it wraps. Empty candidate list stays at -1.
export function nextHighlight(current, length, dir) {
  if (!Number.isFinite(length) || length <= 0) return -1;
  if (current < 0 || current >= length) return dir >= 0 ? 0 : length - 1;
  if (dir >= 0) return (current + 1) % length;
  return (current - 1 + length) % length;
}

// Resolve an Enter press. searchOutcome is the result of Interaction.
// search() and is only consulted when no highlight applies; it must be
// null when the highlight branch applies (the caller has not run search
// yet), and { hit, searchError, ambiguousCandidates } otherwise.
// Returns one of:
//   { action: "highlight", body }      — select the highlighted candidate
//   { action: "searchHit", body }      — search() already selected it
//   { action: "searchError", message } — search() could not run
//   { action: "ambiguous", candidates }— keep dropdown open, highlight -1
//   { action: "notFound" }             — no candidate at all
// In particular, an ambiguous outcome NEVER yields a body: calling this
// twice in a row on the same ambiguous outcome returns "ambiguous" both
// times (the B5 double-Enter regression), never a silent first-hit jump.
export function resolveEnter(highlight, candidates, searchOutcome) {
  const list = Array.isArray(candidates) ? candidates : [];
  if (Number.isInteger(highlight) && highlight >= 0 && list[highlight]) {
    return { action: "highlight", body: list[highlight] };
  }
  if (!searchOutcome) return { action: "notFound" };
  if (searchOutcome.hit) return { action: "searchHit", body: searchOutcome.hit };
  if (searchOutcome.searchError) return { action: "searchError", message: searchOutcome.searchError };
  const amb = Array.isArray(searchOutcome.ambiguousCandidates) ? searchOutcome.ambiguousCandidates : [];
  if (amb.length) return { action: "ambiguous", candidates: amb };
  return { action: "notFound" };
}

export class Interaction {
  constructor({ renderer, getScenePos, onSelect, hasPosition }) {
    this.renderer = renderer;
    this.getScenePos = getScenePos; // (id) => {x,y,z} scene units
    this.onSelect = onSelect;
    // hasPosition: (id) => boolean, injected by main.js from positionsAU.
    // Absent (old callers / Node stubs without a positions map) means
    // "treat as positioned": the redirect only fires when the caller can
    // actually prove a body has no position, never on a guess.
    this.hasPosition = typeof hasPosition === "function" ? hasPosition : null;
    this.selectedId = null;
    this.searchError = null; // string when the last search could not run
    this.ambiguousCandidates = []; // candidates when search() declined to pick
    this.focusNotice = null; // P0-1: NO_POSITION_FOCUS_NOTICE when the last selection had no position
    this.focusRedirectedTo = null; // P0-1: parent id the camera was redirected to, else null
  }
  select(id) {
    // Unknown id: never throw, never focus a missing object. The panel
    // renders "未找到该天体" via onSelect -> renderInfo (contract §8).
    const known = !!findBody(id);
    this.selectedId = id;
    this.focusNotice = null;
    this.focusRedirectedTo = null;
    if (!known) {
      if (this.renderer) this.renderer.highlight(null);
      if (this.onSelect) this.onSelect(id);
      return false;
    }
    const body = findBody(id);
    const positioned = this.hasPosition ? this.hasPosition(id) : true;
    if (!positioned) this.focusNotice = NO_POSITION_FOCUS_NOTICE;
    // P0-1 redirect: no position + a positioned parent -> camera goes to
    // the parent, selection identity stays on the requested body so its
    // panel (catalogue + physical parameters + notice) still renders.
    // The highlight follows the camera target, so the selection outline
    // never sits at the origin on a hidden body.
    // P2-31: all renderer uses below are guarded (main.js always passes
    // a Renderer, so production behaviour is unchanged; this only keeps
    // a null renderer from throwing in tests and in any future caller).
    if (!positioned && body && body.parent && this.hasPosition && this.hasPosition(body.parent)) {
      this.focusRedirectedTo = body.parent;
      const parentSp = this.getScenePos ? this.getScenePos(body.parent) : null;
      const parentRec = this.renderer ? this.renderer.bodies.get(body.parent) : null;
      if (parentSp && parentRec) this.renderer.focusTo(body.parent, parentSp, parentRec.radius);
      if (this.renderer) this.renderer.highlight(body.parent);
      if (this.onSelect) this.onSelect(id);
      return true;
    }
    const sp = this.getScenePos(id);
    const o = this.renderer ? this.renderer.bodies.get(id) : null;
    if (sp && o) this.renderer.focusTo(id, sp, o.radius);
    if (this.renderer) this.renderer.highlight(id);
    if (this.onSelect) this.onSelect(id);
    return true;
  }
  // Focus the selected body's parent (breadcrumb "返回母天体").
  // Returns false when there is no parent to go to.
  focusParent() {
    if (!this.selectedId) return false;
    const b = findBody(this.selectedId);
    if (!b || !b.parent) return false;
    this.select(b.parent);
    return true;
  }
  // Cancel the selection without moving the camera (blank-canvas click).
  // Distinct from overview(), which also tweens the camera back.
  deselect() {
    this.selectedId = null;
    this.focusNotice = null;
    this.focusRedirectedTo = null;
    if (this.renderer) this.renderer.highlight(null);
    if (this.onSelect) this.onSelect(null);
    return true;
  }
  overview() {
    this.selectedId = null;
    this.focusNotice = null;
    this.focusRedirectedTo = null;
    // P2-31: null-renderer guard (see select()); overview() previously
    // threw on this.renderer.overview() when renderer was null.
    if (this.renderer) {
      this.renderer.overview();
      this.renderer.highlight(null);
    }
    if (this.onSelect) this.onSelect(null);
  }
  search(query) {
    this.searchError = null;
    this.ambiguousCandidates = [];
    const q = normalizeQuery(query);
    if (!q) return null;
    const { ALL_BODIES } = Interaction._data;
    if (!Array.isArray(ALL_BODIES) || ALL_BODIES.length === 0) {
      this.searchError = "搜索数据未注入（Interaction._data.ALL_BODIES 为空），请检查 main.js 的注入逻辑";
      console.warn(`[ORBITAL] ${this.searchError}`);
      return null;
    }
    const candidates = searchCandidates(query, ALL_BODIES);
    if (candidates.length === 0) return null;
    const raw = (query || "").trim();
    const exact = candidates.find((b) => b.id === q || b.en.toLowerCase() === q || b.zh === raw);
    if (exact) { this.select(exact.id); return exact; }
    if (candidates.length === 1) { this.select(candidates[0].id); return candidates[0]; }
    // Ambiguous: do NOT silently take the first hit; let the UI disambiguate.
    this.ambiguousCandidates = candidates;
    return null;
  }
}
// Injected by main.js to avoid a circular import.
Interaction._data = { ALL_BODIES: [] };
