import { useCallback, useRef, useState } from 'react';

// Reading position is specific to this tab. Shared recipe files contain only the recipe.
const memory = new Map();
function read(key) {
  if (memory.has(key)) return memory.get(key);
  try { return sessionStorage.getItem(key); } catch { return null; }
}
function write(key, value) {
  memory.set(key, value);
  try { sessionStorage.setItem(key, value); } catch { /* Still available in this tab. */ }
}

export function useReadingChoice(key, fallback) {
  const [, refresh] = useState(0);
  const select = useCallback(value => {
    write(key, value);
    refresh(revision => revision + 1);
  }, [key]);
  return [read(key) ?? fallback, select];
}

export function useReadingScroll(key) {
  const detach = useRef(null);
  return useCallback(element => {
    detach.current?.();
    detach.current = null;
    if (!element) return;
    const saved = Number(read(key)) || 0;
    let restoring = saved > 0;
    let frame;
    element.scrollTop = saved;
    const remember = () => { if (!restoring) write(key, String(element.scrollTop)); };
    const takeControl = () => { restoring = false; };
    const inputs = ['pointerdown', 'touchstart', 'wheel', 'keydown'];
    for (const event of inputs) element.addEventListener(event, takeControl, { passive: true });
    if (restoring) {
      // Header and list text can wrap differently in the fallback font. Chrome
      // clamps scrollTop to that shorter list before our bundled fonts load.
      document.fonts.ready.then(() => {
        if (!restoring) return;
        frame = requestAnimationFrame(() => {
          if (!restoring) return;
          element.scrollTop = saved;
          restoring = false;
        });
      });
    }
    // A filter may already have shortened the list when the ref detaches.
    // Page teardown can also drop fonts and clamp the offset. Save only
    // observed scrolls from the attached view.
    element.addEventListener('scroll', remember, { passive: true });
    detach.current = () => {
      restoring = false;
      cancelAnimationFrame(frame);
      for (const event of inputs) element.removeEventListener(event, takeControl);
      element.removeEventListener('scroll', remember);
    };
  }, [key]);
}
