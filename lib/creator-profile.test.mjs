import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {beforeAll,afterAll,beforeEach,it,expect} from 'vitest';
import {readWorkspace,writeWorkspace} from './workspace.mjs';
import {saveCreatorProfile} from './growth-workspace.mjs';
import {evaluateCreatorProfile,profileBrief} from '../js/creator-profile.js';
import {renderCreatorProfile,profileAssessmentHtml} from '../js/creator-profile-ui.js';
import {businessMaterialContext} from './content-context.mjs';
import {researchFingerprint} from './research.mjs';
const email='persona-test@example.com',previous=process.cwd();let dir;
beforeAll(()=>{dir=fs.mkdtempSync(path.join(os.tmpdir(),'harta-persona-'));process.chdir(dir);});
afterAll(()=>{process.chdir(previous);fs.rmSync(dir,{recursive:true,force:true});});
beforeEach(()=>writeWorkspace(email,{seedVersion:999,customers:[{id:'c1',name:'厨房业务',hunt:'家装',drops:[],packs:[]}]}));
const customer=()=>readWorkspace(email).customers[0];
const change=(action,fields={},extra={})=>{const c=customer();return saveCreatorProfile(email,{customerId:'c1',version:c.creatorProfile?.version || 0,draftVersion:c.creatorProfileDraft?.version || 0,action,fields,...extra});};
it('保存草稿持久化但不进入创作依据、不改变已采用版本或研究缓存',()=>{
  const before=researchFingerprint(customer(),{});
  change('save-draft',{identity:'我是设计师',voice:'短句'});
  expect(customer().creatorProfileDraft.fields.identity).toBe('我是设计师');
  expect(customer().creatorProfile).toBeUndefined();expect(profileBrief(customer())).toBe('');
  expect(researchFingerprint(customer(),{})).toBe(before);
});
it('逐项采用不覆盖其他字段和其他草稿，整批采用与撤回保留历史',()=>{
  change('save-draft',{identity:'设计师',voice:'短句'});
  change('adopt-field',{identity:'厨房设计师'},{key:'identity'});
  expect(profileBrief(customer())).toContain('厨房设计师');expect(profileBrief(customer())).not.toContain('短句');
  expect(customer().creatorProfileDraft.fields.voice).toBe('短句');
  change('adopt-all',customer().creatorProfileDraft.fields);
  expect(profileBrief(customer())).toContain('短句');
  change('clear-field',{}, {key:'identity'});
  expect(customer().creatorProfile.fields).toMatchObject({identity:'',voice:'短句'});
  expect(customer().creatorProfileDraft.fields.identity).toBe('厨房设计师');
  expect(customer().creatorProfileHistory.at(-1).fields.identity).toBe('厨房设计师');
  change('adopt-all',{});expect(profileBrief(customer())).toBe('');
});
it('并发草稿与已采用版本分别校验，失败不落盘；业务隔离且字段操作严格校验',()=>{
  change('save-draft',{identity:'草稿'});const before=customer();
  expect(()=>saveCreatorProfile(email,{customerId:'c1',version:0,draftVersion:0,action:'adopt-all',fields:{identity:'过期'}})).toThrow('草稿已被修改');
  expect(customer()).toEqual(before);
  expect(()=>change('adopt-field',{identity:''},{key:'identity'})).toThrow('撤回');
  expect(()=>change('adopt-field',{}, {key:'__proto__'})).toThrow('未知');
  expect(()=>change('unknown',{})).toThrow('未知');
  expect(()=>change('save-draft',{identity:123})).toThrow('2000');
  expect(()=>saveCreatorProfile('other@example.com',{customerId:'c1',version:0,draftVersion:1,action:'save-draft',fields:{}})).toThrow('没有这个客户');
  change('adopt-field',{identity:'采用'},{key:'identity'});
  expect(()=>saveCreatorProfile(email,{customerId:'c1',version:0,draftVersion:2,action:'save-draft',fields:{}})).toThrow('资料已被修改');
});
it('评估区分空白、待采用、已采用与清空，不从字数推断质量或事实',()=>{
  const report=evaluateCreatorProfile({identity:'  设计师 ',voice:'口语'},{identity:'设计师',evidence:'旧经历'});
  expect(report).toMatchObject({filled:2,adopted:2,total:7});
  expect(report.rows.map(r=>r.status)).toEqual(['已采用','清空待采用','待填写','待采用','待填写','待填写','待填写']);
  expect(report).not.toHaveProperty('score');
  const c={creatorProfile:{version:2,fields:{identity:'<script>alert(1)</script>'}},creatorProfileDraft:{version:3,fields:{voice:'未采用'}}};
  const html=renderCreatorProfile(c,{'profile-voice':'输入中',__profileBasis:{version:1,draftVersion:2}});
  expect(html).toContain('资料或草稿已更新');expect(html).toContain('输入中');expect(html).not.toContain('<script>');
  expect(html).toContain('data-version="1"');expect(profileAssessmentHtml({},{})).toContain('当前填写 0 / 7');
});

it('咨询入口只在采用后进入生成与事实核对依据，旧客户端省略新字段不会清空入口',()=>{
 const entry='小红书：站内私信说明厨房尺寸；公众号：菜单预约咨询',before=researchFingerprint(customer(),{});
 change('save-draft',{contactEntry:entry});expect(profileBrief(customer())).not.toContain(entry);expect(businessMaterialContext(customer()).text).not.toContain(entry);expect(researchFingerprint(customer(),{})).toBe(before);
 change('adopt-field',{contactEntry:entry},{key:'contactEntry'});expect(profileBrief(customer())).toContain(entry);expect(businessMaterialContext(customer()).text).toContain(entry);expect(researchFingerprint(customer(),{})).not.toBe(before);
 change('adopt-all',{identity:'来自旧客户端'});expect(customer().creatorProfile.fields.contactEntry).toBe(entry);
 saveCreatorProfile(email,{customerId:'c1',version:customer().creatorProfile.version,fields:{identity:'旧接口保存'}});expect(customer().creatorProfile.fields.contactEntry).toBe(entry);
 change('clear-field',{}, {key:'contactEntry'});expect(profileBrief(customer())).not.toContain(entry);expect(businessMaterialContext(customer()).text).not.toContain(entry);expect(customer().creatorProfileHistory.at(-1).fields.contactEntry).toBe(entry);expect(customer().creatorProfileDraft.fields.contactEntry).toBe(entry);
 change('adopt-all',{contactEntry:''});expect(customer().creatorProfile.fields.contactEntry).toBe('');
});
