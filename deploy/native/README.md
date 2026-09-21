# macOS 原生数据服务

不使用 Docker。需要 Node、npm、git、uv 和本机 Google Chrome。安装到被 Git 忽略的 `data/services/`，不会把 Python 依赖装进系统环境。

```sh
node deploy/native/install.mjs
node deploy/native/start.mjs
```

启动脚本注册当前用户的三个 LaunchAgent，登录后自动运行，退出终端不停止。Harta 为 http://127.0.0.1:5173，SearXNG 为 http://127.0.0.1:8080，RSSHub 为 http://127.0.0.1:1200。辅助服务仅监听本机。依赖初次启动需要数秒；在 Harta 设置中测试真实数据连接。

- SearXNG：Google、Bing、Brave、DuckDuckGo 聚合搜索，JSON 接口；上游可能限流或无结果。
- Crawl4AI：按需启动独立 Python 进程，用 Google Chrome 读取前两个公开来源。失败退回基础网页读取器，证据标记区分两种方式。读取公开 5118 首页不等于获得付费关键词数据。
- RSSHub：`/feed` 读取 36 氪最新快讯；`/search?q=业务词` 在这批真实资讯中匹配关键词。范围有限，不是全网历史关键词搜索。当前未启用不稳定的百度/36氪搜索路线。

配置保存在 `data/research.json`，日志位于 `data/logs/`；RSSHub 库的附加日志可能位于 `logs/`。没有配置 5118 和 Brave 的 Key 也能使用上述来源。平台搜索量、完整评论和真实线索不在这些来源的保证范围内。

部分本机代理把公网域名解析为 `198.18.0.0/15` 的 fake IP。只有确实使用这种代理时，才在 `data/native.json` 设置 `{"proxyFakeIp":true}`，再停止并重新启动服务。它仅允许域名的这种代理映射；字面 IP 和普通私网地址仍被浏览器读取器拦截。其他机器默认关闭。单独运行验证脚本时需同样设置环境变量 `HARTA_PROXY_FAKE_IP=1`。

```sh
node deploy/native/stop.mjs
node deploy/native/start.mjs
```

停止不会删除数据。卸载自动启动时，在停止后删除 `~/Library/LaunchAgents/local.harta.app.plist`、`local.harta.search.plist`、`local.harta.rsshub.plist`。

只验证三个原生来源、不调用模型：`node scripts/verify-native-sources.mjs`。本机代理环境同样需 `HARTA_PROXY_FAKE_IP=1`，证据保存至 `data/native-proof.json`。

真实生成验证（调用当前模型，使用虚拟业务，不修改客户）：

```sh
node scripts/verify-research-live.mjs
```

结果写入 `data/research-live-check.json`。模型或网络失败会报错，不能将失败当成验证通过。
