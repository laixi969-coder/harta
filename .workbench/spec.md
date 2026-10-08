---
name: Harta 获客工作台
revision: 2026-10-08 多产品、评论找客与独立购买需求实现
status: 已按用户授权进入实现；目标规范中的平台同步、自动发送和高级引用分析尚未接通，实际交付以 docs/COMMERCE-REVIEW-2026-10-08.md 为准
domain: system
subject: 业务
purpose: 围绕每个业务及其产品，用可信资料创作内容、发现需求、处理咨询，推进每一次购买需求并回查结果。
surface: desktop
structure:
  primary: pipeline
  secondary: registry
moment: 开始工作时查看需要处理的事项；创作、回复或更新产品资料时再次打开
dials:
  cadence: 8
  input: 3
  depth: 8
roles:
- name: 使用者
  opens_daily: true
  does: 在现有授权范围内维护业务与产品、创作、找客、回复与记录结果；经营者、销售和运营共用这一工作入口
- name: 管理员
  opens_daily: false
  does: 配置模型与来源、维护成员、查看原有全组聚合；不因此获得跨成员业务原文读取权限
precedence:
- 本轮用户明确支持多个产品与 SKU，甲方直接使用以及乙方使用均在范围内。身份不作为首页标签或注册分流。
- 用户在审阅原型后明确授权调整正式实现、检查修复缺陷、进行对抗审查并直接 commit / push main。
- PRODUCT.md 中保留布局与视觉的旧锁定已被本会话允许大调整覆盖，适用于本次正式界面；保留旧业务能力和历史数据入口。
- GOAL.md 和 2026-10-08 创作约定覆盖旧版每批 50 条及按反馈自动安排方向：默认精选 1–3 篇，反馈只提供可审阅建议。
- 历史 excluded/deferred 原文保留；明确撤销或收窄的旧约束见 exclusion_overrides，禁止把它们重新当作当前禁令。
hook:
  text: 示例：2 篇内容待确认 · 1 条咨询待回复 · 先核对阅读灯白色款的新价格
  shape: imperative
  example_only: true
  fields:
  - name: pending_content
    reads: 2 篇内容待确认
    writes: derived
    source: count(distinct Content.id where review_state=待确认 and 当前有权访问的业务及产品范围)
    when: 生成完成或保存审阅结果后
    day_one: 导入产品资料，或直接补一句介绍，开始第一篇内容
    skipped: 保留未处理内容，不自动每天给每个 SKU 造一条任务
  - name: pending_inquiries
    reads: 1 条咨询待回复
    writes: derived
    source: 按可验证的会话键去重 Activity 中尚无后续已发送回复的咨询记录
    when: 人工导入/登记咨询和登记实际回复时
    day_one: 导入真实咨询或开始找客；来源未连接不能显示为零咨询
    skipped: 显示记录截至时间；来源未更新时明确标记，不推断没人咨询
  - name: next_action
    reads: 先核对阅读灯白色款的新价格
    writes: derived
    source: SKU.revision 与 Content.source_snapshot 的字段差异生成 Task，再按影响承诺、到期时间排序
    when: 用户确认产品价格或规格变更后；只对实际引用变更字段的未发布草稿建待核对任务
    day_one: 没有产品时引导提供资料；没有受影响内容时不出现这条
    skipped: 保留未处理任务；不能把未核实的新价格当作有效价格使用
cold_start:
  day_1: 先上传一份产品或服务资料，系统整理后由你确认；也可直接填写名称和一句介绍。无需先建 SKU 或完成诊断。
  day_2: 若已生成内容，回到上次草稿继续修改或复制；若没有，则用已确认的资料生成第一篇。
  day_7: 有真实发布和咨询记录时，按产品回看哪些内容关联了咨询；缺来源或结果就写待验证，不补造趋势。
  re_entry: 直接处理仍未完成的事项；显示资料最后确认时间，不补填离开期间的每日记录。
  disconnected: 来源尚未连接或更新失败，显示最后成功时间及手动导入入口；不把缺失当零。
