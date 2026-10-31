# ORBITAL — 分支归档声明 (Phase 2, P2-38)

> 本文件只写文档，不改动任何旧分支：以下分支的 tip 在本声明写稿时
> 未被移动，历史保持原样。归档 ≠ 删除；删除会破坏追溯，故不删除。

## 已归档：不得在其上开新工作

以下 6 个分支均为 `integration` 的祖先（`git merge-base --is-ancestor`
已核实），其内容已被集成吸收，且**不含集成后修复**
（特别是 P0-2 卫星方向映射与 P1-2/P1-3 guard，见 CHANGELOG）。
从其中任一 tip 再开新分支，都会丢掉这些修复并重演集成冲突。

| 分支 | 归档时 tip | 状态 |
| --- | --- | --- |
| `feature/model-system` | `4c8204f` | 已归档：历史贡献已并入 integration |
| `feature/astronomy-engine` | `022ef8f` | 已归档：历史贡献已并入 integration |
| `feature/rendering-engine` | `713d522` | 已归档：历史贡献已并入 integration |
| `feature/ui-system` | `27b8207` | 已归档：历史贡献已并入 integration |
| `feature/performance` | `7c59f2b` | 已归档：历史贡献已并入 integration |
| `test/independent-audit` | `ff401e7` | 已归档：QA 评分快照分支；其 85/100 是修复前快照评分，不覆盖 P0-2 等集成后修复，不得当作当前质量分引用 |

规则：

1. **新的开发一律以 Phase 2 开发线为基线**（本分支的基线为
   `phase2/integration-redesign`，tip `f046e90`；后续以总协调人
   指定的 Phase 2 集成线为准），不得以任何上表分支为起点。
2. **不得把上表分支用作回滚基线**。回滚基线见 DEPLOY.md §7
   （R-1 `f046e90`、R-2 `73bcc66`）；上表分支只用于追溯某一分支
   的原始贡献。
3. 上表分支的 `package.json` / `README` / 测试状态停留在集成前，
   单独检出它们得到的是旧依赖视图，不得当作当前工程状态引用。

## 不在本归档清单内：`feature/visual-redesign`

`feature/visual-redesign`（tip `f046e90`）**不是** `integration` 的
祖先，而是唯一超前于 integration 的分支；Phase 2 基线
`phase2/integration-redesign` 与其 tip 相同（`f046e90`），
本分支即从该基线开出。因此本文件不把 `feature/visual-redesign`
列为已过期分支；它未来的合并或归档由总协调人单独裁决，
不得因本清单而误将其视为已废弃。
