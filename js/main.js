// Mobile nav toggle
const navToggle = document.getElementById("navToggle");
const navList = document.querySelector(".nav ul");

if (navToggle && navList) {
    navToggle.addEventListener("click", () => {
        navList.classList.toggle("open");
    });
}

// Dynamic year in footer
const yearSpan = document.getElementById("year");
if (yearSpan) {
    yearSpan.textContent = new Date().getFullYear();
}
