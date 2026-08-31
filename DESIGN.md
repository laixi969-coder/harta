---
name: HARTA 灵鹿增长 · 获客工作台
description: 销售每天打开的内部台子。暖象牙纸、墨色、克制黄铜，深浅两套同一套制度。
colors:
  page: "oklch(95.6% 0.016 86)"
  wash: "oklch(97.2% 0.014 88)"
  bg: "oklch(97.8% 0.01 88)"
  border: "oklch(80% 0.022 82)"
  panel-2: "oklch(93.4% 0.018 86)"
  rule: "oklch(58% 0.09 76)"
  ink-1: "oklch(22% 0.018 75)"
  ink-2: "oklch(38% 0.02 72)"
  ink-3: "oklch(38% 0.022 70)"
  accent: "oklch(48% 0.072 76)"
  accent-2: "oklch(62% 0.09 80)"
  accent-soft: "oklch(92% 0.03 82)"
  on-accent: "oklch(97% 0.01 88)"
  rail: "oklch(21% 0.014 58)"
  rail-ink: "oklch(78% 0.018 95)"
  rail-ink-active: "oklch(96% 0.01 88)"
  up: "oklch(40% 0.07 160)"
  down: "oklch(42% 0.12 25)"
  on-photo: "oklch(96% 0.01 88)"
  on-photo-2: "oklch(88% 0.02 88)"
typography:
  display:
    fontFamily: "Noto Sans SC, Source Han Sans SC, PingFang SC, Hiragino Sans GB, Microsoft YaHei, sans-serif"
    fontSize: "1.75rem"
    fontWeight: 600
    lineHeight: 1.35
    letterSpacing: "-0.02em"
  headline:
    fontFamily: "Noto Sans SC, Source Han Sans SC, PingFang SC, Hiragino Sans GB, Microsoft YaHei, sans-serif"
    fontSize: "1.24rem"
    fontWeight: 600
    lineHeight: 1.4
    letterSpacing: "0.01em"
  title:
    fontFamily: "Noto Sans SC, Source Han Sans SC, PingFang SC, Hiragino Sans GB, Microsoft YaHei, sans-serif"
    fontSize: "1.06rem"
    fontWeight: 600
    lineHeight: 1.4
    letterSpacing: "normal"
  body:
    fontFamily: "Noto Sans SC, Source Han Sans SC, PingFang SC, Hiragino Sans GB, Microsoft YaHei, sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.6
    letterSpacing: "normal"
  dense:
    fontFamily: "Noto Sans SC, Source Han Sans SC, PingFang SC, Hiragino Sans GB, Microsoft YaHei, sans-serif"
    fontSize: "0.94rem"
    fontWeight: 400
    lineHeight: 1.6
    letterSpacing: "0.04em"
  meta:
    fontFamily: "ui-monospace, SF Mono, JetBrains Mono, Menlo, Consolas, Noto Sans SC, PingFang SC, monospace"
    fontSize: "0.84rem"
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: "0.02em"
    fontFeature: "tabular-nums"
  label:
    fontFamily: "ui-monospace, SF Mono, JetBrains Mono, Menlo, Consolas, Noto Sans SC, PingFang SC, monospace"
    fontSize: "0.72rem"
    fontWeight: 500
    lineHeight: 1.4
    letterSpacing: "0.12em"
    fontFeature: "tabular-nums"
rounded:
  sheet: "2px"
  flush: "0"
spacing:
  hair: "8px"
  tight: "12px"
  step: "16px"
  block: "24px"
  chapter: "36px"
  group: "48px"
  gutter: "56px"
