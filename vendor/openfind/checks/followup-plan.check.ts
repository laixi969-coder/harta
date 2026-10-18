import { test } from 'node:test';
import assert from 'node:assert/strict';
import { followUpPlan } from '../src/followup-plan.ts';
test('follow-up plans use absolute times without rescheduling persisted CRM data', () => {
  const now = Date.parse('2026-10-18T13:50:00Z');
  const plan = { nextAt: '2026-10-18T14:00:00.000Z', stopped: false, stage: '待核实' };
  assert.equal(followUpPlan(plan, now), 'scheduled');
  assert.equal(
    followUpPlan({ ...plan, nextAt: '2026-10-18T09:00:00-05:00' }, now),
    'scheduled',
  );
  assert.equal(followUpPlan(plan, Date.parse(plan.nextAt)), 'due');
  assert.equal(followUpPlan({ ...plan, nextAt: '2026-10-18T02:30:00Z' }, now), 'due');
  assert.equal(followUpPlan({ ...plan, nextAt: '' }, now), 'unplanned');
  assert.equal(followUpPlan({ ...plan, nextAt: 'invalid' }, now), 'invalid');
  assert.equal(
    followUpPlan({ ...plan, stopped: true, nextAt: '2026-10-17T00:00:00Z' }, now),
    'stopped',
  );
  assert.equal(followUpPlan({ ...plan, stage: '暂不跟进' }, now), 'stopped');
  assert.equal(followUpPlan({ ...plan, stage: '已成交' }, now), 'closed');
  assert.equal(plan.nextAt, '2026-10-18T14:00:00.000Z');
});
