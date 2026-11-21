import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {beforeAll,afterAll,beforeEach,describe,it,expect,vi} from 'vitest';
import {readWorkspace,writeWorkspace,dropToday,setFeedback} from './workspace.mjs';
import {businessSearchTerms,observationCatalog,problemSource} from './problem-observation-data.mjs';
import {topicBoardAction} from './topic-board.mjs';
import {generateProductionOutline,saveProductionDraft,applyProductionDraft,confirmProductionClaim,verifyProductionDownload} from './growth-workspace.mjs';
import {savedProductionClaims,productionClaims,openProductionClaims} from '../js/production-claims.js';
import {packAsSent} from '../js/pack-edits.js';
import {distillPlaybook,observedPerformance} from './writing-knowledge.mjs';
import {studioAcquisitionOverview} from '../js/studio-overview.js';
import {generateTodayDrop} from './generate.mjs';
import {prepareKeywordBatch,selectedKeywordBatch,keywordContext} from './keyword-library.mjs';
import {expandKeywordBatch} from './keyword-expand.mjs';
import {shortVideoLink,shortShootSheet} from '../js/practical-shorts.js';
import {workReferences} from './work-references.mjs';
import {searchShortReferences,saveShortReference} from './short-references.mjs';
import {creatorRadar} from '../js/creator-radar.js';
import {topicSource} from './topic-board-data.mjs';
import {productionDocument} from '../js/production-workflow.js';
import {parseImagePages,paginateProse,productionInventory} from '../js/image-pages.js';
vi.mock('./generate.mjs',async load=>({...await load(),generateTodayDrop:vi.fn()}));

const root=process.cwd(),email='review@example.invalid',args={customerId:'c',packId:'p',platform:'小红书',index:0};
const promise='我们会在48小时内提交设计图。';
const material={id:'c',name:'家装工作室',hunt:'家装',pitch:'厨房收纳设计',city:'杭州',growthGoal:'leads',observationNotes:[
  {id:'q',kind:'customer',text:'柜门怎么关不上？',source:'客户来访记录'},
  {id:'a',kind:'answer',text:'量取铰链内侧的可用净宽。',source:'业务测量流程'}]};
let dir;
const business=()=>readWorkspace(email).customers[0];
const getPack=()=>business().drops.find(p=>p.id==='p');
beforeAll(()=>{dir=fs.mkdtempSync(path.join(os.tmpdir(),'harta-review-'));fs.symlinkSync(path.join(root,'vendor'),path.join(dir,'vendor'));process.chdir(dir);});
afterAll(()=>{process.chdir(root);fs.rmSync(dir,{recursive:true,force:true});});
beforeEach(()=>{
  const c=structuredClone(material),[question,answer]=observationCatalog(c);
  const source=s=>({...s,quote:s.text});
  c.observedProblems=[{id:'problem',version:1,status:'ready',review:{source:'manual'},question:question.text,coreAnswer:answer.text,evidence:[source(question)],answerEvidence:[source(answer)],angles:[{id:'judgment',type:'judgment',title:'先量铰链内侧'}]}];
  c.drops=[{id:'p',tier:'今日',origin:{mode:'organic'},shells:{小红书:[{title:'量柜门',body:promise}]},copies:{},execution:[]}];
  writeWorkspace(email,{customers:[c],acquisition:{},contentStates:{},feedback:{},ledger:[]});
  vi.mocked(generateTodayDrop).mockReset().mockResolvedValue({id:'made',tier:'今日',shells:{小红书:[{title:'先量铰链内侧',body:answer.text}]}});
});
const marked=(fields={title:'测量',script:promise})=>saveProductionDraft(email,{...args,version:0,fields,generationReview:{status:'completed',warnings:['事实核对提示：资料中未给出48小时的交付承诺。','编辑建议：开场再短一点。']}});

