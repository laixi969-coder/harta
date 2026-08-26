---
name: 获客工作台
domain: system
subject: 客户
purpose: 让每个销售上班先看见先用的客户出过什么、还能追谁，发出去的每一条能点出有没有回音，下一批顺着回音出；负责人隔一阵能看见全组哪条猎场真有回音
surface: desktop
structure:
  primary: pipeline
  secondary: registry
moment: 上班坐下第一件事
dials:
  cadence: 9
  input: 5
  depth: 8

roles:
  - name: 销售
    opens_daily: true
    does: 给先用的客户出档/补货、复制改文案发出去、点有回音/没反应、记账、追下一位
  - name: 负责人（超管）
    opens_daily: false
    does: 配模型密钥、开账号名单；隔一阵看「全组」页——哪条猎场、多少条有回音，只有聚合数，不拆到人

hook:
  text: "恒基旧改 · 08-17 已出快档：3 个缺口 · 15 条文案 · 主战场巨量信息流、朋友圈。下面还有 2 个可追。"
  shape: state
  fields:
    - name: customer.using_now
      reads: 先看谁
      writes: user
      when: 严格一个：建客户自动先用，或点「先用这位」；没钉过取最近建的
      day_one: 先建一个客户，建完他就是先用的
    - name: pack.tier / pack.copies / pack.gaps / pack.battlefields
      reads: 已出快档：3 个缺口 · 15 条文案 · 主战场…
      writes: system
      when: 出档后台跑完自动落（一两分钟）；侦察档没有缺口，行首改报「N 个要先问清的」
      day_one: 出档中报「正在出档，出好自己刷新」；失败报原因 + 「重出这份档」；没出过报「还没有出过档」
    - name: customer.chaseable_count
      reads: 下面还有 2 个可追
      writes: derived
      when: 数自己名下非先用的客户
      day_one: 人不够不报假数
    - name: feedback（workspace 级字典）
      reads: 首屏「上次有效」条
      writes: user + system
      when: 销售对已发的某条点「有回音 / 没反应」；台账记 问了价/有兴趣/成交 且选了「哪条带来的」时自动写成有回音
      day_one: 没有任何回音时整块不出现，不写「暂无数据」，更不许写「效果很好」
      note: 反馈按「哪份档的哪一行」记，但「上次有效」跨批次找——刚补的新批自己没反馈，前头批次的回音不消失
    - name: pack.origin.engine
      reads: 模板档提醒（这份是行业模板，不是给这家出的）
      writes: system
      when: 出档走的是赛道模板而非真模型时
      day_one: 无

cold_start:
  day_1: 第一件事是管理员在设置里配模型密钥——没配好时出档会失败，报的那句话要让销售转给管理员。然后建一个客户：名字、一句话卖点、猎场，客户先落地，档在后台出一两分钟。
  day_2: 档已出好：四类平台铺满（各 ≥3 是闸门），复制就能发。发出去后点有回音/没反应，台账记原话。
  day_7: 点过的回音让「上次有效」出现在首屏；客户在用素材了，点「补一批」会顺着回音的方向出，没反应的方向被砍掉。
  re_entry: 隔了几天也行。打开还是那两问：先用的客户出过什么、还能追谁。出档中断（服务重启）会明说并给重出按钮，不会一直转圈。

home:
  - hook
  - 模板档提醒（只在使用赛道模板时出现）
  - 历史批次切换（同一客户出过多份时）
  - 上次有效（跨批次找；没有任何回音时整块不出现）
  - 先用客户的档全文：判断（赛道格局/该截谁/缺口或先问什么）→ 出活（交付前检查/文案/钩子拆解/分镜/承接/主战场/怎么投）；出档中、失败、没出过各有各的说法和按钮（重出/补分镜/补一批）
  - 还可以追的客户（一人一行，点「先用这位」切换）
  - 新建客户

