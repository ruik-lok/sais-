// test_render.mjs — Phase 2 渲染组锁定测试（phase2/render）
// Run: node test_render.mjs
// 范围（审计 P1-1～P1-4、P2-1、P2-3、P2-6～P2-8、P2-10）：
//   ① D2 删除锁定：死代码符号不存在，注释不再声称分帧/懒加载；
//   ② governor 单一管理权 + LOD 读档位 + 聚焦解耦（不等式实算）；
//   ③ 共享几何体清理 + 首次 LOD 换下几何 dispose 规则；
//   ④ 科学模式半径钳制披露（阈值实算 + 受影响体清单实算）；
//   ⑤ 卡西尼真缝、renderOrder 阶梯、各向异性、聚焦纹理升级锚点。
// 诚实边界：render.js 依赖 three（仓库未安装），Node 无法 import，
// 故 render.js 相关项一律是源码锁定（静态断言），不是 WebGL 行为证明；
// 唯一真正执行的是 §4 对 data.js 的阈值/清单实算。浏览器复验
// （B6/B7/B8/B15、启动耗时、draw call、透明闪烁、斜视角、聚焦换纹
// 是否闪烁）一律未覆盖，见最终报告 §2.8，不得由本文件声称通过。
// 失败如实退出码 1，不放宽断言，不删除断言。

import { readFileSync } from "node:fs";
import { BODIES, MOONS } from "./src/data.js";

