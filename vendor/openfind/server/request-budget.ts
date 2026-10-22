import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { all, configGet, configSet, db, get, put } from './store.ts';

const context = new AsyncLocalStorage<string>();
export const budgetSchema = z.object({
  flowLimit: z.number().int().min(1).max(10000),
  dailyLimit: z.number().int().min(1).max(100000),
  modelDailyLimit: z.number().int().min(1).max(100000),
}).strict();
export const budgetPolicy = () => budgetSchema.parse(JSON.parse(configGet('requestBudget', '{"flowLimit":60,"dailyLimit":200,"modelDailyLimit":100}')));
export function saveBudget(input: unknown) { const policy = budgetSchema.parse(input); configSet('requestBudget', JSON.stringify(policy)); return budgetStatus(); }
export function withRequestScope<T>(id: string, run: () => T): T { return context.getStore() ? run() : context.run(id, run); }
export interface Usage { id: string; api: number; model: number; providers: Record<string, number>; updatedAt: string }
const empty = (id: string): Usage => ({ id, api: 0, model: 0, providers: {}, updatedAt: '' });
export function reserveRequest(provider: string, kind: 'api' | 'model' = 'api', fallback = randomUUID(), now = new Date()) {
  const policy = budgetPolicy(), dayId = 'day:' + now.toISOString().slice(0, 10), flowId = 'flow:' + (context.getStore() || fallback);
  db.exec('BEGIN IMMEDIATE');
  try {
    const day = get<Usage>('requestUsage', dayId) || empty(dayId);
    const flow = get<Usage>('requestUsage', flowId) || empty(flowId);
    if (day[kind] >= (kind === 'api' ? policy.dailyLimit : policy.modelDailyLimit)) throw new Error('当前业务今日' + (kind === 'api' ? '数据源' : '模型') + '请求额度已用完；已保存结果，UTC 零点重置');
    if (kind === 'api' && flow.api >= policy.flowLimit) throw new Error('本流程数据源请求总额度已用完；已保存结果。继续前请提高流程预算或缩小范围，不会自动重试');
    for (const row of [day, flow]) { row[kind]++; row.providers[provider] = (row.providers[provider] || 0) + 1; row.updatedAt = now.toISOString(); put('requestUsage', row); }
    db.exec('COMMIT');
  } catch (error) { db.exec('ROLLBACK'); throw error; }
}
export function budgetStatus(now = new Date()) {
  const day = get<Usage>('requestUsage', 'day:' + now.toISOString().slice(0,10)) || empty('today');
  return { policy: budgetPolicy(), today: day, resetAt: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()+1)).toISOString(), recent: all<Usage>('requestUsage').filter(r => r.id.startsWith('flow:')).sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt)).slice(0,20) };
}
