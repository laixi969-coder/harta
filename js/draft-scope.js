// Form fields may change while a suggestion request is in flight.
export function manualDraftScope(form) {
  return JSON.stringify(['accountId','channel','recipient','text'].map(name => form.querySelector(`[name=${name}]`)?.value || ''));
}