components:
  button-primary:
    backgroundColor: "{colors.ink-1}"
    textColor: "{colors.bg}"
    typography: "{typography.meta}"
    rounded: "{rounded.sheet}"
    padding: "8px 16px"
    height: "44px"
  button-primary-hover:
    backgroundColor: "{colors.ink-2}"
    textColor: "{colors.bg}"
  button-brass:
    backgroundColor: "transparent"
    textColor: "{colors.ink-1}"
    typography: "{typography.meta}"
    rounded: "{rounded.sheet}"
    padding: "8px 16px"
    height: "44px"
  button-brass-hover:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.on-accent}"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.ink-1}"
    typography: "{typography.meta}"
    rounded: "{rounded.sheet}"
    padding: "8px 16px"
    height: "44px"
  button-inline:
    backgroundColor: "{colors.ink-1}"
    textColor: "{colors.bg}"
    typography: "{typography.label}"
    rounded: "{rounded.sheet}"
    padding: "5px 12px"
    height: "32px"
  toggle-verdict:
    backgroundColor: "transparent"
    textColor: "{colors.ink-2}"
    typography: "{typography.meta}"
    rounded: "{rounded.flush}"
    padding: "8px 0"
    height: "44px"
  toggle-verdict-on:
    backgroundColor: "transparent"
    textColor: "{colors.up}"
  input-field:
    backgroundColor: "{colors.panel-2}"
    textColor: "{colors.ink-1}"
    typography: "{typography.body}"
    rounded: "{rounded.sheet}"
    padding: "11px 14px"
    height: "44px"
  input-field-focus:
    backgroundColor: "{colors.bg}"
    textColor: "{colors.ink-1}"
  nav-item:
    backgroundColor: "transparent"
    textColor: "{colors.rail-ink}"
    typography: "{typography.dense}"
    rounded: "{rounded.flush}"
    padding: "10px 12px"
    height: "44px"
  nav-item-active:
    backgroundColor: "transparent"
    textColor: "{colors.rail-ink-active}"
---

# Design System: HARTA 灵鹿增长 · 获客工作台

## 1. Overview

**Creative North Star: "档案室 The Registry"**

这是一间档案室，不是一个仪表盘。每个销售名下有一柜自己的抽屉，一份客户一份档，出过什么、什么时候出的、当时判断是什么，全在柜子里存着，随时能抽出来看。界面的全部工作是让人快速找到那一屉、抽出来、拿走能用的那几条，然后把结果记回去。所以编号、日期、档位、条数一律走等宽档案体并开表格数字，纸格和函套是柜子里的抽屉与封套，黄铜是柜脚和抽屉牌 —— 是印记，不是装饰。

情绪目标是「坐进集团总部」，不是「进了一家创业公司后台」。说话短、结论在前、不卖弄科技感。密度优先于留白表演：这是一张干活的桌子，销售一天要在上面复制几十条文案、盖几十次回音，所以控件小而准，主操作只有一个，其余全是细线和文字。

这套系统明确拒绝：珊瑚红、freestyle 金按钮、18px 圆角卡片墙、全屏风景图、青绿霓虹、Inter / 默认系统字体堆、渐变数字、图标大楼、毛玻璃、荧光描边。也拒绝所有开屏编排动画 —— 每天早上开一次的台子，不该让人看它一块块拼出来。

**Key Characteristics:**
- 纸面先于界面：分组靠留白、墨阶和纸色带，灰细线不再用于区块分隔，横线只留给黄铜棱和表格纸格
- 圆角只有 2px 和 0，没有第三种
- 一屏一个实心主操作，其余是细线或文字；一屏一条纸色带
- 编号、日期、档位、条数走等宽档案体
- 图只作登录立面和主台信头窄条，从不作全屏壁纸
- 深浅两套同一套制度，只换纸色，不换性格

## 2. Colors: 纸、墨、黄铜、漆木

四种材料，没有第五种。全部色值走 OKLCH，中性色一律往暖色相（70–88）偏，不存在中性灰。

### Primary: 黄铜

- **黄铜印记 accent** `oklch(48% 0.072 76)`：章节名、字段标签、缺口编号、次要动作按钮的描边。永远是文字或线，从不作大面积填色。
- **黄铜棱 rule** `oklch(58% 0.09 76)`：关键分割线。章节线、信头底线、侧栏右边线、当前项。整个台面上只有这一种线是有颜色的，其余都是灰细线。
- **亮铜 accent-2** `oklch(62% 0.09 80)`：仅用于侧栏当前项的左侧 2px 竖标。这是全站唯一允许的竖向标记，因为它标的是导航位置，不是内容状态。
- **铜晕 accent-soft** `oklch(92% 0.03 82)`：仅用于纸格「截谁」那一格的底色，把最该看的那句话托起来。
- **铜上字 on-accent** `oklch(97% 0.01 88)`：黄铜实心时的字色。

