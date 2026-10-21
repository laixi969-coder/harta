// Translate only application-generated provenance; preserve customer content and IDs.
export function hartaAcquisitionDisplay(acquisition) {
  if (!acquisition) return acquisition;
  const sourceRow = row => /^openfind_(live|import)$/.test(row.sourceType || '') && typeof row.source === 'string'
    ? { ...row, source: row.source.replace(/^OpenFind · /, 'Harta · ') } : row;
  return {
    ...acquisition,
    ...(acquisition.tasks && { tasks: acquisition.tasks.map(sourceRow) }),
    ...(acquisition.signals && { signals: acquisition.signals.map(sourceRow) }),
    ...(acquisition.leads && { leads: acquisition.leads.map(lead => ({
      ...lead,
      ...(lead.events && { events: lead.events.map(event => event.type === 'openfind-sales-sync' && typeof event.note === 'string'
        ? { ...event, note: event.note.replace(/^OpenFind (?=平台私信记录同步|沟通记录同步)/, 'Harta ') } : event) }),
    })) }),
  };
}
