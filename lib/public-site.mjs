import fs from 'node:fs';
import path from 'node:path';
import { publicPages } from './public-content.mjs';

const DEFAULT_ORIGIN = 'https://www.harta.cn';
const HOME_TITLE = 'Harta 灵鹿线索｜小红书、抖音内容创作与获客工作台';
const HOME_DESCRIPTION = 'Harta 面向个人经营者和内容团队，连接小红书、抖音的需求发现、内容创作、客户跟进与效果复盘。整理评论线索，准备图文、视频脚本和封面，记录真实咨询与发布表现。';
const PUBLIC_ROBOTS = 'index, follow, max-image-preview:large';
const PRIVATE_ROBOTS = 'noindex, nofollow, noarchive';
const escapeHtml = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const pageTitle = page => page.title.endsWith('Harta') || page.title.startsWith('Harta ') ? page.title : `${page.title} · Harta`;
const jsonLd = value => JSON.stringify(value).replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');

export function createPublicSite({ root, publicOrigin = '' }) {
  // Canonicals never come from Host / X-Forwarded-Host. Preview installs remain noindex.
  const configured = publicOrigin ? new URL(publicOrigin) : null;
  const origin = configured?.origin || DEFAULT_ORIGIN;
  const indexable = Boolean(configured && configured.protocol === 'https:' && !['localhost', '127.0.0.1', '[::1]'].includes(configured.hostname));
  const robots = indexable ? PUBLIC_ROBOTS : PRIVATE_ROBOTS;
  const absolute = pathname => new URL(pathname, origin).href;
  const pages = new Map(publicPages.map(page => [page.path, page]));

  function graph(pagePath, title, description) {
    const home = absolute('/');
    const pageUrl = absolute(pagePath);
    const nodes = [
      { '@type': 'Organization', '@id': `${home}#organization`, name: 'Harta', alternateName: '灵鹿线索', url: home, logo: { '@type': 'ImageObject', url: absolute('/images/harta-logo.png'), width: 1276, height: 386 } },
      { '@type': 'WebSite', '@id': `${home}#website`, name: 'Harta', alternateName: '灵鹿线索', url: home, inLanguage: 'zh-CN', publisher: { '@id': `${home}#organization` } },
      { '@type': 'SoftwareApplication', '@id': `${home}#application`, name: 'Harta', alternateName: '灵鹿线索', url: absolute('/product/'), applicationCategory: 'BusinessApplication', operatingSystem: 'Web', inLanguage: 'zh-CN', description: HOME_DESCRIPTION, publisher: { '@id': `${home}#organization` }, featureList: ['需求发现与评论线索整理', '小红书、抖音图文与视频脚本创作', '封面与图文素材准备', '客户跟进记录', '发布效果与账号复盘'] },
      { '@type': 'WebPage', '@id': `${pageUrl}#webpage`, url: pageUrl, name: title, description, inLanguage: 'zh-CN', isPartOf: { '@id': `${home}#website` }, about: { '@id': `${home}#application` }, ...(pagePath === '/' || pagePath === '/product/' ? { mainEntity: { '@id': `${home}#application` } } : {}), ...(pagePath !== '/' ? { breadcrumb: { '@id': `${pageUrl}#breadcrumb` } } : {}) },
    ];
    if (pagePath !== '/') nodes.push({ '@type': 'BreadcrumbList', '@id': `${pageUrl}#breadcrumb`, itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Harta', item: home },
      { '@type': 'ListItem', position: 2, name: pages.get(pagePath)?.navTitle || title, item: pageUrl },
    ] });
    return { '@context': 'https://schema.org', '@graph': nodes };
  }

  function metadata(pagePath, title, description, { login = false } = {}) {
    const url = absolute(pagePath);
    const image = absolute('/images/landing-landscape.webp');
    return `<title>${escapeHtml(title)}</title>
  <meta name="description" content="${escapeHtml(description)}">
  <meta name="robots" content="${login ? PRIVATE_ROBOTS : robots}">
  <link rel="canonical" href="${escapeHtml(url)}">
  <meta property="og:locale" content="zh_CN">
  <meta property="og:site_name" content="Harta">
  <meta property="og:type" content="website">
  <meta property="og:title" content="${escapeHtml(title)}">
  <meta property="og:description" content="${escapeHtml(description)}">
  <meta property="og:url" content="${escapeHtml(url)}">
  <meta property="og:image" content="${escapeHtml(image)}">
  <meta property="og:image:width" content="1672">
  <meta property="og:image:height" content="941">
  <meta property="og:image:alt" content="Harta 绿色山丘与湖泊风景插画">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${escapeHtml(title)}">
  <meta name="twitter:description" content="${escapeHtml(description)}">
  <meta name="twitter:image" content="${escapeHtml(image)}">
  <meta name="twitter:image:alt" content="Harta 绿色山丘与湖泊风景插画">
  <link rel="alternate" type="text/plain" href="/llms.txt" title="Harta 产品摘要">
  ${login ? '' : `<script type="application/ld+json">${jsonLd(graph(pagePath, title, description))}</script>`}`;
  }

  function landing({ login = false } = {}) {
    // Reuse the complete original landing page, including its existing login flow.
    let html = fs.readFileSync(path.join(root, 'login.html'), 'utf8');
    html = html.replace(/\s*<title>[\s\S]*?<\/title>/i, '').replace(/\s*<meta\b[^>]*(?:name=["'](?:description|robots|twitter:[^"']+)["']|property=["']og:[^"']+["'])[^>]*>/gi, '');
    return html.replace('</head>', `  ${metadata(login ? '/login.html' : '/', login ? '登录工作台 · Harta' : HOME_TITLE, HOME_DESCRIPTION, { login })}\n</head>`);
  }

  function navigation(current = '') {
    return `<nav aria-label="产品导航"><a class="public-brand" href="/">Harta</a><div><a href="/product/"${current === '/product/' ? ' aria-current="page"' : ''}>产品说明</a><a href="/guides/content-acquisition/"${current.startsWith('/guides/') ? ' aria-current="true"' : ''}>使用指南</a><a class="public-login" href="/login.html#login">进入工作台 ↗</a></div></nav>`;
  }

  function sectionHtml(section) {
    const paragraphs = (section.paragraphs || []).map(p => `<p>${escapeHtml(p)}</p>`).join('');
    const steps = section.steps ? `<ol>${section.steps.map(step => `<li>${escapeHtml(step)}</li>`).join('')}</ol>` : '';
    const table = section.table ? `<div class="public-table" role="region" aria-label="${escapeHtml(section.heading)}" tabindex="0"><table><thead><tr>${section.table.headers.map(h => `<th scope="col">${escapeHtml(h)}</th>`).join('')}</tr></thead><tbody>${section.table.rows.map(row => `<tr>${row.map((cell, index) => index ? `<td>${escapeHtml(cell)}</td>` : `<th scope="row">${escapeHtml(cell)}</th>`).join('')}</tr>`).join('')}</tbody></table></div>` : '';
    return `<section id="${escapeHtml(section.id)}"><h2>${escapeHtml(section.heading)}</h2>${paragraphs}${steps}${table}</section>`;
  }

  function contentPage(page) {
    return `<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
${metadata(page.path, pageTitle(page), page.description)}
<link rel="icon" href="/images/harta-icon.png" type="image/png"><link rel="stylesheet" href="/css/public-content.css">
</head><body><a class="public-skip" href="#main">跳到正文</a><header class="public-header">${navigation(page.path)}</header>
<main id="main" class="public-main"><nav class="public-breadcrumb" aria-label="面包屑"><a href="/">Harta</a><span aria-hidden="true"> / </span><span aria-current="page">${escapeHtml(page.navTitle)}</span></nav>
<article><header class="public-intro"><h1>${escapeHtml(page.heading)}</h1><p>${escapeHtml(page.description)}</p></header>
<nav class="public-toc" aria-label="本页目录">${page.sections.map(s => `<a href="#${escapeHtml(s.id)}">${escapeHtml(s.heading)}</a>`).join('')}</nav>
${page.sections.map(sectionHtml).join('\n')}</article>
<aside class="public-related" aria-labelledby="related-heading"><h2 id="related-heading">继续了解</h2><div>${publicPages.filter(p => p.path !== page.path).map(p => `<a href="${p.path}">${escapeHtml(p.navTitle)} <span aria-hidden="true">↗</span></a>`).join('')}</div></aside>
<a class="public-action" href="/login.html#login">进入工作台 <span aria-hidden="true">↗</span></a></main>
<footer class="public-footer"><a href="/">Harta 灵鹿线索</a><a href="/#faq">常见问题</a></footer></body></html>`;
  }

  function robotsText() {
    if (!indexable) return 'User-agent: *\nDisallow: /\n';
    // One wildcard group also applies to search/AI bots, without a more specific
    // group accidentally dropping the private-path restrictions. Training policy is unchanged.
    return `User-agent: *
Allow: /
Disallow: /api/
Disallow: /p/
Disallow: /openfind
Disallow: /index.html
Disallow: /pack
Disallow: /data/

Sitemap: ${absolute('/sitemap.xml')}
`;
  }

  function sitemap() {
    const urls = indexable ? ['/', ...publicPages.map(page => page.path)] : [];
    return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map(p => `  <url><loc>${escapeHtml(absolute(p))}</loc></url>`).join('\n')}\n</urlset>\n`;
  }

  function llmsText() {
    return `# Harta

