/** Thu âm bằng micro rồi đổi sang WAV 16 kHz mono (V-LLM nhận .wav/.mp3; trình duyệt tự thu webm nên đổi tại đây, không cần ffmpeg ở server). */

export const VOICE_RATE = 16000;
export const VOICE_MAX_SECONDS = 60;

/** Hạ tần số lấy mẫu bằng trung bình theo khối (đủ cho giọng nói). */
export function downsample(input: Float32Array, from: number, to: number = VOICE_RATE): Float32Array {
  if (to >= from) return input;
  const ratio = from / to, n = Math.floor(input.length / ratio), out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const a = Math.floor(i * ratio), b = Math.min(input.length, Math.floor((i + 1) * ratio));
    let sum = 0;
    for (let j = a; j < b; j++) sum += input[j];
    out[i] = b > a ? sum / (b - a) : 0;
  }
  return out;
}

/** WAV PCM 16-bit mono. */
export function encodeWav(samples: Float32Array, rate: number = VOICE_RATE): Blob {
  const buf = new ArrayBuffer(44 + samples.length * 2), v = new DataView(buf);
  const str = (o: number, s: string): void => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
  str(0, 'RIFF'); v.setUint32(4, 36 + samples.length * 2, true); str(8, 'WAVE'); str(12, 'fmt ');
  v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, rate, true); v.setUint32(28, rate * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true);
  str(36, 'data'); v.setUint32(40, samples.length * 2, true);
  for (let i = 0; i < samples.length; i++) {
    const x = Math.max(-1, Math.min(1, samples[i]));
    v.setInt16(44 + i * 2, Math.round(x < 0 ? x * 0x8000 : x * 0x7fff), true);
  }
  return new Blob([buf], { type: 'audio/wav' });
}

/** Mức âm lớn nhất của đoạn thu (0..1); gần 0 nghĩa là micro im lặng. */
export const peakOf = (s: Float32Array): number => { let m = 0; for (let i = 0; i < s.length; i++) { const a = Math.abs(s[i]); if (a > m) m = a; } return m; };

export const voiceSupported = (): boolean => typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia && typeof AudioContext !== 'undefined';

export class Recorder {
  private ctx: AudioContext | null = null;
  private stream: MediaStream | null = null;
  private node: ScriptProcessorNode | null = null;
  private chunks: Float32Array[] = [];
  private rate = VOICE_RATE;
  private timer: ReturnType<typeof setTimeout> | null = null;

  /** `onAutoStop` chạy khi quá VOICE_MAX_SECONDS giây. */
  async start(onAutoStop?: () => void): Promise<void> {
    this.stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true } });
    this.ctx = new AudioContext();
    this.rate = this.ctx.sampleRate;
    const src = this.ctx.createMediaStreamSource(this.stream), mute = this.ctx.createGain();
    mute.gain.value = 0; // ScriptProcessor phải nối ra loa mới chạy; tắt tiếng để không nghe lại chính mình
    this.node = this.ctx.createScriptProcessor(4096, 1, 1);
    this.chunks = [];
    this.node.onaudioprocess = (e) => { this.chunks.push(new Float32Array(e.inputBuffer.getChannelData(0))); };
    src.connect(this.node); this.node.connect(mute); mute.connect(this.ctx.destination);
    this.timer = setTimeout(() => onAutoStop?.(), VOICE_MAX_SECONDS * 1000);
  }

  private release(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.node?.disconnect();
    this.stream?.getTracks().forEach((t) => t.stop());
    void this.ctx?.close();
    this.node = null; this.stream = null; this.ctx = null;
  }

  /** Dừng và trả WAV; `null` nếu gần như không có tiếng. */
  stop(): Blob | null {
    const total = this.chunks.reduce((n, c) => n + c.length, 0), all = new Float32Array(total);
    let o = 0;
    for (const c of this.chunks) { all.set(c, o); o += c.length; }
    this.chunks = [];
    const rate = this.rate;
    this.release();
    const pcm = downsample(all, rate);
    return pcm.length < VOICE_RATE * 0.4 || peakOf(pcm) < 0.01 ? null : encodeWav(pcm);
  }

  cancel(): void { this.chunks = []; this.release(); }
}
