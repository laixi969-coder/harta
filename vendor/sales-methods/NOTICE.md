# Harta 销售方法来源与修改

2026-10-08：`lib/sales-strategy.mjs` 的销售方法参考、改编以下公开资料。上游原文不作为运行时工具权限或系统指令；没有安装外部插件或引入其 CRM 操作逻辑。

- Anthropic, [knowledge-work-plugins](https://github.com/anthropics/knowledge-work-plugins/tree/ae1513ea94dcb74a7f1505ddcf3b0ec3fab327f1/sales), Apache-2.0，完整许可证见 `LICENSE-Anthropic`。参考 sales/skills 下的 draft-outreach、call-prep、competitive-intelligence、handle-objection、deal-advance-gap。保留证据优先、真实顾虑、阶段缺口与可执行下一步的方法，重写为中文公开评论／私信的短会话策略。
- Shaun Marsden, [practical-ai-sales-workflows](https://github.com/shaunmarsden/practical-ai-sales-workflows/tree/5465619a60d418512040aa17c6a8ac5af14d2bc8), MIT，完整许可证和版权见 `LICENSE-practical-sales`。参考 objection-response、real-blocker-diagnosis 和评测量表，补充不虚构承诺、识别真正购买阻碍的规则。

Harta 修改：以独立购买需求选择策略；不按联系人生命周期排除老客户；报价精确读取当前所选 SKU；补充资料先按业务／产品／SKU／确认状态／有效期过滤；拒绝、人工接管、频率限制在服务端执行；不自动发送、修改销售阶段或登记成交。上游声誉和示例评分不代表本实现已验证成交提升。
