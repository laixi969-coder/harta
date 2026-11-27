import {afterEach, beforeEach, describe, expect, it} from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {businessMaterialContext} from './content-context.mjs';
import {findCreationEvidence, creationDocuments, creationEvidenceBasis} from './creation-evidence.mjs';
import {reviewContentFacts} from './content-review.mjs';
import {extractFile} from './materials.mjs';
import {readWorkspace, writeWorkspace} from './workspace.mjs';
import {generateProductionOutline, reviewProductionFacts} from './growth-workspace.mjs';
import {evaluateCreation} from '../evals/creation/provider.mjs';
import {fixture, scenarios} from '../evals/creation/fixtures.mjs';

describe('按问题与承诺找可回查的资料原文', () => {
  it.each(scenarios)('$industry · $position', async row => {
    const result=await evaluateCreation(row);
    expect(result).toMatchObject({retrieved:true,scopeClean:true,exceptionRetained:true,newClaimRetrieved:true,exactRanges:true});
  });
  it('相同问题的冲突条款均进入前五段，引用位置保留相邻例外', () => {
    const customer={readerQuestion:'柜门安装服务范围', creationDocuments:[
      {id:'a',title:'资料一',revision:1,body:'甲'.repeat(523)+'柜门安装服务范围只含木板。另有玻璃须先确认。'+'乙'.repeat(900)},
      {id:'b',title:'资料二',revision:3,body:'柜门安装服务范围含木板和玻璃。门框需另行确认。'},
    ]};
    const rows=findCreationEvidence(customer);
    expect(rows.map(r=>r.id)).toEqual(expect.arrayContaining(['a','b']));
    expect(rows.find(r=>r.id==='a').text).toContain('另有玻璃须先确认');
    for (const row of rows) expect(customer.creationDocuments.find(d=>d.id===row.id).body.slice(row.offset,row.offset+row.text.length)).toBe(row.text);
  });
  it('长上传取出的中段进入预算，保留原件标识；已限定规格时排除通用附件', async () => {
    const dir=fs.mkdtempSync(path.join(os.tmpdir(),'harta-text-evidence-'));
    try {
      const quote='星桥街道提供上门测量，河西片区只提供图纸咨询。';
      const file=path.join(dir,'范围.txt');fs.writeFileSync(file,'甲'.repeat(30000)+quote+'乙'.repeat(29000));
      const {text}=await extractFile({originalFilename:'范围.txt'},file,dir);
      const customer={id:'c',materialBatchId:'batch',readerQuestion:'星桥街道可上门测量吗',sourceMaterial:'【范围.txt】\n'+text};
      const batch=()=>({sources:[{id:'s1',name:'范围.txt',text}]});
      customer.creationDocuments=creationDocuments('owner',{},customer,undefined,batch);
      expect(businessMaterialContext(customer,{retrieve:false}).text).not.toContain(quote);
      const result=businessMaterialContext(customer);
      expect(result.excerpts[0]).toMatchObject({id:'batch/s1',revision:expect.stringMatching(/^[0-9a-f]{64}$/)});
      expect(result.text).toContain(quote);
      expect(result.text.length).toBeLessThan(30200);
      expect(creationDocuments('owner',{},customer,{products:[{}]},batch)).toEqual([]);
    } finally {fs.rmSync(dir,{recursive:true,force:true});}
  });
});

describe('制作与事实核对沿用当前产品和资料版本',()=>{
  let dir,original;
  const email='retrieval-test@example.invalid', identity={customerId:'synthetic',packId:'paper',platform:'小红书',index:0,format:'image'};
  const budget=(_email,_customer,_purpose,run)=>run();
  beforeEach(()=>{
    original=process.cwd();dir=fs.mkdtempSync(path.join(os.tmpdir(),'harta-scope-evidence-'));process.chdir(dir);
  });
  afterEach(()=>{process.chdir(original);fs.rmSync(dir,{recursive:true,force:true});});
  it('重查制作稿新增承诺；销售资料改版时拒绝保存陈旧核对',async()=>{
    const {sample,customer,scope,space}=fixture('shop','中间');
    const pack={id:'paper',tier:'今日',origin:{mode:'manual',readerQuestion:sample.question},
      productScope:{productIds:scope.productIds,skuIds:scope.skuIds},shells:{小红书:[{title:sample.question,body:''}]}};
    space.customers=[{...customer,packs:[],drops:[pack]}];
    space.acquisition.products=scope.products;
    space.acquisition.skus=scope.skus.map(s=>({...s,customerId:customer.id,revision:1,status:'active'}));
    writeWorkspace(email,space);
    await generateProductionOutline(email,{...identity,workingFields:{}},{budget,chatFn:async req=>{
      expect(req.user).toContain(sample.fact);expect(req.user).not.toContain('错误样本专用标记');
      return JSON.stringify({script:sample.fact,shots:sample.fact});
    }});
    const input={...identity,fields:{title:sample.question,script:sample.claim}};
    const checked=await reviewProductionFacts(email,input,{budget,reviewFn:(draft,c,options)=>reviewContentFacts(draft,c,{...options,chatFn:async req=>{
      expect(req.user).toContain(sample.after);expect(req.user).not.toContain('错误样本专用标记');
      return JSON.stringify({approved:false,issues:[{index:1,quote:sample.claim,reason:'与退货条款矛盾',fix:'改为随盒隔板须一并退回'}]});
    }})});
    expect(checked.excerpts.some(e=>e.id==='later'&&e.text.includes(sample.after))).toBe(true);
    expect(checked.issues[0]).toContain(sample.claim);
    const originalBasis=creationEvidenceBasis(creationDocuments(email,space,customer,scope,()=>null));
    await expect(reviewProductionFacts(email,input,{budget,reviewFn:async()=>{
      const updated=readWorkspace(email);updated.acquisition.salesDocuments[0].revision++;writeWorkspace(email,updated);return [];
    }})).rejects.toThrow('资料已变化');
    expect(creationEvidenceBasis(creationDocuments(email,readWorkspace(email),customer,scope,()=>null))).not.toBe(originalBasis);
  });
});
