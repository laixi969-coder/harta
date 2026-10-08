import crypto from 'node:crypto';
export const scopeHash = value => crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
export function productScope(space, customerId, input = {}) {
  const a = space.acquisition || {};
  const ids = (value, label, max) => {
    if (value === undefined) return [];
    if (!Array.isArray(value) || value.length > max || value.some(id => typeof id !== 'string' || !id || id.length > 100)) throw new Error(`${label}无效`);
    return [...new Set(value)];
  };
  const productIds = ids(input.productIds, '产品范围', 12), skuIds = ids(input.skuIds, '规格范围', 30);
  const products = productIds.map(id => {
    const p = (a.products || []).find(p => p.id === id && p.customerId === customerId);
    if (!p) throw new Error('产品不属于当前业务');
    if (p.status === 'archived') throw new Error('产品已停止推广，请重新选择');
    return { id:p.id, name:p.name, facts:p.facts, source:p.source, revision:p.revision };
  });
  const skus = skuIds.map(id => {
    const s = (a.skus || []).find(s => s.id === id && s.customerId === customerId && productIds.includes(s.productId));
    if (!s) throw new Error('规格必须属于本次选择的产品');
    if (s.status === 'archived') throw new Error('规格已停止推广');
    return { id:s.id, productId:s.productId, name:s.name, attributes:s.attributes, facts:s.facts, priceTerms:s.priceTerms, source:s.source, revision:s.revision };
  });
  const snapshot = { productIds, skuIds, products, skus };
  return { ...snapshot, hash:scopeHash(snapshot), text:products.length ? `本次只讨论以下产品，其他产品信息不得混用。未选择规格时不得使用任一规格的价格或参数；未知保持未知。\n${JSON.stringify({products,skus})}` : '' };
}
export function isScopeCurrent(space, customerId, snapshot) {
  if (!snapshot) return true;
  try { return productScope(space, customerId, snapshot).hash === snapshot.hash; } catch { return false; }
}
