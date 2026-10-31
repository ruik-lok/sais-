// test_data.mjs — Phase 2 tests group C (audit P0-5): data-consistency
// assertions沉淀进仓库 (the Phase 1 probe set, /tmp/qa_probe.mjs, was
// lost and never committed; these assertions replace its data checks in
// the repo so they cannot be lost again).
// Run: node test_data.mjs
// npm-test note: package.json currently carries no scripts (audit P0-4,
// owned by the infra workstream). When a test script lands, this file
// belongs in it alongside test_kepler.mjs / test_ui.mjs /
// test_redesign.mjs / test_pure.mjs / test_render_pure.mjs.
// Every check below DIRECTLY reads src/data.js (no source string
// anchors). Numbers are asserted against data.js as the source of
// truth; where the task brief's shorthand differed, the code value is
// used and the correction is noted in the check name / report:
//   - accuracy completeness holds for ALL 40 bodies, not only the 19
//     BODIES entries (the 21 MOONS entries carry the same object shape).

import { BODIES, MOONS, ALL_BODIES, moonsOf } from "./src/data.js";

let failures = 0;
let passes = 0;
function check(name, cond, extra = "") {
  if (cond) passes++;
  else failures++;
  console.log(`${cond ? "PASS" : "FAIL"} ${name} ${extra}`);
}

const bodyIds = new Set(BODIES.map((b) => b.id));

// ------------------------------------------------------- catalogue shape
check("数据 BODIES为19体", BODIES.length === 19, `n=${BODIES.length}`);
check("数据 MOONS为21体", MOONS.length === 21, `n=${MOONS.length}`);
check("数据 ALL_BODIES为40体", ALL_BODIES.length === 40, `n=${ALL_BODIES.length}`);
check("数据 40个体id唯一", new Set(ALL_BODIES.map((b) => b.id)).size === 40);
check("数据 BODIES类型分布1恒星+8行星+5矮行星+3小行星+2彗星",
  BODIES.filter((b) => b.type === "恒星").length === 1
  && BODIES.filter((b) => b.type === "行星").length === 8
  && BODIES.filter((b) => b.type === "矮行星").length === 5
  && BODIES.filter((b) => b.type === "小行星").length === 3
  && BODIES.filter((b) => b.type === "彗星").length === 2);

// ------------------------------------------------------- parent links
{
  const orphan = MOONS.filter((m) => !bodyIds.has(m.parent));
  check("数据 21卫星parent均在BODIES内（无孤儿）", orphan.length === 0, orphan.length ? `orphans=${orphan.map((m) => m.id).join(",")}` : "");
  const selfRef = MOONS.filter((m) => m.parent === m.id);
  check("数据 无卫星自指parent", selfRef.length === 0);
  const parentSum = BODIES.reduce((a, b) => a + moonsOf(b.id).length, 0);
  check("数据 各母天体建模卫星数之和为21", parentSum === 21, `sum=${parentSum}`);
}

// ------------------------------------------------------- moons counts
{
  const mismatch = BODIES.filter((b) => b.moonsModelled !== moonsOf(b.id).length);
  check("数据 19体moonsModelled与moonsOf计数一致", mismatch.length === 0,
    mismatch.length ? `mismatch=${mismatch.map((b) => b.id).join(",")}` : "");
  const totalShort = BODIES.filter((b) => !(b.moonsTotal >= b.moonsModelled));
  check("数据 19体moonsTotal均不小于moonsModelled", totalShort.length === 0);
  const legacy = BODIES.filter((b) => b.moons !== b.moonsTotal);
  check("数据 19体 legacy moons字段等于moonsTotal", legacy.length === 0);
  const sumTotal = BODIES.reduce((a, b) => a + (b.moonsTotal || 0), 0);
  check("数据 19体moonsTotal合计297", sumTotal === 297, `sum=${sumTotal}`);
}

// ------------------------------------------------------- rings
{
  const ringed = BODIES.filter((b) => b.ring);
  const ringIds = ringed.map((b) => b.id).sort().join(",");
  check("数据 仅4巨行星有环", ringed.length === 4 && ringIds === "jupiter,neptune,saturn,uranus", `ids=${ringIds}`);
  check("数据 4环profile均为schematic", ringed.every((b) => b.ring.profile === "schematic"));
  const gapTrue = ringed.filter((b) => b.ring.cassiniGap === true).map((b) => b.id);
  check("数据 土星唯一cassiniGap为真", gapTrue.length === 1 && gapTrue[0] === "saturn", `gap=${gapTrue.join(",")}`);
  check("数据 4环inner均小于outer且为有限数",
    ringed.every((b) => Number.isFinite(b.ring.inner) && Number.isFinite(b.ring.outer) && b.ring.inner < b.ring.outer));
  check("数据 非巨行星与全部卫星均无环",
    BODIES.filter((b) => !["jupiter", "saturn", "uranus", "neptune"].includes(b.id)).every((b) => !b.ring)
    && MOONS.every((m) => !m.ring));
}

// ------------------------------------------------------- accuracy
{
  const bad = ALL_BODIES.filter((b) => {
    const a = b.accuracy;
    return !a || typeof a !== "object"
      || typeof a.level !== "string" || !a.level
      || !("validFromJd" in a) || !("validToJd" in a)
      || !(a.validFromJd === null || Number.isFinite(a.validFromJd))
      || !(a.validToJd === null || Number.isFinite(a.validToJd))
      || typeof a.note !== "string" || !a.note;
  });
  // Correction to the brief's "19体": completeness holds for all 40.
  check("数据 40体accuracy字段齐全（level/validFromJd/validToJd/note）", bad.length === 0,
    bad.length ? `bad=${bad.map((b) => b.id).join(",")}` : "");
  const jpl = BODIES.filter((b) => b.elements && b.elements.L !== undefined);
  check("数据 JPL支9体accuracy窗口为数值且from小于to",
    jpl.length === 9 && jpl.every((b) => Number.isFinite(b.accuracy.validFromJd) && Number.isFinite(b.accuracy.validToJd) && b.accuracy.validFromJd < b.accuracy.validToJd),
    `n=${jpl.length} ids=${jpl.map((b) => b.id).join(",")}`);
  const sbdb = BODIES.filter((b) => b.orbitSolution);
  check("数据 SBDB支9体accuracy窗口均为null（适用期未知）",
    sbdb.length === 9 && sbdb.every((b) => b.accuracy.validFromJd === null && b.accuracy.validToJd === null),
    `n=${sbdb.length} ids=${sbdb.map((b) => b.id).join(",")}`);
  check("数据 JPL9+SBDB9+太阳1=19体分支全覆盖", jpl.length + sbdb.length + 1 === 19);
  const sun = BODIES.find((b) => b.id === "sun");
  check("数据 太阳accuracy窗口为null（中心天体示意）",
    sun && sun.accuracy.validFromJd === null && sun.accuracy.validToJd === null);
}

console.log(`\n${passes} PASS, ${failures} FAIL`);
console.log(failures === 0 ? "ALL DATA TESTS PASSED" : `${failures} DATA TEST(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
