const motion = matchMedia('(prefers-reduced-motion: reduce)');
const canvases = [...document.querySelectorAll('[data-visual]')];
const states = new Map();
const tau = Math.PI * 2;
function resize(canvas) {
  const box = canvas.getBoundingClientRect(), dpr = Math.min(devicePixelRatio || 1, 2);
  if (!box.width || !box.height) return;
  canvas.width = Math.round(box.width * dpr); canvas.height = Math.round(box.height * dpr);
  const ctx = canvas.getContext('2d'); ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  states.set(canvas, {...states.get(canvas), ctx, w:box.width, h:box.height});
}
function line(ctx, points, color, width=1) {
  ctx.beginPath(); points.forEach(([x,y],i)=> i ? ctx.lineTo(x,y) : ctx.moveTo(x,y)); ctx.strokeStyle=color; ctx.lineWidth=width; ctx.stroke();
}
function dot(ctx,x,y,r,color) {ctx.beginPath();ctx.arc(x,y,r,0,tau);ctx.fillStyle=color;ctx.fill();}
function render(canvas, t) {
  const {ctx,w,h}=states.get(canvas) || {}; if(!ctx) return;
  ctx.clearRect(0,0,w,h); const type=canvas.dataset.visual;
  if(type==='hero') {
    const cx=w*.78,cy=h*.48,R=Math.min(w*.4,h*.66);
    for(let j=0;j<7;j++){ctx.beginPath();ctx.ellipse(cx,cy,R*(.28+j*.12),R*(.15+j*.08),-.38,0,tau);ctx.strokeStyle=`rgba(74,120,90,${.09+j*.015})`;ctx.lineWidth=1;ctx.stroke();}
    for(let i=0;i<85;i++){const a=i*2.399+t*.06, r=R*(.15+(i%17)/19);dot(ctx,cx+Math.cos(a)*r,cy+Math.sin(a)*r*.48, i%13===0?3:1.3, i%13===0?'#6b9775':'#a5bfa7');}
    return;
  }
  const cx=w*.53,cy=h*.52,r=Math.min(w,h)*.32;
  if(type==='leads') {
    for(let j=0;j<5;j++){ctx.beginPath();ctx.arc(cx,cy,r*(.38+j*.2),0,tau);ctx.strokeStyle=`rgba(178,218,165,${.16-j*.02})`;ctx.stroke();}
    for(let i=0;i<48;i++){const a=i*2.399,dist=r*(.5+(i%9)*.12),x=cx+Math.cos(a)*dist,y=cy+Math.sin(a)*dist*.8;dot(ctx,x,y,i%9===0?3:1.5,'rgba(187,231,176,.65)');if(i%9===0)line(ctx,[[x,y],[cx,cy]],'rgba(187,231,176,.17)');}
    dot(ctx,cx,cy,18+Math.sin(t*.8)*2,'rgba(165,227,153,.15)');dot(ctx,cx,cy,7,'#c9edb9');
    for(let i=0;i<4;i++){const a=t*.25+i*tau/4;dot(ctx,cx+Math.cos(a)*r*.78,cy+Math.sin(a)*r*.78,3,'#d0efc1');}
  } else if(type==='content') {
    const shapes=[[-.48,-.12,-.28],[0,-.27,.04],[.48,-.05,.28]];
    shapes.forEach(([dx,dy,angle],i)=>{ctx.save();ctx.translate(cx+dx*r,cy+dy*r+Math.sin(t*.8+i)*4);ctx.rotate(angle);const cw=r*.8,ch=r*1.12;ctx.fillStyle=['#d5e9cc','#96bb93','#edf5e7'][i];ctx.globalAlpha=.92;ctx.beginPath();ctx.roundRect(-cw/2,-ch/2,cw,ch,10);ctx.fill();ctx.globalAlpha=1;ctx.fillStyle=['#668f6b','#d6ebce','#719a72'][i];ctx.beginPath();ctx.arc(0,-ch*.1,cw*.23,0,tau);ctx.fill();line(ctx,[[-cw*.3,ch*.24],[cw*.3,ch*.24]],'rgba(36,65,45,.35)',2);line(ctx,[[-cw*.3,ch*.34],[cw*.12,ch*.34]],'rgba(36,65,45,.25)',2);ctx.restore();});
    for(let i=0;i<24;i++){let a=i*tau/24+t*.04;dot(ctx,cx+Math.cos(a)*r*1.25,cy+Math.sin(a)*r*.9,1.5,'rgba(193,232,183,.6)');}
  } else {
    for(let j=0;j<6;j++){const points=[];for(let x=0;x<=w;x+=8){let y=h*.58+Math.sin(x/w*6+j*.65+t*.16)*h*.12+(j-3)*13;points.push([x,y]);}line(ctx,points,`rgba(186,227,178,${.08+j*.018})`);}
    for(let i=0;i<32;i++){let x=(i*97)%w,y=h*.55+Math.sin(x/w*6+i*.65+t*.16)*h*.12+(i%6-3)*13;dot(ctx,x,y,i%7===0?3:1,'rgba(206,241,193,.6)');}
  }
}
let frame=0, running=false, visible=new Set();
function tick(now){ if(!running)return; for(const canvas of visible) render(canvas,now/1000);frame=requestAnimationFrame(tick); }
function sync(){const shouldRun=!motion.matches&&!document.hidden&&visible.size>0;if(shouldRun&&!running){running=true;frame=requestAnimationFrame(tick)}else if(!shouldRun&&running){running=false;cancelAnimationFrame(frame)}if(!shouldRun)for(const canvas of visible)render(canvas,0);}
const observer = new IntersectionObserver(entries=>{for(const entry of entries){if(entry.isIntersecting)visible.add(entry.target);else visible.delete(entry.target)}sync()},{rootMargin:'100px'});
const sizeObserver = new ResizeObserver(entries=>{for(const e of entries){resize(e.target);render(e.target,0)}});
canvases.forEach(canvas=>{resize(canvas);render(canvas,0);observer.observe(canvas);sizeObserver.observe(canvas)});
motion.addEventListener('change',sync);document.addEventListener('visibilitychange',sync);
