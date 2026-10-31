import {describe,it,expect} from 'vitest';
import {accountReviewSuggestions} from './account-review-suggestions.js';
const row=(id,metrics={})=>({publicationId:id,outcomeId:`out-${id}`,title:id,views:null,qualifiedLeads:null,completionRate:null,...metrics});
const group=rows=>({accountId:'a',platform:'抖音',start:'2026-01-01',end:'2026-01-07',rows});
describe('账号复盘建议',()=>{
  it('separates reach and qualified leads and cites the observations',()=>{
    const suggestions=accountReviewSuggestions(group([row('高流量',{views:1000,qualifiedLeads:1,criteria:'去重咨询'}),row('高客资',{views:200,qualifiedLeads:5,criteria:'去重咨询'})]));
    expect(suggestions.map(s=>s.id)).toEqual(['views','leads:去重咨询','dual:去重咨询']);
    expect(suggestions[0].observation).toContain('1000');expect(suggestions[0].observation).toContain('不代表原因');
    expect(suggestions[2].hypothesis).toContain('不用总播放量代替获客效果');
    expect(suggestions[2].evidenceIds).toEqual(['out-高流量','out-高客资']);
  });
  it('requires two actual observations and never substitutes missing values with zero',()=>{
    expect(accountReviewSuggestions(group([row('a',{views:50}),row('b')]))).toEqual([]);
    const [suggestion]=accountReviewSuggestions(group([row('a',{views:50}),row('b',{views:0})]));
    expect(suggestion.observation).toContain('为 0');
    expect(accountReviewSuggestions(group([row('a',{views:NaN,completionRate:101}),row('b',{views:-1,completionRate:60})]))).toEqual([]);
  });
  it('does not compare different qualified lead definitions or infer conversion rates',()=>{
    const suggestions=accountReviewSuggestions(group([row('a',{views:30,qualifiedLeads:3,criteria:'按人'}),row('b',{views:50,qualifiedLeads:4,criteria:'按企业'})]));
    expect(suggestions.map(s=>s.id)).toEqual(['views']);
    expect(accountReviewSuggestions(group([row('a',{qualifiedLeads:3}),row('b',{qualifiedLeads:4})]))).toEqual([]);
  });
  it('does not choose a winner from ties or duplicate publications',()=>{
    const suggestions=accountReviewSuggestions(group([row('a',{views:0,qualifiedLeads:2,criteria:'去重'}),row('b',{views:0,qualifiedLeads:3,criteria:'去重'})]));
    expect(suggestions[0].observation).toContain('均为 0');expect(suggestions.some(s=>s.id.startsWith('dual:'))).toBe(false);
    expect(accountReviewSuggestions(group([row('a',{views:20}),row('a',{views:30}),row('b',{views:40})]))).toEqual([]);
  });
  it('keeps suggestions editable within the memory field limit for long imported labels',()=>{
    const title='标题'.repeat(100),criteria='筛选条件'.repeat(250);
    const suggestions=accountReviewSuggestions(group([{...row('a',{views:300,qualifiedLeads:1,criteria}),title},{...row('b',{views:100,qualifiedLeads:5,criteria}),title}]));
    expect(suggestions.every(s=>s.hypothesis.length<=1000)).toBe(true);
    expect(suggestions.find(s=>s.id.startsWith('leads:')).id).toBe('leads:'+criteria);
  });
  it('uses percentage values directly without claiming early drop-off or causal improvement',()=>{
    const [suggestion]=accountReviewSuggestions(group([row('a',{completionRate:0}),row('b',{completionRate:42.5})]));
    expect(suggestion.observation).toContain('42.5%');expect(suggestion.observation).toContain('0%');
    expect(suggestion.hypothesis).toContain('不能判断观众在哪一秒离开');
    expect(accountReviewSuggestions({rows:[row('a',{views:20}),row('b',{views:30})]})).toEqual([]);
  });
});
