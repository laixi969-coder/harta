// Local TextRank on words in each supplied passage. Every result retains a
// literal excerpt. Scores rank this document only and never imply search volume.
const segmenter=new Intl.Segmenter('zh',{granularity:'word'});
const stop=new Set('一个 一种 这个 那个 这样 如何 可以 我们 他们 自己 如果 需要 进行 注意 问题 客户 提供 以及 主要 关于 知道 这些 时候 应该 使用 怎么 什么 哪个 不同 其中 已经 这里 根据'.split(' '));
// A user's chosen scope is a starting point. Compare the actual keyword to
// the business vocabulary so a high index or an assigned scope alone never selects it.
export function recommendedKeywordIds(batch,customer,products=[]){
  const sources=[batch.scope.name,customer.name,customer.hunt,customer.pitch,customer.salesMaterial,
    ...products.filter(p=>p.customerId===customer.id&&p.status==='active').map(p=>p.name)];
  const vocabulary=new Set(),generic=new Set(['服务','品牌','领域','行业','公司','工作室','产品','经营','专业','其他','用户','价格','怎么','分析','有限','有限公司']);
  const terms=value=>[...segmenter.segment(value)].filter(s=>s.isWordLike).map(s=>s.segment)
    .filter(s=>s.length>=2&&!stop.has(s)&&!generic.has(s)&&!/^\d+$/.test(s));
  const normalize=value=>String(value||'').normalize('NFKC').toLowerCase();
  for(const source of sources){
    for(const part of normalize(source).split(/[，。；,;\n]/)){
      if(/不做|不卖|不经营|不代理|不提供|不支持|非代理|未代理|没有|不属于/.test(part))continue;
      for(const word of terms(part))vocabulary.add(word);
    }
  }
  return batch.items.filter(row=>terms(normalize(row.keyword)).some(word=>vocabulary.has(word))).map(row=>row.id);
}
export function localKeywordExtract(text,scope=''){
  const sentences=text.split(/[。！？!?；;\r\n]+/).map(s=>s.trim()).filter(Boolean),graph=new Map(),examples=new Map(),phrases=new Map();
  for(const sentence of sentences){
    const words=[...segmenter.segment(sentence)].filter(s=>s.isWordLike&&s.segment.length>=2&&s.segment.length<=32&&!stop.has(s.segment)&&!/^\d+$/.test(s.segment)).map(s=>s.segment);
    for(let i=0;i<words.length;i++){
      const word=words[i];if(!graph.has(word))graph.set(word,new Map());
      if(!examples.has(word))examples.set(word,sentence);
      const near=graph.get(word);
      for(const other of words.slice(Math.max(0,i-2),i+3))if(other!==word)near.set(other,(near.get(other)||0)+1);
    }
    for(const clause of sentence.split(/[,，：:]/).map(s=>s.trim())){
      if(clause.length>=4&&clause.length<=38 && (/(怎么|如何|为什么|能否|多少|哪里|区别|避坑|价格|哪种|适合|不合|吗$)/.test(clause)||(scope&&clause.includes(scope))))phrases.set(clause,sentence);
    }
  }
  let rank=new Map([...graph.keys()].map(w=>[w,1]));
  const sums=new Map([...graph].map(([w,neighbors])=>[w,[...neighbors.values()].reduce((a,b)=>a+b,0)]));
  for(let i=0;i<12;i++)rank=new Map([...graph].map(([w,neighbors])=>[w,0.15+0.85*[...neighbors].reduce((v,[n,count])=>v+count*rank.get(n)/(sums.get(n)||1),0)]));
  const ranked=[...rank].sort((a,b)=>b[1]-a[1]).slice(0,24).map(([w])=>[w,examples.get(w)]);
  return [...new Map([...phrases,...ranked])].slice(0,50).map(([keyword,sentence])=>{
    const pos=Math.max(0,sentence.indexOf(keyword)-35);return {keyword,quote:sentence.slice(pos,pos+130)};
  });
}
