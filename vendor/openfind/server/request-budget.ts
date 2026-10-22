import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';
import { requestBudgetStore } from '../../../lib/request-budget-core.mjs';
import { db } from './store.ts';
export { budgetSchema } from '../../../lib/request-budget-core.mjs';
const context = new AsyncLocalStorage<string>();
const store = requestBudgetStore(db);
export const budgetPolicy = store.policy;
export const saveBudget = store.save;
export const budgetStatus = store.status;
export function withRequestScope<T>(id: string, run: () => T): T { return context.getStore() ? run() : context.run(id, run); }
export function reserveRequest(provider: string, kind: 'api' | 'model' = 'api', fallback = randomUUID(), now = new Date()) {
  store.reserve(provider, kind, context.getStore() || fallback, now);
}
