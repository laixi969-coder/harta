import { gradeLabel, LEVEL, qualificationDirectory } from '../js/lead-qualification.js';
import { isRealEvidence } from '../js/evidence-kind.js';

// Deliberately project only the current business's CRM records; no sibling data or credentials.
export function openFindContacts(space, customerId) {
  const a = space.acquisition || {};
  const {contacts}=qualificationDirectory(a,customerId);
  return (a.signals || []).flatMap((signal) => {
    if (!isRealEvidence(signal) || signal.customerId !== customerId || !signal.leadId || !signal.recordId) return [];
    const contact=contacts.get(signal.leadId), lead=contact?.lead;
    const work = (a.works || []).find(
      (w) => w.customerId === customerId && w.id === signal.workId,
    );
    if (!lead || !isRealEvidence(work) || !work.openfindIds?.length) return [];
    const plan=contact.summary.opportunity || lead;
    return [
      {
        id: lead.id,
        name: lead.authorName,
        commentId: (work.platform === '抖音' ? 'dy:' : 'xhs:') + signal.recordId,
        noteId: work.openfindIds[0],
        platform: work.platform === '抖音' ? 'douyin' : 'xiaohongshu',
        stage: lead.stage,
        grade: gradeLabel(contact.summary),
        planStage: plan.stage,
        paused: ['paused','unfit','service'].includes(contact.summary.code),
        stopped: Boolean(contact.blocked),
        nextAt: plan.nextAt || '',
        nextStep: plan.nextStep || '',
        events: (lead.events || [])
          .slice(-20)
          .map((e) => ({ id: e.id, at: e.at, note: e.note, stage: e.type === 'qualification' ? '线索分级 · ' + (LEVEL[e.after] || LEVEL.pending) : e.stage })),
      },
    ];
  });
}
