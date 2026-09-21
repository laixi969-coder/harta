import fs from 'node:fs';
import { querySearxng, readResearchConfig } from '../lib/research.mjs';
import { readPublicSource, queryRsshub } from '../lib/native-sources.mjs';
const config = readResearchConfig();
const jobs = [
  ['SearXNG', () => querySearxng('隔音窗 怎么选 临街', config.searxngUrl)],
  ['Crawl4AI', () => readPublicSource('https://www.5118.com/')],
  ['RSSHub', () => queryRsshub('机器人', config.rsshubUrl)],
];
const outcomes = await Promise.allSettled(jobs.map(([, run]) => run()));
const report = outcomes.map((result, i) => {
  if (result.status === 'rejected') return { service: jobs[i][0], ok: false, error: result.reason.message };
  const data = result.value;
  return { service: jobs[i][0], ok: Array.isArray(data) ? data.length > 0 : data.ok && data.method?.startsWith('Crawl4AI'), data: Array.isArray(data) ? data : { url: data.url, method: data.method || '基础读取器', characters: data.text?.length || 0 } };
});
fs.mkdirSync('data', { recursive: true });
fs.writeFileSync('data/native-proof.json', JSON.stringify({ checkedAt: new Date().toISOString(), report }, null, 2));
for (const item of report) console.log(`${item.service}: ${item.ok ? '取得真实数据' : '本次未取得数据或仅基础回退'} (${Array.isArray(item.data) ? item.data.length : item.data?.characters || 0})`);
console.log('结果：data/native-proof.json。RSSHub 只检查最新资讯，没有关键词匹配也是可能的真实结果。');
if (report.some(item => !item.ok)) process.exitCode = 1;
