import { describe, expect, it } from 'vitest';
import { DEFAULT_POLICY, gradeDistribution, gradeFacts, qualificationDirectory } from '../js/lead-qualification.js';
import { leadMarketingBlocked } from '../js/contact-boundaries.js';
import { businessActions, businessResults } from '../js/business-results.js';
import { saveLeadQualification, saveQualificationPolicy } from './lead-qualification.mjs';

const today=new Date(Date.now()-2000).toISOString();
const lead=(id, customerId='music', extra={})=>({id,customerId,authorId:id,authorName:id,platform:'抖音',messages:[],events:[],signalIds:[],...extra});
const message=(id,text,opportunityId='',time=today)=>({id,text,opportunityId,direction:'inbound',receivedAt:time,createdAt:time});
const op=(id,leadId,stage='了解需求')=>({id,leadId,customerId:'shop',stage,title:id,signalIds:[],revision:1});
const facts={fit:'yes',need:'specific',commitment:'appointment'};
const current=(a,c,id,at)=>qualificationDirectory(a,c,at).contacts.get(id).summary;
const assessment=(leadId,other={})=>({action:'qualify-lead',leadId,opportunityId:'',baseRevision:0,policyRevision:0,
  ...facts,note:'核对了服务范围，并与客户确认本次事项',sourceKey:'note',observedAt:today,...other});

describe('分级标准与业务跟进',()=>{
  it.each([
    ['yes','specific','appointment','A'], ['unknown','specific','appointment','B'], ['yes','specific','none','B'],
    ['yes','exploring','none','C'],['yes','unknown','none','pending'],['unknown','unknown','none','pending'],
    ['no','specific','order','unfit'],['unknown','unknown','quote','B']
  ])('fit=%s need=%s commitment=%s → %s',(fit,need,commitment,expected)=>{
    expect(gradeFacts({fit,need,commitment},DEFAULT_POLICY)).toBe(expected);
  });
  it('音乐教育 · 真实来信只作为依据，试听约定和适配经核实才评 A，记录可更正并撤销',()=>{
    const quote='孩子 7 岁，想学钢琴入门。已经约好周六来试听。';
    const a={leads:[lead('家长','music',{messages:[message('dm',quote)]})]};
    expect(current(a,'music','家长').code).toBe('pending');
    const input=assessment('家长',{sourceKey:'message:dm',sourceQuote:quote});
    saveLeadQualification(a,'music',input);
    expect(current(a,'music','家长')).toMatchObject({code:'A',review:'',assessment:{quote,observedAt:today}});
    expect(()=>saveLeadQualification(a,'music',input)).toThrow(/变化/);
    saveLeadQualification(a,'music',{...input,baseRevision:1,fit:'unknown',note:'校区是否适用仍待确认'});
    expect(current(a,'music','家长').code).toBe('B');
    saveLeadQualification(a,'music',{...input,baseRevision:2,action:'clear-qualification',note:'客户确认此前谈的是另一门课'});
    expect(current(a,'music','家长').code).toBe('pending');
    expect(a.leads[0].events.map(e=>[e.before,e.after])).toEqual([['pending','A'],['A','B'],['B','pending']]);
    expect(a.leads[0].events[0].assessment.quote).toBe(quote);
    expect(a.leads[0].messages).toHaveLength(1);
    expect(()=>saveLeadQualification(a,'music',{...input,baseRevision:3,action:'clear-qualification'})).toThrow(/没有/);
  });
  it('厨房收纳 · 出服务区记不适配，已知只做功课为 C，未知和商家自己已报价均不升档',()=>{
    const a={leads:[lead('外地','kitchen'),lead('装修','kitchen'),lead('报价','kitchen',{stage:'沟通中',messages:[{direction:'outbound',status:'sent_manual',text:'报价已发'}]})]};
    saveLeadQualification(a,'kitchen',assessment('外地',{fit:'no',note:'需要上门量尺，所在城市超出服务范围'}));
    saveLeadQualification(a,'kitchen',assessment('装修',{need:'exploring',commitment:'none',note:'半年后才装修，目前只想看看尺寸表'}));
    expect([...qualificationDirectory(a,'kitchen').contacts.values()].map(c=>c.summary.code)).toEqual(['unfit','C','pending']);
    expect(businessActions(a,'kitchen')).toEqual([]);
  });
  it('电商 · 成交、售后和新采购需求分开；只按当前可跟进需求计一个人',()=>{
    const a={leads:[lead('买家','shop',{stage:'已成交',intentTracks:[{kind:'service',status:'noted'}],messages:[message('退货','请问退货进度','售后')]} )],
      opportunities:[op('前单','买家','已成交'),op('售后','买家'),op('复购','买家')]};
    saveLeadQualification(a,'shop',assessment('买家',{opportunityId:'复购',opportunityRevision:1,commitment:'order',note:'核实规格和库存，采购确认按 40 件安排打样'}));
    const {contacts}=qualificationDirectory(a,'shop'),person=contacts.get('买家');
    expect(person.scopes.map(s=>s.code)).toEqual(['won','service','A']);
    expect(person.summary.scopeId).toBe('复购');
    expect(gradeDistribution(contacts)).toMatchObject({A:1,won:0,service:0});
    expect(businessResults(a,'shop')).toMatchObject({wonNeeds:1,wonContacts:1});
    expect(businessActions(a,'shop').map(x=>[x.id,x.label])).toEqual([['售后','待回复'],['复购','A 级待排期']]);
    a.opportunities[2].nextStep='寄样';a.opportunities[2].nextAt=new Date(Date.now()+86400000).toISOString();
    expect(businessActions(a,'shop').some(x=>x.id==='复购')).toBe(false);
    a.opportunities[2].stage='已结束';expect(current(a,'shop','买家').code).toBe('service');
    expect(()=>saveLeadQualification(a,'shop',assessment('买家',{opportunityId:'前单',opportunityRevision:1}))).toThrow(/状态/);
  });
  it('现有已确认需求与时间的销售记录可直接评 B，单独的报价阶段不足，撤销后维持待核实',()=>{
    const sales={id:'sale',stage:'quoted',need:'要买 20 只手提袋',timing:'下月布展前',updatedAt:today};
    const a={leads:[lead('门店','shop',{openfindSales:sales}),lead('只有阶段','shop',{openfindSales:{stage:'quoted'}})]};
    expect(current(a,'shop','门店')).toMatchObject({code:'B',derived:{quote:'要买 20 只手提袋 / 下月布展前'}});
    expect(current(a,'shop','只有阶段').code).toBe('pending');
    saveLeadQualification(a,'shop',assessment('门店',{action:'clear-qualification',note:'数量和时间属于另一笔采购'}));
    expect(current(a,'shop','门店').code).toBe('pending');
  });
});

