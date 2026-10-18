# OpenFind embedded acquisition engine

Source: https://github.com/laixi969-coder/openfind
Pinned commit: 1c214229aa6d7cddf0bdd18c0885953eaa19f96b (retrieved 2026-10-17).
The repository owner requested integrating this engine into Harta. Upstream source and README are preserved here; the repository does not include a separate LICENSE file.

Harta adaptations:
- Playwright imports resolve to the existing playwright-core dependency; optional executable and headless configuration.
- OPENFIND_EMBEDDED suppresses upstream's fixed-port listener.
- platforms/client.ts dispatches to the same browser operations within the isolated worker instead of the standalone browser-service HTTP daemon.
- Login opens the visible official login control when needed; headless Douyin uses Playwright default launch arguments.
- loginPointer targets the same official page as the screenshot, allowing QR/login/challenge interaction inside Harta.
- Douyin search verifies the hydrated keyword before trusting the filter shell; empty exhausted searches reset response tracking before retrying.
- Shared Harta demand expressions and exact seven-day eligibility; workflow work-format selection and topic-aware sampling.
- Comment hydration supports the Douyin comments tab; pagination targets the comment pane and tracks expanded reply controls. Unknown Douyin comment counts remain unknown.
- Full upstream React UI is built as an isolated Harta workbench, with authenticated business-scoped API transport; main Harta keeps its existing stack.
- Native publishing/prepare/reconcile, drafts, media, exports, accounts, collection policy, sales case/profile/summary and optional semantic review endpoints use the same scoped worker. No private messaging endpoint is added.
- Cover and gallery URLs are preserved in Harta; public platform CDN assets are validated against the current store and fetched over TLS without credentials or redirects. Legacy HTTP CDN addresses are upgraded to HTTPS.
- Draft ZIPs include actual images. Uploaded video and binary exports stream through the authenticated bridge; credentials are never returned in snapshots.
- Parent workbench navigation preserves business context; note/comment/lead actions hand off to Harta evidence review, content references and existing customer follow-up.
- Original card hover interception and download navigation are corrected; accessible image fallbacks and gallery controls added.

Each business runs in a separate child process with a separate SQLite database and Chrome profile. Native screenshots and login state stay scoped to the signed-in Harta user and selected business. Do not commit the runtime data directories.

Sales case revisions sync only to already verified Harta contacts, preserving original evidence. Opt-out and Harta contact blocks propagate without auto-resuming contact. Model review transport supports upstream configurable deadlines.

Workbench state refreshes every 3 seconds and connection/budget panels every 8 seconds, avoiding duplicate upstream polls exhausting Harta's existing API rate limit across tabs.


2026-10-18 Harta 补充适配：语义复核复用宿主当前渠道和模型（不复制共享密钥），配置指纹隔离缓存，引用校验可有界重试；当前有效复核证据同步到宿主需求与客户页面。补充作品库范围、详情深链接、大图预览和键盘操作；宿主原生作品库/详情/参考选择同步补齐媒体交互，已保存素材不依赖采集引擎存活。
