/* nav, tabs, hero background */

(function () {
"use strict";

/* ---- mobile nav ---- */
const navToggle = document.getElementById("navToggle");
const nav = document.getElementById("siteNav");

if (navToggle && nav) {
  navToggle.addEventListener("click", () => {
    const isOpen = nav.classList.toggle("open");
    navToggle.setAttribute("aria-expanded", String(isOpen));
  });
  nav.querySelectorAll("a").forEach((link) =>
    link.addEventListener("click", () => {
      nav.classList.remove("open");
      navToggle.setAttribute("aria-expanded", "false");
    })
  );
}

/* ---- demo tabs ---- */
document.querySelectorAll(".demo-panel").forEach((panel) => {
  const tabs = panel.querySelectorAll(".tab");
  tabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      tabs.forEach((t) => t.classList.remove("active"));
      tab.classList.add("active");
      panel.querySelectorAll(".tab-pane").forEach((p) => p.classList.remove("active"));
      const pane = panel.querySelector("#pane-" + tab.dataset.tab);
      if (pane) {
        pane.classList.add("active");
        // canvases inside previously-hidden panes need a paint
        const hook = window.__paneHooks && window.__paneHooks[pane.id];
        if (hook) requestAnimationFrame(hook);
      }
    });
  });
});

/* ---- hero particle network ---- */
const cv = document.getElementById("heroCanvas");
if (cv && !window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
  const ctx = cv.getContext("2d");
  let W, H, pts;

  function init() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = cv.clientWidth;
    H = cv.clientHeight;
    cv.width = W * dpr;
    cv.height = H * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const n = Math.min(70, Math.floor((W * H) / 16000));
    pts = Array.from({ length: n }, () => ({
      x: Math.random() * W,
      y: Math.random() * H,
      vx: (Math.random() - 0.5) * 0.25,
      vy: (Math.random() - 0.5) * 0.25
    }));
  }

  function frame() {
    ctx.clearRect(0, 0, W, H);
    for (const p of pts) {
      p.x += p.vx; p.y += p.vy;
      if (p.x < 0 || p.x > W) p.vx *= -1;
      if (p.y < 0 || p.y > H) p.vy *= -1;
    }
    ctx.strokeStyle = "rgba(34, 211, 238, 0.07)";
    for (let i = 0; i < pts.length; i++) {
      for (let j = i + 1; j < pts.length; j++) {
        const dx = pts[i].x - pts[j].x, dy = pts[i].y - pts[j].y;
        const d2 = dx * dx + dy * dy;
        if (d2 < 13000) {
          ctx.beginPath();
          ctx.moveTo(pts[i].x, pts[i].y);
          ctx.lineTo(pts[j].x, pts[j].y);
          ctx.stroke();
        }
      }
    }
    ctx.fillStyle = "rgba(34, 211, 238, 0.35)";
    for (const p of pts) {
      ctx.beginPath();
      ctx.arc(p.x, p.y, 1.4, 0, 7);
      ctx.fill();
    }
    requestAnimationFrame(frame);
  }

  init();
  window.addEventListener("resize", init);
  requestAnimationFrame(frame);
}
})();