home:
- 业务切换器与当前范围，单业务直接打开；有多个产品时提供轻量产品筛选，默认全部产品
- 两到三条有记录支撑的待处理摘要与首要动作，不展示产品/SKU 总数充当成绩
- 按实际紧急程度排序的待办清单；显示产品，具体规格仅在任务涉及 SKU 时出现
- 继续创作的草稿与最近处理的咨询；支持一键返回原上下文
- 产品更新影响的待核对事项；无变更或无实际影响时不显示
entities:
- name: Business
  fields:
  - id
  - created_at
  - owner_id
  - name
  - facts
  - account_refs
  - legacy_ref
  - collaboration
  written_by:
    id: system
    created_at: system
    owner_id: system
    name: user
    facts: user 确认已读资料提取结果；每条保留来源及确认时间
    account_refs: user 绑定现有账号记录
    legacy_ref: system 迁移映射，保持原 Customer ID 关联
    collaboration: user 可选记录联系人、交付及合作事项，不是身份类型
  relations:
  - Business 1-n Product
  - Business 1-n Content
  - Business 1-n Contact
  - Business 1-n Task
  note: 资料、研究、侦察/诊断报告、关键词及历史原能力归属于此；继续使用现有存储，不在原型阶段迁移。
- name: Product
  fields:
  - id
  - created_at
  - business_id
  - name
  - kind
  - category
  - description
  - facts
  - marketing_focus
  - availability
  - revision
  written_by:
    id: system
    created_at: system
    business_id: system 从当前业务上下文写入并校验权限
    name: user
    kind: user 商品或服务，可从资料建议后确认
    category: user 可选分组
    description: user 确认
    facts: user 确认含来源的卖点、适用人群、限制和素材
    marketing_focus: user 可选；推广新品、讲解差异等，不控制买家阶段
    availability: user 确认可售/暂停/停止推广，未知保持未知
    revision: system 每次确认资料变更时更新
  relations:
  - Product n-1 Business
  - Product 1-n SKU
  - Product n-m Content
  - Product n-m Opportunity
  note: 产品是资料和推广主单位，默认折叠规格；同业务同品名也靠 ID 区分。多平台映射不复制产品。
- name: SKU
  fields:
  - id
  - created_at
  - product_id
  - name
  - code
  - attributes
  - facts
  - price_terms
  - availability
  - revision
  written_by:
    id: system
    created_at: system
    product_id: system 从产品上下文写入
    name: user 面向用户的规格名
    code: user 可选内部编码
    attributes: user 颜色/尺寸/容量/服务档位等
    facts: user 确认含来源、时间的差异事实；未知值不能回退成其他 SKU 的值
    price_terms: user 确认价格、币种、单位、渠道、有效期和条件；空值不是 0
    availability: user 确认可售状态；不表示实时库存
    revision: system 变更确认后写入
  relations:
  - SKU n-1 Product
  - SKU n-m Content
  - SKU n-m Opportunity
  note: 规格可有零条，单规格不强制维护编码。服务套餐可作为产品或规格：核心承诺/目标人群显著不同时拆产品，单纯档位差异用规格。
- name: Content
  fields:
  - id
  - created_at
  - business_id
  - goal
  - scope_kind
  - product_refs
  - sku_refs
  - platform_account
  - body
  - source_snapshot
  - review_state
  - publication_snapshot
  - updated_at
  written_by:
    id: system
    created_at: system
    business_id: system
    goal: user 默认沿用业务目标，可选流量/传播/客资/成交
    scope_kind: user 品牌通用/单产品/多产品
    product_refs: user 确认本次涉及的产品
    sku_refs: user 可选；提到特定规格时确认
    platform_account: user 按当前业务选择
    body: system 生成，user 编辑
    source_snapshot: system 固化所用业务/产品/SKU 事实、来源与版本
    review_state: system 生成或核对变更时标待确认，user 确认
    publication_snapshot: system 按实际发布登记保存当时版本与链接
    updated_at: system
  relations:
  - Content n-1 Business
  - Content n-m Product/SKU
  - Content 1-n Activity
  note: 默认 1–3 篇；比较文可关联多产品，但文章本身只有一个 ID。多平台版本、排期、复制、导出及历史保留。
- name: Contact
  fields:
  - id
  - created_at
  - business_id
  - name
  - platform_identity
  - contact_restrictions
  - identity_evidence
  written_by:
    id: system
    created_at: system
    business_id: system
    name: user
    platform_identity: user 从真实来源导入或确认，不凭相似昵称合并
    contact_restrictions: user 明确拒绝联系等限制
    identity_evidence: user 确认身份关联依据
  relations:
  - Contact n-1 Business
  - Contact 1-n Opportunity
  - Contact 1-n Activity
  note: 这里是业务买家，不是被服务企业。买家不拥有唯一购买阶段，不跨业务自动拼接个人身份。
