// Section dictionary: "Sao lưu & xuất dữ liệu" (JSON backup / restore, CSV export). Keys prefixed 'bk.'.
export const vi = {
  'bk.title': 'Sao lưu & xuất dữ liệu',
  'bk.hint': 'Dữ liệu cá nhân (lệnh thử lưu trên máy này, danh sách theo dõi, nét vẽ biểu đồ, tiến độ học, lịch ôn tập) nằm trong trình duyệt. Hãy tải bản sao lưu trước khi xóa dữ liệu trình duyệt hoặc đổi máy.',
  'bk.download': 'Tải bản sao lưu (.json)',
  'bk.restore': 'Khôi phục từ file',
  'bk.csv': 'Xuất lệnh thử ra CSV',
  'bk.csvEmpty': 'Chưa có lệnh thử đã đóng trên máy này để xuất.',
  'bk.mode.merge': 'Gộp với dữ liệu hiện có (giữ mục đang có)',
  'bk.mode.replace': 'Thay thế hoàn toàn dữ liệu hiện có',
  'bk.confirm': 'Khôi phục từ "{file}" theo cách đã chọn? Trang sẽ tải lại sau khi xong.',
  'bk.done': 'Đã khôi phục. Đang tải lại trang...',
  'bk.cancel': 'Hủy',
  'bk.ok': 'Khôi phục',
  'bk.readError': 'Không đọc được tệp.',
};

export const en: Record<keyof typeof vi, string> = {
  'bk.title': 'Backup & export data',
  'bk.hint': 'Your personal data (practice orders stored on this device, watchlist, chart drawings, learning progress, review schedule) lives in this browser. Download a backup before clearing browser data or switching devices.',
  'bk.download': 'Download backup (.json)',
  'bk.restore': 'Restore from file',
  'bk.csv': 'Export practice trades to CSV',
  'bk.csvEmpty': 'No closed practice trades on this device to export.',
  'bk.mode.merge': 'Merge with existing data (keep current items)',
  'bk.mode.replace': 'Replace existing data completely',
  'bk.confirm': 'Restore from "{file}" with the selected option? The page will reload afterwards.',
  'bk.done': 'Restored. Reloading the page...',
  'bk.cancel': 'Cancel',
  'bk.ok': 'Restore',
  'bk.readError': 'Could not read the file.',
};
