# Bug Hunt: 最新存量每日内容与质量闸门

**Date:** 2026-09-01
**Scope:** `bd89f76` 新增的双轨工作台、今日内容、质量闸门，以及相邻的包裹/台账用户路径
**Failures:** 0（没有未确认的根因假设）

## Summary

| # | Bug | Severity | File | Fix |
|---|---|---|---|---|
| 1 | 打开有分享链接的旧判断档时引用已删除变量，页面抛 `ReferenceError` | MEDIUM | `js/app.js:369` | 恢复由全部硬问题计算的发布阻断状态 |
| 2 | “包裹”页把不可分享的今日内容列成甲方包裹 | MEDIUM | `js/app.js:837` | 把工作台档案与甲方包裹拆成两个纯函数边界 |
| 3 | 纯存量客户的台账无法选择今日文案归因 | MEDIUM | `js/app.js:892` | 台账优先读取最新今日内容，拓新仍读取判断档 |
| 4 | 跨平台重复检查只看每条外壳的第一个字段，可把重复句藏在小红书正文 | MEDIUM | `lib/quality.mjs:151` | 检查每个平台外壳的全部字段，并按规范化平台身份去重 |
| 5 | 换皮算法仅凭 14 字公共片段硬拦，口号检查也会误杀批评套话和真实第一人称 | MEDIUM | `lib/quality.mjs:23` | 改为高相似度 bigram 判定，并识别真正否定语境；保留“不要错过”对抗闸门 |
| 6 | ISO 时间戳形式的今日内容会被误判为今天未出 | MEDIUM | `lib/desk.mjs:29` | 统一取日期前 10 位比较，并覆盖 `lastDropAt` |
| 7 | desk 在 API 响应中复制整份客户/档案，50 条批次会显著放大轮询负载 | LOW | `lib/desk.mjs:62` | desk 只返回渲染所需摘要字段 |
| 8 | 今日演示内容仍显示“赛道判断”，并残留判断报告的拆解、承接和投放段 | LOW | `lib/pitch-seed.mjs:7` | 今日盖章改为“内容”，演示 drop 清空判断专属字段并明确仅为演示 |

## Findings

### BUG-1: 旧判断档触发前端运行时异常 (MEDIUM)

**File:** `js/app.js:369`
**Root cause:** 新提交删除了 `publishBlocked` 的声明，但分享按钮分支仍读取该变量。今日内容没有 `sharePath`，短路逻辑掩盖了问题；切换到旧判断档才会执行未定义变量。

**Observed:** Playwright 切到 2026-08-17 快档后控制台出现 `ReferenceError: publishBlocked is not defined`，调用栈指向 `renderToday`。

**Fix:** 用当前档全部硬问题重新计算 `publishBlocked`；浏览器复测旧档可正常显示甲方包裹入口，控制台零错误。

### BUG-2/3: 今日内容越过包裹边界，同时未进入台账归因 (MEDIUM)

**File:** `js/app.js:837`, `js/app.js:892`
**Root cause:** 同一个 `packsOf` 概念同时承担“工作台历史”“甲方包裹”“台账归因”三个不同语义。引入 `drops` 后，一处纳入过多，一处仍只读旧 `packs`。

**Observed:** 包裹页出现无分享 token 的“今日”条目；纯存量客户 `packs=[]` 时台账下拉框没有任何今日文案。

**Fix:** 新增 `js/customer-view.js`，显式区分全部工作台档案、可分享判断档、最新可归因档，并用 3 个单测锁住边界。

### BUG-4/5: 质量闸门既可绕过又会误杀 (MEDIUM)

**File:** `lib/quality.mjs:23`, `lib/quality.mjs:151`
**Root cause:** 跨平台只取 `title || body || cover`，后续字段永远不检查；换皮判定把任意 14 字公共片段当作同一句；词面命中不区分“自夸”与“批评套话”。

**Observed:** 朋友圈标题与小红书正文完全相同时无跨平台问题；两条共享长场景前缀、结论不同的文案被硬拦；“别信专业团队四个字”被当作自夸。

**Fix:** 扫描所有字段，按 `specFor()` 归一平台别名；用包含比例与 bigram Dice 高阈值识别换皮；只豁免紧邻且明确的否定语境，并验证“不要错过专业团队”仍被拦。

### BUG-6/7/8: 日期、响应体与演示语义不一致 (MEDIUM/LOW)

**File:** `lib/desk.mjs:29`, `lib/desk.mjs:62`, `lib/pitch-seed.mjs:7`
**Root cause:** 日期比较假设字段永远是 `YYYY-MM-DD`；desk 行直接展开整个客户对象；演示今日内容由快档浅拷贝而来。

**Observed:** ISO 时间戳不等于纯日期；desk 重复携带 drops/packs/materials/checks；首屏“今日”仍显示诊断免责声明、钩子拆解和承接。

**Fix:** 归一日期；desk 改为摘要 DTO；演示 drop 清空判断专属字段，并在 UI 中按 tier 显示“今日内容”、按是否有内容隐藏空章节。

## Pass Accounting

| Pass | Files | Findings | False Positives | Notes |
|---|---:|---:|---:|---|
| 1 · Surface | 15 | 8 | 0 | 单测基线 127/127；静态差异审查与浏览器复现 |
| 2 · Fresh eyes | 10 | 2 | 0 | 发现平台正文绕检与否定语境绕过，补对抗测试后修复 |
| 3 · Integration | 10 | 0 | 0 | 单元/集成测试、Node 语法、浏览器旧档/包裹/演示路径 |
| 4 · Verify | 10 | 0 | 0 | 全差异复读与相同验证门复跑，无新 HIGH/MEDIUM |

## Verification

- `npm test`：14 个文件、136 项测试通过（修复前为 127 项）。
- `node --check js/app.js`、`node --check js/customer-view.js`：通过。
- `git diff --check`：通过。
- Playwright：旧快档打开、甲方包裹列表、今日演示首屏均通过；控制台 0 error。
- BF4：真实 LLM 超时/断连注入未执行，需要真实渠道凭据；本次未改 LLM transport，后台任务异常落盘路径已有工作区测试覆盖。
- BF5：范围内没有 shell 脚本。
- BF1：新增转换均有确定性边界/对抗测试；未引入属性测试框架。

## Convergence

Pass 3 与 Pass 4 连续满足：无新增 HIGH/MEDIUM、无遗留 deferred、测试为绿、静态检查为绿、浏览器回归无错误。Finding decay 为 `8 → 2 → 0 → 0`，审计收敛。
