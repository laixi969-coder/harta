import {describe,expect,it} from 'vitest';
import {prepareBlindReview,blindReviewPage,decodeBlindReview} from '../evals/creation/blind-review.mjs';

const pairs=Array.from({length:4},(_,i)=>({id:'case-'+i,topic:'柜门怎么量？',baseline:'测柜内尺寸。',candidate:'先量铰链旁的净宽。'}));
const blank={editMinutes:null,shootMinutes:null};
describe('离线经营者盲评',()=>{
  it('分组随机换位，只有组织者密钥记录版本，选择及用时可还原，空值保留',()=>{
    let i=0;
    const {reviewer,key}=prepareBlindReview(pairs,{flip:()=>i++%2});
    const html=blindReviewPage(reviewer);
    expect(html).not.toMatch(/baseline|candidate|case-0/);
    expect(reviewer.cases[0].A).toBe(pairs[0].baseline);
    expect(reviewer.cases[1].A).toBe(pairs[1].candidate);
    expect(key.cases[1].copies.candidate).toMatchObject({text:pairs[1].candidate,sha256:expect.stringMatching(/^[0-9a-f]{64}$/)});
    const report={session:reviewer.session,rows:reviewer.cases.map(({id},idx)=>({id,choice:['tie','A','neither',null][idx],A:{editMinutes:idx===1?0:null,shootMinutes:idx===1?3.5:null},B:blank}))};
    expect(JSON.stringify(report)).not.toMatch(/baseline|candidate|case-0/);
    expect(decodeBlindReview(key,report).rows.map(r=>r.choice)).toEqual(['tie','candidate','neither',null]);
    expect(decodeBlindReview(key,report).rows[1].times).toEqual({candidate:{editMinutes:0,shootMinutes:3.5},baseline:blank});
    expect(()=>decodeBlindReview(key,{...report,session:'other'})).toThrow('不匹配');
    expect(()=>decodeBlindReview(key,{...report,rows:[report.rows[0],report.rows[0]]})).toThrow('无效');
  });
  it('稿件作为文字渲染，缺字段和重复编号无法开始',()=>{
    const {reviewer}=prepareBlindReview([{...pairs[0],candidate:'<img onerror=alert(1)>'}]);
    expect(blindReviewPage(reviewer)).toContain('&lt;img onerror=alert(1)&gt;');
    expect(()=>prepareBlindReview([pairs[0],pairs[0]])).toThrow('重复');
    expect(()=>prepareBlindReview([{...pairs[0],candidate:''}])).toThrow('两份成稿');
  });
});
