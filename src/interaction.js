// interaction.js — focus chains and search, decoupled from rendering.
// A focus chain is just successive focusTo calls; the renderer tweens
// smoothly, so Solar System -> Earth -> Moon never teleports.
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

export class Interaction {
  constructor({ renderer, getScenePos, onSelect }) {
    this.renderer = renderer;
    this.getScenePos = getScenePos; // (id) => {x,y,z} scene units
    this.onSelect = onSelect;
    this.selectedId = null;
    this.searchError = null; // string when the last search could not run
    this.ambiguousCandidates = []; // candidates when search() declined to pick
  }
  select(id) {
    // Unknown id: never throw, never focus a missing object. The panel
    // renders "未找到该天体" via onSelect -> renderInfo (contract §8).
    const known = !!findBody(id);
    this.selectedId = id;
    if (!known) {
      if (this.renderer) this.renderer.highlight(null);
      if (this.onSelect) this.onSelect(id);
      return false;
    }
    const sp = this.getScenePos(id);
    const o = this.renderer.bodies.get(id);
    if (sp && o) this.renderer.focusTo(id, sp, o.radius);
    this.renderer.highlight(id);
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
    if (this.renderer) this.renderer.highlight(null);
    if (this.onSelect) this.onSelect(null);
    return true;
  }
  overview() {
    this.selectedId = null;
    this.renderer.overview();
    this.renderer.highlight(null);
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
