import crypto from 'node:crypto';
import { customerMaterialText } from './workspace.mjs';
import { businessMaterialContext } from './content-context.mjs';
const hash = value => crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
export function agentKnowledge(email, c) {
  const facts = { name: c.name, hunt: c.hunt || '', city: c.city || '', pitch: c.pitch || '', salesMaterial: c.salesMaterial || '', factCards: c.factCards || [], sourceMaterial: customerMaterialText(email, c), growthGoal: c.growthGoal || 'leads', growthCriteria: c.growthCriteria || '' };
  const context = businessMaterialContext(facts);
  return { hash: hash(facts), facts: { ...facts, sourceMaterial: context.text }, warnings: context.warnings };
}
