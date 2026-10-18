export type PlanState = 'due' | 'scheduled' | 'unplanned' | 'invalid' | 'stopped' | 'closed';
export function followUpPlan(
  contact: { nextAt: string; stopped: boolean; stage: string },
  now = Date.now(),
): PlanState {
  if (contact.stopped || contact.stage === '暂不跟进') return 'stopped';
  if (contact.stage === '已成交') return 'closed';
  if (!contact.nextAt) return 'unplanned';
  const at = Date.parse(contact.nextAt);
  if (!Number.isFinite(at)) return 'invalid';
  return at <= now ? 'due' : 'scheduled';
}
