export const CUSTOMER_STAGES = { new: '新客户', following: '在跟客户', cooperating: '已合作客户' };
export function customerStage(customer) {
  if (customer?.track === '存量') return 'cooperating';
  if (['new', 'following'].includes(customer?.stage)) return customer.stage;
  return customer?.packs?.length ? 'following' : 'new';
}
