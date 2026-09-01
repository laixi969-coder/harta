---
name: HARTA 灵鹿增长 · 获客工作台
description: 销售每天打开的内部台子。冷青石灰纸、青绿主色、一枚朱红印，深浅两套同一套制度。
colors:
  page: "oklch(93.8% 0.014 185)"
  wash: "oklch(96.2% 0.01 185)"
  bg: "oklch(98.4% 0.006 185)"
  border: "oklch(78% 0.02 185 / 0.55)"
  panel-2: "oklch(94.6% 0.012 185)"
  rule: "oklch(42% 0.08 185)"
  ink-1: "oklch(18% 0.028 195)"
  ink-2: "oklch(36% 0.022 195)"
  ink-3: "oklch(48% 0.02 195)"
  accent: "oklch(42% 0.078 185)"
  accent-2: "oklch(54% 0.13 42)"
  accent-soft: "oklch(93% 0.028 185)"
  on-accent: "oklch(98% 0.008 185)"
  rail: "oklch(16% 0.022 195)"
  rail-ink: "oklch(74% 0.024 185)"
  rail-ink-active: "oklch(97% 0.01 185)"
  up: "oklch(46% 0.09 165)"
  down: "oklch(48% 0.15 25)"
  on-photo: "oklch(97% 0.01 185)"
  on-photo-2: "oklch(88% 0.02 185)"
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
  sheet: "12px"
  control: "8px"
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
    backgroundColor: "{colors.accent}"
    textColor: "{colors.on-accent}"
    typography: "{typography.meta}"
    rounded: "{rounded.control}"
    padding: "8px 16px"
    height: "44px"
  button-primary-hover:
    backgroundColor: "color-mix(in oklch, accent 82%, ink-1)"
    textColor: "{colors.on-accent}"
  button-clay:
    backgroundColor: "transparent"
    textColor: "{colors.accent-2}"
    typography: "{typography.meta}"
    rounded: "{rounded.control}"
    padding: "8px 16px"
    height: "44px"
  button-clay-hover:
    backgroundColor: "{colors.accent-2}"
    textColor: "{colors.on-accent}"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.ink-1}"
    typography: "{typography.meta}"
    rounded: "{rounded.control}"
    padding: "8px 16px"
    height: "44px"
  button-inline:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.on-accent}"
    typography: "{typography.label}"
    rounded: "{rounded.control}"
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
    rounded: "{rounded.control}"
    padding: "10px 12px"
    height: "44px"
  nav-item-active:
    backgroundColor: "color-mix(in oklch, accent 22%, transparent)"
    textColor: "{colors.rail-ink-active}"
---

# Design System: HARTA 灵鹿增长 · 获客工作台

## 1. Overview

**Creative North Star: "冷青台面 The Cool Desk"**

这是一张集团总部的工作台，不是档案室，也不是创业公司后台。纸是冷青石灰色，主色是青绿，印记只留一枚朱红——有回音、当前项、盖在封面上的那一章。销售每天早上打开两列待办：左边存量今天该发，右边拓新该判断。界面的工作是让人坐下就能抄走能发的句子、点出有没有回音、给资料齐的人出一份判断。

情绪目标仍是「坐进集团总部」，不是「进了一家 SaaS」。说话短、结论在前、不卖弄科技感。密度优先于留白表演：控件准，主操作实心青绿，次操作朱红描边。卡片有底、细边和淡投影，用来托住一块活，不是用来砌墙。

这套系统明确拒绝：暖象牙纸、黄铜、漆木档案室、后台蓝、珊瑚红、青绿霓虹、全屏风景图、毛玻璃、荧光描边、Inter / 默认系统字体堆。也拒绝所有开屏编排动画 —— 每天早上开一次的台子，不该让人看它一块块拼出来。

**Key Characteristics:**
- 冷青石灰纸面，中性色一律往青（色相 185–200）偏
- 圆角 12px，控件 8px；列表行和文字开关保持直角
- 卡片有底、半透明边、淡投影；今天双列用色温差分开，不套第三层卡片
- 一屏一个实心青绿主操作，朱红只作印记
- 编号、日期、档位、条数走等宽台账体
- 图只作登录立面和主台信头窄条，从不作全屏壁纸
- 深浅两套同一套制度，只换纸色，不换性格

## 2. Colors: 冷青纸、青绿、朱红印、炭灰侧栏

四种材料。全部色值走 OKLCH，中性色一律往青色相（185–200）偏，不存在中性灰，也不走暖象牙。

### Primary: 青绿

