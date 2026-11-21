export type PlanState = 'due' | 'scheduled' | 'unplanned' | 'invalid' | 'stopped' | 'closed';
export function followUpPlan(
  contact: { nextAt: string; stopped: boolean; stage: string; planStage?: string; paused?: boolean },
  now = Date.now(),
): PlanState {
  const stage = contact.planStage || contact.stage;
  if (contact.stopped || contact.paused || stage === '暂不跟进') return 'stopped';
  if (stage === '已成交' || stage === '已结束') return 'closed';
  if (!contact.nextAt) return 'unplanned';
  const at = Date.parse(contact.nextAt);
  if (!Number.isFinite(at)) return 'invalid';
  return at <= now ? 'due' : 'scheduled';
}
