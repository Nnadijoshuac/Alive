/**
 * ALIVE Landing Page — Vanilla JS Interactions
 * - Stat Count-up Animation with easeOutCubic
 * - Responsive Mobile Drawer Toggle & Keyboard Access
 */

document.addEventListener("DOMContentLoaded", () => {
  initStatCountUp();
  initMobileMenu();
});

function initStatCountUp() {
  const statElements = document.querySelectorAll(".stat-value[data-target]");
  if (!statElements.length) return;

  const prefersReducedMotion = window.matchMedia(
    "(prefers-reduced-motion: reduce)",
  ).matches;

  if (prefersReducedMotion) {
    statElements.forEach((el) => {
      const target = el.getAttribute("data-target") || "0";
      el.textContent = target;
    });
    return;
  }

  function easeOutCubic(t) {
    return 1 - Math.pow(1 - t, 3);
  }

  function animateValue(el, target, duration, delay) {
    setTimeout(() => {
      const startTime = performance.now();
      const isInteger = Number.isInteger(target);

      function update(currentTime) {
        const elapsed = currentTime - startTime;
        const progress = Math.min(elapsed / duration, 1);
        const eased = easeOutCubic(progress);
        const current = target * eased;

        el.textContent = isInteger
          ? Math.round(current).toString()
          : current.toFixed(1);

        if (progress < 1) {
          requestAnimationFrame(update);
        } else {
          el.textContent = target.toString();
        }
      }

      requestAnimationFrame(update);
    }, delay);
  }

  const observer = new IntersectionObserver(
    (entries, obs) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          statElements.forEach((el, index) => {
            const target = parseFloat(el.getAttribute("data-target") || "0");
            const duration = 1500 + index * 80;
            const delay = 480 + index * 90;
            animateValue(el, target, duration, delay);
          });
          obs.disconnect();
        }
      });
    },
    { threshold: 0.25 },
  );

  const statsSection = document.querySelector(".stats");
  if (statsSection) {
    observer.observe(statsSection);
  } else {
    statElements.forEach((el, index) => {
      const target = parseFloat(el.getAttribute("data-target") || "0");
      animateValue(el, target, 1500 + index * 80, 480 + index * 90);
    });
  }
}

function initMobileMenu() {
  const burgerBtn = document.getElementById("burgerBtn");
  const mobileOverlay = document.getElementById("mobileOverlay");
  if (!burgerBtn || !mobileOverlay) return;

  function setMenuOpen(open) {
    burgerBtn.classList.toggle("open", open);
    mobileOverlay.classList.toggle("active", open);
    burgerBtn.setAttribute("aria-expanded", open ? "true" : "false");
    mobileOverlay.setAttribute("aria-hidden", open ? "false" : "true");
    document.body.classList.toggle("menu-open", open);
  }

  burgerBtn.addEventListener("click", () => {
    const isOpen = burgerBtn.classList.contains("open");
    setMenuOpen(!isOpen);
  });

  mobileOverlay.addEventListener("click", (event) => {
    if (event.target === mobileOverlay) {
      setMenuOpen(false);
    }
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && burgerBtn.classList.contains("open")) {
      setMenuOpen(false);
      burgerBtn.focus();
    }
  });

  const mobileLinks = mobileOverlay.querySelectorAll("a");
  mobileLinks.forEach((link) => {
    link.addEventListener("click", () => {
      setMenuOpen(false);
    });
  });

  window.addEventListener("resize", () => {
    if (window.innerWidth > 720 && burgerBtn.classList.contains("open")) {
      setMenuOpen(false);
    }
  });
}