- **青绿 accent** `oklch(42% 0.078 185)`：主按钮填色、章节名、字段标签、缺口编号。主操作允许大面积填色。
- **青绿棱 rule** `oklch(42% 0.08 185)`：关键分割线。章节线、当前组、主战场组头。
- **青晕 accent-soft** `oklch(93% 0.028 185)`：选中底、焦点、纸格「截谁」那一格的托底。
- **青上字 on-accent** `oklch(98% 0.008 185)`：青绿实心时的字色。

### Secondary: 朱红印

- **朱红 accent-2** `oklch(54% 0.13 42)`：有回音、侧栏当前项左边线、关防章描边、次要动作（「新建客户」）描边。永远是印记，不作大面积填色。
- 一屏上朱红总面积超过约 2% 就是滥用。

### Tertiary: 炭灰侧栏

- **炭灰 rail** `oklch(16% 0.022 195)`：左侧导航栏底色。冷炭灰，和石灰纸同一个青系。深色模式下换成更深的 `oklch(11% 0.016 200)`。
- **栏上字 rail-ink** `oklch(74% 0.024 185)` / **当前项 rail-ink-active** `oklch(97% 0.01 185)`：侧栏文字的默认与当前态。当前项加青绿浅底 + 朱红左边线。

### 回音与红线

- **有回音 up** `oklch(46% 0.09 165)`：盖过「有回音」的下划线和文字。从不用于成功提示、图标或装饰。
- **别打谁 down** `oklch(48% 0.15 25)`：纸格「别打谁」格、表单报错。从不用于删除按钮或警告横幅。

### Neutral: 纸与墨

- **石灰纸 page** `oklch(93.8% 0.014 185)`：整页底色。
- **上缘纸 wash** `oklch(96.2% 0.01 185)`：页面顶部往下的极浅渐变。
- **台面纸 bg** `oklch(98.4% 0.006 185)`：卡片、纸格、甲方包裹。
- **灰细线 border** `oklch(78% 0.02 185 / 0.55)`：半透明结构线。
- **墨 ink-1** `oklch(18% 0.028 195)`：正文与标题。绝不使用 `#000`。
- **淡墨 ink-2** `oklch(36% 0.022 195)`：次要正文、可点的文字动作。
- **铅灰 ink-3** `oklch(48% 0.02 195)`：说明、字段名、不可点的标签。

### Named Rules

**The 四材料规则。** 冷青纸、青绿、朱红印、炭灰侧栏。任何新界面上出现第五种材料（尤其是黄铜、暖象牙、后台蓝、荧光）都是错的。语义色只有两个：有回音的绿、别打谁的红，各自只有一个用途，用完即止。

**The 朱红是印记规则。** 朱红只出现在有回音、当前项、章印、次要动作描边。它永远是线或字，永远不是块。

**The 换纸不换性格规则。** 深浅两套共用同一套 token 名、同一套结构、同一套间距。切换主题只换纸色和栏色，不换圆角、不换字重、不换动效、不换任何一处布局。

## 3. Typography

**正文与标题字体：** Noto Sans SC / Source Han Sans SC（回落 PingFang SC、Hiragino Sans GB、Microsoft YaHei）
**台账体：** ui-monospace / SF Mono / JetBrains Mono / Menlo / Consolas，中文回落思源黑

**Character:** 中文一律思源黑，不用宋体、不用 Inter、不用系统默认堆。层级靠字号和字重拉开，不靠换字体。真正制造「公文感」的是第二套字：所有日期、编号、档位、条数、字段名走等宽台账体并开 `tabular-nums`，中文字符自然回落思源黑，于是数字和拉丁字母成列对齐，汉字保持原样。这是这套系统最容易被漏掉、也最关键的一笔。

### Hierarchy

字阶只有六级，正文 1rem 是基准，不进阶梯。任何新界面不得引入第七个字号。

- **Display** (600, 1.75rem, lh 1.35, ls -0.02em)：每页只有一句的页面标题。固定值，不用 `clamp()` —— 产品界面用户在固定 DPI 下看，流体字号只会在窄栏里缩得更难看。唯一例外是甲方包裹的标题，那是对外文件，允许流体。
- **Headline** (600, 1.24rem, lh 1.4)：区块标题。「该截的需求」「缺口」「文案」。
- **Title** (600, 1.06rem, lh 1.4)：条目标题。缺口名、文案组名、历史档标题。
- **Body** (400, 1rem, lh 1.6)：文案原句、正文段落。文案原句（要被复制走的资产）升 500 字重。长文段控制在 65–75ch；数据密集的表格和纸格可以更宽。
- **Dense** (400, 0.94rem, lh 1.6, ls 0.04em)：纸格内正文、侧栏导航、上次有效提示。
- **Meta** (400, 0.84rem, 台账体, tabular-nums)：说明句、账号、条数、控件文字、回音开关。
- **Label** (500, 0.72rem, 台账体, ls 0.12–0.2em, tabular-nums)：字段名、缺口编号、表头、信头、章节名。