### Secondary: 漆木侧栏

- **漆木 rail** `oklch(21% 0.014 58)`：左侧导航栏底色。暖褐黑，和象牙纸同一个色系。深色模式下换成更深的 `oklch(14% 0.01 80)`，性格不变。
- **漆上字 rail-ink** `oklch(78% 0.018 95)` / **当前项 rail-ink-active** `oklch(96% 0.01 88)`：侧栏文字的默认与当前态。

### Tertiary: 回音与红线

- **有回音 up** `oklch(40% 0.07 160)`：唯一的绿。只出现在盖过「有回音」的那条下划线和文字上。从不用于成功提示、图标或装饰。
- **别打谁 down** `oklch(42% 0.12 25)`：唯一的红。用于纸格「别打谁」格的标签与底色、以及表单报错。从不用于删除按钮或警告横幅。

### Neutral: 纸与墨

- **象牙纸 page** `oklch(95.6% 0.016 86)`：整页底色。
- **上缘纸 wash** `oklch(97.2% 0.014 88)`：页面顶部往下的极浅渐变，只为让纸有上下之分。
- **函纸 bg** `oklch(97.8% 0.01 88)`：纸格、甲方包裹这类需要浮起来的纸面。
- **灰细线 border** `oklch(80% 0.022 82)`：所有结构线。1px，永不加粗。
- **墨 ink-1** `oklch(22% 0.018 75)`：正文与标题。绝不使用 `#000`。
- **淡墨 ink-2** `oklch(38% 0.02 72)`：次要正文、可点的文字动作。
- **铅灰 ink-3** `oklch(38% 0.022 70)`：说明、字段名、不可点的标签。

### Named Rules

**The 四材料规则。** 纸、墨、黄铜、漆木。任何新界面上出现第五种材料（尤其是蓝、紫、青绿、荧光）都是错的。语义色只有两个：有回音的绿、别打谁的红，各自只有一个用途，用完即止。

**The 黄铜是印记规则。** 黄铜只出现在三处：标识、当前项、关键分割线。它永远是线或字，永远不是块。一屏上黄铜的总面积超过 2% 就是滥用。

**The 换纸不换性格规则。** 深浅两套共用同一套 token 名、同一套结构、同一套间距。切换主题只换纸色和漆色，不换圆角、不换字重、不换动效、不换任何一处布局。

## 3. Typography

**正文与标题字体：** Noto Sans SC / Source Han Sans SC（回落 PingFang SC、Hiragino Sans GB、Microsoft YaHei）
**档案体：** ui-monospace / SF Mono / JetBrains Mono / Menlo / Consolas，中文回落思源黑

**Character:** 中文一律思源黑，不用宋体、不用 Inter、不用系统默认堆。层级靠字号和字重拉开，不靠换字体。真正制造「公文感」的是第二套字：所有日期、编号、档位、条数、字段名走等宽档案体并开 `tabular-nums`，中文字符自然回落思源黑，于是数字和拉丁字母成列对齐，汉字保持原样。这是这套系统最容易被漏掉、也最关键的一笔。

### Hierarchy

字阶只有六级，正文 1rem 是基准，不进阶梯。任何新界面不得引入第七个字号。

- **Display** (600, 1.75rem, lh 1.35, ls -0.02em)：每页只有一句的页面标题。固定值，不用 `clamp()` —— 产品界面用户在固定 DPI 下看，流体字号只会在窄栏里缩得更难看。唯一例外是甲方包裹的标题，那是对外文件，允许流体。
- **Headline** (600, 1.24rem, lh 1.4)：区块标题。「该截的需求」「缺口」「文案」。
- **Title** (600, 1.06rem, lh 1.4)：条目标题。缺口名、文案组名、历史档标题。
- **Body** (400, 1rem, lh 1.6)：文案原句、正文段落。文案原句（要被复制走的资产）升 500 字重。长文段控制在 65–75ch；数据密集的表格和纸格可以更宽。
- **Dense** (400, 0.94rem, lh 1.6, ls 0.04em)：纸格内正文、侧栏导航、上次有效提示。
- **Meta** (400, 0.84rem, 档案体, tabular-nums)：说明句、账号、条数、控件文字、回音开关。
- **Label** (500, 0.72rem, 档案体, ls 0.12–0.2em, tabular-nums)：字段名、缺口编号、表头、信头、章节名。

