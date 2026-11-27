# 创作原文与成品评测

运行 `node scripts/evaluate-creation-evidence.mjs` 可检查培训、家装、电商三组问题。每组将唯一依据分别放在文首、中段、文末，混入近似规格、过期条款、已归档材料及其他业务的记录。程序核对前五段的原句、适用例外、文档版本和字符位置，再用成稿中新出现的承诺发起第二次检索。传播、获客与成交使用独立目标。离线输出中 `issues: null` 表示未请求模型。

使用 `node scripts/evaluate-creation-evidence.mjs --live` 会对同一批合成材料调用当前模型写稿、核对成稿及预置的错误承诺，并消耗模型额度。只运行需要复验的模型任务时，原有制作矩阵还可用 `node scripts/check-content-matrix-live.mjs 17` 按序号执行。场景 1–16 保留原来的编号，17–32 覆盖传播与成交。付费运行由操作者选择。

可在现有 Promptfoo 工作流使用 `evals/creation/promptfooconfig.json`。默认使用本地规则。`HARTA_CREATION_EVAL_LIVE=1` 启用真实模型分支。报告中应标明执行模式。自动检查反映原文检索、隔离及审读表现，经营者采用和发布后效果需实际观察。

## 离线盲评

用下面的命令为同一个问题的两份稿件准备盲评页。每组输入包含 `id`、`topic`、`baseline` 和 `candidate`，稿件正文请使用清洁文本，删除能直接透露版本的批注。也可把输入文件换成 `--synthetic` 练习完整流程。

```sh
node scripts/creation-blind-review.mjs prepare pairs.json blind-round
```

只给评审者 `blind-round/创作盲评.html`。每题随机分配 A/B，仅组织者持有记录当时两份正文及版本指纹的 `分组密钥.json`。评审者可以选任一稿、两稿相当、都不采用，或跳过。两份稿均可分别记录改稿和实拍分钟，支持计时或手填。未填写的项保留为空。页面可在本地打开，无需服务器或账号。

收回评审者主动下载的记录后，在本机解盲。

```sh
node scripts/creation-blind-review.mjs decode blind-round/分组密钥.json 评审记录.json 解盲结果.json
```

解盲结果保留本题编号、选择、当时的正文指纹和两份稿各自的用时。只把真实经营者实际提交的记录用于衡量采用和效率。

## 平台成稿对照

同一组虚构的厨房收纳资料、题目、候选和写作响应，分别通过历史版本 `afd7671` 与当前的一键生成入口。题目是「盒子放得进，为什么柜门关不上？」。两版都先教读者慢慢合上柜门，辨认碰撞点，盒身顶到铰链时量可用净宽。

| 合成成稿 | 读者看到的最后一句 |
| --- | --- |
| 历史版本 | 欢迎私信咨询。 |
| 当前版本，商家已确认平台私信入口 | 如果柜门还会卡住，私信说一下，是盒盖碰到门边，还是盒身顶到铰链？ |

用 `npx vitest run lib/creative-flow.test.mjs lib/lead-delivery.test.mjs lib/growth-workspace.test.mjs` 复验。对照覆盖小红书获客图文正文及末页、抖音传播兼获客视频正文及末镜、可复制成稿和视频行动提示。其他回归覆盖没有可用入口时改用现场自查、保留手写字段及传播目的。写作和事实审读响应由夹具固定，经营者选稿、改稿与拍摄用时、实际咨询结果待真实使用后填写。
