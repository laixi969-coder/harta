import { AsyncLocalStorage } from 'node:async_hooks';
import { createHash, randomUUID } from 'node:crypto';
import path from 'node:path';
import { openScopedStore } from './scoped-store.mjs';
import { requestBudgetStore } from './request-budget-core.mjs';
export { RequestBudgetError } from './request-budget-core.mjs';
const context = new AsyncLocalStorage();

// Call only after ownership has been resolved from the user's stored business,
// contact or job. Never infer the owner from a browser's current selection.
export function withBusinessModelBudget(email, customerId, purpose, run, flowId = randomUUID()) {
  if (!email || !customerId) throw new Error('模型任务缺少业务归属');
  const key = createHash('sha256').update(JSON.stringify([email.toLowerCase(), customerId])).digest('hex');
  const directory = path.join(process.cwd(), 'data', 'openfind', key, 'engine');
  const parent = context.getStore();
  if (parent) {
    if (parent.directory !== directory) throw new Error('模型任务不能切换业务预算');
    return run();
  }
  return context.run({ directory, purpose, flowId }, run);
}
export function reserveModelRequest(signal) {
  signal?.throwIfAborted();
  const scope = context.getStore();
  // Administrative model tests have no business. Embedded comment review is
  // charged in its own worker before calling the shared model adapter.
  if (!scope) return;
  const { db } = openScopedStore(scope.directory);
  try { requestBudgetStore(db).reserve(scope.purpose, 'model', scope.flowId); }
  finally { db.close(); }
}
