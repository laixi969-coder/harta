import { describe, it, expect } from 'vitest';
import { monthlyEstimate, openingChecklist, PLANS } from './pricing-model.js';

describe('monthly pricing and user-controlled resource budgets', () => {
  it('keeps software fees distinct from resource budgets and calculates in cents', () => {
    expect(PLANS.map(p => p.monthlyCents)).toEqual([9900, 29900, 79900]);
    const estimate = monthlyEstimate('business', { model: '50.10', data: '0.20', image: '0' });
    expect(estimate.serviceCents).toBe(29900);
    expect(estimate.resourceCents).toBe(5030);
    expect(estimate.totalCents).toBe(34930);
    expect(monthlyEstimate('solo', { model: '0', data: '0', image: '0' }).totalCents).toBe(9900);
  });
  it.each(['-1', '', 'NaN', 'Infinity', '1.234', '1e3', '1000000', '<script>'])('rejects invalid budgets: %s', value => {
    expect(() => monthlyEstimate('solo', { model: value, data: '0', image: '0' })).toThrow();
  });
  it('never treats a generated checklist as a paid order or provider credit', () => {
    const text = openingChecklist(monthlyEstimate('studio', { model: '50', data: '50', image: '20' }));
    expect(text).toContain('工作室版'); expect(text).toContain('¥799'); expect(text).toContain('¥919');
    expect(text).toContain('不会自动提交订单、扣款、续费或开通');
    expect(text).toContain('交付方式：托管订阅');
    expect(text).toContain('计量单位、预算和结算方式');
    expect(text).toContain('不是套餐赠送额度、充值或正式报价');
    expect(() => monthlyEstimate('invalid', { model: '0', data: '0', image: '0' })).toThrow();
  });
});
