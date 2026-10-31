# ORBITAL — DEPLOY.md (Phase 2, P2-37)

> 状态声明（请勿删除）：本文件只说明**如何部署**，不是“已经部署”的声明。
> 本组没有在任何托管方上部署过本仓库，也没有验证过任何托管方；
> 任何托管 URL、托管方名称、CDN 备用方案或“已上线”的说法都不应从本文件推断。
> 本地验证仅限于：用本地静态服务器 serve 本工作树并 curl 检查
> `index.html` / `src/main.js` / `src/ui.js` 返回 200（见 §5）。
> 托管后的首屏 3D、搜索、速度、暂停仍需一次有 live browser 权限的
> 代理按 §6 清单实测后才能声称通过。

## 1. 部署形态：纯静态，无构建

- 运行时只需要：仓库根目录的 `index.html` + `src/`（含 `src/*.js` 与
  `src/*.css`：`tokens.css` / `motion.css` / `mobile.css`）。
- 没有构建步骤、没有转译、没有打包器、没有服务端代码、没有数据库、
  没有环境变量。`package.json` 只声明 `three@0.160.0`，浏览器运行时
  并不走 `node_modules`（见 §4）。
- 运行时文件之外的 `test_*.mjs`、`*.md` 不需要随部署产物提供；
  一并提供亦无害，但不要只拷贝 `index.html` 一个文件——
  相对路径 `src/main.js`、`src/*.css` 必须保持与 `index.html` 的相对位置。
- 运行时不发任何应用层请求：`src/*.js` 中没有 `fetch(` 调用；
  SBDB 轨道解是 2026-10-31 静态取回的快照，已固化在 `src/data.js`，
  不是运行时实时查询（README“未完成 / 未验证”节口径一致）。

## 2. 本地构建 / 打包说明

构建步骤：**无**。不要引入构建工具来“完成”这一步；如未来引入构建，
须先修订本合同与 `INTERFACE_CONTRACTS.md`，不得悄悄改变部署形态。

```bash
# 1) 取得指定基线（不要用 main，见 §7 回滚表）
git worktree add /tmp/orbital-deploy phase2/integration-redesign
# 或：git worktree add <dir> <commit-or-tag>

# 2) 语法与测试（数字以实际运行输出为准；本分支写稿时为
#    test_kepler 181、test_ui 38、test_redesign 84，均为 0 失败）
node --check src/*.js
node test_kepler.mjs
node test_ui.mjs
node test_redesign.mjs

# 3) 本地静态 serve（仅示例，任一静态服务器均可；不要用 file:// 直接
#    打开 index.html——ES 模块 + importmap 在 file:// 下不可靠）
python3 -m http.server 8000 --directory /tmp/orbital-deploy
# 浏览器打开 http://127.0.0.1:8000/index.html
```

## 3. 静态托管要点

任一能按原样 serve 静态文件的托管均可（本组未验证任何一家，
故此处不点名推荐）。托管时必须满足：

1. **静态根 = 仓库根目录**，入口为 `index.html`；MIME 类型按
   `.js` → `text/javascript`、`.css` → `text/css`、`.html` → `text/html`
   的常规值即可，无特殊服务器配置。
2. **放行唯一运行时外部依赖**（见 §4）：`https://cdn.jsdelivr.net`
  （`three@0.160.0` 及其 `three/addons/` 路径）。该域名不可达时，
   页面会显示 `#cdn-fallback` 横幅且无 3D 场景——这是仓库现有行为，
   如实告知用户，不要声称为离线可用。
3. **缓存策略（建议，未验证）**：`index.html` 用不缓存或短缓存；
   `src/*.js`、`src/*.css` 的文件名不带内容哈希，**长缓存会在二次
   发布后让浏览器继续用旧版脚本**。二选一并在发布时写死：
   (a) `src/*` 同样短缓存，或 (b) 发布时给引用加查询串并实测
   二次发布后浏览器确实拿到新版 `src/*.js`（见 §6）。
4. **CSP（注意，未验证）**：仓库没有自带 CSP。托管方若加 CSP，
   必须先在预发布环境实测：`index.html` 内含内联 `<style>` 与内联
   `<script>`，且 importmap 指向 jsdelivr——收得过严的 CSP 会直接
   破坏页面。不要在未实测的情况下把一份 CSP 示例当作“已验证配置”。
5. **artifact 预览 ≠ 仓库部署**：既往公开预览页是打包衍生品，
   其行为（例如本地 three 副本）不等于本仓库的静态部署表现。
   不要用预览页的通过记录背书某次仓库部署；每次仓库部署都须
   按 §6 单独验证。

## 4. three 本地副本说明（现状，不是方案）

- 源码仓库内**没有** vendor 的 three 副本（本工作树无 `vendor/` 目录）。
- 浏览器运行时 three 来自 `index.html` 的 importmap：
  `three` → `https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js`，
  `three/addons/` → `https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/`，
  与 `package.json` 的 `three@0.160.0` 版本号一致，但两者互不接线。
