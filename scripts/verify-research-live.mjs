import fs from 'node:fs';
import { generateTodayDrop } from '../lib/generate.mjs';
const customer = { id: 'live-verification', name: '隔音门窗研究验证样例', hunt: '家装', pitch: '提供本地隔音门窗选型咨询', city: '广州', growthDirection: '面向临街住宅业主，优先小红书，不出镜。不能编造案例、品牌资质、报价或效果参数。', salesMaterial: '这是验证研究接通的虚拟业务样例。业务范围为隔音门窗选型咨询，未提供案例、价格、检测报告或品牌资质。', packs: [], drops: [] };
const pack = await generateTodayDrop(customer, {}, { onResearch: (research) => fs.writeFileSync(new URL("../data/research-live-snapshot.json", import.meta.url), JSON.stringify(research, null, 2)), onProgress: (percent, stage) => console.log(`${percent}% ${stage}`) });
fs.writeFileSync(new URL('../data/research-live-check.json', import.meta.url), JSON.stringify(pack, null, 2));
console.log(JSON.stringify({ sources: pack.research.sources.map(({ title, url, kind }) => ({ title, url, kind })), warnings: pack.research.warnings, researchStatus: pack.research.status, platform: pack.battlefields, contentCount: Object.values(pack.copies).flat().length, output: 'data/research-live-check.json' }, null, 2));
if (!pack.research.sources.length) process.exitCode = 1;
