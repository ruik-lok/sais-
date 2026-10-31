# ORBITAL — AGENT_TASKS.md
| Agent | 分支 / Worktree | 授权文件 | 任务要点 |
|---|---|---|---|
| Model | feature/model-system / orbital-wt-model | src/data.js（形状/环/纹理元数据字段）、src/render.js（纹理生成器、几何分档、彗星彗发彗尾部分，与 Rendering 协调边界） | 扁率/三轴/不规则体、彗星、纹理分档与独立种子、环按天体区分、矮行星卫星建模缺口说明 |
| Physics | feature/astronomy-engine / orbital-wt-physics | src/astro.js、src/data.js（轨道根数/轨道解字段）、src/time.js、src/events.js | TT/TDB、光行时、岁差、有效期护栏、非法输入抛错、SBDB/Horizons 接入（接不上留未知）、卫星相位历元、事件三维极值 |
| Rendering | feature/rendering-engine / orbital-wt-rendering | src/render.js（光照/阴影/色调/后期/LOD/相机/setMode）、index.html（importmap fallback）、package.json | 物理衰减、阴影、ACES、泛光、环/光晕随模式更新、maxDistance 动态适配、CDN fallback |
| UI | feature/ui-system / orbital-wt-ui | index.html（布局/全屏/底部栏）、src/ui.js、src/interaction.js、src/main.js（状态源与增量更新部分） | 全屏、面包屑、可点击卫星、母天体分组、搜索联想消歧、增量更新、移动端底部溢出、触屏目标、无障碍 |
| Performance | feature/performance / orbital-wt-performance | src/render.js（性能部分）、src/main.js（循环/governor）、src/events.js（复用位置） | 共享几何、scenePos 去重、refreshOrbits 原地更新+材质释放、启动懒加载、FPS governor、visibilitychange 暂停 |
| QA | test/independent-audit / orbital-wt-qa | 测试文件（新增 test_*.mjs）、TEST_REPORT.md | 独立验证，不信开发方自述；覆盖行星卫星、土星环、搜索、聚焦、轨道、时间、UI、桌面、移动、长时间运行 |
- 规则：只改授权文件；接口不匹配先报主控；每次提交写测试结果；不得改他人模块；不得 force-push；不得动 main。
