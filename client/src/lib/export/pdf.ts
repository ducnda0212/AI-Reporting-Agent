import type { AppState } from '@/store/types';
import { docHtml } from './docHtml';

/** Xuất PDF: dựng HTML ẩn → html2canvas → jsPDF, ngắt trang không cắt ngang dòng bảng. Thư viện tải theo nhu cầu từ CDN. */

interface Html2Canvas { (el: HTMLElement, o: object): Promise<HTMLCanvasElement> }
interface JsPdf { jsPDF: new (o: object) => { addPage: () => void; addImage: (...a: unknown[]) => void; output: (t: string) => Blob } }
declare global { interface Window { html2canvas?: Html2Canvas; jspdf?: JsPdf } }

export function loadScript(url: string): Promise<void> {
  return new Promise((ok, no) => {
    const sc = document.createElement('script');
    sc.src = url; sc.onload = () => ok(); sc.onerror = () => no(new Error('load ' + url));
    document.head.appendChild(sc);
  });
}

/** Tải file về máy bằng thẻ <a download>. */
export function saveFile(name: string, blob: Blob) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = name;
  document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1500);
}

export async function buildPdf(s: AppState): Promise<Blob> {
  if (!window.html2canvas) await loadScript('https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js');
  if (!window.jspdf) await loadScript('https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js');
  const doc = docHtml(s, false);
  const css = /<style>([\s\S]*?)<\/style>/.exec(doc)![1].replace(/@page[^}]*\}/g, '');
  const body = /<body>([\s\S]*)<\/body>/.exec(doc)![1];
  const host = document.createElement('div');
  host.style.cssText = 'position:fixed;left:-20000px;top:0;width:1120px;background:#fff;padding:28px 32px;box-sizing:border-box';
  host.innerHTML = `<style>${css.replace(/body\{/, '.exp{')}</style><div class="exp">${body}</div>`;
  document.body.appendChild(host);
  const pageW = 297; const pageH = 210; const m = 10;
  const usableH = (pageH - 2 * m) * (1120 / (pageW - 2 * m));
  const top0 = host.getBoundingClientRect().top;
  const cuts = [0];
  let last = 0;
  host.querySelectorAll('tr, .bar, h1, p').forEach((el) => {
    const r = el.getBoundingClientRect();
    const y0 = r.top - top0; const y1 = r.bottom - top0;
    if (y1 - last > usableH && y0 > last) { last = y0; cuts.push(last); }
  });
  const cv = await window.html2canvas!(host, { scale: 2, backgroundColor: '#ffffff' });
  host.remove();
  const pdf = new window.jspdf!.jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const k = cv.width / 1120;
  const mmPerPx = (pageW - 2 * m) / 1120;
  cuts.push(cv.height / k);
  for (let i = 0; i < cuts.length - 1; i++) {
    const sy = cuts[i] * k; const sh = (cuts[i + 1] - cuts[i]) * k;
    if (sh <= 0) continue;
    const part = document.createElement('canvas');
    part.width = cv.width; part.height = sh;
    part.getContext('2d')!.drawImage(cv, 0, sy, cv.width, sh, 0, 0, cv.width, sh);
    if (i) pdf.addPage();
    pdf.addImage(part.toDataURL('image/jpeg', 0.92), 'JPEG', m, m, pageW - 2 * m, (sh / k) * mmPerPx);
  }
  return pdf.output('blob');
}
