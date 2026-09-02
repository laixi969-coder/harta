# 打包字体

`wqy-microhei.ttc`（文泉驿微米黑）随仓库分发，作为 PDF 导出的首选中文字体，
这样任何机器（包括没有装系统字体的 Ubuntu 服务器）clone 后即可导出，
无需 `apt install fonts-noto-cjk` 之类的系统操作。

- 来源：Ubuntu `fonts-wqy-microhei_0.2.0-beta-3.1_all.deb`
  （上游 https://sourceforge.net/projects/wqy/files/wqy-microhei/ ）
- 许可：Apache-2.0 或 GPL-3+（含字体嵌入例外），详见 `wqy-microhei-copyright`。
- 代码引用：`lib/report-export.mjs` 的 `CJK_FONT_CANDIDATES`，
  可用环境变量 `HARTA_CJK_FONT` 覆盖为本机任意 TTF/TTC。
