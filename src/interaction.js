// interaction.js — focus chains and search, decoupled from rendering.
// A focus chain is just successive focusTo calls; the renderer tweens
// smoothly, so Solar System -> Earth -> Moon never teleports.
export class Interaction {
  constructor({ renderer, getScenePos, onSelect }) {
    this.renderer = renderer;
    this.getScenePos = getScenePos; // (id) => {x,y,z} scene units
    this.onSelect = onSelect;
    this.selectedId = null;
  }
  select(id) {
    this.selectedId = id;
    const sp = this.getScenePos(id);
    const o = this.renderer.bodies.get(id);
    if (sp && o) this.renderer.focusTo(id, sp, o.radius);
    this.renderer.highlight(id);
    if (this.onSelect) this.onSelect(id);
  }
  overview() {
    this.selectedId = null;
    this.renderer.overview();
    this.renderer.highlight(null);
    if (this.onSelect) this.onSelect(null);
  }
  search(query) {
    const q = (query || "").trim().toLowerCase();
    if (!q) return null;
    const { ALL_BODIES } = Interaction._data;
    const hit = ALL_BODIES.find(b => b.id === q || b.zh === query.trim() || b.en.toLowerCase() === q || b.zh.includes(query.trim()) || b.en.toLowerCase().includes(q));
    if (hit) this.select(hit.id);
    return hit || null;
  }
}
// Injected by main.js to avoid a circular import.
Interaction._data = { ALL_BODIES: [] };
