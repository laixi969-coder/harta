import {it,expect} from 'vitest';
import {normalizeCreationIntent,creationIntentBrief} from './creation-intent.js';
it('keeps both entries independent from distribution and defaults only new requests',()=>{
 for(const creationEntry of ['feed','platform'])for(const distributionIntent of ['paid','natural','mixed'])expect(normalizeCreationIntent({creationEntry,distributionIntent})).toEqual({creationEntry,distributionIntent});
 expect(normalizeCreationIntent()).toEqual({creationEntry:'platform',distributionIntent:'natural'});
 expect(creationIntentBrief({mode:'organic'})).toContain('未记录');
});
it('rejects invalid intent before any generation',()=>{
 expect(()=>normalizeCreationIntent({creationEntry:['feed']})).toThrow('创作入口');
 expect(()=>normalizeCreationIntent({distributionIntent:'automatic'})).toThrow('传播用途');
 expect(()=>normalizeCreationIntent({distributionIntent:{paid:true}})).toThrow('传播用途');
});
it('paid and mixed instructions do not inherit the natural-only ban',()=>{
 expect(creationIntentBrief({creationEntry:'feed',distributionIntent:'paid'})).toContain('为付费信息流');
 expect(creationIntentBrief({creationEntry:'feed',distributionIntent:'paid'})).not.toContain('零广告');
 expect(creationIntentBrief({creationEntry:'feed',distributionIntent:'mixed'})).toContain('区分付费用途与自然用途');
 expect(creationIntentBrief({creationEntry:'feed',distributionIntent:'natural'})).toContain('零广告');
});
