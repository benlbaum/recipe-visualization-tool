import { useLayoutEffect, useRef } from 'react';

// The page scrolls through the cover while the plan grows into the space it
// leaves. Method and Ingredients keep their own native scroll and reading place.
export default function useMobilePlanScroll(enabled, recipeId, hasNotice) {
  const frame = useRef(null);
  useLayoutEffect(() => {
    if (!enabled) return;
    const page = frame.current;
    const studio = page.querySelector('.studio');
    const plan = page.querySelector('.workspace-grid');
    let range = 0;
    let reader;
    let previousTop = 0;
    let chartTouch;

    function resizePlan() {
      const offset = Math.max(0, Math.min(range, page.scrollTop));
      page.style.setProperty('--plan-scroll', offset + 'px');
    }

    function measure() {
      range = Math.round(plan.getBoundingClientRect().top - studio.getBoundingClientRect().top);
      page.style.setProperty('--plan-scroll-range', range + 'px');
      resizePlan();
    }

    function beginReading(event) {
      reader = event.target.closest('.method-panel, .ingredient-checklist');
      previousTop = reader?.scrollTop ?? 0;
      if (event.type === 'touchstart') {
        const touch = event.touches[0];
        chartTouch = event.touches.length === 1 && event.target.matches('.react-flow__pane')
          ? { x: touch.clientX, y: touch.clientY, vertical: false } : null;
      }
    }

    // The graph handles its own pan, so a swipe on its background never
    // reaches the native page scroller. Follow only one-finger vertical pans.
    function panChart(event) {
      if (!chartTouch || event.touches.length !== 1) return;
      const touch = event.touches[0];
      const dy = chartTouch.y - touch.clientY;
      if (!chartTouch.vertical) {
        const dx = Math.abs(chartTouch.x - touch.clientX);
        if (Math.max(dx, Math.abs(dy)) < 6) return;
        if (dx >= Math.abs(dy)) {
          chartTouch = null;
          return;
        }
        chartTouch.vertical = true;
      }
      page.scrollTop += dy;
      chartTouch.y = touch.clientY;
    }

    function scroll(event) {
      if (event.target === page) {
        resizePlan();
      } else if (reader && event.target === reader) {
        const top = Math.max(0, reader.scrollTop);
        const delta = top - previousTop;
        previousTop = top;
        // A growing list viewport can clamp its offset at the last item.
        // Only an actual upward scroll should bring the cover back.
        if (delta < 0 && top >= reader.scrollHeight - reader.clientHeight - 1) return;
        page.scrollTop = Math.max(0, Math.min(range, page.scrollTop + delta));
        resizePlan();
      }
    }

    page.scrollTop = 0;
    measure();
    const observer = new ResizeObserver(measure);
    for (const header of page.querySelectorAll('.app-bar, .recipe-cover, .studio-alert')) observer.observe(header);
    page.addEventListener('scroll', scroll, true);
    page.addEventListener('touchmove', panChart, { passive: true, capture: true });
    const inputs = ['touchstart', 'wheel', 'keydown', 'pointerdown'];
    for (const type of inputs) page.addEventListener(type, beginReading, { passive: true, capture: true });
    return () => {
      observer.disconnect();
      page.removeEventListener('scroll', scroll, true);
      page.removeEventListener('touchmove', panChart, true);
      for (const type of inputs) page.removeEventListener(type, beginReading, true);
      page.scrollTop = 0;
      page.style.removeProperty('--plan-scroll');
      page.style.removeProperty('--plan-scroll-range');
    };
  }, [enabled, recipeId, hasNotice]);
  return frame;
}
