import {describe,it,expect} from 'vitest';
import {checkPack} from './check.mjs';
import {deliveryFields,deliveryIssues,titleCount} from '../js/platform-content.js';
import {packAsSent} from './pack-edits.mjs';
import {contentExportData} from './content-export.mjs';

describe('平台交付契约',()=>{
 it('诊断样例不要求完整发布字段，正式内容仍需完整封面和正文',()=>{
  const sample={copies:{},shells:{小红书:[{title:'就诊前先问清费用'}]}};
  expect(checkPack({...sample,tier:'快档'},'医药').quality.filter(q=>q.code==='platform-structure')).toEqual([]);
  expect(checkPack({...sample,tier:'今日'},'医药').quality.some(q=>q.code==='platform-structure')).toBe(true);
 });
 it('自然内容不输出机构审核清单，仍检查实际疗效承诺',()=>{
  const p={origin:{mode:'organic'},copies:{A:['保证三个月转阴']},shells:{}};
  const checks=checkPack(p,'医药');
  expect(checks.guardrails).toEqual([]);
  expect(checks.redline.length).toBeGreaterThan(0);
 });
 it('标题边界包含英文、数字、标点和emoji',()=>{
  expect(titleCount('HPV检查？🙂')).toBe(7);
  const base={cover:'先问清费用',body:'去官方窗口核对说明'};
  expect(deliveryIssues('小红书',{...base,title:'字'.repeat(20)})).toEqual([]);
  expect(deliveryIssues('小红书',{...base,title:'字'.repeat(20)+'!'})).toEqual([expect.objectContaining({field:'title'})]);
 });
 it('旧档缺标题或封面会显示硬错误，不能把正文当完整成品',()=>{
  const p={copies:{},shells:{小红书:[{body:'具体正文'}]}};
  const checks=checkPack(p,'家装');
  expect(checks.quality).toContainEqual(expect.objectContaining({code:'platform-structure',level:'hard',text:'具体正文',why:expect.stringContaining('缺少笔记标题')}));
  expect(contentExportData({pack:{...p,checks},customer:{},options:{kind:'shells'}}).rows).toEqual([]);
 });
 it('可通过编辑补齐旧档缺失字段，并进入校验和导出',()=>{
  const p={id:'p',copies:{},shells:{小红书:[{body:'核对真实服务流程'}]},edits:{'小红书|0|title':{now:'预约前先问清'},'小红书|0|cover':{now:'先问再预约'}}};
  expect(packAsSent(p).shells.小红书[0].title).toBe('预约前先问清');
  p.checks=checkPack(p,'家装');
  expect(p.checks.quality.filter(i=>i.code==='platform-structure')).toEqual([]);
  expect(contentExportData({pack:p,customer:{},options:{kind:'shells'}}).rows).toHaveLength(3);
 });
 it.each(['抖音','视频号'])('%s的视频字段编辑、导出不丢失',platform=>{
  const item={title:'发布描述',cover:'封面',body:'完整脚本',coverLayout:'文字左，人物右',hook:'先展示问题',shots:'0-3｜画面｜开头\n3-20｜画面｜论据\n20-30｜画面｜收尾',cta:'核对官方预约渠道'};
  const p={id:'p',copies:{},shells:{[platform]:[item]},edits:{[`${platform}|0|shots`]:{now:'改后的分镜'}}};
  const rows=contentExportData({pack:p,customer:{},options:{kind:'shells'}}).rows;
  expect(rows).toHaveLength(7);expect(rows.find(r=>r.field==='分镜与字幕').text).toBe('改后的分镜');
  expect(deliveryFields(platform).map(f=>f.key)).toContain('hook');
 });
 it('新版小红书缺排版说明不通过，但兼容旧档基本三件套',()=>{
  const item={title:'预约前先问',cover:'不白跑',body:'向官方窗口确认预约方式。'};
  expect(deliveryIssues('小红书',item)).toEqual([]);
  expect(deliveryIssues('小红书',item,{complete:true})).toContainEqual(expect.objectContaining({field:'coverLayout'}));
 });
});
