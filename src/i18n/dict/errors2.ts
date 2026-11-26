// Section dictionary: friendly error messages (see src/components/common/friendlyError.ts). Keys prefixed 'err2.'.
export const vi = {
  'err2.offline': 'Bạn đang ngoại tuyến. Kiểm tra kết nối mạng rồi thử lại.',
  'err2.network': 'Không kết nối được máy chủ. Kiểm tra mạng rồi thử lại.',
  'err2.timeout': 'Máy chủ phản hồi quá lâu. Thử lại sau ít giây.',
  'err2.rateLimited': 'Bạn thao tác quá nhanh, thử lại sau ít giây.',
  'err2.auth': 'Bạn chưa có quyền xem dữ liệu này.',
  'err2.notFound': 'Chưa có dữ liệu cho mục này.',
  'err2.client': 'Yêu cầu không được chấp nhận. Thử làm mới trang.',
  'err2.server': 'Máy chủ đang bận. Thử lại sau ít giây.',
  'err2.parse': 'Dữ liệu trả về không hợp lệ.',
  'err2.unknown': 'Không tải được dữ liệu.',
  'err2.details': 'Chi tiết kỹ thuật',
  'err2.retry': 'Thử lại',
} as const;

export const en: Record<keyof typeof vi, string> = {
  'err2.offline': 'You are offline. Check your connection and try again.',
  'err2.network': 'Could not reach the server. Check your connection and try again.',
  'err2.timeout': 'The server took too long to respond. Try again in a few seconds.',
  'err2.rateLimited': 'You are going too fast, try again in a few seconds.',
  'err2.auth': 'You do not have access to this data.',
  'err2.notFound': 'No data for this item yet.',
  'err2.client': 'The request was not accepted. Try refreshing the page.',
  'err2.server': 'The server is busy. Try again in a few seconds.',
  'err2.parse': 'The data returned was not valid.',
  'err2.unknown': 'Could not load the data.',
  'err2.details': 'Technical details',
  'err2.retry': 'Retry',
};
