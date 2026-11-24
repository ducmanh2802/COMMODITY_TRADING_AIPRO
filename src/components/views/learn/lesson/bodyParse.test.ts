import test from 'node:test';
import assert from 'node:assert/strict';
import { CURRICULUM } from '../curriculum';
import { GLOSSARY } from '../glossary';
import { ALL_FIGURES } from '../diagrams/Figures';
import { buildTermMatcher, figuresByParagraph, inlineSegments, parseBody, parseBuoc, parseFields, parseFormula, parseInlineSteps, pickTerms, splitLong, termKeys } from './bodyParse';

test('inline (1)…(n) list becomes steps with intro and short titles', () => {
  const r = parseInlineSteps('Ba "cầu dao" nên có: (1) Giới hạn ngày: lỗ 2–3% thì dừng. (2) Giới hạn tuần: giảm khối lượng. (3) Giới hạn vị thế: tối đa 4–5%.');
  assert.ok(r);
  assert.equal(r.intro, 'Ba "cầu dao" nên có:');
  assert.equal(r.steps.length, 3);
  assert.deepEqual(r.steps[0], { title: 'Giới hạn ngày', text: 'lỗ 2–3% thì dừng.' });
});

test('lists must be numbered in order; percentages in parentheses are not steps', () => {
  assert.equal(parseInlineSteps('Một (1) thứ, rồi (3) thứ khác.'), null);
  assert.equal(parseInlineSteps('Khoảng 20% (2% trên ký quỹ 10%) đến 60% (3% trên ký quỹ 5%).'), null);
  assert.equal(parseInlineSteps('Chỉ có (1) một mục.'), null);
  const alpha = parseInlineSteps('Các mẫu: (a) Pin bar: thân nhỏ. (b) Engulfing: bao trùm. (c) Inside bar: do dự.');
  assert.equal(alpha?.steps.length, 3);
  assert.equal(alpha?.steps[2].title, 'Inside bar');
});

test('lower-case step text is capitalised; trailing separators trimmed', () => {
  const r = parseInlineSteps('Cách dùng: (1) xác định xu hướng, (2) đánh dấu vùng, (3) chờ giá.');
  assert.deepEqual(
    r?.steps.map((s) => s.text),
    ['Xác định xu hướng', 'Đánh dấu vùng', 'Chờ giá.']
  );
});

test('consecutive "Bước n –" paragraphs are grouped into one stepper', () => {
  assert.deepEqual(parseBuoc('Bước 2 – Điểm vào: nến bật lên.'), { n: 2, step: { title: 'Điểm vào', text: 'nến bật lên.' } });
  const blocks = parseBody(['Bối cảnh.', 'Bước 1 – Phân tích: a.', 'Bước 2 – Vào: b.', 'Bước 3 – Mục tiêu: c.', 'Kết thúc.']);
  assert.deepEqual(
    blocks.map((b) => [b.kind, b.from, b.to]),
    [
      ['text', 0, 0],
      ['steps', 1, 3],
      ['text', 4, 4],
    ]
  );
});

test('example and warning paragraphs are classified', () => {
  const b = parseBody(['Ví dụ: ngô 450.', 'Lưu ý dữ liệu: nguồn không chính thức.', 'Dấu hiệu đáng ngờ: quá ít lệnh.']);
  assert.equal(b[0].kind, 'example');
  assert.deepEqual(b[1], { kind: 'warning', title: 'Lưu ý dữ liệu', text: 'nguồn không chính thức.', from: 1, to: 1 });
  assert.equal(b[2].kind, 'warning');
});

test('formula lines become a formula card with label and note', () => {
  const f = parseFormula('Công thức khối lượng: Số hợp đồng = (Vốn × % rủi ro) ÷ (Khoảng cách stop × Giá trị mỗi đơn vị giá của 1 hợp đồng). Luôn làm tròn XUỐNG.');
  assert.deepEqual(f, { label: 'Công thức khối lượng', formula: 'Số hợp đồng = (Vốn × % rủi ro) ÷ (Khoảng cách stop × Giá trị mỗi đơn vị giá của 1 hợp đồng)', note: 'Luôn làm tròn XUỐNG.' });
  assert.equal(parseFormula('Giá tăng thì lãi. Không có dấu bằng.'), null);
});

