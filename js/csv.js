export function csvRows(text) {
  if(typeof text!=='string' || text.length>1_000_000)throw new Error('CSV 不能超过 1 MB');
  const rows=[];let row=[],cell='',quoted=false,closed=false;
  text=text.replace(/^\uFEFF/,'');
  for(let i=0;i<text.length;i++){
    const c=text[i];
    if(quoted){if(c==='"'){if(text[i+1]==='"'){cell+='"';i++;}else{quoted=false;closed=true;}}else cell+=c;continue;}
    if(c==='"'){if(cell || closed)throw new Error('CSV 引号格式不正确');quoted=true;continue;}
    if(c===',' || c==='\n' || c==='\r') {row.push(cell);cell='';closed=false;if(c!==','){if(c==='\r' && text[i+1]==='\n')i++;if(row.some(v=>v.trim()))rows.push(row);row=[];}continue;}
    if(closed)throw new Error('CSV 引号后只能是逗号或换行');cell+=c;
  }
  if(quoted)throw new Error('CSV 引号未闭合');row.push(cell);if(row.some(v=>v.trim()))rows.push(row);
  return rows;
}
