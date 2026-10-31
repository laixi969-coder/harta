const intro = document.getElementById('intro');
const login = document.getElementById('login');
const video = document.getElementById('hero-video');
const toggle = document.getElementById('video-toggle');
const motion = matchMedia('(prefers-reduced-motion: reduce)');
let wantsPlayback = !motion.matches && !navigator.connection?.saveData;
let failed = false;

function syncButton() {
  toggle.textContent = failed ? '背景暂不可用' : video.paused ? '播放背景' : '暂停背景';
  toggle.setAttribute('aria-pressed', String(!video.paused));
  toggle.disabled = failed;
}
function syncPlayback() {
  if (!wantsPlayback || document.hidden || !login.hidden || failed) {
    video.pause();
    return;
  }
  if (!video.hasAttribute('src')) video.src = video.dataset.src;
  video.play().catch(() => { syncButton(); });
}
function showPage(focus = false) {
  const signingIn = ['#login', '#form'].includes(location.hash);
  intro.hidden = signingIn;
  login.hidden = !signingIn;
  toggle.hidden = signingIn;
  if (focus || signingIn) (signingIn ? document.getElementById('email') : document.querySelector('.landing-cta')).focus({preventScroll:true});
  syncPlayback();
}
toggle.addEventListener('click', () => {
  wantsPlayback = video.paused;
  // The login form stays still; playback resumes after returning to the hero.
  if (!login.hidden) { location.hash = 'intro'; return; }
  syncPlayback();
});
video.addEventListener('playing', () => { video.classList.add('is-playing'); syncButton(); });
video.addEventListener('pause', syncButton);
video.addEventListener('error', () => { failed = true; video.classList.remove('is-playing'); syncButton(); });
motion.addEventListener('change', () => { wantsPlayback = !motion.matches && !navigator.connection?.saveData; syncPlayback(); });
document.addEventListener('visibilitychange', syncPlayback);
window.addEventListener('hashchange', () => showPage(true));
showPage();
syncButton();
