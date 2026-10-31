// A conservative verbatim-overlap warning, not a plagiarism or copyright ruling.
const normalize = value => String(value || '').normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]/gu,'');
export function referenceOverlaps(content={}, references=[]) {
  const keys=['body','script','hook','shots','cta','liveOpen','liveSegments','liveInteraction','liveOffer','liveClose'];
  const drafts=keys.map(k=>normalize(typeof content[k]==='string'?content[k]:'')).filter(v=>v.length>=18);
  const width=18;if(!drafts.length || !Array.isArray(references))return [];
  const result=[];
  for(const ref of references){
    const source=normalize(ref?.description);if(source.length<width)continue;
    let match='';for(let i=0;i<=source.length-width;i++){const part=source.slice(i,i+width);if(drafts.some(draft=>draft.includes(part))){match=part;break;}}
    if(match)result.push({title:String(ref.title || '未命名参考作品'),url:String(ref.url || ''),excerpt:match});
  }
  return result;
}