describe('来源、复核与归属',()=>{
  it('不同业务标准各自生效，调整 A 门槛即时重算，保留旧版本防止并发覆盖',()=>{
    const a={leads:[lead('约定'),lead('采购','shop')]};
    saveLeadQualification(a,'music',assessment('约定',{commitment:'quote'}));
    saveLeadQualification(a,'shop',assessment('采购',{commitment:'quote'}));
    const policy={baseRevision:0,fitCriteria:'校区能承接对应年龄和课程',actions:['appointment'],reviewDays:14};
    saveQualificationPolicy(a,'music',policy);
    expect(current(a,'music','约定')).toMatchObject({code:'B',review:'本业务分级标准已更新'});
    expect(current(a,'shop','采购')).toMatchObject({code:'A',review:''});
    expect(()=>saveQualificationPolicy(a,'music',policy)).toThrow(/变化/);
    saveQualificationPolicy(a,'music',{...policy,baseRevision:1});
    expect(a.qualificationPolicies[0].revision).toBe(1);
    expect(()=>saveLeadQualification(a,'music',assessment('约定',{baseRevision:1}))).toThrow(/变化/);
    expect(a.leads[0].events[0]).toMatchObject({after:'A',fitCriteria:DEFAULT_POLICY.fitCriteria});
    for(const bad of [{actions:[]},{actions:['none']},{reviewDays:0},{reviewDays:366},{fitCriteria:'  '}])
      expect(()=>saveQualificationPolicy(a,'shop',{...policy,...bad})).toThrow();
  });
  it('不借用其他联系人、购买需求、业务、演示记录、未确认摘要或作者回复；原证据变化时停用结论',()=>{
    const good={id:'ok',customerId:'shop',leadId:'买家',status:'confirmed',text:'确认按这个规格订货',publishedAt:today};
    const a={leads:[lead('买家','shop',{signalIds:['ok','other','foreign','demo','author','snippet','orphan'],messages:[message('dm','前单来信','前单'),{...message('test','演示询价','复购'),demo:true}]}),lead('演示','shop',{demo:true})],
      opportunities:[op('前单','买家'),{...op('复购','买家'),signalIds:['ok','other','foreign','demo','author','snippet','orphan']}],
      signals:[good,{...good,id:'other',leadId:'旁人'},{...good,id:'foreign',customerId:'music'},{...good,id:'demo',source:'demo'},{...good,id:'author',isAuthorReply:true},{...good,id:'snippet',sourceType:'search_summary'},{...good,id:'orphan',workId:'missing'}]};
    const input=assessment('买家',{opportunityId:'复购',opportunityRevision:1,sourceKey:'signal:ok',sourceQuote:good.text});
    for(const key of ['signal:other','signal:foreign','signal:demo','signal:author','signal:snippet','signal:orphan','message:dm','message:test'])
      expect(()=>saveLeadQualification(a,'shop',{...input,sourceKey:key})).toThrow(/依据/);
    expect(()=>saveLeadQualification(a,'shop',{...input,sourceQuote:'修改过的原话'})).toThrow(/依据/);
    expect(()=>saveLeadQualification(a,'music',input)).toThrow(/真实联系人/);
    expect(()=>saveLeadQualification(a,'shop',{...input,leadId:'演示'})).toThrow(/真实联系人/);
    expect(()=>saveLeadQualification(a,'shop',{...input,opportunityId:''})).toThrow(/对应购买需求/);
    expect(()=>saveLeadQualification(a,'shop',{...input,opportunityRevision:0})).toThrow(/变化/);
    saveLeadQualification(a,'shop',input);
    expect(current(a,'shop','买家').code).toBe('A');
    good.status='excluded';
    const result=qualificationDirectory(a,'shop').contacts.get('买家').scopes[1];
    expect(result).toMatchObject({code:'pending',review:'原依据已变更或移除',assessment:{quote:input.sourceQuote}});
    expect(businessActions(a,'shop').find(x=>x.id==='复购').label).toBe('分级待复核');
  });
  it('填写表单过程中新增来信时先刷新核对，退订与人工恢复沿用实际发生时间',()=>{
    const a={leads:[lead('家长')]}, original=current(a,'music','家长').evidenceVersion;
    a.leads[0].messages.push(message('new','要先确认是否有周末课'));
    expect(()=>saveLeadQualification(a,'music',assessment('家长',{evidenceVersion:original}))).toThrow(/依据已变化/);
    a.leads[0].events.push({type:'unblock',at:'2026-04-08'});
    a.leads[0].messages.push({...message('old','别联系我','','2026-04-01'),createdAt:'2026-05-01'});
    expect(leadMarketingBlocked(a,a.leads[0])).toBe(false);
  });
  it('导入日期不冒充评论发生时间，已成交的联系人仍能正常承接及办结售后',()=>{
    const a={leads:[lead('老客户','shop',{stage:'已成交',messages:[message('service','我想知道退货进度')]})]};
    expect(current(a,'shop','老客户').code).toBe('service');
    a.leads[0].intentTracks=[{kind:'service',status:'won',updatedAt:new Date().toISOString()}];
    expect(current(a,'shop','老客户').code).toBe('won');
    const b={leads:[lead('家长','music',{signalIds:['s']})],signals:[{id:'s',leadId:'家长',customerId:'music',status:'confirmed',text:'愿意周六到校',collectedAt:today}]};
    const input=assessment('家长',{sourceKey:'signal:s',sourceQuote:'愿意周六到校',observedAt:''});
    expect(()=>saveLeadQualification(b,'music',input)).toThrow(/沟通时间/);
    saveLeadQualification(b,'music',{...input,observedAt:'2020-01-01T10:00:00Z'});
    expect(current(b,'music','家长').review).toContain('复核期');
  });
  it('过期或新增客户依据转为复核，销售自己更新、排期及草稿不刷新客户事实时间',()=>{
    const a={leads:[lead('家长')]};
    saveLeadQualification(a,'music',assessment('家长'));
    a.leads[0].updatedAt='2100-01-01';a.leads[0].messages.push({direction:'outbound',status:'draft',createdAt:'2100-01-01'});
    expect(current(a,'music','家长',Date.parse(today)+31*86400000)).toMatchObject({code:'A',review:expect.stringContaining('复核期')});
    const time=new Date(Date.now()+5000).toISOString();a.leads[0].messages.push(message('新的','周六时间可能要改','',time));
    expect(current(a,'music','家长',Date.parse(time))).toMatchObject({code:'A',review:'有新的客户依据'});
  });
  it('拒联跨购买需求，演示或他人原话不触发，明确恢复后才可排入队列',()=>{
    const a={leads:[lead('客户','shop',{messages:[message('m','以后不要联系了','旧单')]} )],opportunities:[op('旧单','客户'),op('新单','客户')]};
    expect(current(a,'shop','客户').code).toBe('blocked');
    expect(leadMarketingBlocked(a,a.leads[0])).toBe(true);
    expect(businessActions(a,'shop')).toEqual([]);
    a.leads[0].events.push({type:'unblock',at:new Date().toISOString(),note:'本人重新同意联系'});
    a.leads[0].messages.push({...message('demo','别再联系我了'),demo:true});
    expect(current(a,'shop','客户').code).toBe('pending');
    expect(leadMarketingBlocked(a,a.leads[0])).toBe(false);
    a.leads[0].doNotContact=true;
    expect(()=>saveLeadQualification(a,'shop',assessment('客户',{opportunityId:'新单',opportunityRevision:1}))).toThrow(/状态/);
  });
  it('按平台稳定身份去重，等级分布不相加重复记录；反馈优先于 A 级未排期',()=>{
    const a={leads:[lead('a'),lead('重复','music',{authorId:'a'}),lead('b','music',{messages:[message('b1','怎样报名？')]}),lead('演示','music',{demo:true})]};
    saveLeadQualification(a,'music',assessment('a'));
    expect(businessResults(a,'music')).toMatchObject({grades:{A:1,pending:1},contacts:2,wonContacts:0,wonNeeds:0});
    expect(businessActions(a,'music').map(x=>x.label)).toEqual(['待回复','A 级待排期']);
  });
});
