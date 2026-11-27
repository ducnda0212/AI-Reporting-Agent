import { describe, expect, it } from 'vitest';
import { VOICE_RATE, downsample, encodeWav, peakOf } from '@/lib/voice';

const readBlob = async (b: Blob): Promise<DataView> => new DataView(await new Response(b).arrayBuffer());

describe('voice: thu âm -> WAV', () => {
  it('encodeWav: tiêu đề RIFF/WAVE, 16 kHz mono 16-bit, đúng độ dài', async () => {
    const v = await readBlob(encodeWav(new Float32Array([0, 0.5, -0.5, 1]), VOICE_RATE));
    const tag = (o: number): string => String.fromCharCode(v.getUint8(o), v.getUint8(o + 1), v.getUint8(o + 2), v.getUint8(o + 3));
    expect([tag(0), tag(8), tag(12), tag(36)]).toEqual(['RIFF', 'WAVE', 'fmt ', 'data']);
    expect(v.getUint16(22, true)).toBe(1);
    expect(v.getUint32(24, true)).toBe(VOICE_RATE);
    expect(v.getUint16(34, true)).toBe(16);
    expect(v.getUint32(40, true)).toBe(8);
    expect(v.byteLength).toBe(44 + 8);
    expect(v.getInt16(46, true)).toBe(Math.round(0.5 * 0x7fff));
    expect(v.getInt16(50, true)).toBe(0x7fff);
  });
  it('downsample: 48 kHz -> 16 kHz giảm còn 1/3 mẫu, giữ mức trung bình', () => {
    const out = downsample(new Float32Array(48000).fill(0.3), 48000);
    expect(out.length).toBe(16000);
    expect(out[100]).toBeCloseTo(0.3, 5);
    const same = new Float32Array(10);
    expect(downsample(same, 16000)).toBe(same);
  });
  it('peakOf: im lặng gần 0, có tiếng thì lớn hơn', () => {
    expect(peakOf(new Float32Array(100))).toBe(0);
    expect(peakOf(new Float32Array([0.1, -0.7, 0.2]))).toBeCloseTo(0.7, 5);
  });
});