### Named Rules

**The 六级规则。** 字号只有 `--t-1` 到 `--t-6` 加正文 1rem。写新组件时从这七个里挑，挑不到就说明层级设计错了，回去改层级，不要加第八个字号。

**The 档案体规则。** 凡是「可以被抄进台账的东西」—— 日期、编号、金额、条数、档位、字段名 —— 一律走档案体。凡是「人说的话」—— 标题、文案、说明 —— 一律走思源黑。判断标准是这行字会不会被人一列列地扫。

## 4. Elevation

**这套系统没有阴影。** `--shadow` 和 `--shadow-lg` 都是 `none`，且是有意为之。深度靠三样东西：暖象牙纸上的一层极淡纸纹（`feTurbulence` 生成的 SVG 噪声，压在 `z-index: -1`，只在纸上，不压字和按钮）、漆木侧栏与象牙纸的明度落差、以及 1px 灰细线与黄铜棱线的层级差。

唯一的例外是「纸」：甲方包裹和登录表单是两张需要浮在页面之上的实体纸，各有一道极扩散的低透明度投影。这不是装饰投影，是纸边。

**审计测试：** 如果一个元素需要投影才能让人看出它是一层，那它的边框、底色或间距设计错了。先改那三样。

### Shadow Vocabulary

- **纸边 paper-shadow**（浅色 `0 1px 0 oklch(100% 0.01 88 / 0.55), 0 18px 40px -28px oklch(28% 0.03 70 / 0.28)`；深色 `0 1px 0 oklch(100% 0.01 88 / 0.04), 0 24px 48px -32px oklch(0% 0 0 / 0.55)`）：只用于甲方包裹和提示条这类「一张纸」。
- **纸侧 gate-form**（`-28px 0 56px oklch(24% 0.03 70 / 0.08)`）：登录页右侧那张纸压在照片立面上的侧边。整站仅此一处。

### Named Rules

**The 无盒子规则。** 禁止 `box-shadow` 作为卡片、按钮、弹层、悬停态的装饰。质感靠纸纹、漆面和黄铜棱线。悬停反馈用颜色和 1px 下划线，不用抬起。

**The 只有块画线规则。** 横线是结构的活，不是条目的活，也不是区块的活。区块之间不画线，靠 36px/48px 的留白和标题字重分；组头不画线，靠组名编号分；历史档逐条不画线，选中时才出现 2px 黄铜线——那时它是状态，不是分隔。常态下的结构线：章节脊的 1px 黄铜竖线（竖排章节名旁）、信头底线（黄铜）、有回音的组和主战场组头的 2px 黄铜棱、表格与纸格的内部结构线、纸色带的明暗边界（不是线，是纸）。

**审计测试：** 数一屏上的通栏横线。灰细线的通栏出现即错；黄铜线一屏不超过四条；表格和纸格的内部线不算。如果一处分隔需要灰线才看得出来，它的间距或字重设计错了，先改那两样。

**The 竖条禁令。** 禁止任何超过 1px 的彩色左/右竖条（包括用 `inset box-shadow` 假装的）。要标记「这一组重要」，用横向黄铜棱线加粗到 2px、用标签文字、用留白，或者什么都不用。唯一豁免是侧栏当前项的 2px 竖标，它标的是导航位置。

## 5. Components

整站控件只有一套高度语言、一套边框语言。同一个动作在两个页面上长得不一样，就有一个是错的。

### Buttons

