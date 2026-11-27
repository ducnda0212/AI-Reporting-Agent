/* Ghi âm để hỏi bằng giọng nói (dùng cho màn Trợ lý). Alt+M hoặc Ctrl+M bật/tắt, Esc huỷ.
   Nói xong chữ nhận được TỰ GỬI cho Agent (V-LLM đọc ý định), không cần bấm Enter. */
import { useEffect, useRef, useState } from 'react';
import { transcribeAudio } from '@/lib/api';
import { Recorder, voiceSupported } from '@/lib/voice';

export type MicState = 'idle' | 'rec' | 'busy';

export function useMic(onText: (t: string) => void): { mic: MicState; micMsg: string; micOk: boolean; toggleMic: () => Promise<void> } {
  const [mic, setMic] = useState<MicState>('idle'), [micMsg, setMsg] = useState(''), rec = useRef<Recorder | null>(null);
  const micOk = voiceSupported();
  const cb = useRef(onText); cb.current = onText;
  const finish = async (): Promise<void> => {
    const r = rec.current; rec.current = null; if (!r) return;
    const wav = r.stop();
    if (!wav) { setMic('idle'); setMsg('Không nghe thấy tiếng. Kiểm tra micro rồi thử lại.'); return; }
    setMic('busy'); setMsg('Đang chuyển giọng nói thành chữ…');
    try {
      const out = await transcribeAudio(wav);
      if (!out.text) setMsg('Không nhận ra lời nói. Hãy nói rõ hơn.');
      else { cb.current(out.text); setMsg('Đã gửi cho Trợ lý.'); }
    } catch (e) { setMsg(e instanceof Error ? e.message : 'Không nhận dạng được giọng nói.'); }
    setMic('idle');
  };
  const toggleMic = async (): Promise<void> => {
    if (mic === 'busy') return;
    if (mic === 'rec') { await finish(); return; }
    try {
      const r = new Recorder(); await r.start(() => { void finish(); }); rec.current = r; setMic('rec'); setMsg('Đang nghe… bấm Alt+M để dừng, Esc để hủy.');
    } catch { setMsg('Chưa được dùng micro. Cho phép micro cho trang này trong trình duyệt.'); }
  };
  const ref = useRef(toggleMic); ref.current = toggleMic;
  useEffect(() => {
    if (!micOk) return undefined;
    const onKey = (e: KeyboardEvent): void => {
      if ((e.altKey || e.ctrlKey) && !e.shiftKey && !e.metaKey && e.key.toLowerCase() === 'm') { e.preventDefault(); void ref.current(); }
      else if (e.key === 'Escape' && rec.current) { rec.current.cancel(); rec.current = null; setMic('idle'); setMsg('Đã hủy ghi âm.'); }
    };
    window.addEventListener('keydown', onKey);
    return () => { window.removeEventListener('keydown', onKey); rec.current?.cancel(); rec.current = null; };
  }, [micOk]);
  return { mic, micMsg, micOk, toggleMic };
}
