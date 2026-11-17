import { useMemo } from 'react';
import { useStore } from '@/store';
import type { AppState } from '@/store/types';
import { selectRows } from '@/lib/cell';

/** Danh sách dòng đang dùng (đã áp dụng "mã mới" và "gộp trùng"). Memo theo 3 field liên quan. */
export function useRows() {
  const allRows = useStore((s) => s.allRows);
  const newCodes = useStore((s) => s.newCodes);
  const dupMerged = useStore((s) => s.dupMerged);
  return useMemo(() => selectRows({ allRows, newCodes, dupMerged } as AppState), [allRows, newCodes, dupMerged]);
}

/** Toàn bộ state — dùng cho component cần nhiều giá trị suy ra (cảnh báo, số đếm). */
export const useAppState = () => useStore((s) => s);
