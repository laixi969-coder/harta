import { describe, expect, it } from 'vitest';
import { creatorRadar } from './creator-radar.js';

const business={id:'c1',hunt:'厨房',pitch:'厨房翻新',creatorProfile:{fields:{audience:'租房 人群',direction:'收纳'}}};
const work=(id,description,extra={})=>({id,customerId:'c1',platform:'小红书',title:id,description,source:'manual_import',createdAt:'2026-01-01',...extra});
describe('content radar',()=>{
  it('ranks explainable local matches without using engagement or leaking other businesses',()=>{
    const rows=[work('厨房案例','厨房 收纳'),work('收纳案例','收纳',{metrics:{likes:999999}}),work('其他业务','厨房 收纳',{customerId:'c2'}),work('演示','厨房 收纳',{source:'demo'}),work('演示标记','厨房 收纳',{demo:true}),work('演示类型','厨房 收纳',{sourceType:'demo'})];
    const result=creatorRadar(business,rows);
    expect(result.items.map(x=>x.work.id)).toEqual(['厨房案例','收纳案例']);
    expect(result.items[0].hits).toContain('厨房');expect(result.items[0].hits).toContain('收纳');expect(result.sampleSize).toBe(2);
  });
  it('keeps unmatched and unknown samples out, preserving empty states',()=>{
    expect(creatorRadar({id:'c1'},[work('x','厨房')])).toMatchObject({items:[],hasProfile:false});
    expect(creatorRadar(business,[work('x','画画'),work('y','厨房',{platform:'知乎'})])).toMatchObject({items:[],sampleSize:1});
  });
  it('includes matching or pasted articles and keeps their source',()=>{const result=creatorRadar(business,[work('文章','厨房的收纳',{platform:'公众号',source:'wechat_api',wechat:{source:'material'}})]);expect(result.items[0].work).toMatchObject({platform:'公众号',source:'wechat_api',wechat:{source:'material'}});});
  it('filters the visible platform without hiding other platforms from the weekly count',()=>{const c={...business,radarDecisions:{x:{action:'now'},y:{action:'now'}}},r=creatorRadar(c,[work('x','厨房'),work('y','厨房',{platform:'公众号'})],{platform:'公众号'});expect(r.items.map(row=>row.work.id)).toEqual(['y']);expect(r.nowCount).toBe(2);expect(r.sampleSize).toBe(1);});
  it('limits matching to the newest 500 works and limits output',()=>{
    const rows=Array.from({length:510},(_,i)=>work(String(i),'厨房',{createdAt:new Date(Date.UTC(2026,0,1,0,0,i)).toISOString()}));
    const result=creatorRadar(business,rows,{limit:2});expect(result.truncated).toBe(true);expect(result.sampleSize).toBe(500);expect(result.items).toHaveLength(2);
  });
  it('keeps collected works when profile changes and supports reversible discard',()=>{
    const customer={id:'c1',hunt:'新行业',radarDecisions:{a:{action:'now'},b:{action:'discard'}}};
    const result=creatorRadar(customer,[work('a','不相关'),work('b','不相关')]);
    expect(result.items.map(r=>r.work.id)).toEqual(['a']);expect(result.items[0].hits).toEqual([]);
    expect(result.nowCount).toBe(1);expect(result.discarded.map(w=>w.id)).toEqual(['b']);
  });
  it('does not hide pasted samples without profile matches or truncate collected and discarded items',()=>{
    const rows=Array.from({length:25},(_,i)=>work(`p${i}`,'无匹配内容',{source:'manual_paste'}));
    const decisions=Object.fromEntries(rows.slice(0,10).map(w=>[w.id,{action:'parked'}]));
    const result=creatorRadar({id:'c1',radarDecisions:decisions},rows,{limit:2});
    expect(result.items).toHaveLength(12);expect(result.moreCandidates).toHaveLength(13);
    const discarded=Object.fromEntries(rows.map(w=>[w.id,{action:'discard'}]));
    expect(creatorRadar({id:'c1',radarDecisions:discarded},rows).discarded).toHaveLength(25);
  });
});
