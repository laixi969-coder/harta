import { browserLaunchOptions } from './launch-options.ts';
import { protectionStatus, protectionView, readInterval, reservePlatformAction, recordPlatformSuccess, recordPlatformFailure } from '../protection.ts';
import { hasVisibleChallenge } from './challenge.ts';
import { chromium, type BrowserContext, type Page, type Response } from 'playwright-core';
import { directProxy, closeNetwork, allowNetworkRequest } from './network.ts';
import { randomUUID } from 'node:crypto';
import { mkdirSync, chmodSync } from 'node:fs';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { dataDir, put, get, configGet, configSet } from '../store.ts';
import type {
  Platform,
  PlatformConnection,
  Note,
  Comment,
  SearchInput,
} from '../../shared/types.ts';
import { installDiagnostics } from './diagnostics.ts';
import {
  xhsNotes,
  douyinNotes,
  platformComments,
  responseMore,
  parsePlatformJSON,
  parseDouyinSearch,
  matchesDouyinSort,
  xhsRequestSort,
} from './model.ts';
export const platformNames = { xiaohongshu: '小红书', douyin: '抖音' };
const homes: Record<Platform, string> = {
  xiaohongshu: 'https://www.xiaohongshu.com/explore',
  douyin: 'https://www.douyin.com/',
};
interface Session {
  context: BrowserContext;
  page: Page;
  state: PlatformConnection;
}
interface ReadRun {
  id: string;
  platform: Platform;
  page: Page;
  kind: 'search' | 'comments';
  queue: (Note | Comment)[];
  seen: Set<string>;
  more: boolean | undefined;
  responses: number;
  lastResponse: number;
  noteId?: string;
  error?: string;
  pageNumber?: number;
  diagnostic?: unknown;
  signature?: string;
  minRequestTime?: number;
  detach?: (() => void)[];
  sort?: SearchInput['sort'];
  filtersApplied?: boolean;
  inFlight?: number;
  expandedReplies?: Set<string>;
}
const lastResultPages = new Map<Platform, Page>();
const networkEvents: Record<string, { url: string; error: string }[]> = {};
const sessions = new Map<Platform, Session>();
const opening = new Map<Platform, Promise<Session>>();
const runs = new Map<string, ReadRun>();
export function connection(platform: Platform): PlatformConnection {
  return (
    sessions.get(platform)?.state || {
      platform,
      status: 'disconnected',
      message: '请打开平台浏览器并登录',
      browserOpen: false,
      checkedAt: new Date().toISOString(),
    }
  );
}
function verified(s: Session, id: string, name: string) {
  if (!id || s.state.status === 'challenge') return;
  s.state = {
    ...s.state,
    status: 'ready',
    accountId: id,
    accountName: name || s.state.accountName || platformNames[s.state.platform] + '账号',
    message: '已验证平台登录身份',
    checkedAt: new Date().toISOString(),
  };
  const aid = `browser:${s.state.platform}:${id}`;
  put('accounts', {
    id: aid,
    name: s.state.accountName,
    platform: s.state.platform,
    connectionType: 'browser',
    createdAt: get<{ createdAt: string }>('accounts', aid)?.createdAt || new Date().toISOString(),
  });
  configSet('browserAccount:' + s.state.platform, aid);
}
async function observeIdentity(s: Session, response: Response) {
  const u = response.url();
  if (
    !/\/user\/me(?:\?|$)|\/user\/selfinfo|\/user\/profile\/self\/|\/web\/api\/media\/user\/info(?:\/|\?|$)/.test(
      u,
    )
  )
    return;
  try {
    const root = await response.json();
    const d = root.data || root;
    const user = d.basic_info || d.user || d.user_info || d;
    const id = user.user_id || user.userId || user.uid || user.sec_uid;
    if (root.success === false || (root.status_code && root.status_code !== 0) || d.guest === true)
      return;
    verified(s, String(id || ''), String(user.nickname || user.nick_name || ''));
  } catch {}
}
export async function openLogin(platform: Platform): Promise<Session> {
  if (platform === 'xiaohongshu') throw new Error('小红书模拟浏览已关闭，请在设置配置 TikHub / RedFox API');
  const existing = sessions.get(platform);
  if (existing && !existing.page.isClosed()) {
    if (existing.page.url().startsWith('chrome-error:'))
      await existing.page
        .goto(homes[platform], { waitUntil: 'domcontentloaded', timeout: 45000 })
        .catch(() => {});
    await existing.page.bringToFront();
    return existing;
  }
  if (opening.has(platform)) return opening.get(platform)!;
  const task = (async () => {
    const profile = join(dataDir, 'browser-profiles', platform);
    mkdirSync(profile, { recursive: true, mode: 0o700 });
    chmodSync(profile, 0o700);
    const direct = configGet('browserNetwork:' + platform) === 'direct';
    const proxy = direct ? await directProxy() : undefined;
    const context = await chromium.launchPersistentContext(profile, browserLaunchOptions(proxy)).catch((error: unknown) => { throw new Error('平台浏览器启动失败；已保留任务。诊断：' + (error instanceof Error ? error.message : String(error))); });
    installDiagnostics(context, platform);
    networkEvents[platform] = [];
    if (direct) context.on('request', (request) => allowNetworkRequest(request.url()));
    context.on('requestfailed', (request) => {
      networkEvents[platform].push({
        url: request.url().split('?')[0],
        error: request.failure()?.errorText || 'failed',
      });
      networkEvents[platform] = networkEvents[platform].slice(-60);
    });
    const page = context.pages()[0] || (await context.newPage());
    const s: Session = {
      context,
      page,
      state: {
        platform,
        network: direct ? 'direct' : 'system',
        status: 'opening',
        message: '正在打开平台登录页面',
        browserOpen: true,
        checkedAt: new Date().toISOString(),
      },
    };
    sessions.set(platform, s);
    context.on('response', (r) => void observeIdentity(s, r));
    context.on('close', () => {
      s.state = {
        ...s.state,
        status: 'disconnected',
        browserOpen: false,
        message: '平台浏览器已关闭，请重新打开',
        checkedAt: new Date().toISOString(),
      };
      sessions.delete(platform);
    });
    try {
      await page.goto(homes[platform], { waitUntil: 'domcontentloaded', timeout: 45_000 });
    } catch (e) {
      s.state.message = '页面加载较慢，浏览器已打开，可稍后重试';
    }
    if (platform === 'douyin') {
      const login = page.getByRole('button', { name: '登录', exact: true });
      if (await login.isVisible().catch(() => false))
        await login.click({ timeout: 5000 }).catch(() => {});
    }
    await page.bringToFront();
    if (s.state.status !== 'ready')
      s.state = {
        ...s.state,
        status: 'awaiting_login',
        message: '请在已打开的浏览器中扫码或登录；如有验证码请由本人完成',
        url: page.url(),
        checkedAt: new Date().toISOString(),
      };
    return s;
  })().finally(() => opening.delete(platform));
  opening.set(platform, task);
  return task;
}
export async function checkLogin(platform: Platform) {
  const s = sessions.get(platform);
  if (!s || s.page.isClosed()) return connection(platform);
  try {
    const p = s.page;
    // A verified identity does not imply the platform currently permits access.
    if (await hasVisibleChallenge(p)) {
      s.state = {
        ...s.state,
        status: 'challenge',
        message: '平台要求本人完成安全验证，已暂停自动读取',
        url: p.url(),
        checkedAt: new Date().toISOString(),
      };
      return s.state;
    }
    if (s.state.status === 'challenge') s.state = { ...s.state, status: 'awaiting_login' };
    // Only inspect user identity already exposed to the logged-in page. Cookie existence is not proof.
    const identity = await p.evaluate((which) => {
      if (which === 'xiaohongshu') {
        const state = (window as any).__INITIAL_STATE__;
        const u =
          state?.user?.userInfo?._value || state?.user?.userInfo?.value || state?.user?.userInfo;
        return {
          id: u?.userId || u?.user_id || '',
          name: u?.nickname || u?.nickName || '',
          guest: u?.guest,
        };
      }
      const nodes = [...document.querySelectorAll<HTMLAnchorElement>('a[href*="/user/"]')];
      const mine = nodes.find(
        (a) => (a.textContent || '').trim() === '我' || a.getAttribute('aria-label') === '我',
      );
      return {
        id: mine?.href.split('/user/')[1]?.split('?')[0] || '',
        name: '抖音账号',
        guest: undefined,
      };
    }, platform);
    if (identity.id && identity.guest !== true) verified(s, identity.id, identity.name);
    if (p.url().startsWith('chrome-error:')) {
      s.state = {
        ...s.state,
        status: 'error',
        message: '无法连接平台站点，请检查本机网络或配置该平台代理',
        url: p.url(),
        checkedAt: new Date().toISOString(),
      };
      return s.state;
    }
    if (s.state.status !== 'ready') {
      // Identity may be verified by a response while the DOM check is awaiting.
      if (connection(platform).status === 'ready') return connection(platform);
      s.state = {
        ...s.state,
        status: 'awaiting_login',
        message: '等待你完成扫码登录',
        url: p.url(),
        checkedAt: new Date().toISOString(),
      };
    }
  } catch {
    s.state = {
      ...s.state,
      status: 'error',
      message: '无法核实当前平台状态，已暂停自动读取；请检查平台窗口后再继续',
      checkedAt: new Date().toISOString(),
    };
  }
  return s.state;
}
function loginPage(platform: Platform) {
  const s = sessions.get(platform);
  if (!s || s.page.isClosed()) throw new Error('请先打开登录浏览器');
  const latest = [...runs.values()].reverse().find(r => r.platform === platform && !r.page.isClosed())?.page || lastResultPages.get(platform);
  return latest && !latest.isClosed() ? latest : s.page;
}
export async function loginScreenshot(platform: Platform) {
  return loginPage(platform).screenshot({ type: 'png' });
}
export async function loginPointer(platform: Platform, x: number, y: number, toX?: number, toY?: number) {
  const page = loginPage(platform);
  const host = new URL(page.url()).hostname;
  if (!(host === (platform === 'douyin' ? 'www.douyin.com' : 'www.xiaohongshu.com'))) throw new Error('当前页面不是官方平台页面');
  await page.mouse.move(x, y);
  if (toX === undefined) await page.mouse.click(x, y);
  else { await page.mouse.down(); try { await page.mouse.move(toX, toY!, { steps: 20 }); } finally { await page.mouse.up(); } }
}
export async function requireSession(platform: Platform) {
  const s = await (opening.get(platform) ||
    (sessions.get(platform) && !sessions.get(platform)!.page.isClosed()
      ? Promise.resolve(sessions.get(platform)!)
      : openLogin(platform)));
  for (let i = 0; i < 60; i++) {
    await checkLogin(platform);
    if (['ready', 'challenge', 'error'].includes(s.state.status) || !configGet('browserAccount:' + platform)) break;
    await delay(500);
  }
  if (s.state.status !== 'ready')
    throw new Error(`${platformNames[platform]}需要你完成登录或验证，请查看已打开的浏览器`);
  return s;
}
export async function prepareRead(platform: Platform) {
  return requireSession(platform);
}
function attachRead(run: ReadRun) {
  const page = run.page;
  const listener = async (response: Response) => {
    const url = response.url();
    const match =
      run.kind === 'search'
        ? run.platform === 'xiaohongshu'
          ? /\/search\/notes(?:\?|$)/
          : /\/(?:general\/search\/(?:single|stream)|search\/item)\//
        : run.platform === 'xiaohongshu'
          ? /\/comment\/(?:sub\/)?page(?:\?|$)/
          : /\/comment\/list\/(?:reply\/)?/;
    if (!match.test(url)) return;
    if (run.minRequestTime && response.request().timing().startTime < run.minRequestTime) return;
    if (
      run.platform === 'douyin' &&
      run.kind === 'search' &&
      !matchesDouyinSort(url, run.sort || 'general')
    )
      return;
    let xhsSort: string | null = null;
    let xhsFilters: string | null = null;
    if (run.platform === 'xiaohongshu' && run.kind === 'search') {
      try {
        const body = response.request().postDataJSON();
        xhsSort = xhsRequestSort(body);
        xhsFilters = JSON.stringify(body?.filters || []);
      } catch {
        return;
      }
      const expected =
        run.sort === 'latest'
          ? 'time_descending'
          : run.sort === 'popular'
            ? 'popularity_descending'
            : 'general';
      if (xhsSort !== expected) return;
    }
    run.inFlight = (run.inFlight || 0) + 1;
    try {
      if ([403, 429].includes(response.status())) {
        run.error = `平台限制当前操作（${response.status()}），请停止并检查官方提示`;
        return;
      }
      const text = await response.text();
      const payload = url.includes('/search/stream/')
        ? parseDouyinSearch(text)
        : parsePlatformJSON(text);
      if (run.minRequestTime && response.request().timing().startTime < run.minRequestTime) return;
      run.diagnostic = {
        path: new URL(url).pathname,
        sortType: xhsSort || new URL(url).searchParams.get('sort_type'),
        filterSelected: xhsFilters || new URL(url).searchParams.get('filter_selected'),
        keys: Object.keys(payload),
        status: payload.status_code,
        dataType: Array.isArray(payload.data) ? 'array' : typeof payload.data,
        dataKeys: payload.data && !Array.isArray(payload.data) ? Object.keys(payload.data) : [],
        firstKeys: Array.isArray(payload.data) ? Object.keys(payload.data[0] || {}) : [],
        hasMore: payload.has_more,
      };
      if (payload.success === false || (payload.status_code && payload.status_code !== 0)) {
        run.error = '平台返回验证或请求错误，请在浏览器中检查登录状态';
        return;
      }
      let items: (Note | Comment)[];
      if (run.kind === 'search')
        items = run.platform === 'xiaohongshu' ? xhsNotes(payload) : douyinNotes(payload);
      else {
        let parent: string | null = null;
        if (/sub\/page|list\/reply/.test(url)) {
          const params = new URL(url).searchParams;
          const raw = params.get('root_comment_id') || params.get('comment_id');
          if (raw) parent = (run.platform === 'xiaohongshu' ? 'xhs:' : 'dy:') + raw;
        }
        items = platformComments(run.platform, payload, run.noteId!, parent);
      }
      for (const item of items)
        if (!run.seen.has(item.id)) {
          run.seen.add(item.id);
          run.queue.push(item);
        }
      if (!/sub\/page|list\/reply/.test(url)) run.more = responseMore(run.platform, payload);
      run.responses++;
      run.lastResponse = Date.now();
    } catch {
      run.error = '平台响应未完整读取或格式已变化，页面已保留供检查';
    } finally {
      run.inFlight = Math.max(0, (run.inFlight || 1) - 1);
    }
  };
  page.on('response', listener);
  (run.detach ||= []).push(() => page.off('response', listener));
}
async function assertNoChallenge(page: Page) {
  for (const frame of page.frames()) {
    if (frame !== page.mainFrame()) {
      const element = await frame.frameElement().catch(() => null);
      if (!element || !(await element.isVisible().catch(() => false))) continue;
    }
    const text = await frame
      .locator('body')
      .innerText()
      .catch(() => '');
    if (/请完成下列验证|请完成验证|按住左边按钮|点击两个形状相同/.test(text)) {
      await page.bringToFront();
      throw new Error(
        '平台要求本人完成安全验证，当前页面已保留；完成后在连接设置恢复，再重试原任务',
      );
    }
  }
}
async function pendingReply(run: ReadRun) {
  const controls = run.page.getByText(/展开\s*\d+\s*条回复|展开更多回复|查看更多回复/).and(run.page.locator(':visible'));
  const keys = await controls.evaluateAll(elements => elements.map((element, index) => {
    const parent = element.closest('.parent-comment,[data-e2e="comment-item"]');
    const record = parent?.querySelector('[id^="comment-"]')?.id || parent?.textContent?.slice(0, 160) || String(index);
    return record + ':' + element.textContent;
  }));
  const index = keys.findIndex(key => !run.expandedReplies?.has(key));
  return index < 0 ? null : { control: controls.nth(index), key: keys[index] };
}
async function collectPage(run: ReadRun, signal?: AbortSignal) {
  await assertNoChallenge(run.page);
  if (run.kind === 'comments' && !run.queue.length && run.more === false && !(await pendingReply(run)))
    return { items: [], readId: run.id, nextCursor: null, evidence: run.diagnostic };
  const start = Date.now(),
    before = run.responses;
  let lastScroll = start;
  while (Date.now() - start < 25_000) {
    signal?.throwIfAborted();
    if (run.error) throw new Error(run.error);
    if (run.queue.length && !run.inFlight && Date.now() - run.lastResponse > 1000) break;
    if (!run.queue.length && run.responses > before && run.more === false) break;
    if (run.page.isClosed()) throw new Error('采集浏览器已关闭，已获取数据保留');
    // Long comment threads often need several wheel steps before the next
    // platform page is requested. One step followed only by waiting stalls.
    if (run.kind === 'comments' && run.responses > 0 && !run.queue.length && !run.inFlight && run.more !== false && Date.now() - lastScroll > 1800) {
      await scroll(run.page, true);
      lastScroll = Date.now();
    }
    if (Math.floor((Date.now() - start) / 250) % 4 === 0) await assertNoChallenge(run.page);
    await delay(250, undefined, { signal });
  }
  if (!run.queue.length && run.more !== false) {
    const text = await run.page
      .locator('body')
      .innerText()
      .catch(() => '');
    if (
      /验证码|安全验证|请完成验证|点击两个形状相同/.test(text) ||
      /验证码|安全验证/.test(await run.page.title().catch(() => ''))
    )
      throw new Error('平台要求本人完成验证码，请在采集浏览器中处理后重试');
    if (/登录后查看|登录后搜索|登录即可/.test(text))
      throw new Error('平台要求登录后才能继续，请在连接设置打开登录');
    if (/没有找到|暂无相关|没有相关|暂无评论|暂时没有更多/.test(text)) {
      run.more = false;
    } else {
      configSet('browserReadDiagnostics:' + run.platform, JSON.stringify({ kind: run.kind, more: run.more, responses: run.responses, seen: run.seen.size, evidence: run.diagnostic }));
      throw new Error('未收到平台数据响应；页面已保留供检查，未使用演示数据替代');
    }
  }
  const currentTitle = await run.page.title().catch(() => '');
  const currentText = await run.page
    .locator('body')
    .innerText()
    .catch(() => '');
  if (
    /验证码|安全验证/.test(currentTitle) ||
    /点击两个形状相同|请完成验证|请完成下列验证/.test(currentText)
  ) {
    await run.page.bringToFront();
    throw new Error('平台要求本人完成安全验证，页面已保留，请验证后重新搜索');
  }
  if (
    run.kind === 'search' &&
    !run.queue.length &&
    run.more === false &&
    !/没有找到|暂无.*结果|暂无相关|没有相关/.test(currentText)
  ) {
    await run.page.bringToFront();
    throw new Error(
      '平台返回空响应但页面未显示无结果，可能仍在加载或要求验证；页面已保留，不计为搜索成功',
    );
  }
  const items = run.queue.splice(0);
  const hasReplies = run.kind === 'comments' && Boolean(await pendingReply(run));
  const done = run.more === false && !hasReplies;
  run.pageNumber = (run.pageNumber || 0) + 1;
  return {
    items,
    readId: run.id,
    nextCursor: done ? null : run.id + ':' + run.pageNumber,
    evidence: run.diagnostic,
  };
}
export async function browserSearch(
  input: SearchInput & { cursor?: string | null },
  signal?: AbortSignal,
) {
  const platform = input.platform || 'xiaohongshu';
  const signature = JSON.stringify([platform, input.keyword, input.sort, input.noteType]);
  const pending = !input.cursor
    ? [...runs.values()]
        .reverse()
        .find((r) => r.kind === 'search' && r.signature === signature && !r.page.isClosed())
    : undefined;
  let run: ReadRun;
  if (pending) {
    run = pending;
    await assertNoChallenge(run.page);
    run.error = undefined;
    await run.page.bringToFront();
    if (!run.queue.length && (!run.responses || run.more === false)) {
      const field = run.page.getByPlaceholder('搜索你感兴趣的内容', { exact: true });
      if (platform === 'douyin' && (await field.isVisible().catch(() => false))) {
        run.more = undefined; run.responses = 0; run.seen.clear(); run.minRequestTime = Date.now();
        await field.fill(input.keyword);
        await field.press('Enter');
        run.filtersApplied = false;
      }
    }
  } else if (input.cursor) {
    run = runs.get(input.cursor.split(':')[0])!;
    if (!run || run.platform !== platform || run.kind !== 'search')
      throw new Error('搜索游标已失效，请重新搜索');
    await scroll(run.page);
  } else {
    const s = await requireSession(platform);
    const page = await s.context.newPage();
    run = {
      id: randomUUID(),
      platform,
      page,
      kind: 'search',
      queue: [],
      seen: new Set(),
      more: undefined,
      responses: 0,
      lastResponse: Date.now(),
      signature,
      sort: input.sort,
    };
    runs.set(run.id, run);
    attachRead(run);
    const query =
      platform === 'xiaohongshu'
        ? `https://www.xiaohongshu.com/search_result?keyword=${encodeURIComponent(input.keyword)}&source=web_explore_feed`
        : `https://www.douyin.com/search/${encodeURIComponent(input.keyword)}`;
    if (platform === 'douyin') {
      page.on('popup', (p) => {
        run.page = p;
        attachRead(run);
        void p.bringToFront();
      });
      // Use regular Douyin search rather than entering through the Jingxuan feed.
      await page.goto(query, { waitUntil: 'domcontentloaded', timeout: 45000 });
      // Search can navigate before the search application has hydrated. Submit
      // once from its own loaded input if navigation produced no data request.
      await run.page.waitForLoadState('load', { timeout: 15000 }).catch(() => {});
      await delay(1500);
      await assertNoChallenge(run.page);
      const searchField = run.page.getByPlaceholder('搜索你感兴趣的内容', { exact: true });
      // A visible filter shell does not prove the keyword was hydrated from the URL.
      const keywordReady = await searchField.inputValue().then(value => value.trim() === input.keyword.trim()).catch(() => false);
      // A non-default sort intentionally ignores initial general responses.
      // Only resubmit when the search application itself did not hydrate.
      if (
        !keywordReady || !(await run.page
          .getByText('筛选', { exact: true })
          .first()
          .isVisible()
          .catch(() => false))
      ) {
        await searchField.waitFor({ state: 'visible', timeout: 15000 });
        await searchField.click({ timeout: 5000 });
        await searchField.press('ControlOrMeta+A');
        await searchField.pressSequentially(input.keyword);
        await searchField.press('Enter');
      }
    } else await page.goto(query, { waitUntil: 'domcontentloaded', timeout: 45_000 });
    await run.page.bringToFront();
  }
  if (!input.cursor && !run.filtersApplied) {
    if (input.sort !== 'general' || input.noteType !== 'all')
      await applyFilters(run.page, platform, input, () => {
        run.queue = [];
        run.seen.clear();
        run.more = undefined;
        run.minRequestTime = Date.now();
        run.error = undefined;
      });
    run.filtersApplied = true;
  }
  const result = await collectPage(run, signal);
  let items = result.items as Note[];
  if (input.noteType !== 'all') items = items.filter((n) => n.type === input.noteType);
  if (input.sort === 'latest') items.sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
  return { ...result, items };
}
export async function applyFilters(
  page: Page,
  platform: Platform,
  input: SearchInput,
  beforeChange: () => void,
) {
  await delay(1200);
  const filter = page.getByText('筛选', { exact: true }).first();
  await filter.waitFor({ state: 'visible', timeout: 15000 }).catch(() => {});
  if (await filter.isVisible().catch(() => false)) {
    await filter.hover();
    await delay(350);
    const sortText =
      platform === 'xiaohongshu'
        ? input.sort === 'popular'
          ? '最多点赞'
          : '最新'
        : input.sort === 'popular'
          ? '最多点赞'
          : '最新发布';
    if (input.sort !== 'general') {
      const sort = page.getByText(sortText, { exact: true }).first();
      if (await sort.isVisible().catch(() => false)) {
        beforeChange();
        try {
          await sort.click({ timeout: 3000 });
        } catch (error) {
          if (platform !== 'xiaohongshu') throw error;
          // XHS's hover panel can close as Playwright moves the pointer from its
          // trigger to the option. Reopen it and activate the visible DOM option;
          // the site's own click handler still performs the search and sorting.
          await assertNoChallenge(page);
          await filter.hover();
          await delay(500);
          const visible = page
            .getByText(sortText, { exact: true })
            .and(page.locator(':visible'))
            .first();
          await visible.waitFor({ state: 'visible', timeout: 3000 });
          beforeChange();
          await visible.evaluate((el) => (el as HTMLElement).click());
        }
      } else throw new Error('当前平台页面的排序控件不可用，未悄悄改用综合排序');
    }
    if (input.noteType !== 'all') {
      const option = page
        .getByText(input.noteType === 'video' ? '视频' : '图文', { exact: true })
        .last();
      if (await option.isVisible().catch(() => false)) {
        beforeChange();
        await option.click();
      } else throw new Error('当前平台内容形式筛选不可用，未悄悄改用其他类型');
    }
  } else if (input.sort !== 'general')
    throw new Error('平台筛选控件未加载，请先用综合排序或检查浏览器');
}
async function scroll(page: Page, comments = false) {
  if (comments) {
    // Both official desktop layouts place the comment pane on the right.
    // Scrolling the largest page containers moves the work instead of its list.
    const viewport = page.viewportSize() || { width: 1280, height: 860 };
    const x = viewport.width * 0.85, y = viewport.height * 0.65;
    await page.evaluate(({x,y}) => {
      for (let element = document.elementFromPoint(x,y); element; element = element.parentElement) {
        const style = getComputedStyle(element);
        if (/(auto|scroll)/.test(style.overflowY) && element.scrollHeight > element.clientHeight + 50) {
          element.scrollTop += element.clientHeight * 0.8;
          break;
        }
      }
    }, {x,y});
    await page.mouse.move(x,y);
    await page.mouse.wheel(0,650);
    return;
  }
  await page.evaluate(() => {
    const all = [
      document.scrollingElement,
      ...document.querySelectorAll<HTMLElement>('main,section,div'),
    ].filter(Boolean) as HTMLElement[];
    const containers = all
      .filter((e) => e.scrollHeight > e.clientHeight + 150 && e.clientHeight > 150)
      .sort((a, b) => b.clientHeight - a.clientHeight);
    for (const e of containers.slice(0, 3))
      e.scrollTop = Math.min(e.scrollTop + e.clientHeight * 0.8, e.scrollHeight);
  });
  await page.mouse.wheel(0, 750);
}
export async function browserComments(
  input: { note: Note; cursor?: string | null },
  signal?: AbortSignal,
) {
  const platform = input.note.platform;
  let run: ReadRun;
  if (input.cursor) {
    run = runs.get(input.cursor.split(':')[0])!;
    if (!run || run.noteId !== input.note.id) throw new Error('评论游标已失效，请重新采集');
    // Read remaining top-level comments first; repeatedly expanding the first
    // already-captured reply can otherwise prevent reaching fresh discussions.
    const expand = run.more === false ? await pendingReply(run) : null;
    if (expand) {
      (run.expandedReplies ||= new Set()).add(expand.key);
      await expand.control.click();
    } else if (run.more !== false) await scroll(run.page, true);
  } else {
    const s = await requireSession(platform);
    const page = await s.context.newPage();
    run = {
      id: randomUUID(),
      platform,
      page,
      kind: 'comments',
      queue: [],
      seen: new Set(),
      more: undefined,
      responses: 0,
      lastResponse: Date.now(),
      noteId: input.note.id,
    };
    runs.set(run.id, run);
    attachRead(run);
    await page.goto(input.note.url, { waitUntil: 'domcontentloaded', timeout: 45_000 });
    await page.bringToFront();
    if (platform === 'douyin') {
      const button = page.locator('[data-e2e="comment-icon"], [data-e2e="comment-count"]').first();
      // Image posts may open the recommendations tab beside the work, while
      // video layouts expose an icon. Wait for hydration and select comments.
      const commentTab = page.getByText(/^评论\s*[（(]\s*\d+/).and(page.locator(':visible')).first();
      await button.or(commentTab).first().waitFor({ state: 'visible', timeout: 15000 }).catch(() => {});
      if (await commentTab.isVisible().catch(() => false)) await commentTab.click();
      else if (await button.isVisible().catch(() => false)) await button.click();
      else if (!run.responses) throw new Error('抖音评论入口尚未加载，请检查平台页面后继续');
    }
  }
  return collectPage(run, signal);
}
export async function closeRead(cursor: string) {
  const run = runs.get(cursor.split(':')[0]);
  if (run) {
    runs.delete(run.id);
    for (const detach of run.detach || []) detach();
    // Keep the verified official result visible. Closing it exposed an older
    // blank/home tab and made successful searches look broken to the user.
    await run.page.bringToFront().catch(() => {});
    const previous = lastResultPages.get(run.platform);
    lastResultPages.set(run.platform, run.page);
    if (previous && previous !== run.page && !previous.isClosed())
      await previous.close().catch(() => {});
  }
}
export async function readDetail(note: Note, signal?: AbortSignal, force = false, readLink = readWorkLink): Promise<Note> {
  signal?.throwIfAborted();
  const cached = get<Note>('notes', note.id);
  if (!force && note.detailState === 'complete') return note;
  if (!force && cached?.source === note.source && cached.platform === note.platform && cached.detailState === 'complete') return cached;
  const state = protectionStatus(note.platform);
  if (protectionView(note.platform).paused || state.counts.search >= state.policy!.search.dailyLimit)
    throw new Error('平台已暂停或今日读取额度不足，请处理后继续');
  const wait = Math.max(0, readInterval(state, 'search') - (Date.now() - (state.lastReadAt || 0)));
  if (wait) await delay(wait, undefined, { signal });
  signal?.throwIfAborted();
  reservePlatformAction(note.platform, 'search');
  try {
    const detail = await readLink(note.url, signal, { force });
    signal?.throwIfAborted();
    if (detail.id !== note.id || detail.platform !== note.platform || detail.source !== 'live' || detail.detailState !== 'complete') throw new Error('未读取到当前作品的完整详情');
    recordPlatformSuccess(note.platform);
    return detail;
  } catch (error) {
    if (!signal?.aborted) recordPlatformFailure(note.platform, (error as Error).message);
    throw error;
  }
}

setInterval(() => {
  for (const p of sessions.keys()) void checkLogin(p);
}, 5000).unref();

async function inspectFooter(page: Page) {
  if (!page.url().startsWith('https://creator.xiaohongshu.com')) return null;
  const cdp = await page.context().newCDPSession(page);
  try {
    const { root } = await cdp.send('DOM.getDocument', { depth: -1, pierce: true });
    const nodes = (n: any): any[] => [
      n,
      ...(n.children || []).flatMap(nodes),
      ...(n.shadowRoots || []).flatMap(nodes),
    ];
    const host = nodes(root).find((n) => n.nodeName === 'XHS-PUBLISH-BTN');
    if (!host) return null;
    const buttons = nodes(host).filter((n) => n.nodeName === 'BUTTON');
    const results = [];
    for (const b of buttons) {
      const box = await cdp
        .send('DOM.getBoxModel', { backendNodeId: b.backendNodeId })
        .catch(() => null);
      results.push({
        text: nodes(b)
          .filter((n) => n.nodeName === '#text')
          .map((n) => n.nodeValue)
          .join(''),
        attributes: b.attributes,
        box: box?.model.content,
      });
    }
    return {
      buttons: results,
      scroll: await page.evaluate(() => ({ x: scrollX, y: scrollY })),
      viewport: page.viewportSize(),
    };
  } finally {
    await cdp.detach();
  }
}
export async function inspectPlatform(platform: Platform) {
  const s = sessions.get(platform);
  if (!s) return { state: connection(platform), pages: [] };
  const pages = [];
  for (const p of s.context.pages()) {
    if (p.isClosed()) continue;
    pages.push({
      footer: await inspectFooter(p),
      frames: await Promise.all(
        p
          .frames()
          .filter((f) => f !== p.mainFrame())
          .map(async (f) => ({
            url: f.url().split('?')[0],
            visible: await f
              .frameElement()
              .then((e) => e.isVisible())
              .catch(() => false),
            text: (
              await f
                .locator('body')
                .innerText()
                .catch(() => '')
            ).slice(0, 1000),
          })),
      ),
      url: p.url(),
      title: await p.title().catch(() => ''),
      text: (
        await p
          .locator('body')
          .innerText()
          .catch(() => '')
      ).slice(0, 14000),
      resources: await p
        .evaluate(() =>
          performance.getEntriesByType('resource').map((v: any) => ({
            url: v.name.split('?')[0],
            transferSize: v.transferSize,
            duration: v.duration,
          })),
        )
        .catch(() => []),
      fields: await p
        .locator('input,textarea,[contenteditable=true],button')
        .evaluateAll((nodes) =>
          nodes.map((n) => ({
            tag: n.tagName,
            type: n.getAttribute('type'),
            placeholder: n.getAttribute('placeholder'),
            text: (n.textContent || '').slice(0, 80),
            accept: n.getAttribute('accept'),
          })),
        )
        .catch(() => []),
    });
  }
  return {
    state: s.state,
    pages,
    reads: [...runs.values()]
      .filter((r) => r.platform === platform)
      .map((r) => ({
        id: r.id,
        kind: r.kind,
        responses: r.responses,
        seen: r.seen.size,
        more: r.more,
        diagnostic: r.diagnostic,
      })),
    networkErrors: networkEvents[platform] || [],
  };
}
export async function openCreator(platform: Platform) {
  const s = await openLogin(platform);
  const url =
    platform === 'xiaohongshu'
      ? 'https://creator.xiaohongshu.com/publish/publish?source=official'
      : 'https://creator.douyin.com/creator-micro/content/upload';
  let p = s.context
    .pages()
    .find((p) =>
      p
        .url()
        .startsWith(
          platform === 'xiaohongshu'
            ? 'https://creator.xiaohongshu.com'
            : 'https://creator.douyin.com',
        ),
    );
  if (!p) p = await s.context.newPage();
  await p.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
  s.page = p;
  await p.bringToFront();
  return { s, page: p };
}

export async function refreshPlatform(platform: Platform, creator = false) {
  const s = await openLogin(platform);
  await s.page.goto(
    creator
      ? platform === 'xiaohongshu'
        ? 'https://creator.xiaohongshu.com/publish/publish?source=official'
        : 'https://creator.douyin.com/creator-micro/content/upload'
      : homes[platform],
    { waitUntil: 'domcontentloaded', timeout: 45000 },
  );
  await s.page.bringToFront();
  return checkLogin(platform);
}
export async function closeBrowsers() {
  for (const s of sessions.values()) await s.context.close().catch(() => {});
  await closeNetwork();
}

export async function setNetwork(platform: Platform, mode: 'system' | 'direct') {
  const s = sessions.get(platform);
  if (s) await s.context.close();
  configSet('browserNetwork:' + platform, mode);
  await openLogin(platform);
  return checkLogin(platform);
}

// Read only official work/share links in the existing business-scoped login session.
export async function readWorkLink(url:string, signal?:AbortSignal, options: {force?:boolean} = {}):Promise<Note> {
  signal?.throwIfAborted();
  const {workLink}=await import('../../shared/work-links.ts');
  const input=workLink(url);
  const cached=input.id?get<Note>('notes',(input.platform==='douyin'?'dy:':'xhs:')+input.id):undefined;
  if(!options.force&&cached?.source==='live'&&cached.detailState==='complete') return cached;
  const session=await requireSession(input.platform);signal?.throwIfAborted();
  const page=await session.context.newPage();
  let nativeId=input.id,detail:Note|undefined;
  const cancel=()=>{void page.close().catch(()=>{});};
  signal?.addEventListener('abort',cancel,{once:true});
  await page.route('**/*',route=>{
    const request=route.request();
    if(request.isNavigationRequest()&&request.frame()===page.mainFrame()) {
      try { const u=new URL(request.url());const hosts=input.platform==='douyin'?['douyin.com','www.douyin.com','v.douyin.com','iesdouyin.com','www.iesdouyin.com']:['xiaohongshu.com','www.xiaohongshu.com','xhslink.com','www.xhslink.com'];if(!['https:','http:'].includes(u.protocol)||!hosts.includes(u.hostname)) return route.abort(); } catch{return route.abort();}
    }
    return route.continue();
  });
  const capture=async(response:Response)=>{
    try {
      if(!/\/feed(?:\?|$)|\/aweme\/v1\/web\/aweme\/detail\//.test(response.url())) return;
      const payload=await response.json();
      const resolved=workLink(page.url());nativeId=resolved.id||nativeId;
      const rows=input.platform==='xiaohongshu'?xhsNotes(payload):douyinNotes({aweme_list:[payload.aweme_detail||payload.data?.aweme_detail].filter(Boolean)});
      const found=rows.find(n=>n.nativeId===nativeId);
      if(found) detail={...found,url:resolved.url,detailState:'complete'};
    } catch{}
  };
  page.on('response',capture);
  try {
    signal?.throwIfAborted();
    await page.goto(input.url,{waitUntil:'domcontentloaded',timeout:45000});
    const resolved=workLink(page.url());
    if(resolved.platform!==input.platform||!resolved.id) throw new Error('分享链接未解析到作品，请复制完整作品链接重试');
    nativeId=resolved.id;
    const existing=get<Note>('notes',(input.platform==='douyin'?'dy:':'xhs:')+nativeId);
    if(!options.force&&existing?.source==='live'&&existing.detailState==='complete') return existing;
    for(let i=0;i<60&&!detail;i++) {
      signal?.throwIfAborted();
      if(input.platform==='xiaohongshu') {
        const raw=await page.evaluate(id=>(window as any).__INITIAL_STATE__?.note?.noteDetailMap?.[id]?.note||null,nativeId).catch(()=>null);
        if(raw) { const note=xhsNotes({data:{items:[{id:nativeId,note_card:raw}]}})[0];if(note) detail={...note,url:resolved.url,detailState:'complete'}; }
      }
      if(input.platform==='douyin'&&!detail) {
        const raw=await page.evaluate(id=>{
          const roots=[(window as any)._ROUTER_DATA,(window as any).__INITIAL_STATE__,(window as any).__NEXT_DATA__];
          const serialized=document.getElementById('RENDER_DATA')?.textContent;
          if(serialized) { try {roots.push(JSON.parse(decodeURIComponent(serialized)));} catch{} }
          const stack=roots.filter(Boolean),seen=new Set<object>();let count=0;
          while(stack.length&&count++<5000) {const item=stack.pop();if(!item||typeof item!=='object'||seen.has(item))continue;seen.add(item);if(String(item.aweme_id||'')===id&&(item.video||item.images)&&item.author)return item;for(const value of Object.values(item))if(value&&typeof value==='object')stack.push(value);}
          return null;
        },nativeId).catch(()=>null);
        if(raw) {const note=douyinNotes({aweme_list:[raw]})[0];if(note)detail={...note,url:resolved.url,detailState:'complete'};}
      }
      if(!detail) await delay(250);
    }
    if(!detail) throw new Error('未读取到作品内容，请检查平台登录、链接有效性或访问验证后继续');
    return detail;
  } finally {signal?.removeEventListener('abort',cancel);await page.close().catch(()=>{});}
}