- name: Opportunity
  fields:
  - id
  - created_at
  - business_id
  - contact_id
  - need
  - product_refs
  - sku_refs
  - candidate_refs
  - stage
  - decision_evidence
  - source_content_id
  - outcome
  - next_step
  - next_at
  - last_activity_at
  written_by:
    id: system
    created_at: system
    business_id: system
    contact_id: user 选择，system 校验同业务
    need: user 或 system 从原文提出待确认摘要
    product_refs: user 确认，system 建议待确认
    sku_refs: user 可选确认，未知显式留空
    candidate_refs: system 给出候选产品/规格与原文依据，不当作已选
    stage: user 本次需求的了解/比较/询价/成交/结束
    decision_evidence: user 或 system 保存阶段判断原文，推断标待确认
    source_content_id: user 明确关联或 system 使用真实内容标识匹配，未知不猜
    outcome: user 实际成交/回访等记录及来源
    next_step: user
    next_at: user 可选日期
    last_activity_at: system 保存跟进后更新
  relations:
  - Opportunity n-1 Contact
  - Opportunity n-m Product/SKU
  - Opportunity 1-n Activity
  note: 一次需求可比较多个产品；同一买家可有独立复购需求，阶段互不覆盖；成交后的回访仍在原记录。
- name: Activity
  fields:
  - id
  - created_at
  - business_id
  - contact_id
  - opportunity_id
  - thread_key
  - kind
  - text
  - source
  - event_at
  - recorded_at
  - content_ref
  written_by:
    id: system
    created_at: system
    business_id: system
    contact_id: system 或 user 关联同业务联系人
    opportunity_id: user 确认归属，未知允许为空
    thread_key: system 根据来源真实标识或手动登记会话生成
    kind: user 咨询/已发送回复/跟进/发布记录/结果，system 保留写入事件
    text: user 录入或导入原文
    source: user 提供链接/来源记录，system 保存导入途径
    event_at: user 来源时间未知留空
    recorded_at: system
    content_ref: user 明确关联或 system 从真实内容标识匹配
  relations:
  - Activity n-1 Contact
  - Activity n-1 Opportunity optional
  - Activity n-1 Content optional
  note: 复制回复不等于已经发送，已发送必须登记；系统时间与源事件时间分开。
- name: Task
  fields:
  - id
  - created_at
  - business_id
  - target_ref
  - kind
  - reason
  - state
  - due_at
  - source_revision
  - updated_at
  written_by:
    id: system
    created_at: system
    business_id: system
    target_ref: system 从业务动作写入，user 可创建实际跟进任务
    kind: system 或 user
    reason: system 写明变更字段或真实未完成事项
    state: user 处理确认，system 随目标事实变化同步
    due_at: user 明确排期，不自动给每个产品设置日任务
    source_revision: system
    updated_at: system
  relations:
  - Task n-1 Business
  - Task n-1 Content/Opportunity/Product/SKU
  note: 对同一对象同一原因去重；原任务运行日志仍保留，不把智能体运行状态和买家阶段混为一谈。
depends_on:
- name: 模型、业务资料读取、研究与内容流程
  exists_today: true
  until_then: 配置与可用性以当前环境为准，失败如实显示；不得先生成虚假产品事实
- name: 结构化产品/SKU、产品范围快照及变更影响任务
  exists_today: false
  until_then: 本轮为设计与独立示例图，正式系统仍按现有业务资料工作，不宣称已支持结构化 SKU
- name: 产品表格批量导入及规格匹配
  exists_today: false
  until_then: 实现时需预览映射、重复项及错误行；现有附件读取不等于已完成产品导入
- name: 平台消息自动同步、自动发布、实时库存与订单归因
  exists_today: false
  until_then: 依据目前可用的真实证据导入、公开摘要搜索、人工发布登记与咨询记录；首页不显示假库存、GMV 或销量
- name: SKU 渠道商品链接与价格同步
  exists_today: false
  until_then: 手工确认当前报价条件与来源，显示确认时间，不写实时价格
channels:
- name: 今天
  type: today
  weight: primary
  does: 处理真实待办，继续创作和回复
  pages:
  - level: L1
    shows: 按紧急程度排序的待办清单与继续工作区
    actions:
    - 处理
    - 继续创作
    - 生成内容
    - 找客户
    filters:
    - 业务
    - 产品
  - level: L2
    shows: 直接定位原内容、咨询或资料差异
    actions:
    - 完成具体动作
    - 返回原列表
