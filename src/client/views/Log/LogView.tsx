import { useStore } from '@/store';

export function LogView() {
  const log = useStore((s) => s.log);
  return (
    <div className="gridwrap gut" style={{ paddingBlock: 18 }}>
      <div style={{ maxWidth: 1180, margin: '0 auto' }}>
        <h1 style={{ fontSize: 17, fontWeight: 600, margin: '0 0 4px' }}>Nhật ký</h1>
        <p style={{ fontSize: 12.5, color: 'var(--mut)', margin: '0 0 12px' }}>Ai làm gì, lúc nào, trên dữ liệu tuần này. Mới nhất ở trên.</p>
        <div className="card" style={{ overflowX: 'auto' }}>
          <table className="tb" style={{ width: '100%' }}>
            <thead><tr><th>Giờ</th><th>Hành động</th><th>Đối tượng</th><th>Chi tiết</th><th>Kết quả</th></tr></thead>
            <tbody>
              {log.map((e, k) => (
                <tr key={k}>
                  <td style={{ fontFamily: 'var(--mono)' }}>{e.t}</td><td>{e.a}</td><td style={{ fontFamily: 'var(--mono)' }}>{e.o}</td><td>{e.d}</td>
                  <td style={{ color: e.r === 'Lỗi' ? 'var(--err)' : e.r === 'Cảnh báo' ? 'var(--wrn)' : 'var(--ok)', fontWeight: 600 }}>{e.r}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div style={{ fontSize: 11.5, color: 'var(--mut2)', marginTop: 11, maxWidth: 620, lineHeight: 1.6 }}>
          Nhật ký ghi hành động, đối tượng và số dòng bị ảnh hưởng. Không ghi nội dung ô dữ liệu, không ghi nội dung lý do người dùng nhập.
        </div>
      </div>
    </div>
  );
}
