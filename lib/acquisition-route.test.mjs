import { describe, expect, it } from 'vitest';
import { acquisitionSection, hartaAcquisitionUrl, isAcquisitionPage } from '../js/acquisition-route.js';
describe('one Harta acquisition shell',()=>{
  it('routes acquisition, content and customer capabilities to their Harta sections',()=>{
    for(const page of ['discover','comments','leads','acquisition','history']) expect(acquisitionSection(page)).toBe('prospecting');
    expect(acquisitionSection('studio')).toBe('content-home');
    expect(acquisitionSection('followup')).toBe('conversations');
    expect(acquisitionSection('inbox')).toBe('conversations');
    expect(acquisitionSection('settings')).toBe('connections');
  });
  it('keeps scoped work and comment deep links without leaking embedded options',()=>{
    const url=new URL(hartaAcquisitionUrl('?customerId=business%201&note=xhs%3A123&lead=live%3A456&embedded=1&token=secret','comments'),'http://localhost');
    expect(url.pathname).toBe('/'); expect(url.searchParams.get('acqPage')).toBe('comments');
    expect(url.searchParams.get('customerId')).toBe('business 1'); expect(url.searchParams.get('note')).toBe('xhs:123'); expect(url.searchParams.get('lead')).toBe('live:456');
    expect(url.searchParams.has('embedded')).toBe(false);expect(url.searchParams.has('token')).toBe(false);
  });
  it('rejects unknown pages and preserves valid collection task links',()=>{
    expect(isAcquisitionPage('https://example.com')).toBe(false);
    expect(hartaAcquisitionUrl('?job=abc&platform=douyin','unknown')).toContain('acqPage=discover');
    expect(hartaAcquisitionUrl('?job=abc&platform=douyin','history')).toContain('job=abc&platform=douyin');
  });
});
