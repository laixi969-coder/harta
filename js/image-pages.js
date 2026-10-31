// Page text is used verbatim. Never silently turn a production instruction into a claim.
export function parseImagePages(raw) {
  const pages=String(raw || '').split(/\r?\n/).map(s=>s.trim()).filter(Boolean);
  if(pages.length<1 || pages.length>10)throw new Error('图文需要1至10页，每行填写一页要显示的文字');
  if(pages.some(page=>Array.from(page).length>90))throw new Error('每页最多90字，请先精简以免文字被裁切');
  return pages;
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

export function makeImagePages(raw, theme = 'paper', createCanvas = () => document.createElement('canvas')) {
  const pages=parseImagePages(raw), palettes={paper:['#f2f0e9','#25211f','#c9256d'],ink:['#191715','#f5f2e9','#ed8bad'],rose:['#9e1e54','#fff9f6','#ffc8d7']};
  const [background,ink,accent]=palettes[theme] || palettes.paper;
  return pages.map((text,index)=>{
    const canvas=createCanvas();canvas.width=900;canvas.height=1200;
    const ctx=canvas.getContext('2d');if(!ctx)throw new Error('浏览器无法制作图文图片');
    ctx.fillStyle=background;ctx.fillRect(0,0,900,1200);ctx.fillStyle=accent;ctx.fillRect(70,94,88,9);
    ctx.font='bold 30px sans-serif';ctx.textBaseline='top';ctx.fillText(`${String(index+1).padStart(2,'0')} / ${String(pages.length).padStart(2,'0')}`,70,125);
    ctx.fillStyle=ink;ctx.font='bold 64px sans-serif';const lines=wrapCanvasText(ctx,text,760);
    if(lines.length>10)throw new Error(`第${index+1}页文字排不下，请缩短后重试`);
    const lineHeight=92,start=Math.max(245,(1200-lines.length*lineHeight)/2);
    lines.forEach((line,i)=>ctx.fillText(line,70,start+i*lineHeight,760));
    return {number:index+1,url:canvas.toDataURL('image/png')};
  });
}
