// Observable shooting techniques. These are original practice plans, not claims
// about the footage, the budget or the popularity of a search result.
export const SHORT_TECHNIQUES=[
  {id:'screens',name:'多屏接力显字',example:{title:'多屏接力原帖 · ROYS Digital Media',url:'https://www.instagram.com/p/C5EmhIEJv1P/'},query:'phones sequential text reveal reel',match:/(?:phones|screens).{0,55}(?:sequen|one by one|reveal|message)|(?:stacked|multiple|two|three|four|five|sequential).{0,40}(?:phones|screens)|多屏|手机.{0,10}(?:依次|亮字)/i,
    gear:'固定手机拍摄，另备几部显示文字的手机和能举稳它们的手。',first:'先对准一列空白屏幕，让第一块屏先亮出半句话。',turn:'其余屏幕依次补齐信息，最后一块给出答案，留一拍让人读完。',edit:'固定构图，各屏按顺序换字。',simple:'只有一部手机时，用三张纸卡依次入画，最后一张揭晓。'},
  {id:'paper',name:'抽绳或翻卡显字',example:{title:'纸张翻面揭晓 · Viralish Couples',url:'https://www.youtube.com/shorts/xE9x7ZpqlPQ'},query:'paper sign flip string reveal reel',match:/(?:paper|card|sign|string).{0,65}(?:reveal|drop|flip|cut|pull)|(?:flip|pull|drop|cut).{0,48}(?:paper|card|sign|string)|翻卡|剪线|纸[牌卡].{0,12}(?:翻|落|揭)/i,
    gear:'一台固定手机、几张纸卡、一根线，一双手即可。',first:'拍一张只露出半句的纸卡，让手拉住画面边上的线。',turn:'拉线让纸卡翻面或落下，下一张补上答案，再让实物入画。',edit:'机位锁定，切点落在纸卡遮满上一张的一刻。',simple:'不用吊挂，直接在桌面用手翻两张卡。'},
  {id:'illusion',name:'错位道具翻面揭晓',example:{title:'纸板错觉与活动揭晓 · Love Letters Winder',url:'https://www.instagram.com/p/DeuNk2Bxx_6/'},query:'cardboard sign bite illusion reveal reel',match:/cardboard.{0,65}(?:illusion|bite|reveal)|(?:illusion|bite).{0,40}(?:sign|cardboard)|forced perspective|错位|纸板.{0,12}(?:缺口|错觉|翻面)/i,
    gear:'手机、预先剪好缺口的纸板、一件真实产品，单人固定机位。',first:'让实物和纸板缺口在镜头里重合，先让观众看错一眼。',turn:'移开实物，再把纸板翻过来，用一行字揭晓真实用途。',edit:'固定构图，用遮挡和翻面完成反转。',simple:'用两件大小不同的日常物件做近大远小，移开近物揭晓。'},
  {id:'wipe',name:'遮住镜头再揭字',query:'cover lens hand wipe transition product reveal reel',match:/cover.{0,24}(lens|camera)|lens.{0,24}wipe|hand.{0,24}(wipe|transition|reveal)|遮镜|擦镜/i,
    gear:'手机、软布或纸卡、写好信息的便签，单人单场地。',first:'手从画面边缘伸入，用软布或纸卡遮满画面。',turn:'原机位移开遮挡，让产品旁的便签显出已核实的信息。',edit:'在完全遮黑的两帧之间切一次。',simple:'用手掌遮镜再移开，便签提前摆好。'},
  {id:'pass',name:'同方向传物接镜',query:'paper airplane pass the object match cut transition reel',match:/paper (plane|airplane)|pass.{0,24}object|match.?cut|纸飞机|传物|接镜/i,
    gear:'手机、纸飞机或轻质小物，同一房间的两个角落。',first:'让物件贴近镜头从左向右出画，留出明确的运动方向。',turn:'在下一个角落同方向接住它，展开纸面揭晓要传的信息。',edit:'保持入画方向和大小，在物件过画幅边缘处切一次。',simple:'一个人分两次拍自己的左右手，背景用同一张桌子。'},
  {id:'sound',name:'用实物声音串起画面',query:'everyday object sounds foley product reel behind the scenes',match:/foley|sound of|object sounds|拟音|实物声音/i,
    gear:'手机、手边两三件能发出清晰声音的物品，安静房间。',first:'先拍手碰到第一件实物，保留当场发出的清脆声。',turn:'用第二个动作接下一声，最后一个动作揭示这几样东西的用途。',edit:'按动作声切镜，结尾留出一拍。',simple:'只有一样物件时，分别拍打开、使用和收起。'}
];
export const shortTechnique=id=>SHORT_TECHNIQUES.find(item=>item.id===id);
export function shortShootSheet(id,business=''){
  const t=shortTechnique(id);if(!t)return '';
  return [t.name+(business?' · '+business:''),'第一镜　'+t.first,'揭晓　'+t.turn,'现场准备　'+t.gear,'剪辑　'+t.edit,'更简拍法　'+t.simple].join('\n');
}
export function shortVideoLink(raw){
  try{
    const url=new URL(raw),host=url.hostname.toLowerCase().replace(/^(www|m)\./,''),p=url.pathname.replace(/\/+$/,'');
    if(url.protocol!=='https:'||url.username||url.password||url.port)return null;
    if(host==='tiktok.com'&&/^\/@[\w.-]+\/video\/\d{8,24}$/.test(p))return {platform:'TikTok',url:'https://www.tiktok.com'+p};
    if(host==='youtube.com'&&/^\/shorts\/[\w-]{11}$/.test(p))return {platform:'YouTube',url:'https://www.youtube.com'+p};
    if(host==='instagram.com'&&/^\/(?:reel|p)\/[\w-]{5,30}$/.test(p))return {platform:'Instagram',url:'https://www.instagram.com'+p+'/'};
  }catch{/* A profile or search page cannot identify the video. */}
  return null;
}
export function shortWorkDetails(work){
  return shortTechnique(work?.shortTechnique)&&work.observedAction?{shortTechnique:work.shortTechnique,observedAction:work.observedAction,shortSetup:work.shortSetup||''}:{};
}
export function shortReferenceNotes(references=[]){
  return references.filter(r=>shortTechnique(r.shortTechnique)&&r.observedAction).map(r=>
    '参考作品　'+r.title+'\n原片　'+r.url+'\n观看记录　'+r.observedAction+(r.shortSetup?'\n本业务能怎么拍　'+r.shortSetup:'')+'\n试拍步骤\n'+shortShootSheet(r.shortTechnique)).join('\n\n');
}
