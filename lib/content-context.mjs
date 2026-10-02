// Keep the user's supported 12,000-character business input intact. Attachments
// have their own budget; sampling is explicit and shared by research and drafting.
export function businessMaterialContext(customer) {
  const sales = String(customer.salesMaterial || '').trim();
  const source = String(customer.sourceMaterial || '').trim();
  const facts = (customer.factCards || []).map(card => `${card.id} [${card.status === 'confirmed' ? '用户已确认' : card.status === 'retired' ? '已停用，不得采用' : '待确认，不得写成事实'}] ${card.text}；来源：${card.source}；适用范围：${card.scope || '未限定'}`).join('\n');
  const budget = 30000;
  let attachment = source;
  if (source.length > budget) {
    const sections = source.split(/\n+(?=【[^\n]+】)/).filter(Boolean);
    const allowance = Math.floor(budget / sections.length);
    attachment = sections.map(section => {
      if (section.length <= allowance) return section;
      const head = Math.ceil(allowance * 0.7);
      return `${section.slice(0, head)}\n[中间内容未纳入本次上下文，不得声称已完整核实]\n${allowance > head ? section.slice(-(allowance - head)) : ''}`;
    }).join('\n\n');
  }
  return {
    text: [facts && `【用户事实卡；相互冲突或与其他资料冲突时不得自行择一承诺】\n${facts}`, sales && `【用户保存的业务补充】\n${sales}`, attachment && `【已读取的附件资料】\n${attachment}`].filter(Boolean).join('\n\n'),
    warnings: source.length > budget ? ['已读取附件超过本批上下文预算，按资料分段取样；未纳入部分不能视为本批依据。'] : [],
  };
}