- name: 产品与服务
  type: record
  weight: regular
  does: 整理产品事实、展开规格，查关联内容和需求
  pages:
  - level: L1
    shows: 可展开规格的产品目录，默认产品行
    actions:
    - 添加产品
    - 导入资料
    - 搜索
    - 批量分组
    filters:
    - 分类
    - 可售状态
    - 待核对
  - level: L2
    shows: 产品摘要与资料、规格、相关内容、咨询页签
    actions:
    - 补充资料
    - 为此产品写内容
    - 找相关需求
    - 比较规格
  - level: L3
    shows: 所选规格的差异事实和资料版本抽屉
    actions:
    - 编辑差异
    - 查看来源
    - 核对受影响草稿
- name: 内容
  type: tool
  weight: regular
  does: 选择这次要讲的产品，生成、修改、复制和安排发布
  pages:
  - level: L1
    shows: 按待确认/待发布/已发布分组的内容工作区
    actions:
    - 创作
    - 查历史批次
    filters:
    - 产品
    - 平台
    - 状态
  - level: L2
    shows: 精选列表与正文编辑区，上方明确本次产品范围
    actions:
    - 帮我挑选并写好
    - 改写
    - 复制
    - 排期
    - 导出
    - 查看依据
  - level: L3
    shows: 平台版本或历史发布快照
    actions:
    - 查看原版本
    - 关联咨询
- name: 客户与咨询
  type: record
  weight: regular
  does: 找需求、回复咨询，分别推进同一买家的不同购买需求
  pages:
  - level: L1
    shows: 会话队列与详情双栏，主动找客为同级页签
    actions:
    - 找客户
    - 导入原文
    - 打开会话
    filters:
    - 待回复
    - 产品
    - 需求阶段
    - 来源
  - level: L2
    shows: 原文、产品候选、当前需求和跟进时间线
    actions:
    - 关联产品
    - 确认规格
    - 复制回复
    - 登记已发送
    - 记录成交或回访
  - level: L3
    shows: 联系人名下本次与历史需求记录
    actions:
    - 打开另一需求
    - 记录复购需求
- name: 资料与报告
  type: knowledge
  weight: regular
  does: 读取业务资料，研究需求，生成并回看侦察和诊断报告
  pages:
  - level: L1
    shows: 资料/研究/报告页签，按对象与来源组织
    actions:
    - 上传
    - 补充
    - 研究
    - 生成报告
  - level: L2
    shows: 来源正文或报告阅读器，明确业务/产品范围
    actions:
    - 查看引用
    - 更新
    - 导出 PDF/Word
    - 分享
    - 看版本
- name: 复盘
  type: review
  weight: regular
  does: 沿内容与需求记录核对结果，找出可验证的调整方向
  pages:
  - level: L1
    shows: 有依据的结果摘要与来源明细，不足时提示补充记录
    actions:
    - 按产品筛选
    - 查看来源
    - 记录结果
    - 导出
  - level: L2
    shows: 单产品、内容或需求的来源链和统计窗口
    actions:
    - 查看明细
    - 更正关联
- name: 智能体
  type: tool
  weight: occasional
  does: 在明确业务及产品范围内配置、试运行并看运行记录
  pages:
  - level: L1
    shows: 智能体职责与状态列表
    actions:
    - 创建
    - 启停
    - 看记录
  - level: L2
    shows: 配置、版本、产品范围和账号绑定
    actions:
    - 保存版本
    - 试运行
  - level: L3
    shows: 单次运行的输入快照和结果
    actions:
    - 查看证据
    - 重试
- name: 设置
  type: tool
  weight: occasional
  does: 维护业务信息和现有账号配置，管理员维护模型和成员
  pages:
  - level: L1
    shows: 分组表单，保留原全组聚合入口
    actions:
    - 维护业务
    - 改密码
    - 管理员配置模型与成员
    - 管理员查看全组聚合
  access: 普通用户仅原有自己的设置；全组保持原聚合边界
