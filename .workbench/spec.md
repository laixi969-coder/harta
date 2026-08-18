---
name: 获客工作台
domain: system
subject: 客户
purpose: 让每个销售上班先看见该给正在跟的客户出什么、还能追谁，并用自己过往哪条真的有回音，让下一批打法变准
surface: desktop
structure:
  primary: pipeline
  secondary: runbook
moment: 上班坐下第一件事
dials:
  cadence: 9
  input: 5
  depth: 8

roles:
  - name: 销售
    opens_daily: true
    does: 给先用的客户出今天的东西、看还能追谁、给发出去的东西点有没有回音、出档、记账
  - name: 负责人
    opens_daily: false
    does: 看全组哪条猎场、哪个平台有回音；不能让销售看见彼此的客户

hook:
  text: "先给恒基旧改出：信息流 3 · 朋友圈 3 · 小红书 3 · 短视频 3（按你上周朋友圈更有回音排前）· 还有 4 个可追"
  shape: imperative
  fields:
    - name: customer.using_now
      reads: 先给谁出
      writes: user
      when: 点一次「先用这个」，最多 1–3 个；没钉过取最近在跟的 1 个
      day_one: 先建一个客户，建完他就是先用的
    - name: play_item.copy
      reads: 各平台各至少 3 条
      writes: derived
      when: 按先用客户的猎场生成；排序吃该销售自己的反馈（有回音的平台和钩子靠前）
      day_one: 没有反馈时按行业包默认序，不编「上周爆了」
    - name: play_item.platform
      reads: 信息流 / 朋友圈 / 小红书 / 短视频
      writes: derived
      when: 每平台至少 3 条，少了算没出完
      day_one: 无
    - name: play_item.feedback
      reads: 上周朋友圈更有回音
      writes: user
      when: 对已发的某一条点「有回音 / 没反应」；台账记成问价或成交时，系统自动把对应条标成有回音
      day_one: 还没有反馈，hook 里不出现「上周更有回音」这半句
    - name: customer.chaseable_count
      reads: 还有 4 个可追
      writes: derived
      when: 数自己名下非先用且可追的
      day_one: 人不够不报假数
    - name: customer.last_activity_at
      reads: 超 3 天没回
      writes: system
      when: 记账、已发、出档、点反馈时自动盖
      day_one: 不显示超期数字

cold_start:
  day_1: 先建你自己的一个客户。建完四个平台各出至少 3 条。还没有「哪条有效」，发出去之后点一下有没有回音，明天才会变准。
  day_2: 先用的是这 1 个。四平台文案已备好。有回音的那条，点一下，下次会往前排。
  day_7: 这周你点过的有回音里，朋友圈 2 次、信息流 0 次——今天朋友圈会排在前面。
  re_entry: 隔了几天也行。打开先看先用的客户今天出什么；下面是可追的；有回音的打法会自动提前。

home:
  - hook
  - 上次有效（仅自己的：哪条、哪个平台、带来问价还是没反应；没有反馈时整块不出现，不要写「暂无数据」）
  - 先用的客户（1–3）：四平台分组，每组 ≥3 条，有回音的平台和钩子排前
  - 还可以追的客户
  - 新建客户；标先用

entities:
  - name: SalesUser
    fields: [id, name, role, created_at]
    written_by: { name: user, role: user, created_at: system }
    relations: [SalesUser 1-n Customer]
  - name: Customer
    fields: [id, owner_id, name, hunt_field, pitch, city, website, materials, using_now, created_at, last_activity_at]
    written_by:
      { name: user, hunt_field: user, pitch: user, city: user, website: user,
        materials: user, using_now: user, owner_id: system, created_at: system, last_activity_at: system }
    relations: [Customer n-1 SalesUser, Customer 1-n Pack, Customer 1-n LedgerEntry, Customer 1-n PlayItem]
  - name: Pack
    fields: [id, customer_id, tier, title, body, share_token, created_at]
    written_by: { tier: system, title: system, body: system, share_token: system, created_at: system }
    relations: [Pack n-1 Customer]
  - name: LedgerEntry
    fields: [id, customer_id, owner_id, channel, quote, reaction, result, note, created_at]
    written_by: { channel: user, quote: user, reaction: user, result: user, note: user, created_at: system, owner_id: system }
    relations: [LedgerEntry n-1 Customer, LedgerEntry n-1 SalesUser]
  - name: PlayItem
    fields: [id, customer_id, owner_id, date, platform, copy, hook_formula, used, feedback]
    written_by:
      { date: system, platform: derived, copy: derived, hook_formula: derived,
        used: user, feedback: user, customer_id: system, owner_id: system }
    relations: [PlayItem n-1 Customer, PlayItem n-1 SalesUser]
  - name: IndustryPack
    fields: [id, hooks, baits, banned, platforms]
    written_by: { hooks: user, baits: user, banned: user, platforms: user }
    relations: []

depends_on: []

