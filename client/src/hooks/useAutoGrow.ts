import { useLayoutEffect, type RefObject } from 'react';

/** Ô nhập tự giãn theo nội dung (như ChatGPT / Mobbin): cao vừa đủ số dòng, tới `max-height` trong CSS thì mới hiện thanh cuộn.
 *  Đo lại khi nội dung đổi (gõ, dán, nói xong, gửi xong ô về rỗng, đổi bố cục màn hình) và khi bề rộng ô đổi (kéo rộng panel, đổi zoom). */
export function useAutoGrow(ref: RefObject<HTMLTextAreaElement | null>, value: string, layoutKey: unknown = 0): void {
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const fit = (): void => {
      el.style.height = 'auto';
      const max = parseFloat(getComputedStyle(el).maxHeight) || 160;
      el.style.height = Math.min(el.scrollHeight, max) + 'px';
      el.style.overflowY = el.scrollHeight > max ? 'auto' : 'hidden';
    };
    fit();
    if (typeof ResizeObserver === 'undefined') return;
    let w = el.clientWidth;
    const ro = new ResizeObserver(() => { if (el.clientWidth !== w) { w = el.clientWidth; fit(); } });
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref, value, layoutKey]);
}
