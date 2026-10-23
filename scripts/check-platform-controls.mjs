// Real DOM regression for platform controls; no network/platform login.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {chromium} from 'playwright-core';
import {openDouyinComments} from '../vendor/openfind/server/platforms/comment-entry.ts';
const chrome=process.env.HARTA_BROWSER_EXECUTABLE||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser=await chromium.launch({headless:true,...(fs.existsSync(chrome)?{executablePath:chrome}:{})});
try {
 const page=await browser.newPage();
 await page.setContent('<span data-e2e="comment-icon" hidden>stale</span><div id="tab" hidden onclick="this.dataset.clicked=1">评论(12)</div>');
 await page.evaluate(()=>setTimeout(()=>document.querySelector('#tab').hidden=false,100));
 await openDouyinComments(page,()=>false,1000);
 assert.equal(await page.locator('#tab').getAttribute('data-clicked'),'1');
 await page.setContent('<span data-e2e="comment-icon" hidden>stale</span><button data-e2e="comment-count" onclick="this.dataset.clicked=1">5</button>');
 await openDouyinComments(page,()=>false,1000);
 assert.equal(await page.locator('button').getAttribute('data-clicked'),'1');
 await page.setContent('<button data-e2e="comment-icon" onclick="this.dataset.clicked=1">icon</button><div id="tab" onclick="this.dataset.clicked=1">评论（12）</div>');
 await openDouyinComments(page,()=>false,1000);
 assert.equal(await page.locator('#tab').getAttribute('data-clicked'),'1');
 assert.equal(await page.locator('button').getAttribute('data-clicked'),null);
 await page.setContent('<p>Loading</p>');
 await assert.rejects(openDouyinComments(page,()=>false,50),/评论入口尚未加载/);
 await openDouyinComments(page,()=>true,50);
 console.log('passed: delayed comments tab, hidden stale icon, visible icon fallback, tab preference, no false empty success');
} finally { await browser.close(); }