- **Shape:** 近乎直角（2px）。永不使用胶囊、永不使用 8px 以上圆角。
- **主操作 button-primary:** 实心墨色（`ink-1` 底，`bg` 字），`8px 16px`，最小高 44px，字距 `0.06em`。一屏只允许一个。
- **Hover / Active:** 底色向黄铜偏 12%（`color-mix(in oklch, ink-1 88%, accent)`），180ms；按下 `scale(0.98)`。永不改变尺寸或投影。
- **黄铜次操作 button-brass:** 透明底 + 黄铜描边，hover 才填成黄铜实心。用于「新建客户」这类开新档的动作。
- **幽灵 button-ghost:** 透明底 + 灰细线描边。用于切深浅这类无后果的动作。
- **行内动作 button-inline:** 主按钮的小一档 —— 同样的形状、颜色、状态，字号降到 label，高度 32px。用于每条文案上的「复制这条」。**这一档存在的理由：** 一屏二十个等重黑砖，「一个主操作」就作废了。触屏下（`pointer: coarse`）回到 44px。

### Toggles（回音开关）

- **Style:** 无底、无框，靠一条 1px 灰细下划线表明可点。这是它和旁边说明词唯一的区别，也是必须保留的区别。
- **State:** hover 下划线转 `ink-2`；盖过「有回音」转绿（`up`）、盖过「没反应」转红（`down`），文字同色，文案改成「已记有回音 / 已记没反应」。
- **禁止：** 把说明词和开关做成同样的样子。三个同等淡字并排，用户分不出哪两个能点。

### Cards / Containers

**这套系统没有卡片。** `.card` 这个类名是历史遗留，实际渲染只有留白：卡与卡之间 36px、章节之间 48px，没有顶边线、底色、边框、圆角和投影。分组靠字重、留白和章线，不靠画线。

真正有边框的容器只有两种，各有各的语义：

- **纸格 folio:** 2×2 或 1×3 的网格，1px 灰细线分隔，`bg` 底，`16px 18px` 内边距。用于「该截的需求」四问和投放三段。「截谁」格用铜晕托底，「别打谁」格用极淡红托底。
- **函套 sleeve:** 左侧编号栏（黄铜 label）+ 右侧内容，组内靠留白分条。文案组用横排变体：组头带黄铜档案号（组名自带的 A/B 字母提成档案号；没带字母的组按序补中文数字，与「缺口一」「问一」同构），组名居左、条数在右，有回音的组把底线加粗到 2px 黄铜。组与组间距 48px，组内条与条 20px 且不画线。文案原句（要被复制走的资产）用 500 字重压过操作排；钩子拆解层的引句 500 + ink-2，比资产轻一档。

第三种容器没有边框，是一张纸的明暗：**纸色带 zone**（`--zone`，浅色 `panel-2` 对透明 78% 混合，深色 75%）。「二 · 出活」整章坐在深一档的纸上，通栏负边距出血到台面两缘，无边框、无圆角、无投影、无线，透明混合让纸纹透上来。一页只此一带——上半页读、下半页取用，纸的明暗自己分区；纸色阶的贵重程度和黄铜一样，靠稀少维持。

第四种是一枚章：**关防章 stamp**。黄铜描边、档案体、两行（档位 / 证据级）、`rotate(-3deg)`，盖在「先用」封面行的右端。章是盖上去的，没有一张章是正的；它是这一页唯一的「实物痕迹」，全站不许出现第二枚。

章节的骨架是**章节脊**：章节名竖排（`writing-mode: vertical-rl`）钉在每章左缘，`position: sticky` 跟随滚动，左侧 1px 黄铜竖线。窄屏（≤860px）放不下书脊，回落为横排章节名 + 黄铜底线。

禁止卡片套卡片，禁止三等圆角卡片墙。

### Inputs / Fields

- **Style:** 极淡的填色字段（`panel-2`），无边框、无下划线，2px 圆角，`11px 14px` 内边距，最小高 44px。标签在上方，label 级档案体。
- **Focus:** 底色转 `bg`，边框转黄铜。不发光、不投影。
- **为什么不是下划线：** 下划线字段在两三个字段时很干净，到了十五个字段就是十五条通栏横线，纸变成横格本。填色字段一条线都不画。
- **Password:** 必须配眼睛图标按钮，点一下必须看见明文。
- **Autofill:** 强制覆盖浏览器黄色底，保持 `bg` 底和 `ink-1` 字。

### Navigation

