// Harta embedded transport. Same upstream browser operations, isolated in one worker per business.
import * as browser from './browser.ts';
export async function browserCall<T>(path: string, body?: any, signal?: AbortSignal): Promise<T> {
  signal?.throwIfAborted();
  const platform = body?.platform;
  if (path === '/connections') return ['xiaohongshu', 'douyin'].map(p => browser.connection(p as any)) as T;
  if (path === '/login') {
    const session = await browser.openLogin(platform);
    const state = await browser.checkLogin(platform);
    if (state.status === 'awaiting_login') {
      const button = session.page.getByText('登录', { exact: true }).first();
      if (await button.isVisible().catch(() => false)) await button.click({ timeout: 3000 }).catch(() => {});
    }
    return await browser.checkLogin(platform) as T;
  }
  if (path === '/messaging') return await (await import('./messages.ts')).messaging(body) as T;
  if (path === '/status') return await browser.checkLogin(platform) as T;
  if (path === '/search') return await browser.browserSearch(body, signal) as T;
  if (path === '/comments') return await browser.browserComments(body, signal) as T;
  if (path === '/inspect') return await browser.inspectPlatform(platform) as T;
  if (path === '/read-link') return await browser.readWorkLink(body.url, signal, {force:body.force===true}) as T;
  if (path === '/detail') return await browser.readDetail(body.note, signal, body.force===true) as T;
  if (path === '/close-read') { await browser.closeRead(body.cursor); return { ok: true } as T; }
  if (path === '/network') return await browser.setNetwork(platform, body.mode) as T;
  if (path === '/refresh') return await browser.refreshPlatform(platform, !!body.creator) as T;
  if (path === '/creator') return await browser.openCreator(platform).then(() => browser.connection(platform)) as T;
  if (path === '/prepare-publish') return await (await import('./publish.ts')).preparePublish(body) as T;
  if (path === '/publish') return await (await import('./publish.ts')).publishNative(body) as T;
  if (path === '/reconcile-publish') return await (await import('./publish.ts')).reconcilePublish(body) as T;
  throw new Error('此浏览器操作未接入 Harta 获客引擎');
}

export async function browserScreenshot(platform: 'xiaohongshu' | 'douyin') {
  return (await import('./messages.ts')).loginPreview(platform);
}
