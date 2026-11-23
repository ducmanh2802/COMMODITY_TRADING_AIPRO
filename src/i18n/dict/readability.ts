// Section dictionary: readability settings (text size, high contrast). `en` is typed against `vi`.
export const vi = {
  'read.sizeLabel': 'Cỡ chữ',
  'read.sizeNormal': 'Bình thường',
  'read.sizeLg': 'To',
  'read.sizeXl': 'Rất to',
  'read.contrastLabel': 'Tương phản cao',
  'read.contrastOn': 'Bật',
  'read.contrastOff': 'Tắt',
  'read.hint': 'Chữ to hơn và màu tương phản mạnh hơn giúp đọc dễ hơn. Lựa chọn được ghi nhớ trên trình duyệt này.',
  'read.title': 'Dễ đọc',
} as const;

export const en: Record<keyof typeof vi, string> = {
  'read.sizeLabel': 'Text size',
  'read.sizeNormal': 'Normal',
  'read.sizeLg': 'Large',
  'read.sizeXl': 'Extra large',
  'read.contrastLabel': 'High contrast',
  'read.contrastOn': 'On',
  'read.contrastOff': 'Off',
  'read.hint': 'Larger text and stronger contrast make reading easier. Your choice is remembered in this browser.',
  'read.title': 'Readability',
};
