import { exPending } from '@/lib/exec';
import { docxBlob } from '@/lib/export/docx';
import { buildPdf, saveFile } from '@/lib/export/pdf';
import { pushLog, setToast } from '../helpers';
import { getState, mutate } from '../index';
import { markExported } from './flow';

/** Xuất báo cáo điều hành (PDF / Word) và nút "Xuất file" ở modal chốt & xuất. */

const EXEC_NAME = '20261121_DAN_Bao-cao-dieu-hanh';

export async function exportPdf() {
  const s = getState();
  if (exPending(s)) mutate((d) => setToast(d, `Còn ${exPending(s)} ô nháp chưa duyệt — sẽ để trống trong file`));
  mutate((d) => { setToast(d, 'Đang dựng file PDF…'); pushLog(d, 'Xuất báo cáo điều hành', 'PDF', 'Khổ A4 ngang, bố cục theo PMO_Bao_cao_dieu_hanh_template', 'Xuất'); });
  try {
    saveFile(EXEC_NAME + '.pdf', await buildPdf(getState()));
    mutate((d) => setToast(d, `Đã tải ${EXEC_NAME}.pdf`));
  } catch {
    mutate((d) => setToast(d, 'Không tải được thư viện dựng PDF — thử bản Word'));
  }
}

export function exportWord() {
  saveFile(EXEC_NAME + '.docx', docxBlob(getState()));
  mutate((d) => { pushLog(d, 'Xuất báo cáo điều hành', EXEC_NAME + '.docx', 'File Word · khổ A4 ngang', 'Xuất'); setToast(d, `Đã tải ${EXEC_NAME}.docx`); });
}

/** Nút "Xuất file từ vN": ghi nhận file đã xuất vào bản chốt và tạo file báo cáo điều hành nếu được chọn. */
export function doExport(fileName: string) {
  const s = getState();
  const fmt = s.exFmt;
  const out = markExported(fileName, fmt);
  if (!out) return;
  if (s.exOut.exec && fmt === 'pdf') exportPdf();
  if (s.exOut.exec && fmt === 'docx') exportWord();
}
