import { describe, it, expect } from 'vitest';
import { profileBrief } from './creator-profile.js';
import { selectCreatorPack } from './creator-play-packs.js';
import { comparableOutcomes, packOutcomes, comparisonEvidence, reviewMetricText, reviewPackText, reviewJobText } from './creator-review.js';

describe('creator tools', () => {
  it('uses only saved profile fields as unverified context', () => {
    expect(profileBrief({})).toBe('');
    expect(profileBrief({creatorProfile:{fields:{voice:'短句',unexpected:'ignore'}}})).toContain('短句');
    expect(profileBrief({creatorProfile:{fields:{unexpected:'ignore'}}})).toBe('');
  });
  it('requires an explicit matching form and platform for specialized packs', () => {
    expect(selectCreatorPack('小红书','教程清单').id).toBe('xhs-guide');
    expect(selectCreatorPack('抖音','口播视频').id).toBe('douyin');
    expect(selectCreatorPack('抖音','短视频教程').id).toBe('douyin');
    expect(selectCreatorPack('小红书','视频教程').id).toBe('xhs-video');
    expect(selectCreatorPack('抖音','图文清单').id).toBe('douyin-image');
    expect(selectCreatorPack('小红书','图文清单').id).toBe('xhs-image');
    expect(selectCreatorPack('抖音','直播').id).toBe('douyin-live');
    expect(selectCreatorPack('小红书','直播').id).toBe('xhs-live');
    expect(selectCreatorPack('抖音','教程').id).toBe('general');
    expect(selectCreatorPack('其他','口播视频').id).toBe('general');
    const settings={selected:'mine',custom:[{id:'mine',name:'我的打法',platform:'抖音',form:'video'}]};
    expect(selectCreatorPack('抖音','视频',settings).id).toBe('mine');
    expect(selectCreatorPack('小红书','清单',settings).id).toBe('xhs-guide');
    expect(selectCreatorPack('抖音','视频',{selected:'off'}).id).toBe('off');
    expect(selectCreatorPack('小红书','直播',{selected:'mine',custom:[{id:'mine',platform:'小红书',form:'live'}]}).id).toBe('mine');
    expect(selectCreatorPack('小红书','图文',{selected:'mine',custom:[{id:'mine',platform:'小红书',form:'live'}]}).id).toBe('xhs-image');
    const scoped={selected:'lead-pack',custom:[{id:'lead-pack',platform:'小红书',form:'image',goal:'leads'}]};
    expect(selectCreatorPack('小红书','图文',scoped,'leads').id).toBe('lead-pack');
    expect(selectCreatorPack('小红书','图文',scoped,'reach').id).toBe('xhs-image');
    expect(selectCreatorPack('小红书','图文',scoped,'reach_leads').id).toBe('xhs-image');
    const byJob={selected:'',custom:[{id:'lead-job',name:'任务打法',platform:'小红书',form:'image',job:'lead'}]};
    expect(selectCreatorPack('小红书','图文',byJob,'leads','lead').id).toBe('lead-job');
    expect(selectCreatorPack('小红书','图文',byJob,'leads','').id).toBe('xhs-image');
  });
  it('uses the pack snapshot stored with the outcome, not current settings',()=>{
    const rows=packOutcomes({drops:[{outcomes:{x:[{creatorPack:{name:'旧打法',version:1},metrics:{views:0},platform:'抖音',content:{title:'作品'}}]}}]});
    expect(rows[0].name).toBe('旧打法');expect(rows[0].views).toBe(0);
  });
  it('同账号同窗口展示各作品的发布打法快照，变化时更新对照依据',()=>{
    const row=(id,pack)=>({id,accountId:'a',accountName:'账号甲',publicationId:id,platform:'抖音',start:'2026-01-01',end:'2026-01-07',metrics:{views:20},content:{title:id},source:'后台',creatorPack:pack});
    const pack={id:'a-pack',name:'教程打法',version:2,instruction:'给出步骤'},c={drops:[{id:'one',outcomes:{x:[row('one',pack)]}},{id:'two',outcomes:{x:[row('two',null)]}}]};
    let group=comparableOutcomes(c)[0],first=group.rows.find(r=>r.title==='one'),second=group.rows.find(r=>r.title==='two');
    expect(reviewPackText(first)).toBe('教程打法 v2');expect(reviewPackText(second)).toBe('未记录打法');expect(packOutcomes(c)[0].accountName).toBe('账号甲');
    const evidence=comparisonEvidence(group);c.drops[0].outcomes.x[0].creatorPack.instruction='改为讲故事';group=comparableOutcomes(c)[0];expect(comparisonEvidence(group)).not.toBe(evidence);
    c.drops[0].outcomes.x[0].creatorPack.attribution='user-confirmed';group=comparableOutcomes(c)[0];expect(reviewPackText(group.rows.find(r=>r.title==='one'))).toContain('人工确认');
    c.drops[1].outcomes.x[0].accountId='another-account';expect(comparableOutcomes(c)).toEqual([]);
  });
  it('compares latest records only for the same platform and dates, preserving zero', () => {
    const row=(platform,start,views,publicationId)=>({accountId:'a1',accountName:'账号',platform,start,end:'2026-01-07',metrics:{views},content:{title:'作品'},source:'手工',publicationId});
    const customer={drops:[{id:'a',outcomes:{x:[row('抖音','2026-01-01',0,'p1'),row('抖音','2026-01-01',90,'p1')]}},{id:'b',outcomes:{y:[row('抖音','2026-01-01',3,'p2')]}},{id:'c',outcomes:{z:[row('小红书','2026-01-01',10,'p3')]}}]};
    const groups=comparableOutcomes(customer);expect(groups).toHaveLength(1);expect(groups[0].rows.map(r=>r.views)).toEqual([3,0]);
    customer.drops[1].outcomes.y[0].accountName='账号改名';
    expect(comparableOutcomes(customer)).toHaveLength(1);
  });
  it('流量和客资分别保留，客资对照要求相同去重口径且零不等于未知',()=>{
    const row=(id,metrics,criteria='')=>({id,accountId:'a1',accountName:'账号',publicationId:id,platform:'抖音',start:'2026-01-01',end:'2026-01-07',metrics,criteria,content:{title:id},source:'后台'});
    const customer={drops:[{id:'p',outcomes:{x:[row('one',{qualifiedLeads:0},'按联系人去重'),row('two',{qualifiedLeads:3},'按联系人去重'),row('three',{views:90})]}}]};
    let group=comparableOutcomes(customer)[0];expect(group.comparableViews).toBe(false);expect(group.comparableLeads).toBe(true);expect(group.rows.find(r=>r.publicationId==='one').qualifiedLeads).toBe(0);expect(reviewMetricText(group.rows.find(r=>r.publicationId==='three'))).toContain('有效客资未记录');
    const prior=comparisonEvidence(group);customer.drops[0].outcomes.x[1].criteria='按咨询次数';expect(comparableOutcomes(customer)).toEqual([]);
    customer.drops[0].outcomes.x[2].metrics.views=91;customer.drops[0].outcomes.x[0].metrics.views=20;group=comparableOutcomes(customer)[0];expect(group.comparableViews).toBe(true);expect(group.comparableLeads).toBe(false);expect(comparisonEvidence(group)).not.toBe(prior);
    expect(packOutcomes({drops:[{outcomes:{x:[{...row('four',{qualifiedLeads:2},'去重'),creatorPack:{name:'打法',version:2}}]}}]})[0].qualifiedLeads).toBe(2);
  });
  it('对照平台完播率并纳入复盘证据，保留零和未知',()=>{
    const row=(id,rate)=>({id,accountId:'a',publicationId:id,platform:'抖音',start:'2026-01-01',end:'2026-01-07',metrics:rate==null?{}:{completionRate:rate},content:{title:id},source:'后台'});
    const customer={drops:[{id:'p',outcomes:{x:[row('one',0),row('two',37.5)]}}]};
    const group=comparableOutcomes(customer)[0];expect(group.comparableCompletion).toBe(true);expect(reviewMetricText(group.rows[0])).toContain('0%');
    const before=comparisonEvidence(group);customer.drops[0].outcomes.x[1].metrics.completionRate=38;expect(comparisonEvidence(comparableOutcomes(customer)[0])).not.toBe(before);
    customer.drops[0].outcomes.x[1].metrics={};expect(comparableOutcomes(customer)).toEqual([]);
  });
  it('keeps distinct accounts and publications while deduplicating repeated snapshots per window',()=>{
    const row=(account,pub,views)=>({accountId:account,accountName:account,publicationId:pub,platform:'抖音',start:'2026-01-01',end:'2026-01-07',metrics:{views},content:{title:pub},source:'后台'});
    const c={drops:[{id:'a',outcomes:{x:[row('a','p1',12),row('a','p1',9),row('b','p2',8),row('a','p3',7)]}},{id:'b',outcomes:{x:[row('b','p4',6)]}}]};
    const groups=comparableOutcomes(c);expect(groups).toHaveLength(2);expect(groups.find(g=>g.accountId==='a').rows.map(r=>r.views)).toEqual([12,7]);expect(groups.find(g=>g.accountId==='b').rows.map(r=>r.views)).toEqual([8,6]);
    expect(comparableOutcomes({drops:[{id:'a',outcomes:{x:[row('a','p1',12)]}},{id:'b',outcomes:{x:[row('a','',7)]}}]})).toEqual([]);
  });
  it('排除示例作品和效果记录，不让样本数据参与对照或打法归因',()=>{
    const row=(id,views)=>({id,accountId:'a',publicationId:id,platform:'抖音',start:'2026-01-01',end:'2026-01-07',metrics:{views},content:{title:id},creatorPack:{name:'打法',version:1},source:'后台'});
    for(const marker of [{demo:true},{source:'demo'},{sourceType:'demo'}]){
      const customer={drops:[{id:'real',outcomes:{x:[row('real',10),{...row('example-row',100),...marker}]}},{id:'example-pack',...marker,outcomes:{x:[row('example-pack',200)]}}],accountReviewOutcomes:[{...row('external',300),...marker}]};
      expect(comparableOutcomes(customer)).toEqual([]);expect(packOutcomes(customer).map(r=>r.title)).toEqual(['real']);
      customer.accountReviewOutcomes.push(row('second-real',20));const group=comparableOutcomes(customer)[0];expect(group.rows.map(r=>r.title)).toEqual(['second-real','real']);
    }
  });
});

it('任务只显示已登记的发布快照，并纳入复盘依据',()=>{
 const row=(id,job)=>({id,accountId:'a',accountName:'账号',publicationId:id,platform:'抖音',start:'2026-01-01',end:'2026-01-07',metrics:{views:10},content:{title:id},source:'后台',contentJob:job});
 const customer={drops:[{id:'p',outcomes:{x:[row('one','divert'),row('two','')]}}]};let group=comparableOutcomes(customer)[0];expect(reviewJobText(group.rows.find(r=>r.publicationId==='one'))).toBe('引流');const basis=comparisonEvidence(group);customer.drops[0].outcomes.x[0].contentJob='lead';group=comparableOutcomes(customer)[0];expect(comparisonEvidence(group)).not.toBe(basis);expect(reviewJobText({})).toBe('未记录任务');
});
