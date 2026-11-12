# Harta GEO / SEO 审查与实现记录

日期：2026-11-11（America/Los_Angeles）

规范域名：https://www.harta.cn/

产品类型：面向个人经营者和内容团队的 Web 创作与获客工作台

范围：现有落地页、公开路由、抓取策略、产品实体、内容与性能；未改动工作台操作流程。

后续定价实现：已新增 `/pricing/`，当前公开页面与 sitemap 共六页；首发套餐、费用构成与验证见 [定价研究](docs/PRICING-RESEARCH-2026-11-11.md)。下方原始审查测试数保留当时记录，上线时按当前六页核验。

## 当前结论

本轮代码已完成可抓取与可引用的公开站基础建设。原始落地页内容完整保留，新增产品说明与三篇指南。SEO 配置只对公开页面生效，私有工作台、API 和分享内容保留限制。

**尚未上线验证。** 本次环境通过 HTTPS 探测 `https://www.harta.cn/`、`https://www.harta.cn/robots.txt`、`https://harta.cn/` 与裸域 robots，均观察到 Nginx `502 Bad Gateway`。Web 抓取工具也无法访问首页。该结果只能说明本次探测未成功，无法据此断言所有地区均不可用；仍需在实际服务器检查上游进程、监听端口、反向代理和源站连接。502 恢复前，代码优化不能转化为有效收录。

未获得搜索平台账户、线上运行指标及已核实的第三方品牌资料，因此不编造综合 GEO 分数、排名提升、引用率、外部提及量或 Core Web Vitals 成绩。

## 问题与修复

| 优先级 | 原问题 | 本轮处理 | 验证状态 |
| --- | --- | --- | --- |
| P0 | 公网探测返回 502 | 记录服务器排查与上线顺序 | 外部阻碍，待服务器恢复 |
| P0 | 全站 `X-Robots-Tag: noindex, nofollow, noarchive` | 明确公开路由才允许索引；预览及私有页面仍 noindex | 本地 HTTP 回归通过 |
| P0 | 匿名首页 302 到登录页 | 匿名 `/` 直接返回原落地页 HTML 200；登录后仍是工作台 | 登录、退出和旧入口回归通过 |
| P1 | 缺规范 URL、站点地图和抓取入口 | 服务端提供 canonical、robots.txt、sitemap.xml、llms.txt | 内容、类型、GET/HEAD、路由状态通过 |
| P1 | 缺少产品定义和可引用的具体流程 | 增加产品说明和三篇可直接读取的指南，建立内链 | 五页禁用 JavaScript 后仍可读 |
| P1 | 没有结构化产品实体 | 服务端 JSON-LD：Organization、WebSite、SoftwareApplication、WebPage；内页 BreadcrumbList | JSON 解析及实体引用检查通过 |
| P2 | 分享信息不完整、图片继承 noindex | 补全 OG/Twitter、绝对图片 URL、尺寸与 alt，公开图片允许索引 | 200/304 响应策略通过 |
| P2 | 首屏加载约 2.13 MB Three.js 源文件 | 装饰动效接近视口时才加载，减少动态效果时不加载；失败保留原画 | 浏览器网络行为验证通过 |
| P2 | 隐藏登录区带来第二个 H1 | 保留落地页 H1，登录标题改为 H2 | 首页只含一个 H1 |

## 公开页面与搜索意图

| URL 路径 | 内容与搜索意图 | 主要引用信息 |
| --- | --- | --- |
| `/` | Harta、灵鹿线索、内容创作与获客工作台 | 原有产品介绍、两条路径、流程和常见问题 |
| `/product/` | Harta 是什么、适合谁、能做什么 | 产品定义、人群、能力表、素材产出及使用边界 |
| `/guides/content-acquisition/` | 小红书/抖音内容获客、选题和视频脚本 | 真实问题到选题、制作、核对与发布反馈 |
| `/guides/comment-leads/` | 评论线索、需求核实、客户跟进 | 回源核对、区分讨论与需求、记录实际沟通 |
| `/guides/review/` | 发布效果、账号复盘、内容归因 | 实际发布版本、统计窗口、咨询来源与创作假设 |

所有公开产品与指南页面互相链接，落地页页脚可进入各页。页面正文在服务端输出，不依赖爬虫执行 JavaScript。`/product` 等缺斜杠入口 308 到规范路径，保留查询参数。匿名 `/index.html` 302 到首页；已登录入口兼容 `?first=1`、`?platform_connection=return` 等原有工作台参数。

标题与摘要各页独立，canonical 去除查询参数并使用可信环境配置，不接受请求 Host 或转发头生成品牌 URL。正文不堆砌关键词、不隐藏 SEO 文本、不为爬虫提供不同内容。

## 抓取、索引与缓存边界

