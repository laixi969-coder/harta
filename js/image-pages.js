// Page text is used verbatim. Never silently turn a production instruction into a claim.
export function parseImagePages(raw) {
  const pages=String(raw || '').split(/\r?\n/).map(s=>s.trim()).filter(Boolean);
  if(pages.length<1 || pages.length>10)throw new Error('图文需要1至10页，每行填写一页要显示的文字');
  if(pages.some(page=>Array.from(page).length>90))throw new Error('每页最多90字，请先精简以免文字被裁切');
  return pages;
}

// Reflow prose at punctuation only, preserving every visible character.
export function paginateProse(raw){
  const text=String(raw||'').trim();
  if(!/[。！？；：，,!?]/.test(text)||/(?:画面|配图|布局|备注)\s*[:：]/.test(text))return null;
  const parts=text.match(/[^。！？；，、,!?：:\n]+[。！？；，、,!?：:]*|[。！？；，、,!?：:]+/g)?.map(s=>s.trim()).filter(Boolean)||[];
  if(!parts.length||parts.some(s=>Array.from(s).length>90))return null;
  const pages=[];let page='';
  for(const part of parts){
    if(Array.from(page+part).length>72&&page){pages.push(page);page='';}
    page+=part;
  }
  if(page)pages.push(page);
  if(pages.length>10||pages.join('').replace(/\s/g,'')!==text.replace(/\s/g,''))return null;
  return pages.join('\n');
}
// A material bundle must cover every line of the saved image draft.
export function validateImagePageSet(raw, names) {
  const expected=parseImagePages(raw).length, ordered=[...names].sort();
  if(ordered.length!==expected || ordered.some((name,i)=>name!==`page-${String(i+1).padStart(2,'0')}.png`))throw new Error(`图文页不完整：当前文案有 ${expected} 页，请重新生成完整图片`);
  return ordered;
}

// Legacy bundles can predate the page-count check; keep them accessible but
// disclose missing pages when displaying or exporting them.
export function imagePageSetWarning(raw, names) {
  if(!names.length)return '';
  try {validateImagePageSet(raw,names);return '';} catch(error) {return `已保存素材可能缺页：${error.message}`;}
}

export function wrapCanvasText(ctx, text, maxWidth) {
  const lines=[];let line='';
  for(const ch of Array.from(text)) {
    const next=line+ch;
    if(line && ctx.measureText(next).width>maxWidth){lines.push(line);line=ch;}else line=next;
  }
  if(line)lines.push(line);
  return lines;
}

export function productionInventory(customer={},acquisition={}) {
  const saved=(acquisition.deliveryAssets||[]).filter(a=>a.customerId===customer.id).map(({id,originalName,mime})=>({id,originalName,mime}));
  const files=(customer.materials||[]).filter(a=>typeof a?.id==='string'&&(a.id.includes(':')||customer.materialBatchId)&&['图片','视频'].includes(a.kind)).map(a=>({id:'material:'+(a.id.includes(':')?a.id:customer.materialBatchId+':'+a.id),originalName:a.name,mime:a.kind==='图片'?'image/jpeg':'video/mp4'}));
  return [...saved,...files];
}
export function photoNotes(raw) {
  return pagePhotos(raw).flatMap((p,i)=>p?.id?['第'+(i+1)+'页实拍 · '+p.name+(p.label?' · '+p.label:'')]:[]).join('\n');
}
export function pagePhotos(raw) {
  if(!raw)return [];
  const rows=JSON.parse(raw);
  if(!Array.isArray(rows)||rows.length>10||rows.some(p=>p && (typeof p.id!=='string'||typeof p.name!=='string'||typeof p.label!=='string'||p.label.length>32||!['left','center','right'].includes(p.point))))throw new Error('逐页实拍设置无效，请重新选择');
  return rows;
}
export function makeImagePages(raw, theme = 'paper', createCanvas = () => document.createElement('canvas'), photos=[]) {
  const pages=parseImagePages(raw), palettes={paper:['#f2f0e9','#25211f','#c9256d'],ink:['#191715','#f5f2e9','#ed8bad'],rose:['#9e1e54','#fff9f6','#ffc8d7']};
  const [background,ink,accent]=palettes[theme] || palettes.paper;
  return pages.map((text,index)=>{
    const canvas=createCanvas();canvas.width=900;canvas.height=1200;
    const ctx=canvas.getContext('2d');if(!ctx)throw new Error('浏览器无法制作图文图片');
    ctx.fillStyle=background;ctx.fillRect(0,0,900,1200);ctx.fillStyle=accent;ctx.fillRect(70,94,88,9);
    ctx.font='bold 30px sans-serif';ctx.textBaseline='top';ctx.fillText(`${String(index+1).padStart(2,'0')} / ${String(pages.length).padStart(2,'0')}`,70,125);
    const photo=photos[index];
    if(photo?.image){
      const img=photo.image,scale=Math.min(760/img.naturalWidth,540/img.naturalHeight);
      const width=img.naturalWidth*scale,height=img.naturalHeight*scale,x=(900-width)/2,y=197+(540-height)/2;
      ctx.drawImage(img,x,y,width,height);
      if(photo.label){
        const markX=x+width*({left:0.22,center:0.5,right:0.78}[photo.point]||0.5);
        ctx.fillStyle=accent;ctx.beginPath();ctx.arc(markX,y+height*0.5,15,0,2*Math.PI);ctx.fill();
        ctx.fillStyle=ink;ctx.font='bold 30px sans-serif';ctx.fillText('● '+photo.label,70,753,760);
      }
      ctx.fillStyle=ink;ctx.font='bold 44px sans-serif';
      const lines=wrapCanvasText(ctx,text,760);
      if(lines.length>6)throw new Error('第'+(index+1)+'页的实拍说明过长，请精简文字');
      lines.forEach((line,i)=>ctx.fillText(line,70,818+i*55,760));
      return {number:index+1,url:canvas.toDataURL('image/png')};
    }
    ctx.fillStyle=ink;ctx.font='bold 64px sans-serif';const lines=wrapCanvasText(ctx,text,760);
    if(lines.length>10)throw new Error(`第${index+1}页文字排不下，请缩短后重试`);
    const lineHeight=92,start=Math.max(245,(1200-lines.length*lineHeight)/2);
    lines.forEach((line,i)=>ctx.fillText(line,70,start+i*lineHeight,760));
    return {number:index+1,url:canvas.toDataURL('image/png')};
  });
}
