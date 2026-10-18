import { it, expect } from 'vitest';
import { openFindContacts } from './openfind-contacts.mjs';
it('projects only business-owned linked evidence and CRM plans without leaking private fields', () => {
  const space = {
    acquisition: {
      works: [
        {
          id: 'w',
          customerId: 'mine',
          platform: '抖音',
          openfindIds: ['dy:123'],
        },
        { id: 'foreign', customerId: 'other', openfindIds: ['xhs:other'] },
      ],
      leads: [
        {
          id: 'l',
          customerId: 'mine',
          authorName: '真实用户',
          stage: '待核实',
          nextAt: '2026-10-18T14:00:00Z',
          nextStep: '先核实地点',
          events: [{ id: 'e', at: '2026-10-18', note: '内部核实', secret: 'never' }],
          messages: ['private'],
        },
        { id: 'f', customerId: 'other', authorName: '其他客户' },
      ],
      signals: [
        { customerId: 'mine', workId: 'w', leadId: 'l', recordId: '456' },
        {
          customerId: 'other',
          workId: 'foreign',
          leadId: 'f',
          recordId: '789',
        },
        { customerId: 'mine', workId: 'foreign', leadId: 'f', recordId: '789' },
      ],
    },
  };
  const result = openFindContacts(space, 'mine');
  expect(result).toHaveLength(1);
  expect(result[0]).toMatchObject({
    commentId: 'dy:456',
    noteId: 'dy:123',
    stage: '待核实',
    nextAt: '2026-10-18T14:00:00Z',
  });
  expect(JSON.stringify(result)).not.toContain('private');
  expect(result[0].events[0]).not.toHaveProperty('secret');
  expect(openFindContacts(space, 'none')).toEqual([]);
});
