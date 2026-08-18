---
name: hiccai-pitch
description: 针对任意行业的一个潜在客户，生成"先让他疼、再让他心动"的获客提案——包含行业诊断、素材文案、竖版成品图与短视频脚本，用于试探不同行业为获客素材付费的意愿。适用于陌生客户开发、行业赛道试探、获客方案提案、信息流素材提案、内容获客诊断。默认出快档（诊断+文案，约5分钟），用户说"出全案/全档"时出全档（加成品图+分镜脚本+HTML提案）。触发词：hiccai-pitch、获客提案、客户提案、素材提案、信息流提案、行业诊断、开发客户、拓客方案、pitch。
license: MIT
metadata:
  author: Caiwenbin
  version: 1.0.0
  created: 2026-08-13
---

# Hiccai Pitch

把"一个行业 + 一个客户名 + 一句话卖点"，变成一份能直接发给客户的获客提案。

这是**销售武器**，不是内容工具。每一份提案同时在做两件事：
促成这一单，以及往 `leads/LEADS.md` 攒一个"哪个行业愿意付费"的样本。

## Hard contract

- Self-scraping content platforms is allowed but is the LAST option, and only under
  the operating discipline in [references/recon.md](references/recon.md)
  (dedicated throwaway account, randomized intervals, capped volume, stop on any
  warning signal). Prefer official free sources first — they are free, structured,
  and carry zero account risk. A previous run with a logged-in main account and
  fixed 3-second intervals earned a real 7-day ban.
- When the skill is used by someone other than its owner, never self-scrape with
  their account. A ban on your own account is a cost you chose; a ban on a
  colleague's or client's account is an incident.
- Never hardcode a specific industry in this file or in `references/`. Industry
  knowledge lives only in `industries/*.md`. Hardcoding an industry is a bug.
- Never let missing information force a fabrication. Zero source material does not
  mean "write it anyway with lower confidence" — it means **switch deliverable**:
  run 侦察档 (recon tier) instead of 快档. Missing intel changes WHAT you ship,
  not whether you ship.
- Label every D-grade judgment as judgment, never as data. One exposed fake
  data point voids the entire proposal.
- Never state anything specific about THIS client's current situation ("你们的内容
  在讲 X", "你们只发了 Y") unless you have actually seen it — via material they gave
  you, or their public account/site you opened and read. Industry-level judgment is
  fine and gets a D label; **claims about a client you have not looked at are
  fabrication, and a D label does not excuse them.** When you have not seen their
  material, phrase it as a question ("如果你们的内容主要在讲 X，那么……") and say so.
- When you HAVE seen the client's material, stay literal. Quote what it says; do not
  upgrade it into a claim it does not make. Quoting a line from their site is a fact;
  restating it as a claim about how their business actually works is an inference —
  and if it is wrong, the client spots it instantly and the whole proposal dies. **Anything that needs an inference to hold
  goes in a "待确认" section, never into the copy, and never into the hook you
  argue hardest for.** The most uncertain item is the one you must NOT build on.
- Attempt to look up the client by name before writing anything. If nothing is
  found, say so explicitly and go back to asking. Skipping the lookup because a
  search tool is broken is not acceptable when a browser is available.
- Write at most 5 diagnosis items. Prefer 3 sharp ones over 5 soft ones.
- Append one row to `leads/LEADS.md` after every run. An unrecorded run is a wasted run.
- Use [references/material-visual.md](references/material-visual.md) for feed
  creative images. Do NOT use `hiccai-title-pic` for them — its hard contract
  locks 1920x1080 presentation covers. Use `hiccai-title-pic` only for the
  proposal cover itself.
- Address the proposal to the end brand client, not to a fellow agency.
- Run `scripts/check_limits.py` on every batch of copy before delivery. Copy that
  exceeds a platform's limit is dead on arrival — the client discovers it cannot be
  posted and the whole proposal loses credibility.
- When quoting any platform number (character limits, sizes, prices), always state
  that the platform's own console is the authority. Write "约 30 字", never "严格 30 字".
  Specs live in [references/platform-specs.json](references/platform-specs.json)
  and go stale.

## 两档

| 档位 | 前提 | 产出 | 耗时 |
|---|---|---|---|
| **侦察档** | **没查到客户 / 没看过他们的材料** | 赛道格局 + **精准提问清单** + 3 条试探性文案 | ~3 分钟 |
| **快档** | 看过客户材料（A/B 级证据） | 诊断 + 15 条素材文案 + 3 条钩子拆解 | ~5 分钟 |
| **全档** | 客户已有反应 | 快档 + 5 张竖版成品图 + 3 条分镜脚本 + HTML 提案 | ~30 分钟 |

