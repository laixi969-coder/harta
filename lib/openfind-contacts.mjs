// Deliberately project only the current business's CRM records; no sibling data or credentials.
export function openFindContacts(space, customerId) {
  const a = space.acquisition || {};
  return (a.signals || []).flatMap((signal) => {
    if (signal.customerId !== customerId || !signal.leadId || !signal.recordId) return [];
    const lead = (a.leads || []).find(
      (l) => l.customerId === customerId && l.id === signal.leadId,
    );
    const work = (a.works || []).find(
      (w) => w.customerId === customerId && w.id === signal.workId,
    );
    if (!lead || !work?.openfindIds?.length) return [];
    return [
      {
        id: lead.id,
        name: lead.authorName,
        commentId: (work.platform === '抖音' ? 'dy:' : 'xhs:') + signal.recordId,
        noteId: work.openfindIds[0],
        platform: work.platform === '抖音' ? 'douyin' : 'xiaohongshu',
        stage: lead.stage,
        stopped: !!lead.doNotContact,
        nextAt: lead.nextAt || '',
        nextStep: lead.nextStep || '',
        events: (lead.events || [])
          .slice(-20)
          .map((e) => ({ id: e.id, at: e.at, note: e.note, stage: e.stage })),
      },
    ];
  });
}
