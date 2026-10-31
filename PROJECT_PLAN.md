# ORBITAL — PROJECT_PLAN.md
- 目标：Professional 精度、Full 天体范围、Cinematic 视觉风格。
- 基线：GitHub ruik-lok/sais- main ff30ebb（与本地逐字节一致，除审计报告外）；本地备份：~/workspace/orbital-backup-20261031/。
- 阶段：Step 1 审计已完成（AUDIT_REPORT.md）；Step 2 Git 隔离已完成（integration + 5 feature + test 分支，worktree 隔离）；Step 3 接口规范已锁定（INTERFACE_CONTRACTS.md v1）。
- Step 4 并行开发：Model/Physics/Rendering/UI/Performance 各自在 feature 分支 + 独立 worktree 工作，只改授权文件，定期提交，跑 node --check + test_kepler。
- Step 5 集成：主控逐分支审查差异/冲突/接口/功能/性能/视觉，通过才合并到 integration。
- Step 6 独立测试：QA 在 test/independent-audit 分支独立验证，不信开发方自述，问题带复现步骤分回修复。
- Step 7 发布：仅当 QA 关键测试全过且综合评分 ≥90/100 才合并 main 并推送；未达标 main 不动。不得删除生产版本/artifact，不得 force-push，不得部署用户服务器。
- 硬约束：未知字段标“未知”不编造；开普勒近似与 DE441、程序化纹理与实测影像的区别必须在 UI 与文档如实标注。
