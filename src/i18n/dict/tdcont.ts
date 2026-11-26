// Section dictionary: Today "Học tiếp" card (tdcont.). `en` is typed against `vi`.
export const vi = {
  'tdcont.title': 'Học tiếp',
  'tdcont.next': 'Bài tiếp theo: {title}',
  'tdcont.start': 'Chưa học bài nào. Bắt đầu với bài đầu tiên: {title}',
  'tdcont.level': 'Cấp {n}: {done}/{total} bài',
  'tdcont.resume': 'Học tiếp',
  'tdcont.begin': 'Bắt đầu bài 1',
  'tdcont.due': '{n} thẻ ôn tập đến hạn hôm nay',
  'tdcont.review': 'Ôn tập',
  'tdcont.allDone': 'Chúc mừng, bạn đã hoàn thành toàn bộ bài học. Hãy ôn lại để nhớ lâu hơn.',
  'tdcont.progress': 'Tiến độ cấp {n}',
};

export const en: Record<keyof typeof vi, string> = {
  'tdcont.title': 'Keep learning',
  'tdcont.next': 'Next lesson: {title}',
  'tdcont.start': 'No lessons yet. Start with the first one: {title}',
  'tdcont.level': 'Level {n}: {done}/{total} lessons',
  'tdcont.resume': 'Continue',
  'tdcont.begin': 'Start lesson 1',
  'tdcont.due': '{n} review cards due today',
  'tdcont.review': 'Review',
  'tdcont.allDone': 'Congratulations, you finished every lesson. Review to remember longer.',
  'tdcont.progress': 'Level {n} progress',
};