mvp:
- 产品与服务的产品/可选规格及事实来源
- 内容的品牌/单产品/多产品范围与历史快照
- 客户与咨询的产品关联、未知规格和按需求记录阶段
later:
- 批量产品表格映射与重复合并
- 组合套餐成员映射与版本
- 渠道商品映射和可验证结果接入
preserve:
- 业务档案与附件读取
- 需求研究与关键词
- 侦察/诊断报告及历史导出分享
- 创意筛选、精选内容、改写与多平台版本
- 排期、复制、发布登记和历史
- 主动找客、原文证据、咨询草稿
- 智能体配置、版本、试运行与运行记录
- 权限、管理员设置与全组聚合
visual: 沿当前原型采用清晰浅灰白与克制橙色。产品目录用层级行、内容用编辑区、咨询用会话区。无甲乙方、自营代客、核心业务能力等角色或内部结构标签。
seam:
  type: none
  why: 本轮只定义使用工作台，不新增付费入口
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
- 每平台只出 1 条（此条仍约束拓新判断里的样例下限；存量每次内容批次的硬闸门是 50 条、四类各 ≥20 条外壳，不得回退成轻量今日）
- 没有反馈时写「效果很好」或假的上周数据
- 拓新客户每天强制出可发内容
- 存量客户再走「先用一位、看整份获客档」当每天主路径
- 把尚未合作的判断报告做成 15 条今日可发库存
- 把存量当成拓新成交后的下一阶段
- 成交、有回音、出过判断之后自动改客户种类
- 存量必须先有判断报告才能出今日内容
- 暖象牙纸 + 黄铜印记 + 漆木侧栏的档案室配色（明确要换新的）
- 首页写甲方/乙方、自己经营/为客户服务等身份分类文案
- 强迫每篇内容选 SKU，或把每个 SKU 建成独立业务
- 把一个买家的所有产品需求压成一个购买阶段
- 无订单/库存来源却展示销量、库存或自动履约
- 把整份产品目录无差别注入每次内容和回复
- 多产品内容或咨询直接在各产品重复累计后当作业务总数
exclusion_overrides:
- historical_item: 甲方自助后台（第二期）
  now: 用户明确要求本人经营业务也能直接使用，已解除这一排除；不建立身份分流后台
- historical_item: 成交型电商、餐饮团购核销
  now: 支持多产品、SKU 与成交目标内容；收窄为不新增交易、库存和核销后台
- historical_item: 每平台只出 1 条（此条仍约束拓新判断里的样例下限；存量每次内容批次的硬闸门是 50 条、四类各 ≥20 条外壳，不得回退成轻量今日）
  now: 2026-10-08 已确认每批精选 1–3 篇，优先主平台，其他按需；原数量禁令不再执行
- historical_item: 用别人的反馈给这个销售排打法（进步只吃自己点过的）
  now: 保留隔离；自己的反馈也不自动改写方向，仅作为可选依据与建议
deferred:
- 甲方回传线索成本和在投素材
- 销售自己看个人成交排行（小老板感，他没要）
- 拆成两个独立台子（一个只做判断，一个只做每日内容）——同一销售同一早上，先合在一张桌子上
prototype:
  deliverable: 一张四屏原型板；只含业务操作画面，外部标注原型与示例数据
  screens:
  - 今天：所有产品与实际待办
  - 产品与服务：两个产品及展开的规格
  - 内容：两款产品比较与可选规格
  - 客户与咨询：一次需求比较两款产品，另一历史需求已成交
  review_status: 供评审，不表示生产实现已完成
---

# 多产品业务如何使用 Harta

## 本次调整

用户明确提出“有多个 SKU、多个产品”，此前又明确：使用者可能经营自己的业务，也可能服务客户，界面不应出现甲乙方身份分类。本轮将旧定义从“销售对服务客户出活”调整为“围绕具体业务的产品推进内容和购买需求”。已有业务、报告、历史与权限均保留，正式代码本轮不改。

原先设计中的“合作阶段”不能代替产品运营，更不能代替买家的购买进程。业务范围、产品状态、单次购买需求的阶段、服务协作事项分别记录。界面只展示对当前动作有用的信息。

## 对象关系与操作层级

业务 → 产品 → 规格，是资料归属，不是三层必填导航。业务选择在左上，产品在页面内搜索或筛选，规格只在明确涉及价格、参数或购买选项时展开。目录的产品分组不新增一个必经层级。

- 一个业务可以只有一项服务，没有 SKU；原有资料即可继续生成通用内容。
- 一个产品拥有多个颜色或容量等规格，用户看到“白色 / 标准款”等名称；SKU 编码仅供搜索、导入和核对，不是必填。
- 不同产品各自保存用途、人群与证据；同品规格仅维护差异。不能把 A 产品的卖点或评价借给 B，也不能把白色款价格用于黑色款。
- 品牌定位等确属通用的业务事实可复用；SKU 的明确差异优先于产品默认事实。未填写只代表未知；继承必须写明适用范围，不能用缺省掩盖冲突。
- 组合套餐暂可作为独立产品使用，先保存确认过的服务范围；不因它叫套餐就自动组合价格。组件数量、替代关系及组件变更传播另行细化。
- 同商品不同平台链接优先作为渠道映射；价格、活动时段不同须单独记录条件，不复制成互不关联的产品。