- 既往公开 artifact 曾用本地拷贝，那是发布衍生品，不是源码仓库内容。
  **按本文件部署源码仓库时，CDN 是必需的**；若未来要改为本地副本
  优先或备用 CDN，那是另一项须先修订合同 §7 的改动，不在本文件
  的承诺范围内，也不要把 artifact 的本地副本反推为“仓库已有”。
- 现状限制（诚实标注，勿删）：无 SRI、无第二 CDN、无重试、
  无本地 vendor 回退；CDN 失败时只有提示横幅，没有自动恢复。

## 5. 本组已做的本地验证（不是托管验证）

- 在本工作树（基线 `f046e90` + 本组文档/注释提交）上：
  `python3 -m http.server` 本地 serve 后，
  `index.html`、`src/main.js`、`src/ui.js` 的 HTTP 状态均为 200，
  且 `index.html` 的 importmap 仍指向上述 jsdelivr three@0.160.0 地址。
- 未做：任何托管方部署、任何托管 URL 的浏览器打开、
  弱网/断网下的表现、缓存策略生效验证、CSP 验证。
  这些属于 §6，须由后续步骤完成并记录，不得提前声称。

## 6. 部署后验证清单（须实测后记录结果，不得预填通过）

- [ ] 首屏出现 3D 画布（canvas），无 `#cdn-fallback` 横幅。
- [ ] 搜索、聚焦、速度、暂停、回到现在等主路径可用。
- [ ] 二次发布后，浏览器拿到的是新版 `src/*.js`（缓存策略生效）。
- [ ] 控制台无新增错误（与本地测试通过状态对照）。
- [ ] 验证通过的 URL、提交 SHA、验证人、验证时间记入 CHANGELOG；
      未验证项继续列在“未验证”中，不得省略。

## 7. 回滚到基线提交的方法

原则：**不要回滚到 `main`**。远程 `main`（`acb0ed5`）是滞后版本
（旧验证版 + 仅 `docs/CODE_REVIEW.md`，无代码改动）；回滚到它等于
丢弃全部 Phase 1 集成工作。按推荐顺序：

| 顺序 | 基线 | 本地提交 | 用途 |
| --- | --- | --- | --- |
| R-1 | 本分支基线（最完整） | `phase2/integration-redesign` tip `f046e90` | 含 integration 全部内容 + 视觉重构 + B5 修复 + B11 横幅刷新修复；是本分支的起点 |
| R-2 | 集成基线 | `integration` tip `73bcc66` | 6 分支集成 + QA + 集成后修复（P0-2/P1-2/P1-3）；若视觉重构出问题，先回这里 |
| — | 不是基线 | 各旧 feature/QA tip（见 ARCHIVE.md） | 仅追溯历史贡献，**不得作为回滚或新开发基线** |
| — | 不是基线 | 远程 PR #1 head `8113345` | 未评审/未合并，**不是回滚基线** |

```bash
# 回滚到某一基线（示例：R-2 integration 73bcc66）
git worktree add /tmp/orbital-rollback 73bcc66
cd /tmp/orbital-rollback
node --check src/*.js && node test_kepler.mjs && node test_ui.mjs
python3 -m http.server 8000 --directory /tmp/orbital-rollback
# 按托管方流程把该目录重新发布为静态根，再按 §6 重新验证。
# 注意：远程快照 SHA 与本地 tip 不同是 snapshot 重提交所致，
# 本地 tip 才是开发事实来源；远程只作异地备份。
```

## 8. git tag 与 version 区分（方案记录，未实际打 tag、未推送）

- 现状：本仓库 `git tag -l` 为空；`package.json` 的 `version`
  在本工作树仍为 `0.1.0`，与旧验证版同号，**仅凭版本号无法区分
  “旧验证版”与“Phase 1 集成版 / Phase 2 基线”**。
- Tag 命名规则（提案，待总协调人裁决后由 infra 组或协调人执行）：
  `phase2-<开发线>-<短 SHA>`，例如基线 `phase2-integration-redesign-f046e90`；
  后续集成合并时再按同一规则打 `phase2-<开发线>-<新短 SHA>`。
  轻量 tag 与附注 tag 的取舍、是否推送，均由总协调人决定；
  **本组没有创建任何 tag，也没有推送任何 tag**（本组禁推送）。
- 打 tag 命令（仅记录，执行前须经裁决）：

```bash
git tag -a phase2-integration-redesign-f046e90 f046e90 -m "Phase 2 baseline: integration + visual redesign + B5 fix"
git rev-parse phase2-integration-redesign-f046e90  # 应输出 f046e90 的完整 SHA
git tag -l 'phase2-*'
```

- `package.json` 的 `version` 改动**留给 infra 组**：本组为避免
  合并冲突没有改 `package.json`。如需用版本号区分集成版，
  请总协调人裁决 bump 方案（例如下一次集成合并时 bump），
  本组在汇报中提出该需求，不自行改号。