### Named Rules

**The 六级规则。** 字号只有 `--t-1` 到 `--t-6` 加正文 1rem。写新组件时从这七个里挑，挑不到就说明层级设计错了，回去改层级，不要加第八个字号。

**The 台账体规则。** 凡是「可以被抄进台账的东西」—— 日期、编号、金额、条数、档位、字段名 —— 一律走台账体。凡是「人说的话」—— 标题、文案、说明 —— 一律走思源黑。判断标准是这行字会不会被人一列列地扫。

## 4. Elevation

深度靠四样：冷青纸纹、炭灰侧栏与石灰纸的明度落差、卡片的淡投影、朱红/青绿棱线。纸纹仍压在 `z-index: -1`，只糊纸，不糊字和按钮。

卡片、主按钮、登录表单、提示条允许投影。投影必须带青调，禁止纯黑阴影。列表行、文字开关、章节脊不加投影。

### Shadow Vocabulary

- **台面 shadow**（浅色 `0 1px 2px oklch(18% 0.03 195 / 0.06), 0 10px 28px -18px oklch(18% 0.03 195 / 0.22)`）：卡片、主按钮。
- **浮层 shadow-lg**：提示条、需要抬起来的纸。
- **纸边 paper-shadow**：甲方包裹这类「一张纸」。
- **纸侧 gate-form**（`-28px 0 56px oklch(18% 0.04 195 / 0.14)`）：登录页右侧那张纸压在照片立面上的侧边。整站仅此一处。

### Named Rules

**The 卡片托住一块活。** `.card` 有底、半透明边、12px 圆角、淡投影。今天页外层 `#desk-card` 自己不再画一层，只让左右两列各自成卡，避免卡片套卡片。

**The 只有块画线规则。** 横线是结构的活，不是条目的活。区块之间主要靠留白和卡片；组头不画线，靠组名编号分；历史档逐条不画线，选中时才出现 2px 青绿线——那时它是状态，不是分隔。有回音的组和主战场组头用 2px 棱。表格与纸格保留内部结构线。

**The 竖条克制。** 禁止把整列刷成色条。唯一常驻竖标是侧栏当前项的朱红左边线。

## 5. Components

整站控件只有一套高度语言、一套边框语言。同一个动作在两个页面上长得不一样，就有一个是错的。

### Buttons

- **Shape:** 8px 圆角（`--r-sm`）。不用胶囊，不用 24px 以上大圆角。
- **主操作 button-primary:** 实心青绿（`accent` 底，`on-accent` 字），`8px 16px`，最小高 44px。一屏只允许一个实心主操作。
- **Hover / Active:** 底色向墨偏（`color-mix(in oklch, accent 82%, ink-1)`），180ms；按下 `scale(0.98)`。
- **朱红次操作 button-clay:** 透明底 + 朱红描边，hover 才填成朱红实心。用于「新建客户」这类开新档的动作。
- **幽灵 button-ghost:** 透明底 + 灰细线描边。用于切深浅这类无后果的动作。
- **行内动作 button-inline:** 主按钮的小一档，高度 32px。用于每条文案上的「复制这条」。触屏下（`pointer: coarse`）回到 44px。

### Toggles（回音开关）

- **Style:** 无底、无框，靠一条 1px 灰细下划线表明可点。这是它和旁边说明词唯一的区别，也是必须保留的区别。
- **State:** hover 下划线转 `ink-2`；盖过「有回音」转绿（`up`）、盖过「没反应」转红（`down`），文字同色，文案改成「已记有回音 / 已记没反应」。
- **禁止：** 把说明词和开关做成同样的样子。三个同等淡字并排，用户分不出哪两个能点。

### Cards / Containers

**卡片托住一块活。** `.card` 有 `bg` 底、半透明边、12px 圆角、淡投影。卡与卡之间约 20px。禁止卡片套卡片：今天页外层不画卡，只让「今日该发 / 该判断」两列各自成卡，左列陶土浅底、右列青绿浅底。

真正有内部结构的容器还有两种：

- **纸格 folio:** 2×2 或 1×3 的网格，1px 灰细线分隔，`bg` 底。用于「该截的需求」四问和投放三段。「截谁」格用青晕托底，「别打谁」格用极淡红托底。
- **函套 sleeve:** 左侧编号栏（青绿 label）+ 右侧内容，组内靠留白分条。文案组用横排变体：组头带档案号，有回音的组把底线加粗到 2px 朱红/青绿棱。组与组间距 48px，组内条与条 20px 且不画线。

第三种容器是一张纸的明暗：**纸色带 zone**。「二 · 出活」整章可以坐在深一档的纸上，通栏负边距出血到台面两缘。