## 一个普通工作日

打开业务“澄光照明”，默认查看全部产品的实际待办：一篇阅读灯草稿因白色款价格更新需要核对，一篇壁灯草稿待确认，张女士的新咨询待回复。这里不因为有 100 个 SKU 就生成 100 个每日任务。

进入产品“阅读灯”，展开白色和黑色两种规格，看参数、资料来源和差异。补充产品通用资料只做一次。系统提出提取结果，用户确认后才成为经营事实。产品表格导入需要预览新建/更新/重复/失败行，不能覆盖同名产品；该导入能力尚待实现。

点“为此产品写内容”，默认带入阅读灯，不再选业务。用户选一个结果目标后即可“帮我挑选并写好”；规格默认“不限定”。只有内容要讲特定规格的价格或承诺时，才提示一个具体问题。“不知道推哪款”可选品牌通用内容，或审阅系统建议；不要悄悄选全目录中的某个 SKU。

如果用户想比较阅读灯与壁灯，在同业务范围内多选两款。内容编辑区始终显示本次产品范围及所用来源；选择新产品不会静默重写已经编辑的正文，需明确重新生成或保留草稿。本次选择与首页筛选分别保存，避免用户以为筛选列表就改了文案对象。

张女士问“书桌边用阅读灯还是壁灯？”，这是一条购买需求比较两款产品，不能拆成两个买家。规格尚未确定时保留“待确认”，回复先比较有依据的使用场景。系统可建议产品关联，附原文；建议不等于用户已选购。对方后来询价白色阅读灯，才关联具体规格并记录条件。

张女士曾买过的另一盏灯仍保留已成交记录及回访；新的比较需求不会把旧成交改回询价。复制回复只是复制，用户在平台实际发送后才登记“已发送”。

## 三种内容范围

| 范围 | 用户什么时候用 | 使用哪些资料 |
| --- | --- | --- |
| 品牌通用 | 讲行业问题、服务理念，暂不推某款 | 业务通用事实；若引用具体产品例子，记录该产品引用 |
| 单产品 | 推一款商品或服务 | 业务通用事实 + 所选产品，规格按需 |
| 多产品 | 比较、选购指南、关联搭配 | 用户选定的产品；引用按产品分开，不能合并成虚假的统一价格 |

“全部产品”只是一种浏览范围，不等于创作时把全产品库塞入上下文。只有一个产品时可以预选并显示名称，但允许改为品牌通用。找客任务和智能体配置同样采用明确的业务及产品范围；任务启动后固定当时的范围和事实快照，新增产品不会自动进入旧任务。

## 产品变更与历史

用户确认价格、规格或可售状态变化后，先计算哪些未发布草稿确实引用了对应事实。只给这些草稿添加“资料已更新，待核对”，已审批但未发布的相关内容也需重新确认。无关草稿不打扰。

发布前若所引用价格过期或条件缺失，只要求确认相关信息，也可移除该承诺继续；不禁止无价格的通用内容。已发布记录保持原文、当时事实和版本，必要时生成更正待办，不直接改写历史。

正式实现第一步做兼容映射：旧 Customer 指向业务，旧内容未绑定产品保持“未关联”，不猜产品、不强迫批量回填；旧报告与链接、ID、作者权限保持。新增产品不拆旧客户档案，不删除旧批次。

## 首屏与导航

主导航是今天、产品与服务、内容、客户与咨询、资料与报告、复盘。智能体和设置置于辅助区域，总计八项。任务运行记录从智能体及具体任务进入，也可通过全局搜索找到；不删除既有记录入口能力。业务目录收进切换器，单业务用户不需要先浏览目录。

跨业务今天可汇总有权访问的待办，每条注明业务名；进入编辑或回复后固定业务，明确切换时保存当前草稿再进入新范围。跨业务不能合并创作或共用发信账号。服务协作按需要出现在业务详情，不向所有用户展示自营/代客标签，也不扩大可见权限。

## 数字如何成立

两篇待确认来自两条真实内容记录，一条待回复来自一个有原文的会话；图中值仅为示例。每天生成成功不意味着今天必须发布；没有排期就不制造逾期。价格核对来自已确认的事实变更及该草稿的实际引用。

比较文可以出现在两个产品的筛选结果里，但业务总文章数按 Content ID 去重。咨询按会话、需求按 Opportunity ID、联系人按 Contact ID 分开统计，均写清单位。产品之间的关联数可能重叠，不能相加充当业务总数。来源不明的咨询保留未知，不从打开了哪个页面或产品筛选反推归因。