**档位由证据决定，不由用户要求决定。**
用户说"出快档"但你没看过他们任何东西——出侦察档，并说明为什么。

### 侦察档不是残次品

一份"我研究了你们的赛道，有三个问题想确认"，
比一份"我诊断出你们三个毛病"**更容易开启和陌生客户的对话**，
而且判断错了不会当场翻车——**你还没资格诊断一个你不了解的人。**

侦察档的产出结构：

1. **赛道格局**（公开检索得到的，B/C 级）——竞争对手是谁、他们怎么打
2. **精准提问清单**（3–5 个）——**这是侦察档的主体**。
   每个问题都要显示"我认真看过"，而不是"请介绍一下贵公司"
3. **3 条试探性文案**——基于赛道判断，标明"这是基于赛道的猜测，
   等你确认后我重出"

**一个精准的提问比一个错误的诊断值钱得多。**
提问显示你做过功课，错误的诊断证明你没有。

先用侦察/快档广撒网初筛，客户有反应了再上全档。**不要主动对没反应的客户跑全档。**

## 流程

### 第 0 步 · 收料

最少只需要：**行业 + 客户名 + 一句话卖点**。缺了就问，别的都不要问。

有更多材料更好，按有用程度排序：客户官网/详情页链接 > 客户现有素材截图 >
竞品在投素材 > 客户投放数据。**一样都没有也直接往下跑**，
用公开检索补，锐度低一点但照样出货。

不要让客户填 brief 表。不要一次问超过 3 个问题。

**收完料先查这个客户本身**（不是查行业，是查客户）：

1. 搜客户名 / 项目名——WebSearch，坏了就用浏览器
   （`mcp__Claude_Browser__preview_start` 开搜索引擎）
2. 有官网、公众号、小红书/抖音账号就打开读——**这是把诊断从 D 级抬到 A 级最快的一步**
3. **查不到就明说**，然后回到 [references/recon.md](references/recon.md) 第 1 优先级：
   直接问蔡蔡。查不到本身也是情报（说明这个项目还没有公开声量）

**没查过客户就不许写"你们的内容如何如何"。** 行业判断可以标 D 级照写，
但对这个客户现状的具体陈述，没看过就是编。

### 第 1 步 · 行业侦察

先查 `industries/` 有没有这个行业的包：

- **有** → 直接加载，跳到第 2 步（这是"跑得越多越快"的来源）
- **没有** → 读 [references/recon.md](references/recon.md) 现场侦察，
  按 [industries/_template.md](industries/_template.md) 的六项结构生成新包并存下

包超过 90 天的，钩子公式库重新抽样验证一次。

**顺带定平台**：行业包第 7 项就是主投平台建议。新行业则读
[references/platforms.md](references/platforms.md) 现场判断——
按行业、人群在哪、客户的承接能力选 **1–2 个**主战场。
冷启动阶段同时铺四个平台，等于每个都跑不出模型。

平台一旦定下，后面的素材形态就被它决定了：抖音要像内容、朋友圈要像朋友发的、
小红书要像笔记。**这一步定错，后面素材做得再好也跑不动。**

### 第 2 步 · 逆向拆解

调用 `hiccai-douyin` 的炼金四步法**前两步**：
X-Ray 透视拆解 → 迁移与超越。

拆出：钩子结构、焦虑源、信任背书方式、诱饵形态、承接路径。
产物同时喂给第 3 步诊断和第 4 步生产。

### 第 3 步 · 诊断 ← 胜负手

**闸门（先回答，答错了后面全废）：我看过这个客户的东西吗？**

| 情况 | 怎么办 |
|---|---|
| 客户给了材料，或我打开读过他们的官网/账号 | ✅ 可以出诊断 |
| 只搜到媒体报道，没看过他们自己产出的内容 | ⚠️ 只能诊断"对外可见度"，不能诊断"内容质量" |
| **什么都没看过** | ❌ **停。回侦察档。不许出诊断。** |

这道闸门不是建议。**没看过就写"你们的内容如何如何"，客户一眼看穿，整份提案作废。**

完整读 [references/diagnosis.md](references/diagnosis.md) 再动手。

五个要素：事实差 → 代价换算 → **根因归因** → 缺口命名 → **可验证动作**。
3–5 条，每条标注证据级别（A/B/C/D）。