describe('采用和交付经营承诺',()=>{
  it.each(['改写','删除','补依据'])('%s 才能交付已标出的工期',route=>{
    marked();const draft=getPack().productionDrafts['小红书|0'],[claim]=savedProductionClaims(getPack(),'小红书|0',draft);
    expect(()=>applyProductionDraft(email,{...args,version:1,confirmed:true})).toThrow('48小时');
    expect(()=>verifyProductionDownload(email,{...args,fields:draft.fields})).toThrow('48小时');
    if(route==='补依据'){
      expect(()=>confirmProductionClaim(email,{...args,claimId:claim.id,version:1,source:'签约条款',excerpt:''})).toThrow('原文');
      confirmProductionClaim(email,{...args,claimId:claim.id,version:1,source:'双方确认的设计协议第3条',excerpt:'确认测量稿后48小时内提交设计图。'});
    }else saveProductionDraft(email,{...args,version:1,fields:{...draft.fields,script:route==='删除'?'':claim.replacement}});
    const final=getPack().productionDrafts['小红书|0'];verifyProductionDownload(email,{...args,fields:final.fields});
    applyProductionDraft(email,{...args,version:2,confirmed:true});
    expect(packAsSent(getPack()).shells.小红书[0].body).toBe(route==='删除'?'':route==='改写'?claim.replacement:promise);
    if(route==='补依据'){const s=readWorkspace(email);s.customers[0].pitch+='、局部改造';writeWorkspace(email,s);expect(()=>verifyProductionDownload(email,{...args,fields:final.fields})).toThrow('48小时');}
  });
  it('替换句可直接引用现有已确认事实，仍需核对适用范围',()=>{
    const fields={script:promise},current={text:'设计图按签约排期交付。',source:'设计协议',status:'confirmed'};
    const claims=productionClaims(['「'+promise+'」缺少工期依据；修改建议：改为「'+current.text+'」。'],fields);
    expect(openProductionClaims(claims,fields,'basis',[current])[0].replacement).toBe(current.text);
    for(const facts of [[],[{...current,status:'pending'}],[{...current,scope:'只限试点客户'}]])expect(openProductionClaims(claims,fields,'basis',facts)[0].replacement).not.toBe(current.text);
  });
  it('普通编辑意见不阻断',()=>{
    saveProductionDraft(email,{...args,version:0,fields:{script:'先看看铰链。'},generationReview:{status:'completed',warnings:['编辑建议：「先看看铰链」的开头缺少画面元素。']}});
    expect(()=>applyProductionDraft(email,{...args,version:1,confirmed:true})).not.toThrow();
  });
});
describe('创作入口与回查',()=>{
  it.each([['音乐教育','小提琴启蒙'],['家装','局部厨房翻新'],['电商','收纳盒']])('新建%s业务的建议词来自本业务',(hunt,pitch)=>{
    const terms=businessSearchTerms({id:'x',hunt,pitch,city:'杭州'},{products:[{customerId:'elsewhere',status:'active',name:'跑步鞋'}]});
    expect(terms.length).toBeGreaterThanOrEqual(2);expect(terms[0]).toContain(pitch);expect(terms.join()).not.toContain('跑步鞋');
  });
  it('主入口和选题库使用同一问题、客户原话和答案依据',async()=>{
    const src=problemSource(business(),{},'problem|judgment');
    await topicBoardAction(email,{customerId:'c',action:'create',kind:'problem',sourceKey:'problem|judgment'});
    dropToday(email,'c',{problemKey:'problem|judgment',problemBasis:src.basis});
    await vi.waitFor(()=>expect(business().lastRun?.status).toBe('done'));
    const c=business(),made=c.drops[0];
    expect(made.topicSnapshot.source).toEqual(c.topicPlans[0].sourceSnapshot);
    expect(made.topicSnapshot.sourceBasis).toBe(c.topicPlans[0].sourceBasis);
    expect(generateTodayDrop.mock.calls[0][0].reviewedProblem.answerEvidence[0].quote).toBe(material.observationNotes[1].text);
    const latest=readWorkspace(email);latest.customers[0].observationNotes[1].text+='请现场核对';writeWorkspace(email,latest);
    expect(dropToday(email,'c',{problemKey:'problem|judgment',problemBasis:src.basis}).error).toContain('已变化');
    expect(()=>verifyProductionDownload(email,{...args,packId:'made',fields:{}})).toThrow('依据已变化');
  });
  it('生成期间更换依据时拒绝旧结果，冷启动可以自拟问题',async()=>{
    let finish;generateTodayDrop.mockImplementationOnce(()=>new Promise(resolve=>{finish=resolve;}));
    dropToday(email,'c',{problemKey:'problem|judgment',problemBasis:problemSource(business(),{},'problem|judgment').basis});
    await vi.waitFor(()=>expect(finish).toBeTypeOf('function'));
    const latest=readWorkspace(email);latest.customers[0].observationNotes[0].text='另一个问题';writeWorkspace(email,latest);
    finish({id:'expired'});await vi.waitFor(()=>expect(business().job).toBeFalsy());expect(business().drops.some(p=>p.id==='expired')).toBe(false);
    dropToday(email,'c',{readerQuestion:'第一次学小提琴该怎样挑琴？'});await vi.waitFor(()=>expect(business().drops[0].id).toBe('made'));
    expect(business().drops[0].origin.readerQuestion).toContain('挑琴');
  });
});
it('从真实登记的不可变发布版本学习，低曝光、收藏和有效咨询分别建议',()=>{
  const s=readWorkspace(email),c=s.customers[0],p=c.drops[0];p.edits={'小红书|0|body':{now:'这是采用稿。'}};
  s.acquisition.publications=[{id:'pub',status:'published',customerId:'c',packId:'p',platform:'小红书',index:0,accountId:'account',goal:'leads',content:{body:'已发的是这一句。接着量铰链。'}}];writeWorkspace(email,s);
  const key='p-平台-小红书-0';setFeedback(email,key,'replied');
  const later=readWorkspace(email);later.customers[0].drops[0].edits['小红书|0|body'].now='又改了。';const card=distillPlaybook(later.customers[0],later.feedback,{space:later}).cards[0];
  expect([card.opener,card.versionSource]).toEqual(['已发的是这一句。','登记发布版本']);
  expect(observedPerformance({goal:'reach',baseline:90,metrics:{views:10}})).toContain('曝光不足');
  expect(observedPerformance({metrics:{collects:4,inquiries:0}})).toContain('承接');
  expect(observedPerformance({metrics:{collects:4,inquiries:2,qualifiedLeads:0}})).toContain('有效咨询为零');
  expect(observedPerformance({metrics:{qualifiedLeads:1}})).toContain('有效咨询');
  c.drops[0].outcomes={one:[{platform:'小红书',goal:'leads',start:'2026-11-01',end:'2026-11-08',source:'平台后台',metrics:{qualifiedLeads:0}}]};
  const html=studioAcquisitionOverview(c);expect(html).toContain('平台后台');expect(html).toContain('<strong>0</strong><span>有效客资');
});
it('本地梳理文档和多表来源，放弃的词不进入下一次研究',async()=>{
  const file=path.join(dir,'材料.txt');fs.writeFileSync(file,'铰链占位怎么测量？测量铰链内侧的净宽，再比较柜门收纳盒。');
  const batch=await prepareKeywordBatch([{path:file,name:'材料.txt'}],{type:'产品品类',name:'收纳盒'},{modelReady:false});
  const candidate=batch.items.find(r=>r.keyword.includes('怎么测量'));
  expect(candidate.evidence[0].fields[0].value).toContain(candidate.keyword);
  const selected=selectedKeywordBatch(batch,[candidate.id]);expect(keywordContext({keywordLibraries:[selected]}).map(r=>r.keyword)).toEqual([candidate.keyword]);
  const fetcher=async()=>Response.json({errcode:0,data:{word:[{keyword:'铰链收纳盒',index:0,douyin_index:28}]}});
  const official=await expandKeywordBatch({provider:'5118',customer:{hunt:'家居'},seeds:['铰链'],scopeType:'品牌',scopeName:'样品品牌',fetcher},{keywordKey:'fixture'});
  const fields=official.items[0].evidence[0].fields;expect(fields.find(f=>f.name==='流量指数').value).toBe('0');expect(fields.find(f=>f.name==='移动指数').value).toBe('');
  expect(official.items[0].brand).toBe('样品品牌');
});
it('只收有可见拍法证据的海外原片链接，合并追踪参数并报告搜索覆盖',async()=>{
  const url='https://www.youtube.com/shorts/A1b2C3d4E5f',rows=[
    {title:'A paper sign flips to reveal a message',url:url+'?si=abc',content:'A hand pulls the paper card.'},
    {title:'Paper card reveal again',url}, {title:'paper market update',url:'https://www.youtube.com/shorts/A1b2C3d4E5g'},
    {title:'paper reveal with a motion-control rig',url:'https://www.youtube.com/shorts/A1b2C3d4E5h'},
    {title:'paper reveal',url:'https://www.youtube.com/@creator'}];
  const fetcher=async request=>{expect(new URL(request).searchParams.get('language')).toBe('en');expect(new URL(request).searchParams.has('time_range')).toBe(false);return Response.json({results:rows,unresponsive_engines:[['provider','timeout']]});};
  const result=await searchShortReferences('paper',{config:{searxngUrl:'https://search.example.invalid'},fetcher});
  expect(result.rows.map(r=>r.url)).toEqual([url]);expect(result.notice).toContain('部分');expect(shortVideoLink('https://youtube.com.example/shorts/A1b2C3d4E5f')).toBeNull();
  expect((await searchShortReferences('paper',{config:{}})).notice).toContain('到平台');
});
it('看片和本地拍摄条件随业务参考进入雷达、选题、脚本交付，重复保存不会生成第二条',async()=>{
  const input={customerId:'c',technique:'paper',url:'https://www.instagram.com/reel/Example01/',title:'手翻纸牌',observedAction:'拉线后第二张牌露出答案',shortSetup:'一张桌子两张卡，用一台手机固定拍摄',watched:true};
  expect(()=>saveShortReference(email,{...input,watched:false})).toThrow('观看');
  expect(()=>saveShortReference(email,{...input,shortSetup:''})).toThrow('条件');
  expect(()=>saveShortReference(email,{...input,customerId:'another'})).toThrow('业务');
  const {workId}=saveShortReference(email,input);expect(saveShortReference(email,input).workId).toBe(workId);
  const s=readWorkspace(email),c=s.customers[0],ref=workReferences(s,c.id,[workId]);
  expect(creatorRadar(c,s.acquisition.works).items[0].work.id).toBe(workId);
  expect(topicSource(c,s.acquisition,'work',workId).snapshot.shortSetup).toBe(input.shortSetup);
  const delivery=productionDocument({shots:'先拍夹住卡片的手'},'video','抖音',[],ref);
  for(const text of [input.url,input.observedAction,input.shortSetup,'更简拍法','第一镜','逐镜屏幕字 / 口播'])expect(delivery).toContain(text);
  c.drops[0].workReferences=ref;writeWorkspace(email,s);let prompt='';
  await generateProductionOutline(email,{...args,format:'video',workingFields:{title:'先看哪一张纸'}},{budget:(e,c,k,run)=>run(),chatFn:async request=>{
    prompt=request.user;return JSON.stringify({script:'先看第一张。',hook:'一只手翻卡。',shots:'手指压住纸边。\n翻开纸卡。\n露出第二面。',shootMaterials:'两张纸卡',cover:'翻面揭晓',cta:'再看背面。'});
  }});
  for(const detail of [input.shortSetup,input.observedAction,'可以全程无口播','揭晓'])expect(prompt).toContain(detail);
  expect(shortShootSheet('screens')).toContain('只有一部手机');expect(workReferences(s,'else',[])).toEqual([]);
});
it('逐页排版保留原字，拍摄清单区分已有照片与待拍物件',()=>{
  const raw=Array.from({length:15},(_,i)=>'第'+(i+1)+'次先测量，再核对。').join('\n');
  const pages=parseImagePages(paginateProse(raw));expect(pages.join('')).toBe(raw.replaceAll('\n',''));
  const inventory=productionInventory({id:'c',materialBatchId:'batch',materials:[{id:'s1',kind:'图片',name:'铰链.jpg'}]},{deliveryAssets:[{customerId:'other',id:'bad',originalName:'别人.jpg'}]});
  const doc=productionDocument({shots:'先拍柜门碰到盒子。\n拿开盒子。',hook:'看这里。',shootMaterials:'铰链\n卷尺'},'video','抖音',inventory);
  expect(doc).toContain('第一镜\n先拍柜门');expect(doc).toContain('铰链 · 已有文件 铰链.jpg');expect(doc).toContain('卷尺 · 待准备或补拍');expect(doc).not.toContain('别人');
});
