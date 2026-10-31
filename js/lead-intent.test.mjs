import {describe,it,expect} from 'vitest';
import {suggestedLeadIntents,leadIntentEventLabel} from './lead-intent.js';
describe('咨询类型词句提示',()=>{
 it('只提供可并存的类型线索，空白不猜测',()=>{
  expect(suggestedLeadIntents([])).toEqual([]);
  expect(suggestedLeadIntents(['想谈商务合作，方便加微信吗？'])).toEqual(['ad','divert']);
  expect(suggestedLeadIntents(['怎么买？多少钱？'])).toEqual(['buy']);
  expect(suggestedLeadIntents(['风景很好看'])).toEqual([]);
  expect(leadIntentEventLabel('ad','won')).toBe('商务合作 · 已签约');expect(leadIntentEventLabel('divert','won')).toBe('私域承接 · 已转入私域');
 });
});
