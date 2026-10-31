# Phase 2 PR #1 评审记录（只记录，未处理）

- 评审日期：2026-10-31；评审方式：`curl` 匿名读取 GitHub 公开仓库 API
  （`https://api.github.com/repos/ruik-lok/sais-/pulls/1` 与
  `/pulls/1/files`），无 token、无登录、无写操作。
- 本文件仅为评审记录：**未合并、未关闭、未重开该 PR，未推送任何分支，
  未改动远程状态。**

## PR 基本信息

- 仓库：`ruik-lok/sais-`（公开仓库）
- PR 编号：#1，链接：https://github.com/ruik-lok/sais-/pull/1
- 标题：代码审查：P0 开普勒求解器数值 bug 与卫星坐标系混用
- 状态（API 当时值）：`closed`，`merged: false`，`merged_at: null`，
  `closed_at: 2026-10-30T17:31:11Z`，`created_at: 2026-10-30T17:27:37Z`
  （注：API 同时返回了一个 `merge_commit_sha` 字段值
  `0ef2f5e31b09c0208392fa4b1aa88fc8159fde07`，但 `merged=false` 且
  `merged_at=null` 为准，故本记录定性为“已关闭、未合并”，不称其已合并。）
- head：`ruik-lok:review/code-audit`，完整 SHA
  `81133457b6b3b4f4f648da1bd72e6351204bf6f1`（任务书所称 head 8113345
  即此 SHA 的缩写）
- base：`ruik-lok:main`，base SHA（当时）`ff30ebb64ae5769d496a01306a4ade03e4b20175`
 （旧验证版；注意远程 main 现为 `acb0ed5`，已比该 base 前进 1 提交）
- 作者：`ruik-lok`；PR 正文自述：只新增一份审查报告，不改动任何源码。

## 改动文件清单（/files 返回，1 个文件）

| 文件 | 状态 | 新增 / 删除 |
|---|---|---|
| `docs/CODE_REVIEW.md` | added | +165 / −0 |

无源码改动，无测试改动。PR 正文所述审查范围为 13 个文件 / 962 行 JS，
两个 P0 为：(1) 开普勒求解器高偏心分支牛顿迭代后不校验残差
（e≥0.95、M≈185°–225° 区间返回错误解，哈雷 M=209° 实测 r=0.887 AU
应≈34.9 AU）；(2) 卫星坐标系混用（render.js 中父天体为 three 空间、
卫星方向仍为黄道空间，直接相加致卫星轨道面绕 X 轴转 90°）；
另有 P1 九项与 P2 工程化清单（含 scripts / CI 等建议）。

## 与 phase2 线的关系 / 冲突判断

- **文件路径冲突：无。** 本 phase2 线（`phase2/integration-redesign` /
  本分支 `phase2/infra`）工作树内不存在 `docs/` 目录，更无
  `docs/CODE_REVIEW.md`，故若原样应用该 PR 的唯一文件，将是纯新增，
  不会覆盖 phase2 线的任何现有文件。
- **内容时效冲突：有，且是决定性因素。** 该 PR 审查的是旧 main
  （ff30ebb 时代、13 文件 / 962 行），而 phase2 线源码已大幅演进
  （src 10 个 JS 文件、render.js 1030 行、main.js 521 行，另有
  mobile/time-float/design-system 等新增）。其两个 P0 在 phase2 线上
  均已有对应修复，不得再当作待修复项引用：
  (1) 求解器残差复核 + 二分回退已在 astro.js 落地（test_kepler 高偏心
  段全绿）；(2) 卫星黄道→three 方向映射已在 integration 修复
  （`db77826`，scenePos 卫星分支 `(dx,dz,−dy)` 与 `_posFromAU` 一致）。
- **与远程 main 的关系（核对，非处理）：** 远程 main 现 tip `acb0ed5`
  的树内已有 `docs/CODE_REVIEW.md`（223 行），与 PR head 版（165 行、
  blob SHA `9509f977a4c269dd40ff2213fea2905772d770b1`）行数与内容均
  不同，说明 main 上已另有一份审查报告落地（非经本 PR 合并，因本 PR
  `merged=false`）。因此 PR head 版文档既非 main 现有文档的副本，
  也不宜再以 PR 形式“补”进 main 或 phase2 线。
- **CI/工程化建议的重合：** PR 正文 P2 清单中的 scripts / CI 建议方向
  与本分支 P0-4 工作重合，但本分支已按当前 phase2 线实际文件（10 个
  src JS、test_redesign 84 项）独立落地 CI 与 npm test，不依赖该 PR。

## 建议：搁置（保持已关闭状态），不合并、不重开

理由：(1) PR 本人已于 2026-10-30 关闭且未合并，无需再由 Phase 2 去
“关闭”它；(2) 其唯一改动是针对旧 main 的审查文档，内容已过时，
两个 P0 在 phase2 线上均已修复，原样合并只会把一份过时审查报告
（165 行旧版）引入 phase2 线，与远程 main 现有的 223 行版并存、
口径冲突；(3) 若总协调人认为该审查报告有存档价值，应由 Phase 2
文档组以“历史审查存档 + 已过时声明 + 两 P0 已修复对照”的方式另行
归档，而不是重开或合并本 PR。本记录不代行该归档决定。
