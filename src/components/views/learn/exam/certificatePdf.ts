/** Client-side certificate PDF (landscape A4). Pure w.r.t. fonts: callers pass base64 TTFs. Loaded lazily (jspdf is a dynamic import). */

/** Fixed print colours (palette tokens converted for paper). */
const INK = [24, 24, 38] as const;
const MUTED = [96, 96, 112] as const;
const ACCENT = [124, 58, 237] as const; // #7C3AED
const SOFT = [237, 233, 254] as const;

export interface CertificateData {
  appName: string;
  learnerName: string;
  /** e.g. "Cấp 3" or "Toàn khoá (10 cấp)". */
  levelLabel: string;
  levelTitle: string;
  scorePct: number;
  correct: number;
  total: number;
  /** YYYY-MM-DD */
  date: string;
  code: string;
  /** Texts so the module stays i18n-agnostic. */
  labels: { heading: string; certifies: string; completed: string; score: string; date: string; code: string; disclaimer: string };
}

export interface CertificateFonts {
  regularBase64: string;
  boldBase64: string;
}

export async function buildCertificatePdf(data: CertificateData, fonts: CertificateFonts): Promise<Blob> {
  const { jsPDF } = await import('jspdf');
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  doc.addFileToVFS('BeVietnamPro-Regular.ttf', fonts.regularBase64);
  doc.addFont('BeVietnamPro-Regular.ttf', 'BeVietnamPro', 'normal');
  doc.addFileToVFS('BeVietnamPro-SemiBold.ttf', fonts.boldBase64);
  doc.addFont('BeVietnamPro-SemiBold.ttf', 'BeVietnamPro', 'bold');

  const W = 297;
  const H = 210;
  const cx = W / 2;

  doc.setFillColor(255, 255, 255);
  doc.rect(0, 0, W, H, 'F');
  doc.setDrawColor(...ACCENT);
  doc.setLineWidth(1.6);
  doc.rect(10, 10, W - 20, H - 20);
  doc.setLineWidth(0.3);
  doc.rect(14, 14, W - 28, H - 28);
  doc.setFillColor(...SOFT);
  doc.rect(14, 14, W - 28, 16, 'F');

  doc.setFont('BeVietnamPro', 'bold');
  doc.setTextColor(...ACCENT);
  doc.setFontSize(12);
  doc.text(data.appName.toUpperCase(), cx, 24.5, { align: 'center', charSpace: 0.6 });

  doc.setTextColor(...INK);
  doc.setFontSize(34);
  doc.text(data.labels.heading, cx, 56, { align: 'center' });

  doc.setFont('BeVietnamPro', 'normal');
  doc.setTextColor(...MUTED);
  doc.setFontSize(13);
  doc.text(data.labels.certifies, cx, 72, { align: 'center' });

  doc.setFont('BeVietnamPro', 'bold');
  doc.setTextColor(...INK);
  doc.setFontSize(30);
  const name = data.learnerName.trim() || '—';
  doc.text(name, cx, 90, { align: 'center', maxWidth: W - 60 });
  doc.setDrawColor(...ACCENT);
  doc.setLineWidth(0.5);
  doc.line(cx - 60, 95, cx + 60, 95);

  doc.setFont('BeVietnamPro', 'normal');
  doc.setTextColor(...MUTED);
  doc.setFontSize(13);
  doc.text(data.labels.completed, cx, 108, { align: 'center' });

  doc.setFont('BeVietnamPro', 'bold');
  doc.setTextColor(...ACCENT);
  doc.setFontSize(15);
  doc.text(data.levelLabel, cx, 120, { align: 'center' });
  doc.setTextColor(...INK);
  doc.setFontSize(20);
  doc.text(data.levelTitle, cx, 132, { align: 'center', maxWidth: W - 60 });

  doc.setFont('BeVietnamPro', 'normal');
  doc.setFontSize(12);
  doc.setTextColor(...INK);
  const colY = 154;
  const cols = [
    { x: cx - 80, k: data.labels.score, v: `${data.scorePct}% (${data.correct}/${data.total})` },
    { x: cx, k: data.labels.date, v: data.date },
    { x: cx + 80, k: data.labels.code, v: data.code },
  ];
  for (const c of cols) {
    doc.setFont('BeVietnamPro', 'normal');
    doc.setTextColor(...MUTED);
    doc.setFontSize(10);
    doc.text(c.k, c.x, colY, { align: 'center' });
    doc.setFont('BeVietnamPro', 'bold');
    doc.setTextColor(...INK);
    doc.setFontSize(14);
    doc.text(c.v, c.x, colY + 8, { align: 'center' });
  }

  doc.setFont('BeVietnamPro', 'normal');
  doc.setTextColor(...MUTED);
  doc.setFontSize(10);
  doc.text(data.labels.disclaimer, cx, H - 24, { align: 'center', maxWidth: W - 50 });

  return doc.output('blob');
}
