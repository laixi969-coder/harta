import { describe, it, expect } from 'vitest';
import { carryOutcome } from './outcome-carry.js';

describe('复盘补录',()=>{
 const saved={start:'2026-01-01',end:'2026-01-07',source:'后台截图',criteria:'按人去重',publicationId:'pub',accountId:'account',metrics:{views:100,qualifiedLeads:0,completionRate:30.5}};
 it('只补空白字段，保留已填值和零',()=>{
  expect(carryOutcome(saved,{start:'2026-01-01',completionRate:'35'},{})).toEqual({end:'2026-01-07',source:'后台截图',criteria:'按人去重',views:'100',qualifiedLeads:'0'});
  expect(carryOutcome(saved,{}, {metricPrefix:'metric-'})).toMatchObject({'metric-views':'100','metric-qualifiedLeads':'0','metric-completionRate':'30.5'});
 });
 it('拒绝跨统计窗口、发布记录或账号混用',()=>{
  expect(()=>carryOutcome(saved,{start:'2026-01-02'})).toThrow('统计窗口');
  expect(()=>carryOutcome(saved,{publicationId:'other'},{checkPublication:true})).toThrow('发布记录');
  expect(()=>carryOutcome(saved,{publicationId:'pub',accountId:'other'},{checkPublication:true})).toThrow('账号');
 });
});
