import { COMMITMENT, FIT, LEVEL, NEED, gradeFacts, gradeLabel } from './lead-qualification.js';

import { followupLocalTime } from './conversation-state.js';

export function qualificationSettings(policy, {panel,form,esc,area,submit}) {
  const actions = Object.entries(COMMITMENT).filter(([key]) => key !== 'none');
  const rules = '<dl class="cm-grade-rules"><dt>A 级</dt><dd>业务适配、需求具体，客户已同意一项推进事项。</dd><dt>B 级</dt><dd>已有具体需求或推进约定，仍有 A 级条件待核实。</dd><dt>C 级</dt><dd>已确认只想初步了解或长期储备。</dd><dt>待核实</dt><dd>现有事实还无法判断。</dd></dl>';
  const fields = '<input type="hidden" name="baseRevision" value="'+policy.revision+'">' +
    area('fitCriteria','本业务的适配条件',policy.fitCriteria,true,500) +
    '<fieldset><legend>可计入 A 级的客户约定</legend>'+ actions.map(([key,label]) =>
      '<label class="cm-check"><input type="checkbox" name="actions" value="'+key+'"'+(policy.actions.includes(key)?' checked':'')+'>'+esc(label)+'</label>').join('') + '</fieldset>' +
    '<label>事实复核周期（天）<input type="number" name="reviewDays" required min="1" max="365" value="'+policy.reviewDays+'"></label>' +
    '<p class="meta">保存后会按新标准重算本业务线索，已有评定会提示复核。</p>'+submit('保存本业务标准');
  return panel('qualification-policy','本业务分级标准',rules+'<p>'+esc(policy.fitCriteria)+'</p>'+panel('edit-qualification-policy','调整标准',form('qualification-policy',fields,'','',String(policy.revision))));
}

export function qualificationHistory(lead, scopeId, {esc,panel,stamp}) {
  const entries=(lead.events || []).filter(e => e.type === 'qualification' && (e.opportunityId || '') === scopeId).reverse();
  if (!entries.length) return '';
  return panel('grade-history-'+lead.id+'-'+scopeId,'分级记录（'+entries.length+'）',entries.map(e => {
    const a=e.assessment || {};
    return '<article><p><strong>'+esc(LEVEL[e.before])+' → '+esc(LEVEL[e.after])+'</strong> · '+stamp(e.at)+'</p><p>'+esc(e.note)+'</p>'+
      (a.cleared?'<p class="meta">已撤销评定</p>':'<p class="meta">'+esc([FIT[a.fit],NEED[a.need],COMMITMENT[a.commitment]].join(' · '))+' · '+esc(a.sourceLabel)+' · '+stamp(a.observedAt)+'</p>')+
      (a.quote?'<blockquote class="cm-evidence">'+esc(a.quote)+'</blockquote>':'')+
      (e.fitCriteria?'<p class="meta">当时标准 v'+esc(a.policyRevision || 0)+' · '+esc(e.fitCriteria)+' · '+esc((e.qualifiedActions || []).map(k=>COMMITMENT[k]).join('、'))+'</p>':'')+'</article>';
  }).join(''));
}

