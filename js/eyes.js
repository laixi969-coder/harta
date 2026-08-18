export function bindEyes(root = document) {
  root.querySelectorAll("[data-eye]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const id = btn.getAttribute("data-eye");
      const input = document.getElementById(id);
      if (!input) return;
      const hide = input.type === "text";
      input.type = hide ? "password" : "text";
      btn.textContent = hide ? "显示" : "隐藏";
      btn.setAttribute("aria-label", hide ? "显示密码" : "隐藏密码");
    });
  });
}

if (typeof document !== "undefined") {
  document.addEventListener("DOMContentLoaded", () => bindEyes());
}
