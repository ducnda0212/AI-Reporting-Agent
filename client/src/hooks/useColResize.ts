import { useCallback } from 'react';
import { setColWidth } from '@/store/actions/grid';

/** Kéo tay nắm đầu cột để đổi độ rộng. Cập nhật DOM trực tiếp khi kéo cho mượt, chốt vào store khi thả chuột. */
export function useColResize() {
  return useCallback((e: React.MouseEvent, fid: string) => {
    e.preventDefault();
    e.stopPropagation();
    const th = (e.currentTarget as HTMLElement).closest('th') as HTMLElement;
    const x0 = e.clientX;
    const w0 = th.getBoundingClientRect().width;
    let w = 0;
    document.body.classList.add('colresizing');
    const move = (ev: MouseEvent) => {
      w = Math.max(60, Math.min(640, w0 + ev.clientX - x0));
      th.style.width = th.style.minWidth = th.style.maxWidth = w + 'px';
      document.querySelectorAll<HTMLElement>(`.gridwrap [data-f="${fid}"]`).forEach((x) => {
        if (x.closest('progress')) { x.style.width = w + 'px'; x.style.maxWidth = w + 'px'; }
      });
    };
    const up = () => {
      document.removeEventListener('mousemove', move);
      document.removeEventListener('mouseup', up);
      document.body.classList.remove('colresizing');
      if (w) setColWidth(fid, w);
    };
    document.addEventListener('mousemove', move);
    document.addEventListener('mouseup', up);
  }, []);
}
