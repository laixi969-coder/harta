"""One-shot native Crawl4AI reader. Input is a public URL vetted by Harta."""
import asyncio
import contextlib
import json
import sys
import socket
import os
import ipaddress
from urllib.parse import urlparse

async def main():
    with contextlib.redirect_stdout(sys.stderr):
        from crawl4ai import AsyncWebCrawler, BrowserConfig, CrawlerRunConfig, CacheMode
        async with AsyncWebCrawler(config=BrowserConfig(headless=True, chrome_channel='chrome', channel='chrome', verbose=False)) as crawler:
            checked = {}
            async def public_only(route):
                parsed = urlparse(route.request.url)
                host = parsed.hostname or ''
                if host not in checked:
                    try:
                        records = await asyncio.to_thread(socket.getaddrinfo, host, None)
                        # Some local proxies map public domains to benchmark-range fake IPs.
                        # Opt in only on that host; literal benchmark/private URLs stay blocked.
                        fake = os.environ.get('HARTA_PROXY_FAKE_IP') == '1'
                        try: ipaddress.ip_address(host); domain = False
                        except ValueError: domain = True
                        checked[host] = bool(records) and all(ipaddress.ip_address(record[4][0]).is_global or (fake and domain and ipaddress.ip_address(record[4][0]) in ipaddress.ip_network('198.18.0.0/15')) for record in records)
                    except Exception:
                        checked[host] = False
                if parsed.scheme in ('http', 'https') and checked[host]:
                    await route.continue_()
                else:
                    await route.abort()
            async def guard(page, context, **kwargs):
                await context.route('**/*', public_only)
                return page
            crawler.crawler_strategy.set_hook('on_page_context_created', guard)
            result = await crawler.arun(url=sys.argv[1], config=CrawlerRunConfig(cache_mode=CacheMode.BYPASS, page_timeout=20000, verbose=False))
            if not result.success: print(result.error_message, file=sys.stderr)
            text = result.markdown.raw_markdown if result.markdown else ''
    print(json.dumps({'ok': bool(result.success and len(text) >= 80), 'url': result.url, 'text': text[:16000]}, ensure_ascii=False))

try:
    asyncio.run(main())
except Exception as exc:
    import traceback
    traceback.print_exc(file=sys.stderr)
    print(json.dumps({'ok': False, 'why': type(exc).__name__}))
