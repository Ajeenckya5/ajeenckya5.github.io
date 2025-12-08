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