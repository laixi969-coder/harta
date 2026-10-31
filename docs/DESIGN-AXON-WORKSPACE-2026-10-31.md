---
name: Harta · 创作与获客
status: implemented-proposal-superseded-by-2026-10-31-brief
updated: 2026-10-31
reference: 用户提供的 Axon 单屏视频 hero
colors:
  ink: "#1B133C"
  page: "#f5f5f8"
  surface: "#ffffff"
  muted: "#625b72"
  border: "#dcd9e4"
  accent: "#1B133C"
  highlight: "#f97316"
  dark-page: "#15121f"
  dark-surface: "#1d192a"
  dark-ink: "#f2eff9"
  dark-accent: "#ded3fc"
typography:
  body: "Inter, Source Han Sans SC, Source Han Sans, PingFang SC, Microsoft YaHei, sans-serif"
  english-display: "Instrument Serif, Georgia, serif"
  body-weight: 400
  control-weight: 500
  emphasis-weight: 600
  body-line-height: 1.6
  chinese-display-line-height: 1.18
  control-min-height: 44px
---

> 2026-10-31：用户选择经营全貌 + 未来工作室，新的目标规范在 `.workbench/spec.md`。以下记录上一轮已实现方案，不再锁定下一轮布局、颜色与首页重心。

# 设计原则

2026-10-31 功能保留约束：用户明确要求原 Harta 与 Flowso 的功能都要保留并在最终界面呈现；本次改变排版、布局与 UI/UX，不通过删减功能换取简洁。相似能力可合并入口和底层数据，但须逐项证明原有操作、结果、历史与设置仍可到达。只存在于代码或接口、没有可发现入口，不算完成。Flowso 历史数据仍不迁移。

用户明确授权 UI/UX、页面布局和信息架构均可调整。旧设计不是必须遵循的约束；历史规范保存在 `docs/DESIGN-HISTORY-2026-10-31.md`。按真实工作流、用户最新要求和端到端验收迭代，禁止为了遵守旧布局而保留操作障碍。

采用用户指定的 finesse-ui 技能。首页为品牌界面，SOUL 6 / SPECTACLE 4 / DENSITY 3；工作台为产品界面，SOUL 4 / SPECTACLE 1 / DENSITY 7。视觉参考来自用户，Inter、Instrument Serif、白色玻璃及深蓝是明确选择，不用技能的默认审美替换。

## 页面与层级

- 首页：一个全屏视频 hero，半透明导航、清晰中文标题、英文展示字和工作台入口。视频可暂停；减少动态或节省流量时使用静态背景。登录表单出现时暂停背景，保留返回首页。
- 工作台：共用业务选择和主导航。主操作先于辅助说明，数据输入使用稳定背景。全局导航与页内目录作用不同、标签明确。
- 内容获客：只保留一列全局主导航。页头放创作动作，顶部四个标签「内容库、排期与直播、账号复盘、选题与雷达」切换独立工作区，每次只展示当前任务。桌面与手机共用标签，支持方向键与 Home / End；切换保留未保存输入。不得再新增第二列固定导航。
- 制作区：从内容库的对应作品进入脚本、直播和封面制作。当前制作类型的字段优先呈现，不强制填写无关字段。
- 账号复盘：先展示同账号、同窗口的数据，再给待验证建议；建议与事实分开。填入不等于采用，用户修改保存后才能进入创作记忆。旧依据变化时停止使用。
- 主动获客与客户跟进：保留业务上下文、来源、核实状态、草稿及真实发送记录，不把视觉进度冒充采集或发送成功。

## 控件与视觉

深蓝（#1B133C）用于主文字和主要动作；浅灰紫（#f5f5f8）用于工作背景；白色用于控件与内容表面；橙色只用于首页点缀。暗色主题独立定义背景、文字与强调色，不能直接反转。

正文优先可读性；中文展示字不照搬英文紧行高。英文展示字使用 Instrument Serif，正文与控件使用 Inter 加中文字体后备。不要额外添加装饰性仪表盘、虚构指标或没有数据依据的排名。

控件至少 44px，清晰 hover / focus / disabled 状态；表单标签在输入框上方。错误说明原因及下一步，成功反馈与实际保存对应。44px 的交互标准适用于手机与键盘导航。

## 验收

1. 桌面、手机及深浅主题视觉检查。
2. 可见文字和按钮对比至少 4.5:1，键盘焦点可见，跳转后焦点落到目标区域。
3. 视频播放、暂停、减少动态、不可用退化；外部字体失败仍能登录和使用。
4. 内容库、脚本、封面、直播、发布记录、咨询和账号复盘的原有流程回归。
5. 用户未保存输入在页面重渲染时保留；与数据绑定的建议不得用新证据冒充旧草稿的依据。

主要实现为 `css/landing.css`、`css/axon-theme.css` 与 `js/commerce-ui.js`。规范可继续调整，产品目标仍以 `GOAL.md` 为准。
