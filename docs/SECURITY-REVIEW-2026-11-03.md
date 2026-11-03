# 2026-11-03 安全审查与本轮修复

对照完整工程审查清单逐项过了一遍实际代码与配置。适用项大多已有真实实现（会话管理、限流、租户隔离、备份与恢复验证、上传防护、SSRF 主路径防护均通过审查）；本轮修复审查发现的问题，全部改动已通过 `npm test`（115 个文件 / 1115 个用例）并在本机服务上验证生效。

## 本轮修复

1. **模型输出直达 innerHTML 的 XSS**（js/app.js「上次有效」提示）
   `js/rank-feedback.js` 拼接模型起的 copies 组名，`js/app.js` 的 `win.innerHTML` 未转义，构成"资料/雷达样本污染模型输出 → 存储型 XSS → 拖走该用户工作区"的链路。已在渲染点补 `esc()`，并把前后端两套 `esc`（js/app.js、lib/pack-page.mjs）统一补上单引号转义。CSP 无 script-src 时这是唯一拦截层，后续计划加 nonce。

2. **研究数据源密钥明文落盘**
   `data/research.json` 的 5118/Brave 密钥此前明文存储，与 llm.json/image-model.json 的加密体系不一致。现复用 `lib/secret-config.mjs` 的 AES-256-GCM 与同一把本机密钥：读取时解密、发现明文自动回写加密（server.mjs 启动时迁移）、保存时加密；`lib/backup.mjs` 恢复校验同步覆盖 research.json。已实测：旧明文文件在启动时自动变为 `harta-secret-v1:` 密文，`publicResearchConfig` 与保存接口均不泄露明文。

3. **crawl4ai 抓取路径的 DNS rebinding TOCTOU**
   `deploy/native/crawl.py` 此前按 hostname 缓存"是否公网"的判定，之后 Chromium 自行再解析 DNS，rebinding 域名可让内网地址搭缓存便车。已移除缓存，每个请求重新解析并校验；重定向产生的新请求同样过校验。

4. **CSRF 对"无 Origin/Referer/Sec-Fetch-Site"请求放行**
   `lib/request-guard.mjs` 的 `sameOriginMutation` 此前对三头皆缺的变更请求放行（为照顾无头 CLI）。现改为 fail closed：三头皆缺即 403。现代浏览器和自带 Origin 的脚本（如 scripts/check-live-model.mjs）不受影响；`/api/connector/` 路径不受影响。已线上验证无头 POST 返回 403。

5. **auth.json 权限自愈**
   老版本曾以 0644 写回含密码哈希的 `data/auth.json`。现在每次读取顺手 `chmod 0600`（与 secret-config 同做法），已实测 644 → 600。

6. **备份与数据同盘提醒**
   `scripts/harta-service.mjs` 启动时用 `statfs` 比较备份目录与业务数据是否同一块磁盘，同盘则打印警告。当前本机即同盘（默认 `~/.harta-backups`），且未配置 Time Machine——**待办：将 `HARTA_BACKUP_DIR` 指向外置磁盘或云同步目录**。

7. **关键词导入的不可信文件解析隔离（问题 4）**
   xlsx/docx/pdf 的第三方解析器（ExcelJS、mammoth、pdf-parse、JSZip 解压扫描）从主进程挪进 fork 的子进程：`lib/keyword-file-reader.mjs`（纯解析实现）+ `lib/keyword-file-reader-worker.mjs`（子进程入口）+ `lib/keyword-parser.mjs`（与 materials 相同的 ulimit+独立进程组脚手架，CPU 60 秒 / 写盘 128MB / 256MB 堆）。CSV/TXT 只经过 TextDecoder 和纯字符串处理，留在父进程；docx/pdf 的模型关键词提取仍在父进程（`chatFn` 注入兼容不变）。解压炸弹防护（2000 条目 / 30MB 解压总量）随解析一起进子进程，xlsx 与 docx 都覆盖。解析器命中 CVE 时只损失一个受限子进程，不再直接波及主服务。

8. **敏感操作审计日志（问题 6）**
   新增 `lib/audit.mjs`：append-only JSONL（`data/audit/audit-YYYY-MM.jsonl`，0600/0700），一行一个动作，只记 `{time, actor, action, target, detail}`，不记内容与密钥；写入失败不阻断业务。`data/audit/` 不在备份排除清单里，随每日备份一起留存。埋点集中在 server.mjs：登录成功、注册、改密、白名单增删、管理员重置密码（激活码不落日志）、开启/撤销分享、删除出档、清空资料、内容/关键词导出、LLM/出图/研究数据源配置变更。管理员查询接口 `GET /api/audit?month=YYYY-MM`（仅管理员），设置页新增「操作审计」卡片按月查看。

   附带：CSRF 收紧后，Playwright `context.request`（无浏览器 Fetch Metadata）的 28 个本地验收脚本统一补了 `extraHTTPHeaders:{origin}`（显式覆盖恶意 Origin 的用例不受影响）。

## 验证

- `npm test`：116 文件 / 1116 用例全过（含新增 audit 单测、server-security 的审计端点与关键词子进程解析用例——xlsx/docx/pdf 均真实 fork 子进程解析）。
- 临时目录端到端演练：明文密钥 → 自动加密 → 轮换保存 → 再读取一致，文件权限 600。
- 本机服务重启后实测：login 200、research.json 已加密、auth.json 已 600、无头 POST 403、`/api/audit` 未登录 401。
- 验收脚本：check-security-ui / check-journey-ui / check-platform-controls 通过。**check-commerce-ui 与 check-openfind-manual-api-ui 在干净 HEAD 基线上同样失败（相同断言行），是本轮改动之前就存在的问题，待单独排查。**

## 遗留（需要设计或运维决策，未在本轮实施）

- **CSP 加 script-src（nonce）**：需先给 index.html 内联脚本改 nonce。
- **服务器时区**：lib/today.mjs 用服务器本地时区，异地部署时批次日期会偏移；部署到与用户不同时区的服务器前需改为按用户时区或显式配置。
- **备份外置**：见上，等待指定外置目录。
- **check-commerce-ui / check-openfind-manual-api-ui 历史失败**：与安全修复无关的存量问题，失败点分别为首页「内容获客」标题未渲染和会话列表选中项文案，需要单独排查。
