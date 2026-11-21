// Offsets are UTF-16 positions, the same units used by textarea values and slice().
export function quotePosition(text, quote, occurrence) {
  let start = text.indexOf(quote);
  if (start < 0) return -1;
  if (occurrence == null) return text.indexOf(quote, start + 1) < 0 ? start : -1;
  if (!Number.isSafeInteger(occurrence) || occurrence < 1) return -1;
  for (let n = 1; n < occurrence && start >= 0; n++) start = text.indexOf(quote, start + 1);
  return start;
}

function shift(issues, field, start, end, length, except) {
  for (const issue of issues) {
    if (issue === except || issue.field !== field || issue.start < 0) continue;
    const size = (issue.applied ? issue.replacement : issue.quote).length;
    if (issue.start >= end) issue.start += length - (end - start);
    else if (issue.start + size > start) issue.start = -1;
  }
}

// Keep independent edits usable after typing before or after a reviewed passage.
// An edit across its anchor requires a fresh diagnosis.
export function alignCraftReview(review, fields) {
  const aligned = structuredClone(review);
  for (const [field, old] of Object.entries(aligned.texts)) {
    const value = fields[field] || '';
    if (old === value) continue;
    let start = 0, oldEnd = old.length, end = value.length;
    while (start < oldEnd && start < end && old[start] === value[start]) start++;
    while (oldEnd > start && end > start && old[oldEnd - 1] === value[end - 1]) { oldEnd--; end--; }
    shift(aligned.issues, field, start, oldEnd, end - start);
    aligned.texts[field] = value;
  }
  return aligned;
}

export function changeCraftReview(review, fields, issueId, action) {
  const next = alignCraftReview(review, fields);
  const issue = next.issues.find(row => row.id === issueId);
  if (!['apply','undo'].includes(action) || !issue?.replacement || issue.applied !== (action === 'undo')) {
    throw new Error('改稿状态已变化，请刷新后重试');
  }
  const {field, start} = issue, value = next.texts[field];
  const before = issue.applied ? issue.replacement : issue.quote;
  const after = issue.applied ? issue.quote : issue.replacement;
  const end = start + before.length;
  if (start < 0 || value.slice(start, end) !== before) throw new Error('这一处文字已被编辑，请重新诊断');
  next.texts[field] = value.slice(0, start) + after + value.slice(end);
  if (next.texts[field].length > 12000) throw new Error('替换后字段超过12000字，请先精简');
  shift(next.issues, field, start, end, after.length, issue);
  issue.applied = !issue.applied;
  return {review:next, fields:{...fields, [field]:next.texts[field]}};
}

export const craftKey = (platform, index, mode) => JSON.stringify([platform, Number(index), mode]);