test('setup paragraphs with labelled fields become a field card', () => {
  const r = parseFields('Setup 1 – Pullback. Điều kiện: xu hướng tăng. Vào: nến từ chối. Stop: dưới đáy. Mục tiêu: đỉnh cũ. Huỷ: đóng cửa dưới HL.');
  assert.equal(r?.title, 'Setup 1 – Pullback');
  assert.deepEqual(
    r?.fields.map((f) => f.label),
    ['Điều kiện', 'Vào', 'Stop', 'Mục tiêu', 'Huỷ']
  );
});

test('long paragraphs split after the first sentence; short ones do not', () => {
  const long = 'Câu đầu tiên khá ngắn. ' + 'Từ '.repeat(60).trim() + '.';
  const r = splitLong(long);
  assert.equal(r?.lead, 'Câu đầu tiên khá ngắn.');
  assert.ok(r?.rest.startsWith('Từ'));
  assert.equal(splitLong('Ngắn. Cũng ngắn.'), null);
  // Decimal commas / dates do not end a sentence.
  assert.equal(splitLong('Giá 0,5 và 02/2024 ' + 'x '.repeat(60)), null);
});

test('arithmetic is marked as math segments', () => {
  const segs = inlineSegments('rủi ro mỗi hợp đồng = 12 × 50 = 600 USD, rồi 300 ÷ 600 = 0,5.', null, undefined);
  assert.deepEqual(
    segs.filter((s) => s.t === 'math').map((s) => s.s),
    ['12 × 50 = 600', '300 ÷ 600 = 0,5']
  );
  assert.ok(inlineSegments('lỗ 7,25 × 50 + 10 = 372,5 USD', null, undefined).some((s) => s.t === 'math' && s.s === '7,25 × 50 + 10 = 372,5'));
});

test('glossary terms: keys, first occurrence only, capped per lesson', () => {
  assert.deepEqual(termKeys('Ký quỹ ban đầu (Initial margin)'), ['Ký quỹ ban đầu', 'Initial margin']);
  const m = buildTermMatcher([
    { term: 'Đòn bẩy (Leverage)', def: 'x' },
    { term: 'Ký quỹ duy trì (Maintenance margin)', def: 'y' },
  ]);
  const picks = pickTerms(['Đòn bẩy cao và đòn bẩy nữa.', 'Ký quỹ duy trì; đòn bẩy.'], m, 6);
  assert.deepEqual([...picks.entries()].map(([k, v]) => [k, [...v]]), [
    [0, [0]],
    [1, [1]],
  ]);
  const segs = inlineSegments('Đòn bẩy cao và đòn bẩy nữa.', m, new Set([0]));
  assert.equal(segs.filter((s) => s.t === 'term').length, 1);
  assert.equal(pickTerms(['Đòn bẩy, ký quỹ duy trì.'], m, 1).get(0)?.size, 1);
});

test('figureAt places figures after a paragraph; others keep the old order', () => {
  const r = figuresByParagraph({ b: 1, c: 99 }, ['a', 'b', 'c'], 3);
  assert.deepEqual([...r.at.entries()], [[1, ['b']]]);
  assert.deepEqual(r.rest, ['a', 'c']);
});

test('every curriculum figureAt entry names a listed, registered figure and a real paragraph', () => {
  const m = buildTermMatcher(GLOSSARY);
  for (const lesson of CURRICULUM.flatMap((l) => l.lessons)) {
    for (const [id, idx] of Object.entries(lesson.figureAt ?? {})) {
      assert.ok(lesson.figures?.includes(id), `${lesson.id}: figureAt ${id} not in figures`);
      assert.ok(ALL_FIGURES[id], `${lesson.id}: unknown figure ${id}`);
      assert.ok(Number.isInteger(idx) && idx >= 0 && idx < lesson.body.length, `${lesson.id}: bad index for ${id}`);
    }
    // Parsing never drops a paragraph.
    const blocks = parseBody(lesson.body);
    assert.equal(blocks[blocks.length - 1].to, lesson.body.length - 1, lesson.id);
    assert.ok(pickTerms(lesson.body, m).size <= 6);
  }
});
