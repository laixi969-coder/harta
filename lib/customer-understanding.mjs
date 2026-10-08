// Evidence is a customer's statement, never a personality profile or proof of fit.
// Hypotheses deliberately remain questions; neither stage nor trust is scored.
export function understandCustomer({evidence=[],conversation=[]}) {
  const incoming=conversation.filter(m=>m.direction==='inbound');
  const statements=[...evidence.map(e=>({quote:e.text,source:'原始评论'})),...incoming.map(m=>({quote:m.text,source:'收到的消息'}))].slice(-12);
  const currentQuestion=statements.at(-1)?.quote||'';
  const dimensions=[
    ['outcome','想解决的问题',/想|希望|为了|解决|改善|用来|用于|写作业|看书|照明/],
    ['context','使用场景',/租房|书桌|卧室|办公室|家里|门店|孩子|老人|搬家|使用/],
    ['alternative','现在的做法',/现在用|目前用|原来用|之前用|现有|换掉|替换/],
    ['constraint','实际限制',/预算|最多|不超过|不能|不方便|没时间|不用打孔|免打孔|尺寸|插座|空间|期限/],
    ['criterion','在意的选择条件',/在意|更看重|主要是|最重要|担心|怕|耐用|售后|保修|省事|效果|便宜|价格/],
  ].map(([key,label,pattern])=>({key,label,state:statements.some(s=>pattern.test(s.quote))?'stated':'unknown',evidence:statements.filter(s=>pattern.test(s.quote))}));
  const hypotheses=[];
  const add=(key,trigger,possibilities,question)=>{
    const basis=statements.filter(s=>trigger.test(s.quote));
    if(basis.length)hypotheses.push({key,status:'待验证',basis:basis.slice(-2),possibilities,question});
  };
  add('price',/太贵|贵了|贵一点|便宜|优惠|预算/,
    ['可能有明确的总预算限制','也可能尚未看到差价对应的价值，或在比较其他方案'],
    '价格这方面，你希望我先考虑哪些限制或取舍？');
  add('effort',/免打孔|不用打孔|不想打孔|租房|搬家|省事|麻烦|没时间/,
    ['可能想减少安装、维护或恢复原状的成本','也可能需要方便移动、重复使用或节省时间'],
    '不用打孔或省事的要求，主要和你的什么使用情况有关？');
  add('risk',/怕|担心|不放心|可靠|耐用|售后|保修|退换|被骗/,
    ['可能需要核对效果、质量或具体保障','也可能在意买错后的处理成本；不能据此推断过去受骗或心理特征'],
    '你希望先核实哪方面的信息，再决定是否合适？');
  const factualBudget=statements.findLast(s=>/(?:预算|最多|不超过).{0,8}\d+|\d+.{0,3}(?:以内|封顶)/.test(s.quote));
  if(factualBudget){const h=hypotheses.find(h=>h.key==='price');if(h){h.question='';h.resolution='已提供预算原话，尊重该限制，不再追问预算或默认需要加价。';}}
  for(const h of hypotheses){
    const explicit=h.basis.findLast(s=>/主要是|因为|就是为了|最在意|更看重/.test(s.quote));
    if(explicit){h.question='';h.resolution='客户已说明原因，先按其原话核对，不重复同一追问；不要把其他可能原因当结论。';}
  }
  return {currentQuestion,statements,dimensions,hypotheses,
    principle:'先理解客户想改变什么、现实限制和选择标准，再判断是否需要我们的产品。假设须由客户确认；不合适、暂缓或沿用现有方案都可以是合理结果。',
    nextQuestion:hypotheses.find(h=>h.question)?.question||'',
    relationship:incoming.length?'对方提出了问题或补充信息，不等于已信任、愿意被推销或决定购买':'尚未收到本次会话的回复，先回应原问题，不默认对方愿意进一步沟通'};
}
