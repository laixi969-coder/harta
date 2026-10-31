import { describe, it, expect } from 'vitest';
import { referenceOverlaps } from './reference-overlap.js';
import { productionIssues } from './production-workflow.js';
describe('参考作品文字核对',()=>{
 const refs=[{title:'参考一',description:'做厨房翻新之前一定先确认水电管线的位置再讨论其他细节'}];
 it('提示长片段逐字重合，忽略标点空格，不凭短词判断',()=>{
  const found=referenceOverlaps({body:'做厨房翻新之前，一定先确认水电管线的位置。'},refs);
  expect(found).toHaveLength(1);expect(found[0].title).toBe('参考一');expect(found[0].excerpt).toHaveLength(18);
  expect(referenceOverlaps({body:'先核对厨房尺寸和实际预算，再找专业人士确认。'},refs)).toEqual([]);
  expect(referenceOverlaps({body:'做厨房翻新之前',hook:'一定先确认水电管线的位置'},refs)).toEqual([]);
 });
 it('检查用户当前制作稿而不是只检查已保存原稿',()=>{
  const fields={script:'做厨房翻新之前一定先确认水电管线的位置再讨论',shots:'镜头',title:'标题',cover:'封面'};
  expect(productionIssues(fields,false,'抖音',null,'',refs).some(x=>x.includes('参考作品「参考一」'))).toBe(true);
  expect(productionIssues({...fields,script:'先测量厨房，再找专业人士核对。'},false,'抖音',null,'',refs).some(x=>x.includes('连续相同'))).toBe(false);
 });
});
