import { describe, it, expect } from 'vitest';
import { interactionReview } from './growth.js';

describe('interaction review', () => {
  it('does not treat missing metrics as zero', () => {
    expect(interactionReview({ metrics: { views: 100, likes: 10 } })).toEqual([]);
  });
  it('describes measured interactions and completion with a comparable denominator', () => {
    const notes = interactionReview({ metrics: { views: 100, completedViews: 30, likes: 10, comments: 0, collects: 1, shares: 2 } });
    expect(notes).toHaveLength(4);
    expect(notes[0]).toContain('30.0%');
    expect(interactionReview({ metrics: { views: 0, completedViews: 0 } })).toEqual([]);
  });
  it('平台完播率低时给出可验证建议，但不把小样本、缺失或恰好 20% 当作低值',()=>{
    for(const metrics of [{views:50,completionRate:0},{views:100,completionRate:19.9}]){
      const note=interactionReview({metrics})[0];expect(note).toContain('经验提示');expect(note).toContain('不是平台标准或原因判断');expect(note).toContain('下一条先尝试调整一项');
    }
    for(const metrics of [{views:49,completionRate:10},{completionRate:10},{views:100},{views:100,completionRate:20},{views:0,completionRate:0}])expect(interactionReview({metrics})).toEqual([]);
    expect(interactionReview({metrics:{views:100,completedViews:70,completionRate:10}})).toHaveLength(2);
  });
});
