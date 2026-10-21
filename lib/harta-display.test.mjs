import { it, expect } from 'vitest';
import { hartaAcquisitionDisplay } from './harta-display.mjs';

it('displays historical system labels as Harta without rewriting customer evidence or stored records', () => {
  const original = {
    tasks: [{ sourceType: 'openfind_live', source: 'OpenFind · 实时引擎自动同步' }, { source: 'OpenFind 用户资料' }],
    leads: [{ events: [
      { type: 'openfind-sales-sync', note: 'OpenFind 沟通记录同步（人工登记，非平台发送回执） · 客户提及 OpenFind' },
      { type: 'manual', note: 'OpenFind 用户原话' },
    ] }],
  };
  const copy = structuredClone(original);
  const result = hartaAcquisitionDisplay(original);
  expect(result.tasks[0].source).toBe('Harta · 实时引擎自动同步');
  expect(result.leads[0].events[0].note).toBe('Harta 沟通记录同步（人工登记，非平台发送回执） · 客户提及 OpenFind');
  expect(result.tasks[1]).toEqual(original.tasks[1]);
  expect(result.leads[0].events[1]).toEqual(original.leads[0].events[1]);
  expect(original).toEqual(copy);
});