let failures = 0;
let passes = 0;
function check(name, cond, extra = "") {
  if (cond) passes++;
  else failures++;
  console.log(`${cond ? "PASS" : "FAIL"} ${name} ${extra}`);
}
const count = (s, sub) => (s.match(new RegExp(sub.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g")) || []).length;

const render = readFileSync(new URL("./src/render.js", import.meta.url), "utf-8");
const renderPure = readFileSync(new URL("./src/renderPure.js", import.meta.url), "utf-8");
const main = readFileSync(new URL("./src/main.js", import.meta.url), "utf-8");
const ui = readFileSync(new URL("./src/ui.js", import.meta.url), "utf-8");
const html = readFileSync(new URL("./index.html", import.meta.url), "utf-8");

// ------------------------------------------- §1 D2 删除锁定（P1-1，删除路线）
{
  check("D2删除 render.js无this.textureQueue", !render.includes("this.textureQueue"));
  check("D2删除 pumpTextureQueue/prioritizeTexture/pendingTextureCount无定义",
    !render.includes("pumpTextureQueue(") && !render.includes("prioritizeTexture(") && !render.includes("pendingTextureCount("));
  check("D2删除 focusTo不再提升纹理", !render.includes("this.prioritizeTexture"));
  check("D2删除 无Jobs drain分帧声称", !render.includes("Jobs drain"));
  check("D2删除 main.js闲置注释不再称deferred纹理到达", !main.includes("deferred textures keep arriving"));
  check("D2删除 render.js明言无分帧/懒加载", render.includes("There is NO framed / lazy texture loading"));
}

// ------------------------------------------- §2 governor 单一管理权（P1-2/P1-3/P2-3）
{
  check("P1-2 setPixelRatio仅在applyPixelRatio内（renderer+composer共2处）", count(render, "setPixelRatio") === 2);
  check("P1-2 _applyGovernorTier与resize均走applyPixelRatio",
    render.includes("this.applyPixelRatio();") && count(render, "applyPixelRatio()") >= 3);
  check("P1-2 resize不再直写composer像素比",
    !render.includes("composer.setPixelRatio(Math.min(devicePixelRatio"));
  check("P1-3 LOD标签可见性合取governor档位", render.includes("this._governorLabelAllowed(c.id, c.d)"));
  // P0-3 抽取后：_applyGovernorVisibility 改走纯函数 governorLabelVisible，
  // 其语义与 _governorLabelAllowed 一致（最低档才限距、聚焦体恒可见）；
  // _governorLabelAllowed 本体仍在，供去重叠 pass 使用（上一条锚点）。
  check("P1-3 _applyGovernorVisibility复用同一规则（纯函数委托）", render.includes("governorLabelVisible(this.showLabels, lowest, id === this.focusedId, d, hideDist)"));
  check("P2-3 governor接管阴影/泛光（tier1关阴影，最低档关泛光）",
    render.includes("this.setShadows(this.govTier === 0)") &&
    render.includes("this.setBloom(this.govTier < this.govTierCaps.length - 1)"));
  check("P2-3 界面开关路线未选：main.js/index.html无setShadows/setBloom调用",
    !main.includes("setShadows") && !main.includes("setBloom") &&
    !html.includes("setShadows") && !html.includes("setBloom"));
}

// ------------------------------------------- §3 LOD 聚焦解耦（P1-4，锚点 + 不等式实算）
{
  // P0-3 抽取后：阈值公式本体在 renderPure.js lodTier，render.js applyLod 委托于它。
  check("P1-4 LOD阈值含1.5绝对下限", renderPure.includes("Math.max(radius * 30, 1.5)") && render.includes("lodTier(d, o.radius)"));
  check("P1-4 focusTo距离下限仍为max(radius*6,1.2)", render.includes("Math.max(radius * 6, 1.2)"));
  // 给定上面两条锚定的公式，聚焦距离恒小于 LOD 阈值，故聚焦体恒 high。
  // 这里实算该不等式本身（不是复刻阈值逻辑：阈值逻辑仍在 render.js 内）。
  const radii = [0.004, 0.005, 0.014, 0.0247, 0.35, 2.0];
  const holds = radii.every((r) => Math.max(r * 6, 1.2) < Math.max(r * 30, 1.5));
  check("P1-4 不等式实算：聚焦距离恒小于LOD阈值（6组半径）", holds);
}

// ------------------------------------------- §4 共享几何体 + dispose（P2-1）
{
  check("P2-1 sharedSpheres无定义、无赋值、无模块单例",
    !render.includes("function sharedSpheres") && !render.includes("this.sharedSpheres") && !render.includes("SHARED_SPHERES"));
  check("P2-1 sharedGeo.high/low无残留引用", !render.includes("sharedGeo.high") && !render.includes("sharedGeo.low"));
  check("P2-1 仅存真实共享体：med（大气/云层）与sharedHitGeo（拾取）",
    render.includes("this.sharedGeo.med") && render.includes("this.sharedHitGeo"));
  check("P2-1 首次LOD换下几何dispose且high/low/med受保护",
    render.includes("old.dispose()") && render.includes("old !== o.high && old !== o.low") && render.includes("old !== this.sharedGeo.med"));
}

// ------------------------------------------- §5 科学模式半径钳制披露（P1-4披露，实算）
{
  const AU_KM = 149597870.7;
  const clamped = [...BODIES, ...MOONS].filter((b) => ((b.diameterKm / 2) / AU_KM) * 30 < 0.004);
  const unclampedIds = [...BODIES, ...MOONS].filter((b) => !clamped.includes(b)).map((b) => b.id).sort();
  check("P1-4实算 被钳制条目35/40", clamped.length === 35, `实际 ${clamped.length}`);
  check("P1-4实算 未钳制仅太阳/木星/土星/天王星/海王星",
    JSON.stringify(unclampedIds) === JSON.stringify(["jupiter", "neptune", "saturn", "sun", "uranus"]));
  check("P1-4实算 全部21颗卫星均被钳制", MOONS.every((m) => clamped.includes(m)));
  check("P1-4实算 钳制直径阈值约39892.77km", Math.abs((2 * AU_KM * 0.004) / 30 - 39892.77) < 0.01);
  check("P1-4 radiusUnits注释写明阈值与受影响体",
    render.includes("39892.77") && render.includes("35 of the 40 entries") && render.includes("ALL 21 moons"));
  // P0-3 抽取后：钳制公式本体在 renderPure.js radiusUnitsFor，render.js radiusUnits 委托于它。
  check("P1-4 钳制数值未改动（仍为max(rAU*30,0.004)）", renderPure.includes("Math.max(rAU * 30, 0.004)") && render.includes("radiusUnitsFor(b, this.mode)"));
  const disclosure = "距离按真实 AU，半径设最小显示下限（小于下限的天体按同一最小尺寸显示，相对大小不真实）";
  check("P1-4披露 徽标（main.js科学模式文案）含披露句", main.includes(disclosure));
  check("P1-4披露 页脚（index.html）含披露句", html.includes(disclosure));
  check("P1-4披露 信息面板总览（ui.js）含披露句", ui.includes(disclosure));
}

// ------------------------------------------- §6 卡西尼缝 / renderOrder / 各向异性 / 聚焦纹理（锚点）
{
  check("P2-6锚点 卡西尼缝alpha精确为0（tt 0.58-0.68）",
    render.includes("if (cassini && tt >= 0.58 && tt < 0.68) a = 0"));
  check("P2-6锚点 外侧窄缝同样为真缝（tt 0.85-0.875）",
    render.includes("else if (tt >= 0.85 && tt < 0.875) a = 0"));
  check("P2-6锚点 土星走cassini分支", render.includes('b.id === "saturn"'));
  check("P2-7锚点 renderOrder阶梯：环2云3大气4彗发5彗尾6辉光7标签8",
    render.includes("ring.renderOrder = 2") && render.includes("clouds.renderOrder = 3") &&
    render.includes("atm.renderOrder = 4") && render.includes("cometComa.renderOrder = 5") &&
    render.includes("cometTail.renderOrder = 6") && render.includes("glow.renderOrder = 7") &&
    render.includes("s.renderOrder = 8"));
  check("P2-8锚点 各向异性min(4,max)且表面/环纹理传入",
    render.includes("t.anisotropy = aniso") &&
    render.includes("Math.min(4, this.renderer.capabilities.getMaxAnisotropy())") &&
    render.includes("gasBandTexture(b.color, b.color2, texSeed, this.maxAnisotropy)") &&
    render.includes("ringTexture(rp.color, rp.cassini, rp.inner, rp.outer, this.maxAnisotropy)"));
  check("P2-10锚点 focusTo升级聚焦体纹理至1024x512且旧纹理dispose",
    render.includes("this._upgradeFocusedTexture(id)") && render.includes("1024, 512") &&
    render.includes("o.textureUpgraded = true") && render.includes("textureUpgraded: false"));
}

// ------------------------------------------- 红线锁定
{
  check("红线 未引入InstancedMesh/Worker", !render.includes("InstancedMesh") && !render.includes("Worker"));
}

console.log(`\n${passes} PASS, ${failures} FAIL`);
console.log(failures === 0 ? "ALL RENDER TESTS PASSED" : `${failures} RENDER TEST(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
