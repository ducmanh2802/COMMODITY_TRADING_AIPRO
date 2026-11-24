// "Chế độ Dễ dùng" (easy mode) strings. Keys prefixed 'sm.'. Plain words, short sentences.
export const vi = {
  'theme.label': 'Màu nền',
  'theme.dark': 'Tối',
  'theme.light': 'Sáng',
  'theme.hint': 'Mặc định nền tối. Lựa chọn được ghi nhớ trên trình duyệt này.',
  'sm.heat.title': 'Bản đồ nhiệt theo nhóm hàng',
  'sm.heat.aria': 'Thay đổi trung bình 1 ngày theo nhóm hàng',
  'sm.heat.noData': 'Chưa có',
  'sm.heat.note': 'Trung bình thay đổi 1 ngày của từng nhóm; đậm hơn là thay đổi mạnh hơn.',
} as const;

export const en: Record<keyof typeof vi, string> = {
  'theme.label': 'Theme',
  'theme.dark': 'Dark',
  'theme.light': 'Light',
  'theme.hint': 'Dark by default. Your choice is remembered in this browser.',
  'sm.heat.title': 'Heatmap by commodity group',
  'sm.heat.aria': 'Average 1-day change by commodity group',
  'sm.heat.noData': 'n/a',
  'sm.heat.note': 'Average 1-day change of each group; darker means a bigger move.',
};