**第 5 个要素是硬性的**：每条诊断必须附一个客户 30 秒内能自己验证的动作。
**写不出验证动作的诊断，说明它基于推断而非事实——降级成提问，别写进诊断。**

### 第 4 步 · 素材生产

**先看行业包第 6 项的类型，决定读哪个方法层——两层混用一句话就露馅：**

| 类型 | 读 | 素材逻辑 |
|---|---|---|
| 留资型 / 到店核销型 | [references/delivery.md](references/delivery.md) | 制造好奇，骗到联系方式，后端有人兜底 |
| **成交型** | [references/selling.md](references/selling.md) | **素材就是销售员**，几十秒内独立完成拦截→相关→欲望→消疑→促成 |

- **文案**：调用 `hiccai-wenan`，按第 1 步的行业包钩子公式库出 15 条
- **钩子拆解**：挑 3 条讲透为什么这么写（客户要看到方法，不只是结果）

全档追加：

- **成品图**：按 [references/material-visual.md](references/material-visual.md)
  出 5 张竖版 9:16
- **分镜脚本**：调用 `hiccai-douyin` 第三步，出 3 条
- **提案封面**：调用 `hiccai-title-pic`（1920×1080，这是它的本职）

**交付前必过两道检查：**

1. **红线**：[references/compliance.md](references/compliance.md) +
   行业包第 5 节。医美、教育、招商加盟尤其不能跳过
2. **平台限制**：把文案存成文件后跑
   ```bash
   python3 scripts/check_limits.py <文案文件>
   ```
   超限的文案等于废稿。**注意不必强行改成一稿通投**——
   按 `platforms.md`，换平台本来就要换外壳，
   只需保证在选定的主战场内不超限。

### 第 5 步 · 投放建议

**成交型读 [references/selling.md](references/selling.md)**（工业化测试：批量上、快速杀、留活的），
留资型与到店核销型读 [references/delivery.md](references/delivery.md)。写三段就够：

1. **主战场建议**——第 1 步定的平台 + 理由
2. **测试路径**——先测钩子 → 再测画面 → 最后测收口，说明第一批测什么
3. **补给节奏**——用衰减算式帮客户算出他每周需要多少条新素材
   （这个数字同时是诊断层"素材断供"那条的依据）

**边界**：不碰账户结构、出价、定向——那是代运营的活，越界会被挑错。
收口用这句："出价和定向让你们代运营定，我们负责让他们有好素材可投。"

### 第 6 步 · 交付 + 记账

1. 输出到 `leads/<客户名>-<YYYYMMDD>/`
2. 全档渲染 [templates/proposal.html](templates/proposal.html)
   （读 [references/proposal-structure.md](references/proposal-structure.md) 定叙事与报价锚点）
3. **往 `leads/LEADS.md` 文件末尾追加一行**（台账表格固定在该文件最末，直接 append 即可）
4. 告诉蔡蔡：产出在哪、诊断里哪一条最狠、建议怎么发出去

## 复用（不重写）

| 能力 | 调用 |
|---|---|
| 对标拆解 + 跨行业迁移 | `hiccai-douyin` 四步法 1–2 步 |
| 分镜脚本 | `hiccai-douyin` 第 3 步 |
| 素材文案 | `hiccai-wenan` |
| 提案封面 | `hiccai-title-pic` |
| 更狠的钩子 | `hiccai-hook`、`dbs-hook` |
| 洞察拔高 | `hiccai-insight` |
| 线索承接页 | `hiccai-landing` |

## 本项目自己的方法层

| 文件 | 管什么 |
|---|---|
| `references/recon.md` | 行业侦察、数据源纪律 |
| `references/diagnosis.md` | 诊断四层结构 ← 胜负手 |
| `references/platforms.md` | 平台的结构性差异（不会过期） |
| `references/platform-specs.json` | 平台的具体数字（**会过期，改这里**） |
| `references/delivery.md` | 投放策略（**留资型 / 到店核销型**）：测试、补给、承接 |
| `references/selling.md` | 卖货方法层（**成交型**）：五步销售结构、价格锚、评论区、工业化测试 |
| `references/material-visual.md` | 竖版素材图规格 |
| `references/compliance.md` | 合规红线（含分行业预置） |
| `references/proposal-structure.md` | 提案叙事与报价锚点 |
| `scripts/check_limits.py` | 文案字数自检 |

## 语气

提案写给客户看，不写给蔡蔡看。

不用"赋能""抓手""闭环""生态位"。诊断要具体到能被反驳——
不能被反驳的诊断都是废话。全篇至少一句真实的肯定，
找不到就不夸，**不许硬夸**。
