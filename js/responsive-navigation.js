// Reuse the actual rail: permissions, links and selected states stay in one place.
export function installResponsiveNavigation() {
  const rail = document.querySelector('.rail');
  const shell = document.querySelector('.shell');
  const toggle = document.getElementById('mobile-menu-toggle');
  const title = document.getElementById('mobile-page-title');
  const dialog = document.getElementById('harta-navigation');
  const media = window.matchMedia('(max-width: 860px)');
  const close = () => { if (dialog.open) dialog.close(); };
  const layout = () => {
    close();
    if (media.matches) dialog.append(rail);
    else shell.prepend(rail);
  };
  toggle.addEventListener('click', () => {
    if (dialog.open) close();
    else { dialog.showModal(); toggle.setAttribute('aria-expanded', 'true'); }
  });
  rail.querySelector('[data-close-navigation]').addEventListener('click', close);
  dialog.addEventListener('close', () => toggle.setAttribute('aria-expanded', 'false'));
  dialog.addEventListener('click', event => { if (event.target === dialog) close(); });
  media.addEventListener('change', layout);
  layout();
  return view => {
    title.textContent = rail.querySelector(`[data-nav="${view}"]`)?.textContent.trim() || '工作台';
    close();
  };
}