- **侧栏:** 漆木底，固定 244px，粘顶满高，右侧 1px 黄铜边线。项目高 44px、`dense` 级字号、字距 `0.04em`。默认 `rail-ink`，hover 转 `rail-ink-active`，当前项加 2px 亮铜左标。无底色变化、无圆角、无投影。
- **窄屏（≤860px）:** 侧栏转横排，导航项收窄；底部承诺句隐藏；「退出」的上分隔线去掉，否则横排下变成一根悬空短线。

### 信头 Mast（签名组件）

主台内容区顶部一条 92px 的照片窄条，压 `oklch → 0.72` 的暗渐变，底部 1px 黄铜线。左侧「灵鹿增长 · 获客工作台」，右侧今天日期，都走 label 级档案体、`0.18em` 字距、纸上白字。

这是品牌在每一屏上唯一的常驻出场。图在这里是信头，不是氛围灯 —— 它必须被压暗到读得清字，宁可看不出照片内容，也不能让字糊。窄屏降到 56px、`16px` 边距。

## 6. Do's and Don'ts

### Do:

- **Do** 用 OKLCH，中性色一律往暖色相（70–88）偏，chroma 0.01–0.022。
- **Do** 把日期、编号、档位、条数、字段名交给档案体并开 `tabular-nums`。
- **Do** 从 `--t-1` 到 `--t-6` 加正文 1rem 这七个字号里挑。挑不到就回去改层级。
- **Do** 每屏只留一个实心墨色主操作，其余是细线或文字。
- **Do** 让每条能动手的句子看得见下一步：先「复制这条」发出去，用过之后再盖「有回音 / 没反应」。
- **Do** 用留白分组。卡与卡 36px、章节之间 48px、组内条与条 20px，全都不画线。
- **Do** 给能点的文字留一条 1px 下划线，让它和纯说明词在静态下就分得开。
- **Do** 把纸纹压在 `z-index: -1`，只糊纸，不糊字和按钮。
- **Do** 深浅两套走同一套 token 名和同一套结构，只换纸色和漆色。
- **Do** 状态过渡 160–200ms，`cubic-bezier(0.16, 1, 0.3, 1)`。

### Don't:

- **Don't** 用超过 1px 的彩色左/右竖条，包括用 `inset box-shadow` 假装的。
- **Don't** 用 `box-shadow` 做卡片、按钮、悬停的装饰。整站只有「纸边」和「纸侧」两处投影。
- **Don't** 做开屏编排动画：不要 `.card` 逐级 `animation-delay`，不要整页 `rise` 入场。每天开一次的台子不该被人看着拼装。
- **Don't** 用 `clamp()` 做界面字号。唯一例外是甲方包裹的标题。
- **Don't** 用珊瑚红、freestyle 金按钮、18px 圆角卡片墙、全屏风景图、青绿霓虹、Inter / 默认系统字体堆、渐变数字、图标大楼。
- **Don't** 用毛玻璃、荧光描边、渐变文字（`background-clip: text`）。
- **Don't** 用宋体写中文。中文一律思源黑。
- **Don't** 把图铺成全屏壁纸。图只有两个位置：登录左侧立面、主台信头窄条。
- **Don't** 做卡片套卡片、三等圆角卡片墙，或者用一排横线把纸切成表。
- **Don't** 给列表条目或区块分隔画通栏横线。条靠留白分，区块也靠留白分；横线只属于章节、信头、表格纸格和黄铜印记。
- **Don't** 用下划线做输入框。两个字段好看，十五个字段就是横格本。
- **Don't** 让三个同等淡字并排，也不要每行三个空心按钮。
- **Don't** 在同一界面里出现第二套控件高度或第二套边框语言。
- **Don't** 把「白名单」「超管」「API Key」这类内部机制词写进销售看得见的界面。
- **Don't** 在甲方看的任何一页上写「AI」。
- **审计测试：** 数一屏上的通栏横线。灰细线通栏出现即错，黄铜线一屏不超过四条。如果一个元素需要投影才能让人看出它是一层，它的边框、底色或间距就设计错了。如果一屏上黄铜面积超过 2%，黄铜就被滥用了。如果一屏上有第七个字号，层级就设计错了。
