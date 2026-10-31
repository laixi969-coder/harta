import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {beforeAll,afterAll,beforeEach,it,expect} from 'vitest';
import {readWorkspace,writeWorkspace} from './workspace.mjs';
import {saveCreationStandards} from './growth-workspace.mjs';
import {reviewStudioText} from './studio-standard-review.mjs';
const root=process.cwd(),email='studio-review@example.test';let dir;
const content={title:'厨房设计',body:'先核对需求与报价。',tags:['厨房'],platform:'xiaohongshu',kind:'image'};
const manual={id:'rule-proof',title:'核对依据',rule:'核对文案有依据',mode:'manual',severity:'block'};
const save=(rules,version=0)=>saveCreationStandards(email,{customerId:'c1',version,rules});
const check=()=>reviewStudioText(email,'c1',{action:'check',content});
const prepare=(report,extra={})=>reviewStudioText(email,'c1',{action:'prepare',content,basis:report.basis,confirmedRuleIds:[manual.id],...extra});
beforeAll(()=>{dir=fs.mkdtempSync(path.join(os.tmpdir(),'harta-studio-rule-test-'));process.chdir(dir);});
afterAll(()=>{process.chdir(root);fs.rmSync(dir,{recursive:true,force:true});});
beforeEach(()=>writeWorkspace(email,{seedVersion:999,customers:[{id:'c1',name:'甲',drops:[]},{id:'c2',name:'乙',drops:[]}]}));
it('uses shared warning/blocking rules and checks hashtags as copied text',()=>{
 save([{id:'rule-quote',title:'报价表达',rule:'报价',mode:'forbid',severity:'warn'},manual]);let report=check();expect(report.blocked).toBe(false);expect(report.checks[0].status).toBe('issue');expect(report.needsConfirmation).toEqual(['rule-proof']);
 expect(()=>prepare(report,{confirmedRuleIds:[]})).toThrow('逐项确认');const result=prepare(report);expect(result.text).toBe('厨房设计\n\n先核对需求与报价。\n\n#厨房');expect(result.record.status).toBe('copy_prepared');expect(result.record.checks[0].severity).toBe('warn');
 save([{id:'rule-tag',title:'话题检查',rule:'厨房',mode:'forbid',severity:'block'}],1);report=check();expect(report.blocked).toBe(true);expect(()=>prepare(report)).toThrow('话题检查');
});
it('revalidates business standards and every copied content dimension before preparation',()=>{
 save([manual]);const report=check();
 for(const change of [{title:'新标题'},{body:'新正文'},{tags:['家装']},{platform:'douyin'},{kind:'video'}])expect(()=>prepare(report,{content:{...content,...change}})).toThrow('已变化');
 save([manual],1);expect(()=>prepare(report)).toThrow('已变化');expect(readWorkspace(email).customers[0].studioTextReviews).toBeUndefined();
});
it('rejects legacy forbidden terms and isolates histories and confirmation tokens by business and owner',()=>{
 saveCreationStandards(email,{customerId:'c1',version:0,forbidden:'报价'});expect(check().blocked).toBe(true);expect(()=>prepare(check())).toThrow('业务禁用词');
 save([],1);const report=check();prepare(report);expect(check().history).toHaveLength(1);
 const other=reviewStudioText(email,'c2',{action:'check',content});expect(other.history).toEqual([]);expect(()=>reviewStudioText(email,'c2',{action:'prepare',content,basis:report.basis})).toThrow('已变化');
 expect(()=>reviewStudioText('other@example.test','c1',{action:'check',content})).toThrow('当前业务');
});
it('keeps immutable rule/content snapshots and validates malformed input before writing history',()=>{
 save([manual]);prepare(check());save([],1);const history=check().history;expect(history[0].checks[0].rule).toBe('核对文案有依据');expect(history[0].version).toBe(1);
 for(const item of [{tags:['#不规范']},{title:''},{title:'x'.repeat(21)},{body:'x'.repeat(1001)},{tags:Array(21).fill('tag')},{platform:'other'},{kind:'script'}])expect(()=>reviewStudioText(email,'c1',{action:'prepare',content:{...content,...item}})).toThrow();
 expect(check().history).toHaveLength(1);
});
