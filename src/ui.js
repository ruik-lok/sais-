// ui.js — navigation, info panel, search, settings, events panel.
// Unknown values (null/undefined) are always rendered as "未知".
import { ALL_BODIES, findBody, moonsOf } from "./data.js";
import { distanceAU } from "./astro.js";

const fmt = (v, digits = 2) => (v === null || v === undefined || Number.isNaN(v) ? "未知" : Number(v).toLocaleString("en-US", { maximumFractionDigits: digits }));
const fmtSci = (v) => (v === null || v === undefined ? "未知" : Number(v).toExponential(2));

export function buildNav(el, onSelect) {
  const groups = {};
  for (const b of ALL_BODIES) { (groups[b.type] ||= []).push(b); }
  el.innerHTML = "";
  for (const [type, list] of Object.entries(groups)) {
    const h = document.createElement("div"); h.className = "nav-group"; h.textContent = type; el.appendChild(h);
    for (const b of list) {
      const btn = document.createElement("button");
      btn.className = "nav-item"; btn.dataset.id = b.id;
      btn.textContent = `${b.zh} ${b.en}`;
      btn.addEventListener("click", () => onSelect(b.id));
      el.appendChild(btn);
    }
  }
}

export function renderInfo(el, id, posAU, sunDistAU) {
  if (!id) {
    el.innerHTML = `<h2>太阳系全景</h2><p class="muted">点击任意天体，或从左侧导航选择，进入连续聚焦：太阳系 → 地球 → 月球、太阳系 → 土星 → 土卫六、太阳系 → 木星 → 木卫二。</p>
    <p class="muted">位置为开普勒近似模型计算，非完整 Horizons DE441 星历。纹理为程序化生成，非实测影像。</p>`;
    return;
  }
  const b = findBody(id);
  const moons = moonsOf(id).map(m => `${m.zh} ${m.en}`).join("、") || (b.type === "卫星" ? "—" : "无");
  const parent = b.parent ? findBody(b.parent) : null;
  const dist = sunDistAU !== undefined && sunDistAU !== null ? `${fmt(sunDistAU, 3)} AU` : "未知";
  const rot = b.rotationDays === null || b.rotationDays === undefined ? "未知" : `${Math.abs(b.rotationDays)} 天${b.rotationDays < 0 ? "（逆向）" : ""}`;
  el.innerHTML = `
    <h2>${b.zh} <span class="en">${b.en}</span></h2>
    <dl>
      <dt>天体类型</dt><dd>${b.type}</dd>
      <dt>直径</dt><dd>${b.diameterKm ? fmt(b.diameterKm, 0) + " km" : "未知"}</dd>
      <dt>质量</dt><dd>${fmtSci(b.massKg)} kg</dd>
      <dt>密度</dt><dd>${b.density ? b.density + " g/cm³" : "未知"}</dd>
      <dt>平均温度</dt><dd>${b.tempK ? b.tempK + " K" : "未知"}</dd>
      <dt>自转周期</dt><dd>${rot}</dd>
      <dt>公转周期</dt><dd>${b.orbitalPeriodDays ? fmt(b.orbitalPeriodDays, 1) + " 天" : "未知"}</dd>
      <dt>轨道偏心率</dt><dd>${fmt(b.eccentricity, 4)}</dd>
      <dt>轨道倾角</dt><dd>${b.inclinationDeg !== null && b.inclinationDeg !== undefined ? b.inclinationDeg + "°" : "未知"}</dd>
      <dt>与太阳距离</dt><dd>${dist}</dd>
      <dt>卫星数量</dt><dd>${b.type === "卫星" ? "—" : (b.moons ?? "未知")}</dd>
      <dt>母天体</dt><dd>${parent ? parent.zh + " " + parent.en : "无（太阳系中心）"}</dd>
      <dt>相关卫星</dt><dd>${moons}</dd>
      <dt>数据来源</dt><dd>${b.source}</dd>
      <dt>数据更新时间</dt><dd>${b.updated || "未知"}</dd>
      <dt>位置精度</dt><dd>${b.accuracy || "未知"}</dd>
      ${b.perihelionAU ? `<dt>近日点距离</dt><dd>${b.perihelionAU} AU</dd><dt>远日点距离</dt><dd>${b.aphelionAU} AU</dd>` : ""}
      ${b.uncertainty ? `<dt>不确定性说明</dt><dd>${b.uncertainty}</dd>` : ""}
    </dl>
    ${b.type === "卫星" ? `<p class="muted">卫星位置为简化开普勒模型，非完整月球/行星卫星理论。</p>` : ""}
    <p class="muted">表面纹理为程序化生成，非实测影像。</p>`;
  void posAU; void distanceAU;
}
