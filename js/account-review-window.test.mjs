import {describe,it,expect} from 'vitest';import {filterReviewWindows} from './account-review-window.js';
describe('账号复盘窗口筛选',()=>{
 it('按本地日历和统计结束日筛选，含边界且排除未来和不合法日期',()=>{
  const now=new Date(2026,9,31,18),rows=['2026-10-31','2026-10-25','2026-10-24','2026-11-01','2026-02-30',''].map(end=>({end}));
  expect(filterReviewWindows(rows,7,now).map(r=>r.end)).toEqual(['2026-10-31','2026-10-25']);expect(filterReviewWindows(rows,30,now).map(r=>r.end)).toEqual(['2026-10-31','2026-10-25','2026-10-24']);expect(filterReviewWindows(rows,90,now).map(r=>r.end)).toEqual(['2026-10-31','2026-10-25','2026-10-24']);expect(filterReviewWindows(rows,'all',now)).toBe(rows);
 });
 it('非法筛选不改变记录或推断缺失日期',()=>{const rows=[{end:''}];expect(filterReviewWindows(rows,8,new Date())).toEqual([]);expect(rows).toEqual([{end:''}]);});
});
