# ORBITAL 代码审查报告

> 审查对象：`ruik-lok/sais-` @ `main`
> 审查时间：2026-10-31
> 审查方式：静态阅读 + 实际运行测试 + 针对性数值探测（模板：Node v26.4.0）
> 审查范围：13 个文件 / 962 行 JS（astro、data、render、interaction、time、ui、main、events、测试）

---

## 0. 结论

架构清晰、数据标注诚实，具备良好的可维护基线；**但当前版本有一处会导致天体位置算错的数值 bug，以及一处坐标系混用问题，修复前不建议作为"科学定位正确"的版本发布。**

| 维度 | 评分 | 说明 |
|---|---|---|
| 科学诚实性 | ★★★★★ | `null` 一律渲染"未知"，不编造；README 主动声明非 DE441、纹理非实测 |
| 架构 | ★★★★☆ | 模块职责清晰，无循环依赖，astro 层与 DOM 解耦 |
| 数值正确性 | ★★☆☆☆ | 开普勒求解器在高偏心轨道返回错误解（见 P0-1） |
| 前端健壮性 | ★★★☆☆ | 坐标混用、资源泄漏、若干边界崩溃（见 P0-2 / P1） |
| 测试 | ★★☆☆☆ | 可运行且通过，但采样点覆盖不足，恰好绕开了故障区间 |
| 工程化 | ★★☆☆☆ | 缺 .gitignore / LICENSE / CI / scripts |

---

## 1. P0 — 必须修复

### P0-1 开普勒求解器在高偏心下返回错误解

**位置**：`src/astro.js:30-49`

**问题**：高偏心分支（`e >= 0.8`）固定从 `E = π` 起做牛顿迭代，**迭代结束不校验残差就直接返回**。在特定平均近点角上会发散或震荡，返回与真解相差可达 π 的 E。

**复现**（以二分法为参考解，e 从 0.9 到 0.99、每 1° 扫描）：

```
e=0.95   M=225°   dE=1.08 rad
e=0.967  M=190°   dE=2.40 rad
e=0.967  M=209°   dE=3.07 rad   ← 偏差 176°
e=0.99   M=185°   dE=3.02 rad
共 18 个角度返回错误解，最大偏差 3.10 rad
```

**实际影响**（哈雷彗星 e=0.967，用 `positionFromElements` 直接计算）：

```
M=190°  → r = 6.14 AU    （应为 ≈31 AU）
M=209°  → r = 0.887 AU   （应为 ≈34.9 AU，远日点附近被画到太阳边上）
```

轨道线采样（`render.js` buildOrbits，128 点）同样会出现尖刺。

**修复**：迭代加收敛校验，失败时用二分兜底（`f(E)=E-e·sinE-M` 严格单调递增，`[M-1, M+1]` 为合法区间）。

```js
export function solveKepler(M, e) {
  const m = normRad(M);
  let E = e < 0.8 ? m : Math.PI;
  for (let i = 0; i < 60; i++) {
    const d = (E - e * Math.sin(E) - m) / (1 - e * Math.cos(E));
    E -= d;
    if (Math.abs(d) < 1e-12) break;
  }
  if (Math.abs(E - e * Math.sin(E) - m) > 1e-9) {
    let lo = m - 1, hi = m + 1;
    for (let i = 0; i < 80; i++) {
      const mid = (lo + hi) / 2;
      if (mid - e * Math.sin(mid) - m > 0) hi = mid; else lo = mid;
    }
    E = (lo + hi) / 2;
  }
  return E;
}
```

**测试补充**（现有 6 个采样点刚好绕开故障区间）：

```js
for (const e of [0.9, 0.95, 0.967, 0.99])
  for (let d = 0; d < 360; d++) {
    const M = d * Math.PI / 180, E = solveKepler(M, e);
    check(`kepler e=${e} M=${d}`, Math.abs(E - e * Math.sin(E) - M) < 1e-9);
  }
```

### P0-2 卫星坐标与父天体坐标系混用

**位置**：`src/render.js:132-153`

**问题**：父天体位置经 `_posFromAU()` 转为 three 空间 `(x, z, -y)`，而卫星相对方向 `dir` 仍是黄道空间，两者直接相加：

```js
const dir = { x: rel.x / len, y: rel.y / len, z: rel.z / len }; // 黄道
return { x: scenePos(parent).x + dir.x * d,                     // three
         y: scenePos(parent).y + dir.y * d,
         z: scenePos(parent).z + dir.z * d };
```

结果：所有卫星的轨道面整体绕 X 轴旋转 90°，倾角方向错误。

**修复**：

```js
const dx = rel.x / len;
const dy = rel.z / len;   // 黄道 y -> three y
const dz = -rel.y / len;  // 黄道 y -> three -z
```

---

## 2. P1 — 应修复