第四种是一枚章：**关防章 stamp**。朱红描边、台账体、两行（档位 / 证据级）、微微倾斜，盖在封面行的右端。章是盖上去的，没有一张章是正的。

章节的骨架是**章节脊**：章节名竖排钉在每章左缘，左侧 1px 青绿竖线。窄屏（≤860px）回落为横排章节名 + 底线。

### Inputs / Fields

- **Style:** 极淡的填色字段（`panel-2`），默认无可见边框，12px 圆角，`11px 14px` 内边距，最小高 44px。标签在上方，label 级台账体。
- **Focus:** 底色转 `bg`，边框转青绿。不发光。
- **为什么不是下划线：** 下划线字段在两三个字段时很干净，到了十五个字段就是十五条通栏横线，纸变成横格本。填色字段一条线都不画。
- **Password:** 必须配眼睛图标按钮，点一下必须看见明文。
- **Autofill:** 强制覆盖浏览器黄色底，保持 `bg` 底和 `ink-1` 字。

### Navigation

- **侧栏:** 冷炭灰底，固定 244px，粘顶满高，右侧 1px 青绿边线。项目高 44px、8px 圆角。默认 `rail-ink`，hover 转 `rail-ink-active`，当前项青绿浅底 + 朱红左边线。
- **窄屏（≤860px）:** 侧栏转横排，导航项收窄；「退出」的上分隔线去掉，否则横排下变成一根悬空短线。

### 信头 Mast（签名组件）

主台内容区顶部一条 88px 的照片窄条，压冷青暗渐变。左侧「灵鹿增长 · 获客工作台」，右侧今天日期，都走 label 级台账体、`0.18em` 字距、纸上白字。

这是品牌在每一屏上唯一的常驻出场。图在这里是信头，不是氛围灯 —— 它必须被压暗到读得清字，宁可看不出照片内容，也不能让字糊。窄屏降到 56px、`16px` 边距。

## 6. Do's and Don'ts

### Do:

- **Do** 用 OKLCH，中性色一律往青色相（185–200）偏，chroma 0.006–0.028。
- **Do** 把日期、编号、档位、条数、字段名交给台账体并开 `tabular-nums`。
- **Do** 从 `--t-1` 到 `--t-6` 加正文 1rem 这七个字号里挑。挑不到就回去改层级。
- **Do** 每屏只留一个实心青绿主操作，朱红只作印记。
- **Do** 让每条能动手的句子看得见下一步：先「复制这条」发出去，用过之后再盖「有回音 / 没反应」。
- **Do** 用卡片托住一块活，用留白分条。今天双列靠色温差分开。
- **Do** 给能点的文字留一条 1px 下划线，让它和纯说明词在静态下就分得开。
- **Do** 把纸纹压在 `z-index: -1`，只糊纸，不糊字和按钮。
- **Do** 深浅两套走同一套 token 名和同一套结构，只换纸色和栏色。
- **Do** 状态过渡 160–200ms，`cubic-bezier(0.16, 1, 0.3, 1)`。

### Don't:

- **Don't** 回到暖象牙纸、黄铜、漆木档案室。
- **Don't** 用纯黑阴影、毛玻璃、荧光描边、渐变文字。
- **Don't** 做开屏编排动画：不要 `.card` 逐级 `animation-delay`，不要整页 `rise` 入场。每天开一次的台子不该被人看着拼装。
- **Don't** 用 `clamp()` 做界面字号。唯一例外是甲方包裹的标题。
- **Don't** 用后台蓝、珊瑚红、青绿霓虹、全屏风景图、Inter / 默认系统字体堆、渐变数字、图标大楼。
- **Don't** 用宋体写中文。中文一律思源黑。
- **Don't** 把图铺成全屏壁纸。图只有两个位置：登录左侧立面、主台信头窄条。
- **Don't** 做卡片套卡片、三等大圆角卡片墙，或者用一排横线把纸切成表。
- **Don't** 给列表条目画通栏横线。条靠留白分；横线只属于章节、表格纸格和印记状态。
- **Don't** 用下划线做输入框。两个字段好看，十五个字段就是横格本。
- **Don't** 让三个同等淡字并排，也不要每行三个空心按钮。
- **Don't** 在同一界面里出现第二套控件高度或第二套边框语言。
- **Don't** 把「白名单」「超管」「API Key」这类内部机制词写进销售看得见的界面。
- **Don't** 在甲方看的任何一页上写「AI」。
- **审计测试：** 今天双列必须一眼分出左暖右冷。朱红面积超过约 2% 就是滥用。卡片套卡片即错。如果一屏上有第七个字号，层级就设计错了。