> Harta（灵鹿线索）是面向个人经营者和内容团队的创作与获客工作台，将需求发现、内容创作、客户跟进与效果复盘连接起来。

官网：${absolute('/')}
主要语言：简体中文。

## 产品与使用指南

- [Harta 首页](${absolute('/')}): 产品概览、两条获客路径、使用流程与常见问题。
${publicPages.map(page => `- [${page.title}](${absolute(page.path)}): ${page.description}`).join('\n')}

## 能力与使用边界

- 围绕业务、人设与受众，为小红书、抖音和信息流准备选题、图文、视频脚本及封面；脚本与分镜不是已渲染的完整视频。
- 评论和平台数据取决于已配置的数据源及其连接与服务能力；线索和资料需要人工核对。
- 支持草稿、复制、素材下载与排期。排期和下载不会自动发布内容，也不会自动发送私信或回复。
- 发布效果以用户记录的真实链接和指标为依据；内容建议不保证流量、询价或转化。
- 已有账号可以登录；注册需要管理员提供的激活码。公开页面没有公布统一价格或免费试用方案。

## Optional

- [站点地图](${absolute('/sitemap.xml')}): 仅列公开产品与指南页面。
`;
  }

  return {
    indexable,
    headers: { 'x-robots-tag': robots, 'cache-control': 'private, no-store', vary: 'Cookie' },
    landing,
    // Explicit route allowlist: no workspace data or internal Markdown is exposed.
    resolve(pathname) {
      if (pathname === '/login.html') return { body: landing({ login: true }), type: 'text/html; charset=utf-8', headers: { 'x-robots-tag': PRIVATE_ROBOTS } };
      if (pathname === '/robots.txt') return { body: robotsText(), type: 'text/plain; charset=utf-8', headers: { 'x-robots-tag': PRIVATE_ROBOTS } };
      if (pathname === '/sitemap.xml') return { body: sitemap(), type: 'application/xml; charset=utf-8', headers: { 'x-robots-tag': PRIVATE_ROBOTS } };
      if (pathname === '/llms.txt') return { body: llmsText(), type: 'text/plain; charset=utf-8', headers: { 'x-robots-tag': PRIVATE_ROBOTS } };
      const page = pages.get(pathname);
      if (page) return { body: contentPage(page), type: 'text/html; charset=utf-8', headers: {} };
      if (pages.has(`${pathname}/`)) return { redirect: `${pathname}/` };
      return null;
    },
  };
}