营收与订单量没有可核验来源就不显示；用户记录“成交”也不能自动等价订单金额或库存扣减。跨平台身份没有依据时不自动去重。新旧接口未打通时显示最后更新时间和手动记录入口。

## 已经想过但没做的

历史 excluded 和 deferred 完整保留在头部，变化列在 exclusion_overrides；旧规范快照保存在 `.workbench/history/spec-before-products-2026-10-08.md`。

明确继续排除公海抢单、跨成员原文串用、虚假效果、强制诊断前置、交易核销与库存后台。甲方本人直接经营与精选 1–3 篇已被用户后续要求确认，旧规范中的相反限制撤销。旧表格输出数量、旧反馈自动定向和旧视觉锁定不再指导本轮原型。

产品组合映射、平台渠道同步、产品批量表格导入需要分别实现；图片出现入口不表示已经接通。现有研究、公开摘要搜索、原文导入和人工操作继续作为可用路径。

## 给实现方

- 原型阶段已经结束，用户已授权正式实现与 main 提交。以下保留目标设计；已实现功能、数据口径、验证证据与剩余项见 docs/COMMERCE-REVIEW-2026-10-08.md，不以示意图替代真实能力。
- 这是桌面网页；按 home 顺序排首屏。优先呈现实际待办，而不是总客户数、总 SKU 数或等大指标卡。
- channels 是导航；pages 是页面层级及主体形态。产品用可展开目录，内容用编辑器，咨询用会话与需求时间线，不能八个入口全画成表格。
- entities 定义对象与关系，written_by 定义谁写事实；system 字段随实际操作记录，不做成用户每天要填的表单。标为尚未接入的来源不进入真实首屏统计。
- hook 的数字只能来自指定字段；cold_start 提供空态和失联态。示例图外仅标“原型 · 示例数据”；真实界面不塞示例记录。
- 不出现甲方、乙方、自营、代客或核心业务能力等架构说明文案。产品操作使用“产品与服务”“规格”“这次写什么”“关联产品”等用户能行动的词。
- UI 不把 Business→Product→SKU 的数据结构画成每次三步向导。单业务、单产品、无规格自然退化为简单流程；产品筛选在有必要时出现，具体内容范围始终明确。
- 内容与回复记录固化业务、产品/规格范围、事实版本与账号。任何自动推断显示待确认，未知不能随机补齐。
- 原型先验证四屏：今天、多产品目录及规格、两产品比较内容、同买家的不同需求。复用同一组演示对象及名称，保持来源与待办数量一致。
- 空态：提供资料；无匹配：清除筛选；加载：保留结构；导入失败：指出行与字段；保存失败：保留编辑文本；权限不足：明确操作受限且不泄露其他业务内容。
- 窄屏将目录详情与会话详情改为独立视图，保留返回位置；键盘可切换、筛选、展开规格；状态使用文字而不只靠颜色。
- 验证场景：零产品可创建品牌内容；单项服务不用 SKU；百个 SKU 不生成百项待办；同名产品不混资料；同买家多个需求不互改阶段；多产品内容统计去重；过期报价不带入新回复；变更不覆盖已发布快照。

## 最新原型图

![Harta 多产品工作台：今天、产品规格、比较内容与购买需求](/Users/caiwenbin/.codex/generated_images/01a11b11-f974-7f30-82ee-662818cda631/exec-83a0c243-4b02-4e9f-a2e2-803a461bfc01.png)

图中产品、姓名和数量均为示例。静态图用于评审关系与入口；并未验证实际交互、响应式或后台实现。

## 抖音视频与评论原型补充

本节前版把“发现视频／我的视频”放在一起，未突出用户真正要求的其他账号评论找客。以下“目标账号找客”修订为本场景的最新方案；自有视频咨询仍保留在内容发布与咨询承接路径，不混入目标账号入口。

![Harta 抖音视频工作页及视频评论详情](/Users/caiwenbin/.codex/generated_images/01a11b11-f974-7f30-82ee-662818cda631/exec-995deaf9-3a89-4797-8a93-a039a2b43a44.png)

