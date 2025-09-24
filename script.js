// Smooth scroll and active navbar/footer link handling (sync active across duplicates)
(function () {
  const nav = document.querySelector('.custom-navbar');
  const allLinks = Array.from(document.querySelectorAll('a.nav-link'));
  const collapseEl = document.getElementById('navbarNav');
  const toggler = document.querySelector('.navbar-toggler');

  if (!allLinks.length) return;

  // Group links by their hash and map to sections
  const linksByHash = new Map(); // hash => [links]
  const sectionsByHash = new Map(); // hash => sectionEl

  allLinks.forEach((link) => {
    const href = link.getAttribute('href') || '';
    if (!href.startsWith('#')) return;
    const section = document.querySelector(href);
    if (!section) return;
    if (!linksByHash.has(href)) linksByHash.set(href, []);
    linksByHash.get(href).push(link);
    sectionsByHash.set(href, section);
  });

  const clearActive = () => allLinks.forEach((l) => l.classList.remove('active'));
  const setActiveByHash = (hash) => {
    clearActive();
    const group = linksByHash.get(hash) || [];
    group.forEach((l) => l.classList.add('active'));
  };

  // Click: smooth scroll and set active for all matching links
  allLinks.forEach((link) => {
    link.addEventListener('click', (e) => {
      const hash = link.getAttribute('href');
      if (hash && hash.startsWith('#')) {
        const target = document.querySelector(hash);
        if (target) {
          e.preventDefault();
          setActiveByHash(hash);
          target.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      }

      // Collapse mobile navbar if open (Bootstrap)
      const opened = document.querySelector('.navbar-collapse.show');
      if (opened && typeof bootstrap !== 'undefined') {
        const collapse = bootstrap.Collapse.getInstance(opened) || new bootstrap.Collapse(opened, { toggle: false });
        collapse.hide();
      }
    });
  });

  // Close collapse when clicking outside of the navbar/collapse area
  document.addEventListener('click', (event) => {
    if (!collapseEl) return;
    const isOpen = collapseEl.classList.contains('show');
    if (!isOpen) return;

    const clickedInsideCollapse = collapseEl.contains(event.target);
    const clickedToggler = toggler && toggler.contains(event.target);
    const clickedInsideNavbar = nav && nav.contains(event.target);

    // If click is outside the open collapse and not on toggler, hide it
    if (!clickedInsideCollapse && !clickedToggler && !clickedInsideNavbar) {
      if (typeof bootstrap !== 'undefined') {
        const instance = bootstrap.Collapse.getInstance(collapseEl) || new bootstrap.Collapse(collapseEl, { toggle: false });
        instance.hide();
      }
    }
  }, { capture: true });

  // Close on Escape key
  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return;
    if (!collapseEl || !collapseEl.classList.contains('show')) return;
    if (typeof bootstrap !== 'undefined') {
      const instance = bootstrap.Collapse.getInstance(collapseEl) || new bootstrap.Collapse(collapseEl, { toggle: false });
      instance.hide();
    }
  });

  // On resize to desktop, ensure collapse is hidden (no visual flicker)
  window.addEventListener('resize', () => {
    if (!collapseEl) return;
    const desktop = window.innerWidth >= 992;
    if (desktop && collapseEl.classList.contains('show') && typeof bootstrap !== 'undefined') {
      const instance = bootstrap.Collapse.getInstance(collapseEl) || new bootstrap.Collapse(collapseEl, { toggle: false });
      instance.hide();
    }
  });

  // Determine the most visible mapped section in the viewport
  const computeMostVisibleHash = () => {
    let best = { hash: null, ratio: 0 };
    sectionsByHash.forEach((section, hash) => {
      const rect = section.getBoundingClientRect();
      const vh = window.innerHeight || document.documentElement.clientHeight;
      const visible = Math.max(0, Math.min(rect.bottom, vh) - Math.max(rect.top, 0));
      const ratio = Math.max(0, Math.min(1, visible / Math.max(1, rect.height)));
      if (ratio > best.ratio) best = { hash, ratio };
    });
    return best.hash;
  };

  // IntersectionObserver to trigger recalculation when sections enter/leave
  const observer = new IntersectionObserver(
    () => {
      const bestHash = computeMostVisibleHash();
      if (bestHash) setActiveByHash(bestHash);
    },
    { root: null, threshold: [0, 0.2, 0.4, 0.6, 0.8, 1] }
  );

  // Observe all mapped sections
  sectionsByHash.forEach((section) => observer.observe(section));

  // Also update on scroll/resize for extra reliability at page edges
  const debouncedUpdate = (() => {
    let raf = null;
    return () => {
      if (raf) cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const bestHash = computeMostVisibleHash();
        if (bestHash) setActiveByHash(bestHash);
      });
    };
  })();
  window.addEventListener('scroll', debouncedUpdate, { passive: true });
  window.addEventListener('resize', debouncedUpdate);

  // Initial active on load
  window.addEventListener('load', () => {
    const bestHash = computeMostVisibleHash();
    if (bestHash) setActiveByHash(bestHash);
  });
})();