entities:
  - name: SalesUser
    fields: [id, name, role, created_at]
    written_by: { name: user, role: user, created_at: system }
    relations: [SalesUser 1-n Customer]
  - name: Customer
    fields: [id, owner_id, name, hunt, pitch, city, link, material, using, packs, job, lastFail, created_at]
    written_by:
      { name: user, hunt: user, pitch: user, city: user, link: user, material: user,
        using: user, owner_id: system, created_at: system, job: system, lastFail: system }
    relations: [Customer n-1 SalesUser, Customer 1-n Pack, Customer 1-n LedgerEntry]
  - name: Pack
    fields: [id, tier(侦察/快/侦察+分镜/全/补给), title, evidence, evidenceNote, gate, gaps, questions, landscape,
             copies, shells, boards, breakdowns, landing, demand, battlefields, testPath, supply, honest, next,
             checks, edits, origin, shareToken, deliveredAt]
    written_by: { 全部字段: system（模型出档时落；edits/逐条改后重跑 checks 仍是 system 记录） }
    relations: [Pack n-1 Customer]
  - name: LedgerEntry
    fields: [date, client, hunt, result(问了价/有兴趣/成交/没下文), quote, talk, demo]
    written_by: { date: system, client: user, hunt: user, result: user, quote: user, talk: user, demo: system }
    relations: [LedgerEntry n-1 Customer；result 为正且挂了行时回写 feedback]
  - name: Feedback（workspace 级字典）
    fields: ["<packId>-<组名>-<行号>": replied/dead]
    written_by: { 销售点按: user, 台账回写: system }
    relations: [指向 Pack 内某一行；「上次有效」跨 Pack 读取；补给吃最近几批]
  - name: IndustryPack
    fields: [id, hooks, baits, banned, platforms]
    written_by: { hooks: user, baits: user, banned: user, platforms: user }
    relations: [策展在 vendor/hiccai-pitch/industries，自长的存 data/industries；同名策展的赢；红线词表跟包走]

depends_on:
  - name: 模型接口（OpenAI 兼容，可配多个渠道）
    exists_today: true
    note: 超管在设置里配密钥。没配好时出档失败，报错要说清这事归管理员管，不许把销售指到一个他打不开的页面

channels:
  - name: 今天
    type: today
    weight: primary
    does: 两问：先用的客户出过什么（档全文、可复制可改可点反馈）、还能追谁
    pages:
      - { level: L1, shows: hook → 模板提醒 → 历史批 → 上次有效 → 先用客户的档全文 → 可追名单, actions: [复制, 改, 有回音, 没反应, 出档, 重出, 补分镜, 补一批, 打开甲方页, 先用这位, 新建客户] }
  - name: 客户
    type: record
    weight: regular
    does: 只看自己的客户：新建（选猎场，没有的行业现场长包）、标先用、翻每个客户的历史档
    pages:
      - { level: L1, shows: 自己的列表，先用置顶，按出档数排, actions: [新建, 先用这位, 看当时给的] }
      - { level: L2, shows: 切到该客户后今天页整份档（含历史批切换）, actions: [出档, 补货, 记账, 反馈] }
      - { level: L3, shows: 某一份档的甲方页 /p/<token>, actions: [复制链接, 下载] }
  - name: 包裹
    type: outward
    weight: regular
    does: 发给甲方的那一页：凭链接打开、不用登录，链接不对就是 404；页内无「AI」字样
    pages:
      - { level: L1, shows: 自己出过的所有档（按客户×日期）, actions: [打开这份] }
  - name: 台账
    type: review
    weight: regular
    does: 记原话和报价；记 问了价/有兴趣/成交 且选了「哪条带来的」时，那条自动算有回音（只认自己客户名下真实存在的行）
    pages:
      - { level: L1, shows: 记一笔表单（客户/结果/哪条带来的/报价/原话）+ 自己的流水；演示行带「演示」标，不进任何统计, actions: [记一笔] }
  - name: 全组
    type: review
    weight: occasional
    does: 只有超管能进：哪条猎场、多少条有回音、多少问价成交，加最近几条原话；只有聚合数，不拆到人
    pages:
      - { level: L1, shows: 按猎场聚合行（人数/客户/出档/有回音/问价/成交）+ 最近原话, actions: [] }
  - name: 设置
    type: tool
    weight: occasional
    does: 人人能改密码；超管多出：模型密钥（多渠道）、开通名单、重设密码
    pages:
      - { level: L1, shows: 密码表单；超管加名单和模型两块, actions: [改密码, 开通, 移出, 重设密码, 保存密钥, 用作当前, 同步模型, 连接测试] }

mvp:
  - 今天（含出档/重出/补分镜/补一批、就地改、反馈两点、跨批次上次有效）
  - 客户（新建含自长猎场、历史档）
  - 包裹（甲方页）
  - 台账（记原话 + 回写有回音）
  - 全组（超管聚合页）
  - 设置（密钥多渠道、名单）
later:
  - 哪些有效（销售自己的独立汇总页）
  - 猎场独立成册（现在选单在建档处，红线跟包走）
  - 设置里更细的成员与分客
visual: 纸面、少颜色。有回音一个克制记号。四平台分组。浅色暖纸 / 深色漆木，同一套制度。
seam:
  type: none
  why: 内部工具，钱向甲方收服务费