export function qualificationView(lead, scope, policy, ui) {
  const {esc,panel,form,select,area,field,submit,stamp,anchor,button} = ui;
  const current=scope.assessment, facts=current && !current.cleared ? current : scope.derived;
  const key=scope.scopeId+'-'+(current?.revision || 0)+'-'+policy.revision+'-'+(scope.opportunity?.revision || 0);
  const context='<input type="hidden" name="productBasis" value="'+esc(scope.productBasis)+'"><input type="hidden" name="evidenceVersion" value="'+scope.evidenceVersion+'"><input type="hidden" name="opportunityId" value="'+esc(scope.scopeId)+'"><input type="hidden" name="baseRevision" value="'+(current?.revision || 0)+'"><input type="hidden" name="policyRevision" value="'+policy.revision+'"><input type="hidden" name="opportunityRevision" value="'+(scope.opportunity?.revision || 0)+'">';
  const selected=scope.sources.find(r=>r.key===facts?.sourceKey) || (!facts ? scope.sources[0] : null);
  const options='<option value="note"'+(!selected?' selected':'')+'>人工核实记录</option>'+scope.sources.map(r=>
    '<option value="'+esc(r.key)+'" data-at="'+esc(r.at)+'" data-quote="'+esc(r.text)+'"'+(selected?.key===r.key?' selected':'')+'>'+esc(r.label+' · '+(r.text || '').slice(0,68))+'</option>').join('');
  const fields=context+
    select('fit','业务适配',Object.entries(FIT),facts?.fit || 'unknown')+'<p class="meta">'+esc(policy.fitCriteria)+'</p>'+
    select('need','客户需求',Object.entries(NEED),facts?.need || 'unknown')+
    select('commitment','客户已同意的下一步',Object.entries(COMMITMENT),facts?.commitment || 'none')+
    '<label>评定来源<select name="sourceKey" data-qualification-source>'+options+'</select></label><blockquote data-grade-quote class="cm-evidence"></blockquote>'+
    field('observedAt','实际沟通时间',followupLocalTime(facts?.sourceKey==='note' ? facts.observedAt : ''),true,'datetime-local')+
    area('note','本次判断依据','',true,2000)+'<output data-grade-preview data-actions="'+esc(JSON.stringify(policy.actions))+'" aria-live="polite"></output>'+submit(facts?'保存重新评定':'保存评定');
  const editor=['A','B','C','pending','unfit'].includes(scope.code) ? panel('grade-edit-'+lead.id+'-'+scope.scopeId,facts?'重新评定':'评定线索',form('qualify-lead',fields,lead.id,'',key)) : '';
  const source=scope.sources.find(s=>s.key===facts?.sourceKey);
  const plan= ['A','B'].includes(scope.code) && !scope.review ? button('schedule-qualified','安排下一步',scope.scopeId || lead.id) : '';
  const evidence=facts ? '<details class="cm-support"><summary>查看评定依据</summary><p>'+esc([FIT[facts.fit],NEED[facts.need],COMMITMENT[facts.commitment]].join(' · '))+'</p><p>'+esc(facts.note)+'</p><p class="meta">'+esc(facts.sourceLabel)+' · '+stamp(facts.observedAt)+'</p>'+(facts.quote?'<blockquote class="cm-evidence">'+esc(facts.quote)+'</blockquote>':'')+(source?.url?anchor(source.url,'回查原评论'):'')+'</details>' : '';
  const clear=facts ? panel('grade-clear-'+lead.id+'-'+scope.scopeId,'撤销评定',form('clear-qualification',context+area('note','撤销原因','',true,2000)+'<p class="meta">撤销后清除本次分级，历史依据会保留。</p>'+submit('确认撤销评定'),lead.id,'',key)) : '';
  return '<section class="cm-qualification" aria-label="线索分级"><h3>线索分级 <span class="cm-tag" data-grade-code="'+esc(scope.code)+'">'+esc(gradeLabel(scope))+'</span></h3><p>'+esc(scope.next)+'</p>'+plan+evidence+editor+qualificationHistory(lead,scope.scopeId,ui)+clear+'</section>';
}

export function syncQualificationSource(form) {
  const selected=form.elements.sourceKey.selectedOptions[0], field=form.elements.observedAt;
  const quote=form.querySelector('[data-grade-quote]');
  quote.textContent=selected?.dataset.quote || '';
  quote.hidden=!quote.textContent;
  field.disabled=Boolean(selected?.dataset.at);
  field.closest('label').hidden=field.disabled;
  const preview=form.querySelector('[data-grade-preview]');
  const facts={fit:form.elements.fit.value,need:form.elements.need.value,commitment:form.elements.commitment.value};
  preview.textContent='按当前标准评为 '+LEVEL[gradeFacts(facts,{actions:JSON.parse(preview.dataset.actions)})];
}

export function closingGradesView(counts) {
  const rows=['A','B','C','unfit','unknown'].filter(code => counts[code]).map(code =>
    '<tr><th scope="row">'+(LEVEL[code] || '无有效评定')+'</th><td>'+counts[code].won+'</td><td>'+counts[code].ended+'</td></tr>');
  if (!rows.length) return '';
  return '<details class="cm-support"><summary>按结束前的等级看购买需求</summary><table class="cm-grade-outcomes"><caption>按购买需求计数</caption><thead><tr><th scope="col">当时等级</th><th scope="col">已成交</th><th scope="col">已结束未成交</th></tr></thead><tbody>'+rows.join('')+'</tbody></table></details>';
}
