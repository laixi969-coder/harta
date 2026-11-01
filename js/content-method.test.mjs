import {describe,it,expect} from 'vitest';
import {contentApproach,CONTENT_METHOD_VERSION} from './content-method.js';
describe('按入口、平台、形式和任务分别制定编辑侧重',()=>{
 it.each([
  ['小红书','image','小红书·图文'],['小红书','video','小红书·视频'],['抖音','image','抖音·图文'],['抖音','video','抖音·视频'],
 ])('%s %s 不混淆图文与视频', (platform,format,label)=>{const text=contentApproach({entry:'platform',platform,format,goal:'reach'});expect(text).toContain(label);expect(text).toContain('偏流量');expect(text).not.toContain('信息流·付费');});
 it.each(['image','video'])('付费信息流 %s 与平台形式并存',(format)=>{const text=contentApproach({entry:'feed',distribution:'paid',platform:'抖音',format,goal:'leads'});expect(text).toContain('信息流·付费');expect(text).toContain(format==='image'?'抖音·图文':'抖音·视频');expect(text).toContain('线索／咨询');});
 it('成交任务使用已确认产品条件，未确认价格和优惠不猜测',()=>{const text=contentApproach({platform:'抖音',format:'video',goal:'sales',job:'convert'});expect(text).toContain('偏成交');expect(text).toContain('价格、优惠、库存、交付与购买入口');});
 it('未记录用途不猜测，单篇任务优先于整体目标',()=>{expect(contentApproach({entry:'feed'})).toContain('用途未记录');expect(contentApproach({entry:'feed'})).not.toContain('信息流·自然');const text=contentApproach({entry:'feed',distribution:'natural',goal:'reach_leads',job:'traffic'});expect(text).toContain('偏流量');expect(text).not.toContain('兼顾流量与线索');expect(CONTENT_METHOD_VERSION).toBe('harta-editorial-v2');});
});