excluded:
  - 销售之间看见别人的客户、跟进、包裹、原话
  - 用别人的反馈给这个销售排打法（进步只吃自己点过的）
  - 公海抢单
  - 甲方自助后台（第二期）
  - 投放账户、出价、定向
  - K12 学科教育客户
  - 成交型电商、餐饮团购核销
  - 给甲方看的任何文字里写「AI」
  - 首屏先给不挂客户的「全天 3 条通用打法」
  - 每平台只出 1 条
  - 没有反馈时写「效果很好」或假的上周数据
deferred:
  - 甲方回传线索成本和在投素材
  - 销售自己看个人成交排行（小老板感，他没要）
---

## 这个台子是给谁的

许多销售对许多客户，彼此看不见。上班两问：先用的客户出过什么，还能追谁。发出去的东西点得出有没有回音，下一批顺着回音出。负责人隔一阵看一眼全组哪条猎场真有回音——只有数，不拆到人。

## 每天怎么用

打开「今天」。第一行说清先用的客户出过什么档、几个缺口、几条文案、主战场在哪，下面还有谁可追。往下是那份档的全文：该截谁、缺口、文案（有回音的组排前）、钩子拆解、承接怎么做、怎么投。每条文案能复制、能就地改（改后那版才是发出去的、进甲方页的），发完点有回音/没反应。

客户有反应了才补分镜升全档；付了钱在用素材了才手动点补货，补给吃最近几批的反馈，有回音的方向多出、没反应的砍掉，但强制留四分之一试新方向。台账记 问了价/有兴趣/成交 时可以顺手选「哪条带来的」，那条自动算有回音，不用点两遍。

第一周没有反馈，就不说上次怎样；「上次有效」整块不出现。

## 档位的规矩

没看过客户的东西（没留官网、没贴材料）只出侦察档——赛道格局加精准提问，不出诊断；看过才出快档；客户有反应了手动补分镜成全档；付了钱才有补给档。档位由证据决定，不由人挑。超管本子里那三个演示客户是给人看样子的，台账里的演示行带着标记，不进任何统计。

## 猎场

猎场就是行业包。策展的在 vendor/hiccai-pitch/industries，遇到新行业选「其他行业」现场长一份存 data/industries，长出来的标 D 级，同名时策展的赢。红线词表跟着行业包走，交付前检查分「发不出去」（硬限制）和「会有代价」（建议）两档，软数字不许当红线。

## 已经想过但没做的

- 销售互查、拿别人的效果给自己排序：不能。
- 没反馈就写效果很好：不能。
- 可追名单铺满文案、不挂客户的通用条：否。
- 猎场独立成册、哪些有效独立页：第二版。
- 全组页拆到人：否——负责人看数可以，看谁的不行。

## 给实现方（不熟悉本规范的 AI 或开发，照这段做即可）

- **网页，电脑浏览器。** 默认落地「今天」。hook 是第一行，正在出档/失败/没出过各有说法，不许空白或假数。
- **出档**：后台任务，一两分钟，界面轮询刷新；服务重启留下的死档要明说并给重出。快档文案 ≥15 条、四类平台各 ≥3 是硬闸门，铺不满作废重跑。侦察档没有缺口只出提问。
- **反馈**：workspace 级字典，key 为 `<packId>-<组名>-<行号>`，值 replied/dead。只对已发的显示「有回音 / 没反应」。
- **台账回写**：POST /api/ledger 带 line 字段；result ∈ {问了价, 有兴趣, 成交} 且 line 真实存在于该客户名下的档时，feedback[line] = "replied"。别的 key 一律不写。
- **上次有效**：跨批次找——把该销售所有客户的所有档按日期倒序，第一份有 replied 的就是「上次」；当前这份才说「已往前排」，更早的说「哪天那批」。没有任何回音时整块隐藏。
- **补给**：generateRefill 吃最近几批（最多三批历史）的反馈；有反馈时强制 ≥25% 的「试」字头新方向组，不然整份作废。没反馈时平铺并如实说没依据。
- **就地改**：改文案存 edits 不覆盖原句（原句留给对比），复制和甲方页拿改后那版，改完立刻重跑检查。
- **全组页**：GET /api/overview，仅超管。聚合各猎场的 有回音/问价/成交 + 最近原话；demo 台账行不进数；不返回任何销售个人明细给非管理员。
- **隔离**：反馈、汇总、排序都不得串销售。超管也只看聚合数。
- **不要做成打分表、星级、问卷。** 一下下就完。
- **空状态 day_1。** 甲方包裹禁止 AI。纸面，有回音一个克制记号即可。
