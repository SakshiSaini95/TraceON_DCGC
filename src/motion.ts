/**
 * Lightweight motion layer (no extra dependencies).
 * - Scroll progress bar        - Parallax (data-parallax="speed")
 * - Scroll-linked text fill    - Stagger delays for grouped .reveal cards
 * - Media / section reveals    - Cursor spotlight on cards
 *
 * All visual states are keyed on the `motion-ready` class so that with
 * reduced-motion (or no JS) the page renders exactly as it did before.
 */
const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n));

export function initMotion(): () => void {
  const root = document.documentElement;
  const reduceMq = window.matchMedia('(prefers-reduced-motion: reduce)');
  const cleanups: Array<() => void> = [];

  const bar = document.querySelector<HTMLElement>('.scroll-progress span');
  const heroMascot = document.querySelector<HTMLElement>('.hero-mascot');
  const parallaxEls = Array.from(document.querySelectorAll<HTMLElement>('[data-parallax]'));
  const fillEls = Array.from(document.querySelectorAll<HTMLElement>('[data-fill]'));
  const lastShift = new Map<HTMLElement, number>();
  const lastFill = new Map<HTMLElement, number>();
  const active = new Set<HTMLElement>(); // parallax / fill elements currently near the viewport

  const motion = !reduceMq.matches;
  if (motion) root.classList.add('motion-ready');

  /* ───── Scroll-driven work, one rAF per frame ───── */
  let ticking = false;
  const update = () => {
    ticking = false;
    const y = window.scrollY;
    const vh = window.innerHeight;

    if (bar) {
      const max = document.documentElement.scrollHeight - vh;
      bar.style.transform = `scaleX(${max > 0 ? clamp(y / max, 0, 1) : 0})`;
    }
    if (!motion) return;

    if (heroMascot) heroMascot.style.setProperty('--scroll-shift', `${Math.min(y * 0.12, 56)}px`);

    active.forEach((el) => {
      if (el.hasAttribute('data-parallax')) {
        const speed = parseFloat(el.dataset.parallax || '0');
        const prev = lastShift.get(el) ?? 0;
        const rect = el.getBoundingClientRect();
        const center = rect.top + rect.height / 2 - prev; // un-shifted centre
        const shift = clamp(-(center - vh / 2) * speed, -70, 70);
        if (Math.abs(shift - prev) > 0.1) {
          lastShift.set(el, shift);
          el.style.setProperty('--py', `${shift.toFixed(1)}px`);
        }
      }
      if (el.hasAttribute('data-fill')) {
        const rect = el.getBoundingClientRect();
        const p = clamp((vh * 0.9 - rect.top) / (vh * 0.5), 0, 1);
        if (Math.abs(p - (lastFill.get(el) ?? -1)) > 0.004) {
          lastFill.set(el, p);
          el.style.setProperty('--f', p.toFixed(3));
        }
      }
    });
  };
  const schedule = () => { if (!ticking) { ticking = true; requestAnimationFrame(update); } };
  window.addEventListener('scroll', schedule, { passive: true });
  cleanups.push(() => window.removeEventListener('scroll', schedule));

  if (!motion) {
    update();
    return () => cleanups.forEach((fn) => fn());
  }

  /* ───── Track which parallax / fill elements are near the viewport ───── */
  const trackIo = new IntersectionObserver((entries) => {
    entries.forEach((e) => (e.isIntersecting ? active.add(e.target as HTMLElement) : active.delete(e.target as HTMLElement)));
    schedule();
  }, { rootMargin: '25% 0px 25% 0px' });
  [...parallaxEls, ...fillEls].forEach((el) => trackIo.observe(el));
  cleanups.push(() => trackIo.disconnect());

  /* ───── Stagger: delay by column position within each group ───── */
  const groups = Array.from(document.querySelectorAll<HTMLElement>('.steps, .feature-grid, .platforms, .notes, .compare-wrap'));
  const applyStagger = () => {
    groups.forEach((group) => {
      const kids = Array.from(group.children) as HTMLElement[];
      const rows = new Map<number, number>();
      kids.forEach((kid) => {
        const row = Math.round(kid.offsetTop / 8);
        const col = rows.get(row) ?? 0;
        rows.set(row, col + 1);
        kid.style.setProperty('--d', `${col * 110}ms`);
      });
    });
  };
  applyStagger();
  let resizeTimer = 0;
  const onResize = () => {
    window.clearTimeout(resizeTimer);
    resizeTimer = window.setTimeout(() => { applyStagger(); schedule(); }, 150);
  };
  window.addEventListener('resize', onResize);
  cleanups.push(() => { window.removeEventListener('resize', onResize); window.clearTimeout(resizeTimer); });

  /* ───── One-shot reveals: mark .reveal as settled, media + sections ───── */
  const once = (selector: string, onEnter: (el: HTMLElement) => void, threshold = 0.12, rootMargin = '0px') => {
    const io = new IntersectionObserver((entries) => {
      entries.forEach((e) => {
        if (!e.isIntersecting) return;
        onEnter(e.target as HTMLElement);
        io.unobserve(e.target);
      });
    }, { threshold, rootMargin });
    document.querySelectorAll<HTMLElement>(selector).forEach((el) => io.observe(el));
    cleanups.push(() => io.disconnect());
  };

  // After the entrance finishes, drop the entrance transition so hover effects aren't delayed.
  once('.reveal', (el) => {
    const delay = parseInt(el.style.getPropertyValue('--d') || '0', 10) || 0;
    window.setTimeout(() => el.setAttribute('data-done', ''), 1000 + delay);
  });
  once('[data-media]', (el) => {
    el.setAttribute('data-in', '');
    window.setTimeout(() => el.setAttribute('data-done', ''), 1600);
  }, 0, '0px 0px -12% 0px'); // threshold 0: the masked element's visible area starts near-empty
  once('.section-dark', (el) => el.setAttribute('data-in', ''), 0.05);

  /* ───── Cursor spotlight on cards (fine pointers only) ───── */
  if (window.matchMedia('(hover: hover) and (pointer: fine)').matches) {
    const onMove = (e: PointerEvent) => {
      const card = (e.target as Element).closest<HTMLElement>('.fold-card, .platform-card');
      if (!card) return;
      const r = card.getBoundingClientRect();
      card.style.setProperty('--mx', `${e.clientX - r.left}px`);
      card.style.setProperty('--my', `${e.clientY - r.top}px`);
    };
    document.addEventListener('pointermove', onMove, { passive: true });
    cleanups.push(() => document.removeEventListener('pointermove', onMove));
  }

  update();
  return () => {
    cleanups.forEach((fn) => fn());
    root.classList.remove('motion-ready');
  };
}
