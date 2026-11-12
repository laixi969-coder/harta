let THREE;
const motion = matchMedia('(prefers-reduced-motion: reduce)');
const cleanups = [];
const syncRenderers = [];
let suspended = false;
function mount(section, index) {
  const host = section.querySelector('.story-visual');
  let renderer;
  try { renderer = new THREE.WebGLRenderer({alpha:true, antialias:true, powerPreference:'low-power'}); } catch { return; }
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
  renderer.setClearColor(0x000000, 0);
  renderer.domElement.className = 'depth-canvas';
  renderer.domElement.setAttribute('aria-hidden','true');
  host.append(renderer.domElement);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(42, 1, .1, 100);
  camera.position.z = 8;
  const count = 100, coordinates = new Float32Array(count * 3);
  for (let i=0;i<count;i++) {coordinates[i*3]=(Math.random()-.5)*13;coordinates[i*3+1]=(Math.random()-.5)*7;coordinates[i*3+2]=(Math.random()-.5)*4;}
  const geometry = new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.BufferAttribute(coordinates,3));
  const material = new THREE.PointsMaterial({color:0x6f8f72,size:.035,transparent:true,opacity:.5,depthWrite:false});
  const particles = new THREE.Points(geometry, material);scene.add(particles);
  const resize = () => {const {width,height}=host.getBoundingClientRect();if(!width||!height)return;renderer.setSize(width,height,false);camera.aspect=width/height;camera.updateProjectionMatrix();};
  const ro = new ResizeObserver(resize);ro.observe(host);resize();
  let visible=false, frame=0, start=0;
  function tick(t) {if(!visible||document.hidden||motion.matches||suspended)return;if(!start)start=t;const time=(t-start)/1000;particles.rotation.y=Math.sin(time*.15+index)*.18;particles.rotation.z=Math.sin(time*.12)*.035;renderer.render(scene,camera);frame=requestAnimationFrame(tick);}
  const sync=()=>{cancelAnimationFrame(frame);if(visible&&!document.hidden&&!motion.matches&&!suspended){start=0;frame=requestAnimationFrame(tick);}};
  syncRenderers.push(sync);
  const io=new IntersectionObserver(entries=>{visible=entries[0].isIntersecting;sync();},{threshold:.05});io.observe(section);document.addEventListener('visibilitychange',sync);motion.addEventListener('change',sync);
  cleanups.push(()=>{cancelAnimationFrame(frame);io.disconnect();ro.disconnect();document.removeEventListener('visibilitychange',sync);motion.removeEventListener('change',sync);geometry.dispose();material.dispose();renderer.dispose();renderer.domElement.remove();});
}
// The decorative WebGL layer is optional. Load it only near a story, keeping
// the original artwork visible if WebGL or the module request is unavailable.
let active = true, loading;
const mounted = new WeakSet();
const sections = [...document.querySelectorAll('.story')];
const depthObserver = 'IntersectionObserver' in window ? new IntersectionObserver(entries => {
  for (const entry of entries) {
    if (!entry.isIntersecting || motion.matches) continue;
    loading ||= import('./three/three.module.js');
    loading.then(module => {
      if (!active || motion.matches || mounted.has(entry.target)) return;
      THREE = module;
      mount(entry.target, sections.indexOf(entry.target));
      mounted.add(entry.target);
      depthObserver.unobserve(entry.target);
    }).catch(() => { /* Static artwork remains available. */ });
  }
}, { rootMargin: '200px' }) : null;
const observeDepth = () => {
  depthObserver?.disconnect();
  if (!motion.matches && active) sections.forEach(section => {
    if (!mounted.has(section)) depthObserver?.observe(section);
  });
};
observeDepth();
motion.addEventListener('change', observeDepth);
window.addEventListener('pagehide', event => {
  suspended = true;
  syncRenderers.forEach(sync => sync());
  if (event.persisted) return;
  active = false;
  depthObserver?.disconnect();
  motion.removeEventListener('change', observeDepth);
  cleanups.forEach(dispose => dispose());
});
window.addEventListener('pageshow', () => {
  if (!active) return;
  suspended = false;
  observeDepth();
  syncRenderers.forEach(sync => sync());
});

// GSAP sequences each full-screen panel once, as it enters the viewport.
if (!motion.matches && window.gsap && 'IntersectionObserver' in window) {
  const observer = new IntersectionObserver(entries=>entries.forEach(entry=>{
    if(!entry.isIntersecting)return;
    const text=entry.target.querySelectorAll('.story-copy > *, .section-heading > *, .steps article, .faq-list details');
    const art=entry.target.querySelector('.story-art');
    const tl=gsap.timeline({defaults:{ease:'power3.out'}});
    if(art)tl.fromTo(art,{scale:1.16},{scale:1.02,duration:2.2,clearProps:'transform'},0);
    if(text.length)tl.fromTo(text,{y:36,autoAlpha:0},{y:0,autoAlpha:1,duration:1,stagger:.1,clearProps:'transform,opacity,visibility'},.1);
    observer.unobserve(entry.target);
  }),{threshold:.15});
  document.querySelectorAll('.story, #paths, .workflow, .faq').forEach(section=>observer.observe(section));
}
