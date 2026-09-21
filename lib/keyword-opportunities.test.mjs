import {expect,it} from 'vitest';
import {metricNumber,normalizeMetrics,buildKeywordOpportunities} from './keyword-opportunities.mjs';
import {rowsToKeywords,dedupeKeywords} from './keyword-library.mjs';
import {buildResearch} from './research.mjs';
const now=Date.parse('2026-09-21');
const make=(rows,extra={})=>({hunt:'家装',pitch:'隔音窗选型与安装',...extra,keywordLibraries:[{id:'b',scope:{type:'产品品类',name:'隔音窗'},analysis:{groups:[]},items:dedupeKeywords(rowsToKeywords(rows,'5118样例.csv')),summary:{'比较选择':2}}]});
it('保留零、万单位和未知值，不猜测区间或带加号的数',()=>{
 expect(metricNumber('0')).toBe(0);expect(metricNumber('1.2万')).toBe(12000);expect(metricNumber('1,200')).toBe(1200);
 for(const v of ['','--','100+','10-20','<10'])expect(metricNumber(v)).toBeNull();
});
it('只在同产品、平台、指标、日期内加热度分，不用竞价充当自然竞争',()=>{
 const c=make([['关键词','平台','搜索指数','竞价价格','数据日期'],['隔音窗怎么选','小红书',100,2,'2026-09-20'],['隔音窗对比','小红书',10,100,'2026-09-20'],['隔音窗测评','抖音',999999,1,'2026-09-20']]);
 const board=buildKeywordOpportunities(c,{now});expect(board.items.every(i=>i.scores.attention===0)).toBe(true);
 const x=buildKeywordOpportunities(c,{now,platform:'小红书'});expect(x.items).toHaveLength(2);expect(x.items[0].keyword).toBe('隔音窗怎么选');expect(x.items[0].scores.attention).toBe(10);
 expect(x.items[0].gaps.join()).toContain('不当作自然流量竞争');
 expect(board.platformBriefs.find(p=>p.platform==='抖音').items).toHaveLength(1);
});
it('旧数据、未知日期、不同产品不互相给热度加分',()=>{
 const c=make([['关键词','品类','平台','搜索指数','数据日期'],['隔音窗怎么选','窗A','小红书',100,'2026-09-20'],['隔音窗对比','窗B','小红书',10,'2026-09-20'],['隔音窗测评','窗A','小红书',999,'2025-01-01'],['隔音窗选购','窗A','小红书',900,'']]);
 expect(buildKeywordOpportunities(c,{now,platform:'小红书'}).items.every(i=>i.scores.attention===0)).toBe(true);
});
it('趋势需要同口径的两个日期，同日冲突和零基数不虚构涨幅',()=>{
 const c=make([['关键词','平台','搜索指数','数据日期'],['隔音窗怎么选','小红书',0,'2026-09-10'],['隔音窗怎么选','小红书',100,'2026-09-20']]);
 let row=buildKeywordOpportunities(c,{now,platform:'小红书'}).items[0];expect(row.trends[0].change).toBeNull();expect(row.scores.trend).toBe(0);
 c.keywordLibraries[0].items[0].evidence[0].fields.find(f=>f.name==='搜索指数').value='50';
 row=buildKeywordOpportunities(c,{now,platform:'小红书'}).items[0];expect(row.trends[0].change).toBe(1);expect(row.scores.trend).toBe(5);
 c.keywordLibraries[0].items[0].evidence.push({...c.keywordLibraries[0].items[0].evidence[1],fields:[{name:'搜索指数',value:'200'},{name:'数据日期',value:'2026-09-20'}]});
 expect(buildKeywordOpportunities(c,{now,platform:'小红书'}).items[0].trends).toEqual([]);
});
it('未确认业务和外来品牌不能靠大指数被列为优先制作',()=>{
 const c=make([['关键词','品牌','平台','搜索指数','数据日期'],['隔音窗多少钱','外来品牌','小红书',999999,'2026-09-20']]);
 expect(buildKeywordOpportunities(c,{now}).items[0].priority).toBe('先确认业务匹配');
 expect(buildKeywordOpportunities({...c,pitch:'餐饮服务',hunt:'餐饮'},{now}).items[0].scores.business).toBe(0);
});
it('不同平台的内容依据实际进入研究提示词和快照',async()=>{
 const c=make([['关键词','平台','搜索指数','数据日期'],['隔音窗怎么选','小红书',100,'2026-09-20'],['隔音窗对比','抖音',200,'2026-09-20']]);
 const prompts=[]; const result=await buildResearch(c,{now,config:{},chatFn:async({user})=>{prompts.push(user);return JSON.stringify(user.includes('最多3个')?{seeds:['隔音窗'],queries:[]}:{audience:'业主',platform:'小红书',rationale:'产品匹配推断'});}});
 expect(result.contentBasis.platformBriefs.map(p=>p.platform)).toEqual(expect.arrayContaining(['小红书','抖音']));
 expect(prompts[0]).toContain('contentBasis');expect(prompts[1]).toContain('咨询');
});
it('冲突观测不能抬高分数，最新冲突不能回退旧趋势',()=>{
 const c=make([['关键词','平台','搜索指数','数据日期'],['隔音窗怎么选','小红书',10,'2026-09-01'],['隔音窗怎么选','小红书',20,'2026-09-10'],['隔音窗怎么选','小红书',9999,'2026-09-20'],['隔音窗怎么选','小红书',1,'2026-09-20'],['隔音窗对比','小红书',2,'2026-09-20']]);
 const row=buildKeywordOpportunities(c,{now,platform:'小红书'}).items.find(i=>i.keyword==='隔音窗怎么选');
 expect(row.scores.attention).toBe(0);expect(row.trends).toEqual([]);expect(row.gaps.join()).toContain('冲突');
});
it('只用最新观测算热度，不挑历史高点',()=>{
 const c=make([['关键词','平台','搜索指数','数据日期'],['隔音窗怎么选','小红书',9999,'2026-09-10'],['隔音窗对比','小红书',1,'2026-09-10'],['隔音窗怎么选','小红书',1,'2026-09-20'],['隔音窗对比','小红书',9999,'2026-09-20']]);
 expect(buildKeywordOpportunities(c,{now,platform:'小红书'}).items.find(i=>i.keyword==='隔音窗怎么选').scores.attention).toBe(0);
});
it('宽泛归属、方向指令及否定经营不能覆盖具体品类',()=>{
 const c=make([['关键词','品类'],['理财多少钱','理财']]);c.keywordLibraries[0].scope={type:'领域',name:'家装'};
 expect(buildKeywordOpportunities(c,{now}).items[0].scores.business).toBe(0);
 expect(buildKeywordOpportunities({...c,growthDirection:'加入理财选题'},{now}).items[0].scores.business).toBe(0);
 expect(buildKeywordOpportunities({...c,pitch:'不做理财'},{now}).items[0].scores.business).toBe(0);
});
it('品牌归属本身也须核对，不能仅凭品类匹配通过',()=>{
 const c=make([['关键词','品类'],['隔音窗多少钱','隔音窗']]);c.keywordLibraries[0].scope={type:'品牌',name:'外来品牌'};
 expect(buildKeywordOpportunities(c,{now}).items[0].priority).toBe('先确认业务匹配');
});
it('不把非法千位分隔符与伪日期当作有效指数',()=>{
 expect(metricNumber('1,2')).toBeNull();expect(metricNumber('12,34,567')).toBeNull();
 expect(normalizeMetrics({evidence:[{fields:[{name:'搜索指数',value:'20'},{name:'日期',value:'2026-09-20Tgarbage'}]}]})[0].date).toBe('');
});
