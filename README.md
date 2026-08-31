# 灵鹿增长 HARTA

销售每天用的获客工作台。

```bash
cd /Users/caiwenbin/Harta
node server.mjs
```

打开 http://127.0.0.1:5173/

建档时可以上传图片、PDF、Office 文档、文本和视频，也可以加入公开网页链接。系统会先归档原件、抽取正文、关键画面与视频语音，再形成资料总览、产品/人群/依据、风险和待补信息。

- 视频语音优先复用已配置的千问百炼渠道，自动调用 `qwen3-asr-flash`；没有千问渠道时使用本机 `whisper-cli`。可用 `HARTA_WHISPER_MODEL` 指定 Whisper 模型文件，也会自动查找 `data/models/ggml-{medium,small,base,tiny}.bin`。
- 视频处理需要 `ffmpeg`，旧版 Office、PPT 和表格转换需要 `libreoffice`。
- 管理员可在设置里标记模型的图片能力并执行“图片测试”。分析时当前模型看不懂图片，会自动尝试其他已经配置的视觉模型；全部失败才降级到文字，并明确列出失败原因。
- 没有真正读取到的正文、画面或语音不会被当成诊断依据。
