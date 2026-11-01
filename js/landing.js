const intro = document.getElementById('intro');
const login = document.getElementById('login');
function showPage(focus = false) {
  const signingIn = ['#login', '#form'].includes(location.hash);
  intro.hidden = signingIn;
  login.hidden = !signingIn;
  document.body.classList.toggle('is-login', signingIn);
  if (signingIn && (focus || location.hash)) document.getElementById('email').focus({ preventScroll: true });
  if (focus && !signingIn && location.hash === '#intro') document.querySelector('.landing-cta').focus({ preventScroll: true });
  if (focus && (signingIn || location.hash === '#intro')) window.scrollTo(0, 0);
}
window.addEventListener('hashchange', () => showPage(true));
showPage();
const reduced = matchMedia('(prefers-reduced-motion: reduce)');
if ('IntersectionObserver' in window && !reduced.matches) {
  document.documentElement.classList.add('motion-ready');
  const observer = new IntersectionObserver((entries, obs) => entries.forEach(entry => {
    if (entry.isIntersecting) { entry.target.classList.add('revealed'); obs.unobserve(entry.target); }
  }), { threshold: 0.12 });
  document.querySelectorAll('[data-reveal]').forEach(el => observer.observe(el));
  const words = new IntersectionObserver((entries, obs) => entries.forEach(entry => {
    if (entry.isIntersecting) { entry.target.classList.add('active'); obs.unobserve(entry.target); }
  }), { threshold: 0.5, rootMargin: '0px 0px -15% 0px' });
  document.querySelectorAll('.word-reveal span').forEach(el => words.observe(el));
} else document.querySelectorAll('.word-reveal span').forEach(el => el.classList.add('active'));

// Animate the product illustrations only when they enter view.
if ('IntersectionObserver' in window && !reduced.matches && window.gsap) {
  const storyObserver = new IntersectionObserver((entries, observer) => {
    entries.forEach(entry => {
      if (!entry.isIntersecting) return;
      const items = entry.target.querySelectorAll('.story-node, .format-card');
      gsap.from(items, { y: 24, autoAlpha: 0, duration: 0.8, stagger: 0.16, ease: 'power3.out', clearProps: 'opacity,visibility,transform' });
      observer.unobserve(entry.target);
    });
  }, { threshold: 0.25 });
  document.querySelectorAll('.story-visual').forEach(el => storyObserver.observe(el));
}

const landscapeToggle = document.querySelector('.landscape-toggle');
if (landscapeToggle) {
  let paused = reduced.matches;
  const updateLandscape = () => {
    document.documentElement.classList.toggle('landscape-paused', paused || reduced.matches);
    landscapeToggle.textContent = paused || reduced.matches ? '播放背景动效' : '暂停背景动效';
    landscapeToggle.setAttribute('aria-pressed', String(paused || reduced.matches));
    landscapeToggle.disabled = reduced.matches;
    landscapeToggle.title = reduced.matches ? '系统已启用减少动态效果' : '';
  };
  landscapeToggle.addEventListener('click', () => { paused = !paused; updateLandscape(); });
  reduced.addEventListener('change', () => { paused = reduced.matches; updateLandscape(); });
  updateLandscape();
}
