// Product policy: draft generation and manual handoff remain; no platform execution.
export function manualPlatformOnly() {
  throw Object.assign(new Error('平台托管、自动回复与代发已关闭，请复制草稿或下载素材后自行发送和发布。'), { statusCode: 410 });
}
