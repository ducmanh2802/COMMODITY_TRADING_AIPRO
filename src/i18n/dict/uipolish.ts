// Section dictionary: small UI-polish strings (topbar overflow menu). `en` is typed against `vi`.
export const vi = {
  'topbar.more': 'Thêm tùy chọn',
  'topbar.moreTitle': 'Giao diện và ngôn ngữ',
  'viz.legend': 'Chú giải',
  'spreads.removeLeg': 'Xóa chân lệnh {n}',
} as const;

export const en: Record<keyof typeof vi, string> = {
  'topbar.more': 'More options',
  'topbar.moreTitle': 'Appearance and language',
  'viz.legend': 'Legend',
  'spreads.removeLeg': 'Remove leg {n}',
};