- 正式站设置 `HARTA_PUBLIC_ORIGIN=https://www.harta.cn` 才开放索引；无配置、本机域名或 HTTP 预览仍 noindex，robots 禁抓，站点地图不含页面。
- robots 使用统一 `User-agent: *`，允许公共内容、样式、脚本和图片；限制 API、分享、工作区及数据路径。未给特定 AI 爬虫单开遗漏私有路径的规则，也没有借此次任务改变模型训练授权政策。
- 登录与注册保持可被读取其 noindex 指令，不放入 sitemap。工作台/API/报告分享继续依靠原有鉴权及访问机制；robots 不是隐私保护机制。
- 首页依会话展示不同内容，所有首页及公开 HTML 都使用 `private, no-store` 与 `Vary: Cookie`。静态图片继续 `no-cache` + ETag/304，200 和 304 索引策略一致。
- `llms.txt` 仅引用公开产品事实与页面，不导出 README、客户数据、内部文档、模型设置或密钥；它是可选发现入口，不承诺被所有 AI 平台使用。
- 未虚构价格、免费试用、评分、公司地址、创始人、社交账号或客户数量；未加入无对应功能的 SearchAction，也未宣称软件富结果资格。
- 保留实际能力边界：平台数据依连接与服务能力；脚本不等于成片；排期、复制与下载不等于自动发布或发送；内容建议不保证业务结果。

## 已执行验证

| 验证 | 结果 |
| --- | --- |
| `npm test` | 119 个测试文件、1137 项测试通过 |
| `npm run test:seo` | 26 项定向检查通过，包含公开文档、真实 HTTP 与既有安全边界 |
| `npm run test:seo-ui` | 桌面 1440px / 手机 390px，五页无 JS 可读、锚点、登录切换、无整页横向溢出、动效延迟加载通过 |
| 爬虫正文一致性 | Mozilla、Googlebot、bingbot、OAI-SearchBot、PerplexityBot、Claude-SearchBot 均返回相同匿名首页 HTML |
| 结构化数据 | JSON 可解析，稳定 `@id` 引用有效；外部 Google Rich Results Test / Schema Validator 待上线验证 |
| 截图检查 | `output/geo-seo/`，检查公开产品页、指南和首页页脚布局 |

定向及浏览器验证都在临时隔离目录运行，不操作真实账号或客户资料，不调用付费模型、发送平台消息或自动发布内容。浏览器验证禁用外部字体，检查系统字体回退。测试结果不代表线上 CDN 配置或实测性能成绩。

## 上线顺序

1. **恢复公网 200。** 在实际服务器检查 Nginx upstream、Harta 服务状态、端口和网络；从外部确认 www 首页及 robots 不再 502。当前会话没有服务器管理连接，未修改公网 Nginx 或服务。
2. 部署本轮代码，并在服务运行环境设置 `HARTA_PUBLIC_ORIGIN=https://www.harta.cn` 后重启 Harta。新内容由 Node 服务提供，无需生成静态 sitemap 文件。
3. 在已配置证书的反向代理层，将裸域及 HTTP 入口 301 到 `https://www.harta.cn`，保留路径与查询参数。应用 Host 白名单继续使用该配置，不放宽未知域名。
4. 让 `/robots.txt`、`/sitemap.xml`、`/llms.txt`、`/product/`、`/guides/` 进入 Node；去掉边缘额外添加的全站 noindex，保留应用按路由返回的策略。首页及带会话请求不缓存，允许真实搜索爬虫访问公开页面；公开文本资源可由现有边缘开启压缩。
5. 用无登录的浏览器确认当前六页 200（含 `/pricing/`）、内容完整、canonical/OG 为 www；robots 与 sitemap 引用同一域名，sitemap 只有六个公开 URL。登录后首页仍是工作台且返回 noindex，报告和 API 不进入索引。
6. 在站点所有者账户验证 Google Search Console 和 Bing Webmaster Tools，提交 `https://www.harta.cn/sitemap.xml` 并检查首页/内页 URL。百度按当前账户开放的普通收录及 sitemap 能力提交。账户权限未提供，本轮未代为提交。

## 后续 30 天

- 第 1 周：完成 502 恢复、部署、规范重定向和站点所有权验证；用真实公网抓取确认没有 CDN 挑战或边缘 noindex。
- 第 2 周：查看 Google/Bing 抓取状态、排除原因、规范 URL 选择及实际搜索词，先修复抓取问题；采集真实移动端性能数据再优化，不按本地文件大小猜测 CWV。
- 第 3 周：仅在获得真实授权资料后，补充运营主体、联系方式、隐私政策、服务条款和官方账号；将已核实且互相关联的品牌主页放入 sameAs。不编造政策或批量制造外部提及。
- 第 4 周：围绕真实用户问题更新指南；若有经同意、可复核的案例，说明场景、过程、时间和结果边界。对照搜索曝光、点击及可确认的 AI 引荐，记录问题与实际引用页面，不把一次 AI 回答当成稳定排名。

## 官方依据

- [Google：AI 搜索功能与网站](https://developers.google.com/search/docs/appearance/ai-features)：抓取、索引、可见文本和与正文一致的结构化数据仍是基础；没有专用 AI 标记要求，也不保证收录。
- [Google：robots.txt 的用途与限制](https://developers.google.com/search/docs/crawling-indexing/robots/intro)：robots 控制抓取，隐藏或保护内容仍需 noindex 或访问控制。
- [OpenAI：爬虫说明](https://developers.openai.com/api/docs/bots)：区分搜索发现与模型训练用途，不将训练抓取开关混作搜索优化。
- [Bing：Sitemaps](https://www.bing.com/webmasters/help/Sitemaps-3b5cf6ed)：站点地图可通过站长工具提交或由 robots 发现。
- [百度：平台工具使用手册](https://ziyuan.baidu.com/college/articleinfo?id=267&page=2)：验证站点后按站点权限与配额使用提交工具。