- 入口：客户与咨询 → 找客户 → 平台视频工作页 → 视频详情及评论。内容的实际发布记录也可直达对应自有视频评论；不为每个平台再建一套产品或客户库。
- 视频工作页提供发现视频／我的视频两个视图。上图展开的是发现视频；“我的视频”须按当前业务实际绑定账号及发布记录核实，不能把导入的其他作者视频当作自有作品。未发布脚本留在内容制作流程，不冒充可播放视频。
- 视频行显示封面、标题、作者、时长、原链接、数据来源和实际读取/导入范围。已加载记录的本地筛选与抖音站内搜索分开；站内读取未接通时保留导入入口，不宣称实时采集。原生播放依赖可用视频资源或官方嵌入；不具备时展示封面与“在抖音打开”，不提供假播放器。
- 视频详情并列展示原视频语境和评论。楼中楼保留父评论、回复对象、作者标记；作者答复与一般互动不自动算潜在客户。来源记录 ID 去重，同一人多条评论保留多条证据，不重复创建买家。
- 选中评论后查看原文支持的关注点、候选产品及未确定规格。评论可能指向视频中的其他品牌商品，不能仅凭“多少钱”断定要买当前业务产品；关联需核实。加入跟进前检查现有联系人和需求，避免重复。
- 回复区域明确这是当前视频的公开评论草稿，区别于私信与自有视频咨询回复。复制草稿不代表发送成功；发送能力、执行账号、目标与平台证据另行验证，遵循 PRD 的独立接入要求。
- 当前图仅展示三条一级评论中的部分样例及一条作者回复；“18 条含 6 条回复”代表示例导入总范围，完整实现需加载其余记录并显示覆盖范围，不能宣称覆盖全部平台评论。

当前仍是静态示例原型；自动搜索、评论读取、消息同步及发送没有因本图生成而接通。

## 目标账号找客：本场景最新原型

![Harta 从其他账号的视频评论中发现需求并保存线索](/Users/caiwenbin/.codex/generated_images/01a11b11-f974-7f30-82ee-662818cda631/exec-faaed3b8-640e-41c8-8083-8d57510541d9.png)

用户澄清要“去别的账号里找的客户评论”。默认路径改为：添加或选择目标账号 → 查看该账号的视频 → 阅读原评论及楼中楼 → 核实需求与产品匹配 → 保存线索或排除 → 按需生成联系建议。

- 目标账号是被研究的外部来源，不是绑定登录账号、发送账号或潜在买家。可登记公开主页或来源记录；发现新目标账号的关键词入口与已保存目录并存，实际站内搜索取决于接入。
- 本轮图展示已添加目标账号的目录及视频，不包含“我的视频”。发布后收到的自有咨询走已有内容路径。
- 线索对象是表达需求的评论者；原作者回复只补充上下文。保存时记录账号、视频、评论及父评论的原始标识或链接；来源不全则标记待补，不伪造标识。
- 保存前按真实平台标识检查已有联系人及购买需求；一个人多条评论作为多条证据保留，不按行重复创建客户。需求标签与处理状态分开，一般互动可待审但不能直接当有效线索。
- 具体产品、规格、地域、预算按评论证据或后续人工核实确定；未确定留空。“明确表达需求”不等于对当前商家已表达购买意向。
- “生成联系建议”从已核实事实出发，明确目标与渠道；不默认生成强推商品的广告，不自动发送或冒充作者。执行账号与被研究账号在后续动作确认中分别展示。

本轮仅补充原型，站内读取仍待接通；图中已导入记录与人数均为示例。


## 2026-10-08 实现对照（优先于此前原型交接说明）

主导航已调整为今天、产品与服务、内容、找客户、客户与咨询、业务资料、智能体、设置；诊断报告、跟进复盘、发布与来源、历史会话及全组入口收进报告与记录。既有内容编辑、研究与报告能力继续使用原实现。

业务仍使用原 Customer ID；新增对象保存在同一用户工作区 acquisition 下。产品和可选规格有事实来源与版本，多产品内容和回复保存实际产品范围。联系人按业务及平台身份核实合并，每次购买需求独立记录阶段与证据。

今天仅统计当前业务的已保存记录。产品变更核对按引用产品或规格版本保守触发，目前未做到字段级语义依赖；历史发布保留快照。评论来自人工导入并按目标账号、视频和楼中楼组织，未实现平台实时评论读取、封面拉取或内嵌播放。智能体可按已保存版本、绑定账号、原评论与购买需求起草，平台自动收发保持不可启用。

批量产品导入、自动分配购买需求、跨业务聚合首页、产品指标归因、字段级差异待办与自动接待的调度、连接器、回执等仍为目标设计。它们不在本次已实现清单内。详细检查与验证见 docs/COMMERCE-REVIEW-2026-10-08.md。
