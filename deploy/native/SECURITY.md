# Harta 服务保护与公网部署

本轮实现的是单进程应用层滥用控制；当前服务仍监听 `127.0.0.1`。没有替用户开公网入口、购买或配置 CDN/WAF，也没有进行公网容量压力测试。Node 限流不能防住打满上游带宽的 DDoS。用户不需要在正常制作内容时看见这些设置。

## 现有部署兼容与管理员初始化

已设密码的管理员和普通用户照常登录。仅**未初始化**的管理员需要在服务环境中预置随机的 `HARTA_SETUP_PASSWORD`（12–128 字符）；首次登录必须输入同一个密码，成功后可以移除环境变量。不要把它写进 Git、日志或示例截图。普通账号由管理员开通后获得 24 小时单次激活码；旧名单中尚未注册的邮箱需要重新发码。重设密码也会生成新的激活码，并撤销旧设备会话。密码改变后当前设备获得新会话，其他设备必须重新登录。移出名单立即撤销会话并阻止再次登录；重新开通已有密码的账号仍使用原密码。

## 应用内已生效

- API 每来源 IP 240 次/分钟，静态资源 600 次/分钟；登录 8 次/10 分钟，注册 5 次/10 分钟；登录/注册另有合计全局 60 次/分钟。429 提供 `Retry-After`（静态资源限流除外）。名单账号之间的昂贵操作额度相互独立。
- 生成、重写、文件分析、模型测试、导出等昂贵操作合计每账号 30 次/小时。同步昂贵请求最多每账号 2 个、整个进程 8 个，直到实际操作结束才释放；后台生成有独立的每账号 2 个、全局 8 个池，两个池总计最多 16 个操作，不声称是共享的全局 8 个。服务重启会重置内存频率限制；多进程部署需要共享限流存储。
- 共享页读取每 IP 30 次/分钟，所有来源合计 120 次/分钟；随机探测不能无限触发工作区扫描。
- IP 限流状态最多 10,000 项，定时清理过期项，满时拒绝新键而不挤掉正在封禁的键。默认不信任请求提供的转发 IP。
- JSON 通常 64KB（事实卡 256KB），仅接受对象和正确媒体类型；超大/损坏/过慢请求分别有 413/400/408。文件上传继续使用原有单文件和总量限制。请求头 15 秒、接收请求 120 秒、空闲 keep-alive 5 秒，最多 256 个连接。接收完的模型处理不受 120 秒上传超时限制。
- 修改操作检查 Origin/Referer/Fetch Metadata，同站不同子域也不能代操作。仅允许本机 Host 和明确配置的公网 Host，防止本机服务被任意域名 DNS 重绑定访问。无这些浏览器头的受控 CLI 仍可用，但仍须会话认证。
- 敏感接口、共享内容、下载禁止存储；静态资源 `no-cache` 配合 ETag/Last-Modified/304，部署改动后会重新核对。隐藏文件、未允许文件类型、跨出公开目录的符号链接不会被提供。
- HTTPS 公网配置自动给会话 Cookie 加 Secure；HttpOnly/SameSite=Lax、禁止嵌入、基础 CSP 和 noindex 响应头默认启用。noindex 是搜索引擎礼貌约定，**不是恶意爬虫认证**。真实业务数据仍以账号权限保护，分享链接应当视作持有者可读取的凭证。

## 公网反向代理接入

设置 `HARTA_PUBLIC_ORIGIN=https://实际域名`。仅当本机反向代理覆盖 `X-Real-IP` 时才设置 `HARTA_TRUST_PROXY=loopback`；不能从互联网原样透传客户端提供的该头。保持 Node、SearXNG、RSSHub 仅本机可达。启用 TLS，并在确认整个域名只用 HTTPS 后由边缘设置 HSTS。

下面是给现有 Nginx TLS 配置合并的示例，需要填实际域名/证书并先 `nginx -t`；本轮没有在用户电脑安装或启用 Nginx：

```nginx
# 放在 http {} 内
limit_req_zone $binary_remote_addr zone=harta_api:10m rate=4r/s;
limit_conn_zone $binary_remote_addr zone=harta_conn:10m;

# 放在已配置 TLS 的 server {} 内
client_header_timeout 15s;
client_body_timeout 30s;
client_max_body_size 125m;
limit_conn harta_conn 20;
limit_req_status 429;

location / {
    proxy_pass http://127.0.0.1:5173;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_request_buffering on;
    proxy_read_timeout 600s;
    proxy_cache off;
}
location /api/ {
    limit_req zone=harta_api burst=40 nodelay;
    proxy_pass http://127.0.0.1:5173;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_request_buffering on;
    proxy_read_timeout 600s;
    proxy_cache off;
}
```

CDN/WAF 接入后，应由源站防火墙只允许边缘入口；边缘绕过 `/api/`、`/p/`、带认证信息/Set-Cookie 的响应缓存，保留 429/Retry-After。若 CDN 后面还有 Nginx，先按 CDN 官方 IP 段配置可信 real-IP 再生成 `X-Real-IP`，不要直接信任全网转发头。请求率、上传体积、挑战规则应先监控再按真实流量调整，避免把同公司共享出口的人或文件上传误拦。至少观察 401/403/413/429/5xx、请求时长、任务数、模型花费、带宽和内存。容量防护需要边缘服务，不应以本地单元测试宣称已完成公网 DDoS 防御。

依据：[Node HTTP 超时与连接配置](https://nodejs.org/api/http.html)、[OWASP CSRF 防护](https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html)、[Nginx 请求限速](https://nginx.org/en/docs/http/ngx_http_limit_req_module.html)、[Nginx 代理缓冲与请求头](https://nginx.org/en/docs/http/ngx_http_proxy_module.html)。
