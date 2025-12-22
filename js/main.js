const navToggle = document.getElementById("navToggle");
const nav = document.getElementById("siteNav");
const yearSpan = document.getElementById("year");

if (navToggle && nav) {
  navToggle.addEventListener("click", () => {
    nav.classList.toggle("open");
  });
}

// set footer year
if (yearSpan) {
  yearSpan.textContent = new Date().getFullYear();
}

document.querySelectorAll(".project-card").forEach((card) => {
  card.addEventListener("mousemove", (e) => {
    const r = card.getBoundingClientRect();
    card.style.setProperty("--mx", `${e.clientX - r.left}px`);
    card.style.setProperty("--my", `${e.clientY - r.top}px`);
  });
});