| # | 位置 | 问题 | 建议 |
|---|---|---|---|
| P1-1 | `render.js:216-219` | `refreshOrbits()` 只 dispose geometry，未 dispose material，切换比例模式反复泄漏 | 遍历时同时 `line.material.dispose()` |
| P1-2 | `render.js:264-267` | 容器高度为 0 时 `aspect = Infinity`，相机矩阵 NaN | `if (!w || !h) return;` |
| P1-3 | `render.js:113-117` | `pointerdown` 落在画布外时 `downX` 为 undefined，`Math.hypot(NaN)` 为 NaN，`NaN > 6` 为 false → 误触发拾取 | 记录 `this.downX = null` 并在 pointerup 判空 |
| P1-4 | `main.js:130-135` | 键盘处理只排除 `INPUT`，在 `<select>` 上按空格会同时触发暂停与展开 | 改为 `e.target.closest("input, textarea, select, [contenteditable]")` 时 return |
| P1-5 | `render.js:151-152` | `this.distUnits(posAU.x) * Math.sign(posAU.x) * 0 + ...` 为死代码 | 直接返回 `this._posFromAU(posAU)` |
| P1-6 | `index.html:7-12` | three.js 走 jsDelivr CDN，无 SRI；国内网络不稳定会导致整页白屏 | 本地 vendor 到 `vendor/three/`，或至少加 SRI + 失败降级提示 |
| P1-7 | `events.js:8-23` | 合相/冲日只比较黄经、不含黄纬，"合相"可能实际相距数十度 | UI 文案改为"黄经合 / 黄经冲"，或在文档中明确此定义 |
| P1-8 | `main.js:113` | `jd !== lastJd` 浮点严格相等，基本每帧必真，40 个开普勒解每帧重算 | 按 `Math.floor(jd * 1000)` 量化后比较，或按需节流 |
| P1-9 | `render.js:257-262` | `highlight()` 给 `MeshBasicMaterial`（太阳）设置 `emissive` 无效果 | 太阳用 scale 或 outline 高亮，或跳过该分支 |

---

## 3. P2 — 工程化

1. **缺少 `.gitignore`**：至少包含 `node_modules/`、`.env*`、`*.log`、`.DS_Store`、`dist/`
2. **缺少 LICENSE**（建议 MIT 或明确保留权利）
3. **`package.json` 是空壳**：无 `scripts`、无 `devDependencies`，`npm test` 不可用
   ```json
   "scripts": { "test": "node test_kepler.mjs", "serve": "python3 -m http.server 8000" }
   ```
4. **无 CI**：一个 GitHub Actions job 即可（`node --version` + `npm test`）
5. **无 lint / format 配置**（建议 eslint + prettier，最小规则集）
6. **无 WebGL 降级**：`new THREE.WebGLRenderer()` 在无 WebGL 环境直接抛错 → 增加 try/catch 与提示页
7. **无性能基准**：README 写了 60 FPS 目标但无测量手段，建议加一个帧率统计输出

---


---

## 3.5 第二轮深挖（2026-10-31 补充）

在第一轮基础上对渲染层与实际数值行为做了针对性实验，新增 5 项发现。

### A. 轨道线尖刺（P0-1 的可视化证据）

沿哈雷彗星轨道线（128 点采样）计算日心距，第 2 段出现非物理跳变：

```
k=0  r=34.938 AU
k=1  r=34.877 AU
k=2  r=20.842 AU   ← 掉进内太阳系
k=3  r=34.723 AU
k=4  r=34.630 AU
```

该段长度为其余段的 23 倍。结论：界面上的哈雷轨道线存在可见尖刺，根因同 P0-1。

### B. 科学比例模式下聚焦失效

`render.js` `focusTo()` 使用 `Math.max(radius * 6, 1.2)`，其中 1.2 的下限在科学模式下过大：

| 天体 | 科学模式半径 | 相机距离 | 倍数 |
|---|---|---|---|
| 地球 | 0.0040 | 1.200 | 300× |
| 木星 | 0.0140 | 1.200 | 86× |
| 土星 | 0.0117 | 1.200 | 103× |

点击聚焦后行星仍是 1–2 像素，科学模式的核心交互形同虚设。建议：聚焦距离改为 `radius * 8`，并为极小半径设置相机 near 平面自适应。

### C. 拾取球比行星大 86–300 倍

`hit.scale.setScalar(Math.max(r, 0.6))`：科学模式下地球半径 0.004、拾取球 0.6，点击空白处 0.02 AU 范围内也会命中。建议拾取半径按相机距离动态缩放，而非用固定下限。

### D. 每帧重复计算坐标转换

`scenePos()` 中 `this._posFromAU(posAU)` 被调用 3 次（且含一段 `* 0` 的死代码）。40 个天体 × 60 fps ≈ 每秒 7200 次多余三角运算与对象分配。建议一次计算后复用。

### E. 视觉模式卫星距离未使用真实轨道半径

`const d = pr * 2.6 + order * 0.9 + 0.6`：卫星按目录序号排开，`aKm` 完全未参与。README 称"距离为已知量"，实际显示距离与真实值无关。建议在视觉模式下也按 `aKm` 的对数压缩排序，或在文档中明确"视觉模式距离为示意"。

---

## 3.6 质量总评（更新）

| 层次 | 评价 | 说明 |
|---|---|---|
| 数据与文档诚实度 | A | `null` 一律"未知"，明确列出"未完成 / 未验证" |
| 架构 | B+ | 模块清晰；`Interaction._data` 全局挂载、魔法数字散落 |
| 渲染 / 交互 | C+ | 科学模式聚焦与拾取两个硬伤，轨道尖刺 |
| 数值 | C | P0-1 未修 |
| 工程化 | C | 无 CI / lint；`package.json` 为空壳；PLAN.md 承诺的"类型完整"未兑现（纯 JS 无 JSDoc） |
| 测试 | C | 可运行且通过，但覆盖不足，恰好绕过故障区间 |

## 4. 建议的修复顺序

1. P0-1 求解器（核心数值正确性）
2. P0-2 卫星坐标系
3. P1-1 ~ P1-5（健壮性，各 2-3 行）
4. P2-1 ~ P2-4（工程化，一次性补齐）
5. P1-6 CDN 本地化（影响国内可用性）

---

## 5. 附：本次实测结果

```
$ node test_kepler.mjs
...
PASS Halley perihelion distance r=0.589 AU
PASS Earth-Sun distance in [0.98, 1.02] AU
ALL TESTS PASSED
```

结论：**现有测试全部通过**，但测试集未覆盖 `e >= 0.9` 且 `M ∈ [180°, 225°]` 区间，因此未能发现 P0-1。

---

*本报告由代码审查自动生成，所有结论均可复现。*
