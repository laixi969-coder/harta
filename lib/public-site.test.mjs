import { describe, expect, it } from 'vitest';
import { createPublicSite } from './public-site.mjs';
import { publicPages } from './public-content.mjs';

const site = createPublicSite({ root: process.cwd(), publicOrigin: 'https://www.harta.cn' });
const graphFrom = html => JSON.parse(html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)[1]);

describe('public search documents', () => {
  it('renders the complete existing landing with one consistent metadata set', () => {
    const html = site.landing();
    expect(html).toContain('让好内容与好沟通，');
    expect(html).toContain('Harta 适合谁使用？');
    expect(html).toContain('id="form"');
    expect(html.match(/<h1\b/g)).toHaveLength(1);
    for (const pattern of [/<title>/g, /name="description"/g, /property="og:title"/g, /name="twitter:card"/g, /name="robots"/g]) expect(html.match(pattern)).toHaveLength(1);
    expect(html).toContain('href="https://www.harta.cn/"');
    expect(html).toContain('content="index, follow, max-image-preview:large"');
    const graph = graphFrom(html)['@graph'];
    expect(graph.map(n => n['@type'])).toEqual(['Organization', 'WebSite', 'SoftwareApplication', 'WebPage']);
    const app = graph.find(n => n['@type'] === 'SoftwareApplication');
    expect(app).not.toHaveProperty('offers');
    expect(app).not.toHaveProperty('aggregateRating');
    expect(graph.find(n => n['@type'] === 'Organization')).not.toHaveProperty('sameAs');
  });

  it('exposes only real public URLs in sitemap and llms, with matching HTML canonicals', () => {
    const sitemap = site.resolve('/sitemap.xml').body;
    expect([...sitemap.matchAll(/<loc>(.*?)<\/loc>/g)].map(m => m[1])).toEqual(['/', ...publicPages.map(p => p.path)].map(p => `https://www.harta.cn${p}`));
    for (const page of publicPages) {
      const html = site.resolve(page.path).body;
      expect(html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/)[1].replace(/<[^>]+>/g, '')).toBe(page.heading);
      expect(html).toContain(`href="https://www.harta.cn${page.path}"`);
      expect(site.resolve('/llms.txt').body).toContain(`https://www.harta.cn${page.path}`);
      const graph = graphFrom(html)['@graph'];
      const ids = new Set(graph.map(n => n['@id']));
      for (const node of graph) for (const value of Object.values(node)) {
        if (value && typeof value === 'object' && value['@id']) expect(ids.has(value['@id'])).toBe(true);
      }
    }
    expect(sitemap).not.toMatch(/login|register|\/api\/|\/p\//);
    expect(site.resolve('/README.md')).toBeNull();
    expect(site.resolve('/guides/does-not-exist/')).toBeNull();
    expect(site.resolve('/product').redirect).toBe('/product/');
  });

  it('keeps login noindex without application schema and does not block public assets', () => {
    const login = site.resolve('/login.html');
    expect(login.headers['x-robots-tag']).toContain('noindex');
    expect(login.body).toContain('<title>登录工作台 · Harta</title>');
    expect(login.body).not.toContain('application/ld+json');
    const robots = site.resolve('/robots.txt').body;
    expect(robots).toContain('User-agent: *\nAllow: /');
    for (const p of ['/api/', '/p/', '/openfind', '/index.html', '/data/']) expect(robots).toContain(`Disallow: ${p}`);
    expect(robots).not.toMatch(/Disallow: \/(?:js|css|images)/);
    expect(robots).toContain('Sitemap: https://www.harta.cn/sitemap.xml');
  });

  it('leaves local and unconfigured previews unindexable', () => {
    for (const publicOrigin of ['', 'http://127.0.0.1:5173', 'https://localhost:5173']) {
      const preview = createPublicSite({ root: process.cwd(), publicOrigin });
      expect(preview.indexable).toBe(false);
      expect(preview.headers['x-robots-tag']).toContain('noindex');
      expect(preview.resolve('/robots.txt').body).toBe('User-agent: *\nDisallow: /\n');
      expect(preview.resolve('/sitemap.xml').body).not.toContain('<loc>');
      expect(preview.landing()).toContain('name="robots" content="noindex');
    }
  });
});