// Blog Carousel - Infinite loop with scaling pagination
(function () {
  const carousel = document.querySelector('.blog-carousel');
  const track = document.querySelector('.blog-track');
  const dots = Array.from(document.querySelectorAll('.pagination span'));
  if (!carousel || !track || dots.length === 0) return;

  const originalCount = track.children.length; // should be 3
  let step = 0; // distance to move per slide
  let animating = false;
  let current = 0; // index within original set for pagination
  let timer = null;

  // Helper to compute step based on card offsets (accounts for gap)
  function computeStep() {
    const items = track.children;
    if (items.length < 2) return;
    const a = items[0].getBoundingClientRect();
    const b = items[1].getBoundingClientRect();
    step = Math.round(b.left - a.left);
  }

  // Duplicate slides once to allow smooth wrap
  (function duplicate() {
    const frag = document.createDocumentFragment();
    for (let i = 0; i < originalCount; i++) {
      frag.appendChild(track.children[i].cloneNode(true));
    }
    track.appendChild(frag);
  })();

  function setActiveDot(idx) {
    dots.forEach((d, i) => {
      d.classList.toggle('active', i === idx);
    });
  }

  function slideNext() {
    if (animating) return;
    animating = true;
    track.style.transition = 'transform 600ms ease';
    track.style.transform = `translateX(${-step}px)`;
  }

  function slideToIndex(target) {
    // compute how many steps forward from current to target (0..2)
    let diff = (target - current + originalCount) % originalCount;
    if (diff === 0) return; // already there
    // chain diff times
    let count = 0;
    const run = () => {
      slideNext();
      count++;
      if (count < diff) {
        // schedule next after the current transition end handling
        pendingChain = true;
      } else {
        pendingChain = false;
      }
    };
    run();
  }

  let pendingChain = false;

  track.addEventListener('transitionend', () => {
    // After moving left by one step, move first item to end and reset transform
    track.style.transition = 'none';
    track.appendChild(track.firstElementChild);
    track.style.transform = 'translateX(0)';
    // force reflow to apply removal of transition before enabling again
    void track.offsetWidth;
    track.style.transition = '';
    animating = false;
    current = (current + 1) % originalCount;
    setActiveDot(current);
    if (pendingChain) {
      // continue chained slides for dot navigation
      pendingChain = false;
      setTimeout(slideNext, 20);
    }
  });

  function startAuto() {
    stopAuto();
    timer = setInterval(slideNext, 3000);
  }
  function stopAuto() {
    if (timer) clearInterval(timer);
    timer = null;
  }

  // Pause on hover
  carousel.addEventListener('mouseenter', stopAuto);
  carousel.addEventListener('mouseleave', startAuto);

  // Dot click navigation
  dots.forEach((dot, idx) => {
    dot.addEventListener('click', () => {
      if (idx === current) return;
      slideToIndex(idx);
    });
  });

  // Recompute step on load/resize
  const ro = new ResizeObserver(() => {
    computeStep();
  });
  ro.observe(carousel);
  computeStep();
  setActiveDot(0);
  startAuto();

  // Add variables for touch detection
let touchStartX = 0;
let touchEndX = 0;
const swipeThreshold = 50; // Minimum pixels to trigger a slide

// Add touch event listeners to the carousel container
carousel.addEventListener('touchstart', (e) => {
  // Stop auto-sliding and record the initial touch position
  stopAuto();
  touchStartX = e.touches[0].clientX;
});

carousel.addEventListener('touchend', (e) => {
  // Record the final touch position
  touchEndX = e.changedTouches[0].clientX;
  const swipeDistance = touchStartX - touchEndX; // positive for left swipe

  // If the swipe is a significant leftward swipe, trigger the next slide
  if (swipeDistance > swipeThreshold) {
    slideNext();
  }

  // Restart auto-sliding after the touch interaction ends
  startAuto();
});

// To prevent the page from scrolling while swiping horizontally
carousel.addEventListener('touchmove', (e) => {
  e.preventDefault();
});
})();
