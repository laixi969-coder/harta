import { z } from 'zod';
export class RequestBudgetError extends Error {}
export const budgetSchema = z.object({
  flowLimit: z.number().int().min(1).max(10000),
  dailyLimit: z.number().int().min(1).max(100000),
  modelDailyLimit: z.number().int().min(1).max(100000),
}).strict();
const defaults = { flowLimit: 60, dailyLimit: 200, modelDailyLimit: 100 };
const empty = id => ({ id, api: 0, model: 0, providers: {}, updatedAt: '' });

export function requestBudgetStore(db) {
  const policy = () => budgetSchema.parse(JSON.parse(db.prepare("SELECT value FROM config WHERE key='requestBudget'").get()?.value || JSON.stringify(defaults)));
  const get = id => { const row = db.prepare("SELECT value FROM entities WHERE kind='requestUsage' AND id=?").get(id); return row ? JSON.parse(row.value) : empty(id); };
  const put = row => db.prepare("INSERT INTO entities(kind,id,value) VALUES('requestUsage',?,?) ON CONFLICT(kind,id) DO UPDATE SET value=excluded.value").run(row.id, JSON.stringify(row));
  function reserve(provider, kind, flowId, now = new Date()) {
    if (!['api', 'model'].includes(kind)) throw new Error('未知请求类型');
    db.exec('BEGIN IMMEDIATE');
    try {
      // Read policy under the same write lock as usage, including updates from
      // another process. Attempts are reserved before transport and not refunded.
      const p = policy(), day = get('day:' + now.toISOString().slice(0, 10)), flow = get('flow:' + flowId);
      if (day[kind] >= (kind === 'api' ? p.dailyLimit : p.modelDailyLimit))
        throw new RequestBudgetError('当前业务今日' + (kind === 'api' ? '数据源' : '模型') + '请求额度已用完；已保存结果保留，UTC 零点重置。可在业务请求预算中调整额度后重试');
      if (kind === 'api' && flow.api >= p.flowLimit)
        throw new RequestBudgetError('本流程数据源请求总额度已用完；已保存结果。继续前请提高流程预算或缩小范围，不会自动重试');
      for (const row of [day, flow]) {
        row[kind]++; row.providers[provider] = (row.providers[provider] || 0) + 1;
        row.updatedAt = now.toISOString(); put(row);
      }
      db.exec('COMMIT');
    } catch (error) { db.exec('ROLLBACK'); throw error; }
  }
  function status(now = new Date()) {
    const recent = db.prepare("SELECT value FROM entities WHERE kind='requestUsage' AND id LIKE 'flow:%'").all().map(r => JSON.parse(r.value)).sort((a,b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0,20);
    return { policy: policy(), today: get('day:' + now.toISOString().slice(0,10)), resetAt: new Date(Date.UTC(now.getUTCFullYear(),now.getUTCMonth(),now.getUTCDate()+1)).toISOString(), recent };
  }
  function save(input) {
    const p = budgetSchema.parse(input);
    db.prepare("INSERT INTO config VALUES('requestBudget',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").run(JSON.stringify(p));
    return status();
  }
  return { policy, reserve, status, save };
}
