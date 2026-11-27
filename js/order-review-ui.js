const previews=new Map(),lookups=new Map();
export function clearOrderPreview(customerId) {previews.delete(customerId);}
export function orderReviewPanel(c,{esc,panel,form,select,area,field,submit}) {
  const preview=previews.get(c.id);
  const shops=[...new Set((c.orderLedger||[]).map(o=>o.shop))];
  const last=preview?.input;
  const importForm=form('orders-preview',field('shop','店铺',last?.shop || (shops.length===1?shops[0]:''),true,'text',100)+
    '<label>订单或退款 CSV<input type="file" name="file" accept=".csv,text/csv"></label>'+
    '<details><summary>粘贴流水或查看格式</summary>'+area('csv','CSV 文本',preview?.pasted?last.csv:'',false,1000000)+
    field('timeZone','店铺时区',last?.timeZone || (shops.length===1?(c.orderLedger.find(o=>o.shop===shops[0])?.timeZone||'Asia/Shanghai'):''),false,'text',80)+'<p class="meta">首次导入默认使用北京时间。表头为“订单号,退款号,日期,金额,平台,作品链接”。支付行留空退款号，金额为人民币，日期形如 2026-01-31。作品来源可留空。</p></details>'+
    field('source','来源名称（选文件时自动使用文件名）',preview?.sourceLabel||'',false,'text',200)+submit('预览订单'));
  let confirmForm='';
  if(preview?.basis) {
    const {counts,rows}=preview;
    confirmForm=form('orders-import','<input type="hidden" name="basis" value="'+esc(preview.basis)+'"><p>'+esc(preview.input.shop)+' · '+esc(preview.input.source)+'</p><p role="status">新增 '+counts.added+' 笔订单、'+counts.refunds+' 笔退款，补认 '+counts.linked+' 笔，更正 '+counts.corrected+' 笔，重复 '+counts.duplicates+' 行。'+(counts.supplemented?'补记 '+counts.supplemented+' 个待确认作品链接。':'')+(counts.pending?counts.pending+' 行待确认作品来源。':'')+'</p>'+
      '<details><summary>核对 '+rows.length+' 行流水</summary>'+rows.map(r=>'<p>'+esc(r.orderId)+' · '+esc(r.refundId?'退款 '+r.refundId:'支付')+' · ¥'+esc(r.amount)+' · '+(r.status==='更正作品归属'?esc(r.previousSource)+' → ':'')+esc(r.title||'来源待确认')+' · '+esc(r.status)+'</p>').join('')+'</details>'+(counts.corrected?'<label class="cm-check"><input type="checkbox" name="corrections" required>确认更正作品归属，相关对账窗口需要重新核对</label>':'')+submit('确认保存流水'),preview.basis);
  }
  const windows=(c.orderReviewWindows||[]).map(w=>'<p>'+esc(w.shop)+' · '+esc(w.start)+' 至 '+esc(w.end)+' · '+(w.stale?'数据已更新，请重新核对窗口':w.rows.length+' 篇作品，'+w.pending+' 行来源待确认')+'</p>').join('');
  const period=shops.length?panel('orders-window','按统计窗口对账',form('orders-window',
    select('shop','店铺',shops)+field('start','统计开始','',true,'date')+field('end','统计结束','',true,'date')+
    '<input type="hidden" name="revision" value="'+esc(c.orderLedgerRevision||0)+'"><label class="cm-check"><input type="checkbox" name="confirmed" required>已核对这段时间的支付和退款流水完整</label>'+submit('保存对账窗口'))+windows):'';
  const pending=(c.orderLedger||[]).filter(o=>!o.publication);
  const unlinked=pending.length?panel('orders-unlinked','待确认作品来源（'+pending.length+' 笔）',
    '<p>确认来源后，给原支付行补上作品链接并重新导入。</p>'+pending.map(o=>'<p>'+esc(o.shop)+' · '+esc(o.orderId)+' · '+esc(o.date)+'</p>').join('')):'';
  const query=lookups.get(c.id);
  const found=query && (c.orderLedger||[]).find(o=>o.shop===query.shop && o.orderId===query.id);
  const lookup=shops.length?panel('orders-lookup','查订单原始流水',form('orders-lookup',
    select('shop','店铺',shops,query?.shop)+field('orderId','订单号',query?.id||'',true,'text',120)+submit('查看流水'))+
    (found?'<p><strong>'+esc(found.orderId)+'</strong> · '+esc(found.publication?.content?.title||'待确认作品来源')+'</p>'+
      '<p>支付 ¥'+esc((found.cents/100).toFixed(2))+' · '+esc(found.date)+' · '+esc(found.source)+'</p>'+(found.sourceUrl?'<p>记录的作品链接 · '+esc(found.sourceUrl)+(found.attributionSource?' · '+esc(found.attributionSource):'')+'</p>':'')+
      found.refunds.map(r=>'<p>退款 ¥'+esc((r.cents/100).toFixed(2))+' · '+esc(r.date)+' · '+esc(r.id)+' · '+esc(r.source)+'</p>').join('')+
      (found.attributionHistory||[]).map(h=>'<p>作品来源更正 · '+esc(h.previousUrl||'来源待确认')+' → '+esc(h.adoptedUrl)+' · '+esc(h.source)+'</p>').join('')
    :query?'<p role="status">这家店没有该订单号的流水。</p>':'')):'';
  return panel('orders-review','订单与退款对账',importForm+confirmForm+unlinked+period+lookup);
}
export async function handleOrderReview(action,{cId,value,fd,ctx}) {
  const request=async body=>{
    const res=await fetch('/api/order-review',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({...body,customerId:cId})});
    const result=await res.json();
    if(!res.ok) throw new Error(result.error || '订单对账未完成');
    return result;
  };
  if(action==='orders-lookup') {lookups.set(cId,{shop:value.shop,id:value.orderId.trim()});return '已查询订单';}
  if(action==='orders-preview') {
    const attempt={};
    previews.set(cId,attempt);
    const file=fd.get('file');
    if(file?.size>1000000) throw new Error('文件超过 1 MB，请分批导入');
    if(file?.size && value.csv?.trim()) throw new Error('请选择文件或粘贴 CSV 文本中的一种');
    const csv=file?.size?await file.text():value.csv;
    const input={shop:value.shop,csv,timeZone:value.timeZone,source:value.source?.trim() || file?.name || '手工粘贴流水'};
    const result=await request({...input,action:'preview'});
    if(previews.get(cId)!==attempt) throw new Error('流水已更改，请重新预览');
    previews.set(cId,{input,pasted:!file?.size,sourceLabel:value.source?.trim(),rows:result.preview,basis:result.basis,counts:result.counts});
    return '预览已就绪';
  }
  if(action==='orders-import') {
    const saved=previews.get(cId);
    if(!saved?.basis || fd.get('basis')!==saved.basis) throw new Error('请重新预览订单');
    const result=await request({...saved.input,action:'import',confirmed:true,confirmCorrections:fd.has('corrections'),basis:saved.basis});
    if(previews.get(cId)===saved) previews.delete(cId);
    ctx.setWorkspace(result.workspace);
    return '流水已保存，可按统计窗口对账';
  }
  const result=await request({action:'window',revision:Number(value.revision),confirmed:fd.has('confirmed'),start:value.start,end:value.end,shop:value.shop});
  ctx.setWorkspace(result.workspace);
  return '已保存对账窗口';
}
