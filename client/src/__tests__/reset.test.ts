import { describe, expect, it } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';

describe('Clean Reset & CSS Foundation', () => {
  it('chỉ giữ cấu trúc sạch và nạp đủ CSS prototype mới', () => {
    const srcDir = path.resolve(__dirname, '..');
    expect(fs.existsSync(path.join(srcDir, 'vite-env.d.ts'))).toBe(true);
    expect(fs.existsSync(path.join(srcDir, 'views/Check'))).toBe(false);
    expect(fs.existsSync(path.join(srcDir, 'views/Risk'))).toBe(false);
    const css = fs.readFileSync(path.join(srcDir, 'styles/pmo-prototype.css'), 'utf-8');
    expect(css).toContain('--accent:#C9276D');
    expect(css).toContain('.ai9hero');
    expect(css).toContain('.pa-box');
    expect(css).toContain('.vbks');
    expect(css).toContain('.lgrow');
    expect(css).toContain('.hpdr');
    expect(css).toContain('.pkpop');
    expect(css).toContain('#agCur');
  });
});
