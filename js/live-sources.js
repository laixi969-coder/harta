import { productionDraft } from './production-workflow.js';
import { isRealEvidence } from './evidence-kind.js';

// A live source points to a saved draft within the current business. It is a
// user assertion about where an inquiry came from, not proof of a broadcast.
export function liveSources(customer, platform = '') {
  return [...(customer?.drops || []), ...(customer?.packs || [])].filter(isRealEvidence).flatMap(pack =>
    Object.entries(pack.productionDrafts || {}).flatMap(([key, draft]) => {
      if (!draft?.live) return [];
      const base = key.endsWith('|live') ? key.slice(0, -5) : key;
      const separator = base.lastIndexOf('|'), name = base.slice(0, separator), index = Number(base.slice(separator + 1));
      if (separator < 1 || !Number.isSafeInteger(index) || index < 0 || (platform && name !== platform) || !pack.shells?.[name]?.[index] || productionDraft(pack, name, index, true) !== draft) return [];
      return [{ id: JSON.stringify([pack.id, name, index]), packId: pack.id, platform: name, index, title: draft.fields?.title || pack.title || '直播场次', time: draft.fields?.liveSchedule || '' }];
    })
  );
}
