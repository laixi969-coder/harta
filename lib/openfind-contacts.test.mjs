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

it('已成交联系人有新采购时，展示该购买需求的分级和下一步',()=>{
  const acquisition={works:[{id:'w',customerId:'c',platform:'抖音',openfindIds:['dy:1']}],
    signals:[{id:'s',customerId:'c',leadId:'l',workId:'w',recordId:'1'}],
    leads:[{id:'l',customerId:'c',stage:'已成交'}],
    opportunities:[{id:'new',leadId:'l',customerId:'c',stage:'比较中',nextStep:'核实新规格',nextAt:'2028-01-01'}]};
  expect(openFindContacts({acquisition},'c')[0]).toMatchObject({stage:'已成交',planStage:'比较中',nextStep:'核实新规格',grade:'待核实'});
});