channels:
  - name: 今天
    type: today
    weight: primary
    does: 先看上次哪条有回音，再给先用的客户出各平台至少 3 条，再看还能追谁
    pages:
      - { level: L1, shows: 上次有效（有才出现）+ 先用客户四平台分组每组≥3 + 可追名单, actions: [有回音, 没反应, 已发, 出档, 复制, 换一条, 标先用] }
  - name: 客户
    type: record
    weight: regular
    does: 只看自己的客户，建档、出档、记账、标先用
    pages:
      - { level: L1, shows: 自己的列表，先用置顶，其余按可追排, filters: [猎场, 结果, 是否先用], actions: [新建, 标先用] }
      - { level: L2, shows: 资料 + 四平台各≥3 + 该客户过往哪条有回音 + 档 + 台账, actions: [出档, 打开包裹, 记账, 有回音, 没反应] }
      - { level: L3, shows: 某一份包裹, actions: [复制链接, 下载] }
  - name: 包裹
    type: outward
    weight: regular
    does: 打开、复制、下载给甲方的那一页
    pages:
      - { level: L1, shows: 自己出过的包裹, actions: [打开, 复制链接] }
  - name: 台账
    type: review
    weight: regular
    does: 记原话和报价；问价/成交会回写到对应打法的「有回音」
    pages:
      - { level: L1, shows: 自己的行（客户·猎场·结果·原话）, actions: [记一笔] }
  - name: 哪些有效
    type: review
    weight: regular
    does: 只看自己的：哪个平台、哪种钩子、哪类客户更有回音，好让下一批往那偏
    pages:
      - { level: L1, shows: 按平台/钩子汇总的有回音次数，加几条原话摘录，不是大表, actions: [] }
  - name: 猎场
    type: knowledge
    weight: occasional
    does: 五个猎场的钩子、红线
    pages:
      - { level: L1, shows: 五个猎场卡片 }
      - { level: L2, shows: 钩子、红线、主战场 }
  - name: 设置
    type: tool
    weight: occasional
    does: 密钥；负责人加人、分客
    pages:
      - { level: L1, shows: 密钥表单, actions: [保存密钥, 加人] }

mvp:
  - 今天
  - 客户
  - 包裹
  - 台账
  - 打法上的有回音/没反应（进步的最小闭环）
later:
  - 哪些有效（独立页）
  - 猎场独立成册
  - 设置里的成员与分客
visual: 纸面、少颜色。有回音用一个克制记号，不要奖杯动画。四平台分组。
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

许多销售对许多客户，彼此看不见。上班两问：给先用的客户出什么，还能追谁。各平台至少 3 条。你又加了一句：同时还要有反馈，之前哪些获客效果不错，让他进步。

进步不是再做一张漂亮报表，是：发出去的东西能点有没有回音，下一次出的东西往有回音的平台和钩子偏。

## 每天怎么用

打开「今天」。若上周点过有回音，先看到一句「你朋友圈更有回音」。再给先用的客户出四平台各 3 条，有回音的平台排前面。发完点已发；客户有反应就点「有回音」，没反应点「没反应」。下面是还能追的人。台账里记成问价或成交，对应那条会自动算有回音，不用点两次。

第一周没有反馈，就不说上周怎样，只出默认序。

## 为什么是这几个频道

- **今天** 仍是两问，多了一块「上次有效」和每条上的有回音/没反应。
- **台账** 会回写反馈，避免记了成交打法还显示没数据。
- **哪些有效** 是回看，第一版可以不单独做页，但点选必须在第一版就有，否则下一批不会变。

## 已经想过但没做的

- 销售互查、拿别人的效果给自己排序：不能。
- 没反馈就写效果很好：不能。
- 可追名单也铺 12 条、每平台 1 条、不挂客户的通用 3 条：否。
- 独立「哪些有效」大页：第二版。

## 给实现方（不熟悉本规范的 AI 或开发，照这段做即可）

- **网页。** 默认落地「今天」。hook 是第一行。
- **home**：hook → 上次有效（无反馈则整块隐藏）→ 先用客户四平台各 ≥3 → 可追 → 新建。
- **配额**：信息流、朋友圈、小红书、短视频各 ≥3，不重复。外壳按平台改。
- **反馈**：PlayItem.feedback = `none` / `replied` / `dead`。只对已发的显示「有回音 / 没反应」。台账 result 为有兴趣/见面/成交时，若能对应到某条 PlayItem，自动写成 replied。
- **进步**：生成下一批时，只读该销售自己的 feedback。有回音的 platform、hook_formula 加权靠前、同类多出；连续没反应的降权，仍须满足每平台 ≥3。没有反馈时用行业包默认序，**禁止**写「上周效果很好」或假数字。
- **隔离**：反馈、汇总、排序都不得串销售。
- **不要做成打分表、星级、问卷。** 一下下就完。
- **mvp**：今天、客户、包裹、台账、每条打法上的两点反馈。哪些有效独立页放 later。
- **空状态 day_1。** 甲方包裹禁止 AI。纸面，有回音一个克制记号即可。
