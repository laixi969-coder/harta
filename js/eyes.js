const OPEN =
  '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M2.5 12s3.5-6.5 9.5-6.5S21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z"/><circle cx="12" cy="12" r="2.6"/></svg>';
const SHUT =
  '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M2.5 12s3.5-6.5 9.5-6.5S21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z"/><circle cx="12" cy="12" r="2.6"/><path d="M4 20 20 4"/></svg>';

function paint(btn, showing) {
  btn.innerHTML = showing ? SHUT : OPEN;
  btn.classList.toggle("is-on", showing);
  btn.setAttribute("aria-pressed", showing ? "true" : "false");
  btn.setAttribute("aria-label", showing ? "隐藏密码" : "显示密码");
}

export function bindEyes(root = document) {
  root.querySelectorAll("[data-eye]").forEach((btn) => {
    if (btn.dataset.bound === "1") return;
    btn.dataset.bound = "1";
    const input = document.getElementById(btn.getAttribute("data-eye"));
    paint(btn, input?.type === "text");
    btn.addEventListener("click", () => {
      if (!input) return;
      const show = input.type === "password";
      input.type = show ? "text" : "password";
      paint(btn, show);
    });
  });
}
