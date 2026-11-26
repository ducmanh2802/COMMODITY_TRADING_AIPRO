import type { InstrumentDefinition } from '../types/instrument';
import type { CurveShape } from '../contracts/termStructure';

export type InsightLang = 'vi' | 'en';
export type InsightTone = 'positive' | 'negative' | 'warning' | 'neutral';

export interface AnalyticalInsight {
  tone: InsightTone;
  headline: string;
  bullets: string[];
  cautions: string[];
}

function nfmt(v: number, digits = 2): string {
  if (!Number.isFinite(v)) return '—';
  return v.toLocaleString('en-US', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

function signedPct(v: number, digits = 2): string {
  if (!Number.isFinite(v)) return '—';
  return `${v > 0 ? '+' : ''}${nfmt(v, digits)}%`;
}

// -----------------------------------------------------------------------------
// 1. Technical Analysis Snapshot Interpreter
// -----------------------------------------------------------------------------

export interface TechnicalSnapshotLike {
  symbol: string;
  lastClose: number | null;
  ema: {
    ema9: number | null;
    ema20: number | null;
    ema50: number | null;
    ema100: number | null;
    ema200: number | null;
  };
  sma: {
    sma20: number | null;
    sma50: number | null;
    sma200: number | null;
  };
  rsi14: number | null;
  macd: { macd: number | null; signal: number | null; histogram: number | null };
  atrPct: number | null;
  adx14: { adx: number | null; plusDI: number | null; minusDI: number | null };
  marketStructure: {
    mainTrend: string;
    shortTermTrend: string;
    momentum: string;
    volatility: string;
    marketRegime: string;
    supportZones: number[];
    resistanceZones: number[];
    bullishInvalidationLevel: number | null;
    bearishInvalidationLevel: number | null;
  };
}

function translateTrendWord(raw: string, lang: InsightLang): string {
  const u = raw.toUpperCase();
  if (u.includes('BULL') || u.includes('UP')) return lang === 'vi' ? 'Tăng' : 'Bullish';
  if (u.includes('BEAR') || u.includes('DOWN')) return lang === 'vi' ? 'Giảm' : 'Bearish';
  if (u.includes('SIDEWAYS') || u.includes('RANGE') || u.includes('FLAT')) {
    return lang === 'vi' ? 'Đi ngang / tích luỹ' : 'Sideways / range-bound';
  }
  return raw;
}

function translateRegimeWord(raw: string, lang: InsightLang): string {
  const u = raw.toUpperCase();
  if (u.includes('TREND') && u.includes('UP')) return lang === 'vi' ? 'Thị trường có xu hướng tăng' : 'Uptrending regime';
  if (u.includes('TREND') && u.includes('DOWN')) return lang === 'vi' ? 'Thị trường có xu hướng giảm' : 'Downtrending regime';
  if (u.includes('TREND')) return lang === 'vi' ? 'Thị trường đang có xu hướng rõ' : 'Trending regime';
  if (u.includes('RANGE') || u.includes('SIDEWAYS') || u.includes('CHOP')) {
    return lang === 'vi' ? 'Thị trường dao động trong biên độ (đi ngang)' : 'Range-bound / choppy regime';
  }
  if (u.includes('VOLATILE')) return lang === 'vi' ? 'Biến động mạnh, khó đoán' : 'High-volatility regime';
  return raw;
}

export function interpretTechnicalSnapshot(
  snap: TechnicalSnapshotLike,
  lang: InsightLang = 'vi'
): AnalyticalInsight {
  const ms = snap.marketStructure;
  const mainUp = /BULL|UP/i.test(ms.mainTrend);
  const mainDown = /BEAR|DOWN/i.test(ms.mainTrend);
  const shortUp = /BULL|UP/i.test(ms.shortTermTrend);
  const shortDown = /BEAR|DOWN/i.test(ms.shortTermTrend);

  const mainLabel = translateTrendWord(ms.mainTrend, lang);
  const shortLabel = translateTrendWord(ms.shortTermTrend, lang);
  const regimeLabel = translateRegimeWord(ms.marketRegime, lang);

  const tone: InsightTone =
    mainUp && shortUp ? 'positive' : mainDown && shortDown ? 'negative' : 'warning';

  let headline: string;
  if (lang === 'vi') {
    if (mainUp && shortUp) {
      headline = `${snap.symbol}: Xu hướng chính và ngắn hạn đều đang tăng (${regimeLabel}).`;
    } else if (mainDown && shortDown) {
      headline = `${snap.symbol}: Xu hướng chính và ngắn hạn đều đang giảm (${regimeLabel}).`;
    } else if (mainUp && !shortUp) {
      headline = `${snap.symbol}: Xu hướng chính ${mainLabel.toLowerCase()} nhưng ngắn hạn ${shortLabel.toLowerCase()} — cần quan sát vùng hỗ trợ trước khi hành động.`;
    } else if (mainDown && !shortDown) {
      headline = `${snap.symbol}: Xu hướng chính ${mainLabel.toLowerCase()}, ngắn hạn ${shortLabel.toLowerCase()} — có nhịp hồi/chững lại.`;
    } else {
      headline = `${snap.symbol}: Thị trường đang ${mainLabel.toLowerCase()} (${regimeLabel}).`;
    }
  } else {
    headline = `${snap.symbol}: Main trend is ${mainLabel.toLowerCase()} while short-term is ${shortLabel.toLowerCase()} (${regimeLabel}).`;
  }

  const bullets: string[] = [];
  const cautions: string[] = [];

  // Moving average position
  if (snap.lastClose !== null) {
    const checks: Array<{ label: string; val: number | null }> = [
      { label: 'EMA 20', val: snap.ema.ema20 },
      { label: 'SMA 50', val: snap.sma.sma50 },
      { label: 'SMA 200', val: snap.sma.sma200 },
    ];
    const valid = checks.filter((c): c is { label: string; val: number } => c.val !== null && Number.isFinite(c.val));
    if (valid.length > 0) {
      const above = valid.filter((c) => snap.lastClose! >= c.val).map((c) => c.label);
      const below = valid.filter((c) => snap.lastClose! < c.val).map((c) => c.label);
      if (lang === 'vi') {
        if (below.length === 0) {
          bullets.push(
            `Giá (${nfmt(snap.lastClose, 2)}) nằm trên tất cả đường trung bình chủ chốt (${above.join(', ')}) — cấu trúc trung/dài hạn giữ được lực nâng.`
          );
        } else if (above.length === 0) {
          bullets.push(
            `Giá (${nfmt(snap.lastClose, 2)}) nằm dưới toàn bộ ${below.join(', ')} — bên bán đang kiểm soát cả ngắn lẫn trung hạn.`
          );
        } else {
          bullets.push(
            `Giá (${nfmt(snap.lastClose, 2)}) đang trên ${above.join(', ')} nhưng dưới ${below.join(', ')} — trạng thái giằng co giữa các khung.`
          );
        }
      } else {
        bullets.push(
          `Last close (${nfmt(snap.lastClose, 2)}) sits above ${above.length ? above.join(', ') : 'none'} and below ${below.length ? below.join(', ') : 'none'}.`
        );
      }
    }
  }

  // RSI + MACD momentum
  const rsi = snap.rsi14;
  const hist = snap.macd.histogram;
  if (rsi !== null || hist !== null) {
    const rsiDesc =
      rsi === null
        ? null
        : lang === 'vi'
          ? rsi >= 70
            ? `RSI(14) = ${nfmt(rsi, 1)} (vùng quá mua ≥70, dễ có nhịp rung lắc/chốt lời)`
            : rsi >= 55
              ? `RSI(14) = ${nfmt(rsi, 1)} (động lượng tăng khá, chưa quá mua)`
              : rsi >= 45
                ? `RSI(14) = ${nfmt(rsi, 1)} (trung tính, cung–cầu cân bằng)`
                : rsi > 30
                  ? `RSI(14) = ${nfmt(rsi, 1)} (động lượng yếu, nghiêng giảm)`
                  : `RSI(14) = ${nfmt(rsi, 1)} (vùng quá bán ≤30, dễ bật hồi kỹ thuật)`
          : rsi >= 70
            ? `RSI(14) = ${nfmt(rsi, 1)} (overbought ≥70)`
            : rsi <= 30
              ? `RSI(14) = ${nfmt(rsi, 1)} (oversold ≤30)`
              : `RSI(14) = ${nfmt(rsi, 1)} (neutral-to-${rsi >= 50 ? 'bullish' : 'bearish'})`;

    const macdDesc =
      hist === null
        ? null
        : lang === 'vi'
          ? hist > 0
            ? `MACD Histogram dương (+${nfmt(hist, 3)}) ủng hộ nhịp tăng`
            : `MACD Histogram âm (${nfmt(hist, 3)}) cho thấy áp lực giảm vẫn còn`
          : hist > 0
            ? `MACD histogram positive (+${nfmt(hist, 3)})`
            : `MACD histogram negative (${nfmt(hist, 3)})`;

    bullets.push([rsiDesc, macdDesc].filter(Boolean).join(' · ') + '.');
    if (rsi !== null && (rsi >= 70 || rsi <= 30)) {
      cautions.push(
        lang === 'vi'
          ? rsi >= 70
            ? 'RSI đang ở vùng quá mua (>70): hạn chế mua đuổi khi giá đã kéo giãn mạnh.'
            : 'RSI đang ở vùng quá bán (<30): thận trọng khi bán đuổi vì dễ xuất hiện nhịp hồi kỹ thuật.'
          : rsi >= 70
            ? 'RSI is overbought (>70): avoid chasing extended upside.'
            : 'RSI is oversold (<30): watch for technical bounce risk before shorting.'
      );
    }
  }

  // ADX & ATR%
  const adx = snap.adx14.adx;
  const plusDI = snap.adx14.plusDI;
  const minusDI = snap.adx14.minusDI;
  if (adx !== null || snap.atrPct !== null) {
    const parts: string[] = [];
    if (adx !== null) {
      const side =
        plusDI !== null && minusDI !== null
          ? plusDI > minusDI
            ? lang === 'vi'
              ? 'phe mua (+DI) chiếm ưu thế'
              : '+DI leads'
            : lang === 'vi'
              ? 'phe bán (-DI) chiếm ưu thế'
              : '-DI leads'
          : '';
      if (lang === 'vi') {
        if (adx < 20) parts.push(`ADX(14) = ${nfmt(adx, 1)} (<20: xu hướng yếu, chiến lược theo xu hướng dễ bị nhiễu)`);
        else if (adx < 25) parts.push(`ADX(14) = ${nfmt(adx, 1)} (xu hướng đang manh nha, ${side})`);
        else parts.push(`ADX(14) = ${nfmt(adx, 1)} (≥25: xu hướng rõ nét, ${side})`);
      } else {
        parts.push(`ADX(14) = ${nfmt(adx, 1)} (${adx < 20 ? 'weak trend' : 'active trend'}${side ? `, ${side}` : ''})`);
      }
    }
    if (snap.atrPct !== null) {
      if (lang === 'vi') {
        const volLevel = snap.atrPct >= 3 ? 'biên độ rất rộng' : snap.atrPct >= 1.5 ? 'biên độ vừa–khá' : 'biên độ hẹp';
        parts.push(`ATR% = ${nfmt(snap.atrPct, 2)}%/nến (${volLevel} — cần đặt điểm cắt lỗ rộng tương ứng)`);
      } else {
        parts.push(`ATR% = ${nfmt(snap.atrPct, 2)}% average bar range`);
      }
    }
    bullets.push(parts.join(' · ') + '.');
  }

  // Key S/R and invalidation
  const nearestSup = ms.supportZones[0];
  const nearestRes = ms.resistanceZones[0];
  if (nearestSup !== undefined || nearestRes !== undefined || ms.bullishInvalidationLevel !== null) {
    const levelParts: string[] = [];
    if (nearestSup !== undefined) {
      levelParts.push(lang === 'vi' ? `Hỗ trợ gần: ${nfmt(nearestSup, 2)}` : `Nearest support: ${nfmt(nearestSup, 2)}`);
    }
    if (nearestRes !== undefined) {
      levelParts.push(lang === 'vi' ? `Kháng cự gần: ${nfmt(nearestRes, 2)}` : `Nearest resistance: ${nfmt(nearestRes, 2)}`);
    }
    if (ms.bullishInvalidationLevel !== null) {
      levelParts.push(
        lang === 'vi'
          ? `Mất cấu trúc tăng nếu thủng: ${nfmt(ms.bullishInvalidationLevel, 2)}`
          : `Bullish invalidation: ${nfmt(ms.bullishInvalidationLevel, 2)}`
      );
    }
    if (levelParts.length > 0) bullets.push(levelParts.join(' · ') + '.');
  }

  return { tone, headline, bullets, cautions };
}

// -----------------------------------------------------------------------------
// 2. Term Structure Interpreter
// -----------------------------------------------------------------------------

export interface TermStructureLike {
  shape: CurveShape;
  points: Array<{ contract: string; price: number; daysToExpiry: number }>;
  spreads: Array<{ near: string; far: string; spread: number; annualizedRollYield: number | null; direction: CurveShape }>;
}

export function interpretTermStructure(
  curve: TermStructureLike,
  instrumentLabel: string,
  lang: InsightLang = 'vi'
): AnalyticalInsight {
  const near = curve.points[0];
  const far = curve.points[1];
  const firstSpread = curve.spreads[0];
  const annPct =
    firstSpread?.annualizedRollYield !== null && firstSpread?.annualizedRollYield !== undefined
      ? firstSpread.annualizedRollYield * 100
      : null;

  let tone: InsightTone = 'neutral';
  let headline: string;
  const bullets: string[] = [];
  const cautions: string[] = [];

  if (curve.shape === 'BACKWARDATION') {
    tone = 'positive';
    headline =
      lang === 'vi'
        ? `${instrumentLabel}: Đường cong Nghịch đảo (Backwardation) — hàng giao ngay đang khan hiếm, kỳ hạn gần đắt hơn kỳ hạn xa.`
        : `${instrumentLabel}: Curve is in Backwardation — near-term supply is tight (near contracts trade above deferred).`;
  } else if (curve.shape === 'CONTANGO') {
    tone = 'warning';
    headline =
      lang === 'vi'
        ? `${instrumentLabel}: Đường cong Bù hoãn (Contango) — kỳ hạn xa đắt hơn kỳ hạn gần (phản ánh chi phí lưu kho/lãi suất).`
        : `${instrumentLabel}: Curve is in Contango — deferred months cost more than front months (storage/carry priced in).`;
  } else if (curve.shape === 'MIXED') {
    tone = 'neutral';
    headline =
      lang === 'vi'
        ? `${instrumentLabel}: Đường cong hỗn hợp — có đoạn tăng giá theo kỳ hạn, có đoạn giảm (thường do yếu tố mùa vụ).`
        : `${instrumentLabel}: Mixed term structure — alternating contango and backwardation segments (often seasonal).`;
  } else {
    headline =
      lang === 'vi'
        ? `${instrumentLabel}: Đường cong đi ngang (Flat) — chênh lệch giữa các kỳ hạn không đáng kể.`
        : `${instrumentLabel}: Flat curve — minimal spread across delivery months.`;
  }

  if (near && far) {
    const diff = far.price - near.price;
    const diffPct = near.price !== 0 ? (diff / near.price) * 100 : 0;
    if (lang === 'vi') {
      bullets.push(
        `So sánh 2 kỳ hạn đầu: ${near.contract} (${nfmt(near.price, 2)}, còn ${near.daysToExpiry} ngày) vs ${far.contract} (${nfmt(far.price, 2)}, còn ${far.daysToExpiry} ngày) — chênh lệch ${diff >= 0 ? '+' : ''}${nfmt(diff, 2)} (${signedPct(diffPct)}).`
      );
    } else {
      bullets.push(
        `Front pair: ${near.contract} (${nfmt(near.price, 2)}, ${near.daysToExpiry}d) vs ${far.contract} (${nfmt(far.price, 2)}, ${far.daysToExpiry}d) — spread ${diff >= 0 ? '+' : ''}${nfmt(diff, 2)} (${signedPct(diffPct)}).`
      );
    }
  }

  if (annPct !== null) {
    if (lang === 'vi') {
      if (annPct < -0.5) {
        bullets.push(
          `Lợi suất chuyển kỳ (Roll Yield) quy năm khoảng ${signedPct(annPct)}/năm: nếu giữ vị thế MUA (Long) dài hạn và chuyển kỳ liên tục, bạn chịu bất lợi từ chi phí roll; ngược lại vị thế BÁN (Short) hưởng lợi phần chênh lệch này (chưa tính phí).`
        );
      } else if (annPct > 0.5) {
        bullets.push(
          `Lợi suất chuyển kỳ (Roll Yield) quy năm khoảng ${signedPct(annPct)}/năm: vị thế MUA (Long) chuyển kỳ từ tháng gần sang tháng xa rẻ hơn có lợi thế carry dương; nhưng hãy kiểm tra lý do khan hàng.`
        );
      } else {
        bullets.push(`Roll yield quy năm quanh ${signedPct(annPct)}/năm — chi phí chuyển kỳ hạn không lớn.`);
      }
    } else {
      bullets.push(
        `Annualized roll yield is ${signedPct(annPct)}/yr (${annPct < 0 ? 'headwind for long rolls' : annPct > 0 ? 'tailwind for long rolls' : 'roughly neutral'}).`
      );
    }
  }

  if (near && near.daysToExpiry <= 14) {
    cautions.push(
      lang === 'vi'
        ? `Hợp đồng ${near.contract} chỉ còn ${near.daysToExpiry} ngày đến LTD — kiểm tra FND/thanh khoản và cân nhắc chuyển sang ${far?.contract ?? 'kỳ hạn kế tiếp'}.`
        : `Front contract ${near.contract} has only ${near.daysToExpiry} days to LTD — check FND/liquidity and consider rolling to ${far?.contract ?? 'the next month'}.`
    );
  }

  return { tone, headline, bullets, cautions };
}

// -----------------------------------------------------------------------------
// 3. Backtest Metrics Interpreter
// -----------------------------------------------------------------------------

export interface BacktestMetricsLike {
  netProfit: number;
  winRatePct: number;
  profitFactor: number | null;
  maxDrawdownPct: number;
  expectancy: number;
  averageR: number;
  sharpeRatio: number | null;
  tradeCount: number;
}

export function interpretBacktestMetrics(
  m: BacktestMetricsLike,
  symbol: string,
  strategyLabel: string,
  lang: InsightLang = 'vi'
): AnalyticalInsight {
  const profitable = m.netProfit > 0 && (m.profitFactor === null || m.profitFactor >= 1);
  const strongEdge = profitable && (m.profitFactor === null || m.profitFactor >= 1.4) && m.tradeCount >= 15;
  const tone: InsightTone =
    m.tradeCount === 0 ? 'warning' : strongEdge ? 'positive' : profitable ? 'neutral' : 'negative';

  if (m.tradeCount === 0) {
    return {
      tone: 'warning',
      headline:
        lang === 'vi'
          ? `Không có lệnh nào được kích hoạt cho ${symbol} với bộ quy tắc ${strategyLabel} trong dữ liệu hiện có.`
          : `No simulated trades triggered for ${symbol} under ${strategyLabel} on the loaded history.`,
      bullets: [
        lang === 'vi'
          ? 'Thử đổi khung thời gian, nạp thêm lịch sử nến dài hơn, hoặc nới lỏng tham số chiến lược để có mẫu kiểm thử.'
          : 'Try a different timeframe, import a longer candle history, or adjust strategy parameters.',
      ],
      cautions: [],
    };
  }

  const pfText = m.profitFactor === null ? '∞' : nfmt(m.profitFactor, 2);
  let headline: string;
  if (lang === 'vi') {
    if (m.netProfit > 0 && (m.profitFactor === null || m.profitFactor >= 1.5)) {
      headline = `${symbol} (${strategyLabel}): Có lợi thế thống kê tích cực trên quá khứ — lãi ròng +$${nfmt(m.netProfit, 2)} (Profit Factor ${pfText}).`;
    } else if (m.netProfit > 0) {
      headline = `${symbol} (${strategyLabel}): Lãi nhẹ +$${nfmt(m.netProfit, 2)} nhưng biên lợi thế mỏng (Profit Factor ${pfText}) — dễ bị bào mòn nếu phí/trượt giá tăng.`;
    } else {
      headline = `${symbol} (${strategyLabel}): Thua lỗ ròng -$${nfmt(Math.abs(m.netProfit), 2)} trên dữ liệu giả lập (Profit Factor ${pfText}) — không nên dùng cấu hình này.`;
    }
  } else {
    headline =
      m.netProfit >= 0
        ? `${symbol} (${strategyLabel}): Net profit +$${nfmt(m.netProfit, 2)} with Profit Factor ${pfText} across ${m.tradeCount} trades.`
        : `${symbol} (${strategyLabel}): Net loss -$${nfmt(Math.abs(m.netProfit), 2)} (Profit Factor ${pfText}) across ${m.tradeCount} trades.`;
  }

  const bullets: string[] = [];
  const cautions: string[] = [];

  if (lang === 'vi') {
    const rrExplanation =
      m.winRatePct < 50 && m.expectancy > 0
        ? 'tỷ lệ thắng dưới 50% nhưng vẫn có lãi nhờ các lệnh thắng ăn lớn hơn lệnh thua'
        : m.winRatePct >= 50 && m.expectancy < 0
          ? 'dù tỷ lệ thắng cao nhưng lệnh thua trung bình quá lớn khiến tổng thể lỗ'
          : m.expectancy > 0
            ? 'kỳ vọng dương giúp tài khoản tăng trưởng đều nếu giữ đúng kỷ luật cắt lỗ'
            : 'kỳ vọng âm, trung bình mỗi lệnh làm giảm vốn';

    bullets.push(
      `Tỷ lệ thắng ${nfmt(m.winRatePct, 1)}% · Kỳ vọng ${m.expectancy >= 0 ? '+' : '-'}$${nfmt(Math.abs(m.expectancy), 2)}/lệnh (${m.averageR >= 0 ? '+' : ''}${nfmt(m.averageR, 2)}R) → ${rrExplanation}.`
    );

    const ddLevel =
      m.maxDrawdownPct <= 10
        ? 'thấp (dễ chịu về tâm lý)'
        : m.maxDrawdownPct <= 20
          ? 'trung bình (cần quản lý khối lượng chặt)'
          : 'cao (áp lực tâm lý lớn, dễ cháy nếu tăng đòn bẩy)';
    const sharpeNote =
      m.sharpeRatio !== null ? ` · Sharpe = ${nfmt(m.sharpeRatio, 2)}` : '';
    bullets.push(`Sụt giảm vốn tối đa (Max Drawdown): ${nfmt(m.maxDrawdownPct, 2)}% — mức ${ddLevel}${sharpeNote}.`);
  } else {
    bullets.push(
      `Win rate ${nfmt(m.winRatePct, 1)}% · Expectancy ${m.expectancy >= 0 ? '+' : '-'}$${nfmt(Math.abs(m.expectancy), 2)} (${nfmt(m.averageR, 2)}R) across ${m.tradeCount} trades.`
    );
    bullets.push(
      `Max drawdown ${nfmt(m.maxDrawdownPct, 2)}%${m.sharpeRatio !== null ? ` · Sharpe ${nfmt(m.sharpeRatio, 2)}` : ''}.`
    );
  }

  if (m.tradeCount < 15) {
    cautions.push(
      lang === 'vi'
        ? `Số lượng mẫu chỉ có ${m.tradeCount} lệnh (<15 lệnh): kết quả có thể do may rủi ngẫu nhiên, cần Walk-Forward/Monte Carlo để kiểm tra độ bền.`
        : `Small sample size (${m.tradeCount} trades < 15): verify robustness via Walk-Forward and Monte Carlo.`
    );
  }
  if (m.maxDrawdownPct > 20) {
    cautions.push(
      lang === 'vi'
        ? `Max Drawdown vượt 20% (${nfmt(m.maxDrawdownPct, 1)}%): cân nhắc giảm số hợp đồng mỗi lệnh trước khi áp dụng.`
        : `Max Drawdown exceeds 20% (${nfmt(m.maxDrawdownPct, 1)}%): consider reducing contract sizing.`
    );
  }

  return { tone, headline, bullets, cautions };
}

// -----------------------------------------------------------------------------
// 4. Signals & Scanner Interpreters
// -----------------------------------------------------------------------------

export interface SignalItemLike {
  strategyName: string;
  direction: 'LONG' | 'SHORT' | 'NONE';
  confirmationStatus: 'CONFIRMED' | 'PENDING' | 'INVALIDATED' | 'UNAVAILABLE';
  setupQualityScore: number | null;
  riskReward: number | null;
}

export function interpretSignalsSummary(
  signals: readonly SignalItemLike[],
  symbol: string,
  timeframe: string,
  lang: InsightLang = 'vi'
): AnalyticalInsight {
  const confirmed = signals.filter((s) => s.confirmationStatus === 'CONFIRMED');
  const pending = signals.filter((s) => s.confirmationStatus === 'PENDING');
  const longConf = confirmed.filter((s) => s.direction === 'LONG');
  const shortConf = confirmed.filter((s) => s.direction === 'SHORT');

  const tone: InsightTone =
    longConf.length > 0 && shortConf.length === 0
      ? 'positive'
      : shortConf.length > 0 && longConf.length === 0
        ? 'negative'
        : confirmed.length > 0 || pending.length > 0
          ? 'warning'
          : 'neutral';

  let headline: string;
  if (lang === 'vi') {
    if (confirmed.length === 0 && pending.length === 0) {
      headline = `${symbol} (${timeframe}): Chưa có chiến lược quy tắc nào kích hoạt hoặc chờ xác nhận — thị trường chưa vào mẫu hình rõ.`;
    } else if (longConf.length > 0 && shortConf.length > 0) {
      headline = `${symbol} (${timeframe}): Có ${longConf.length} mô hình báo TĂNG và ${shortConf.length} mô hình báo GIẢM — tín hiệu đang xung đột, cần thận trọng.`;
    } else if (confirmed.length > 0) {
      const dirText = longConf.length > 0 ? 'TĂNG (Long)' : 'GIẢM (Short)';
      headline = `${symbol} (${timeframe}): ${confirmed.length}/${signals.length} mô hình đã xác nhận hướng ${dirText} (cộng ${pending.length} mô hình đang chờ).`;
    } else {
      headline = `${symbol} (${timeframe}): Chưa có mô hình nào xác nhận, nhưng có ${pending.length} thiết lập đang ở trạng thái chờ (Pending).`;
    }
  } else {
    headline = `${symbol} (${timeframe}): ${confirmed.length} confirmed (${longConf.length} Long / ${shortConf.length} Short), ${pending.length} pending.`;
  }

  const bullets: string[] = [];
  const sorted = [...signals]
    .filter((s) => s.setupQualityScore !== null)
    .sort((a, b) => (b.setupQualityScore ?? 0) - (a.setupQualityScore ?? 0));
  const best = sorted[0];
  if (best && best.setupQualityScore !== null) {
    const dirLabel =
      best.direction === 'LONG' ? (lang === 'vi' ? 'Mua (Long)' : 'Long') : best.direction === 'SHORT' ? (lang === 'vi' ? 'Bán (Short)' : 'Short') : (lang === 'vi' ? 'Trung lập' : 'Neutral');
    const rrPart = best.riskReward !== null ? ` · R:R ${nfmt(best.riskReward, 2)}R` : '';
    bullets.push(
      lang === 'vi'
        ? `Mô hình có điểm cấu trúc cao nhất: ${best.strategyName} (${best.setupQualityScore}/100, hướng ${dirLabel}${rrPart}).`
        : `Highest-scoring setup: ${best.strategyName} (${best.setupQualityScore}/100, ${dirLabel}${rrPart}).`
    );
  }
  bullets.push(
    lang === 'vi'
      ? 'Lưu ý cách đọc: Điểm chất lượng (Score) đo mức độ khớp các điều kiện kỹ thuật định sẵn; R:R là tỷ lệ lợi nhuận kỳ vọng trên rủi ro — đây là dữ liệu sàng lọc, không phải khuyến nghị vào lệnh.'
      : 'How to read: Quality score reflects deterministic rule alignment and R:R measures reward-to-risk distance — educational screening only.'
  );

  const cautions: string[] = [];
  if (longConf.length > 0 && shortConf.length > 0) {
    cautions.push(
      lang === 'vi'
        ? 'Các chiến lược đang cho tín hiệu trái chiều — ưu tiên đứng ngoài hoặc kiểm tra lại khung thời gian lớn hơn.'
        : 'Conflicting Long/Short signals detected — check the higher timeframe before acting.'
    );
  }

  return { tone, headline, bullets, cautions };
}

export interface ScannerOppLike {
  instrument: string;
  strategy: string;
  direction: string;
  setupQualityScore: number;
  riskReward: number | null;
}

export function interpretScannerSummary(
  opportunities: readonly ScannerOppLike[],
  unavailableCount: number,
  style: string,
  timeframe: string,
  lang: InsightLang = 'vi'
): AnalyticalInsight {
  if (opportunities.length === 0) {
    return {
      tone: 'neutral',
      headline:
        lang === 'vi'
          ? `Không có mã nào vượt ngưỡng lọc (${style} · ${timeframe}).`
          : `No instruments passed the scanner filters (${style} · ${timeframe}).`,
      bullets: [
        lang === 'vi'
          ? 'Bạn có thể giảm ngưỡng "Điểm tối thiểu" hoặc "R:R tối thiểu", hoặc nạp thêm dữ liệu nến nếu nhiều mã nằm ở mục Bỏ qua.'
          : 'Try lowering min setup score / min R:R, or import candle history for skipped instruments.',
      ],
      cautions:
        unavailableCount > 0
          ? [
              lang === 'vi'
                ? `${unavailableCount} mã bị bỏ qua do thiếu dữ liệu nến lịch sử để tính chỉ báo.`
                : `${unavailableCount} instruments skipped due to missing candle history.`,
            ]
          : [],
    };
  }

  const longs = opportunities.filter((o) => o.direction === 'LONG').length;
  const shorts = opportunities.filter((o) => o.direction === 'SHORT').length;
  const top = [...opportunities].sort((a, b) => b.setupQualityScore - a.setupQualityScore)[0];
  const tone: InsightTone = longs > shorts ? 'positive' : shorts > longs ? 'negative' : 'neutral';

  const headline =
    lang === 'vi'
      ? `Tìm thấy ${opportunities.length} thiết lập đạt chuẩn (${longs} nghiêng Tăng · ${shorts} nghiêng Giảm) trên khung ${timeframe}.`
      : `Found ${opportunities.length} qualifying setups (${longs} Long · ${shorts} Short) on ${timeframe}.`;

  const bullets: string[] = [];
  if (top) {
    const dir = top.direction === 'LONG' ? (lang === 'vi' ? 'Long (Tăng)' : 'Long') : (lang === 'vi' ? 'Short (Giảm)' : 'Short');
    const rr = top.riskReward !== null ? ` · R:R ${nfmt(top.riskReward, 2)}R` : '';
    bullets.push(
      lang === 'vi'
        ? `Nổi bật nhất theo điểm số: ${top.instrument} — mô hình ${top.strategy} (${dir}, ${top.setupQualityScore}/100${rr}).`
        : `Top ranked setup: ${top.instrument} — ${top.strategy} (${dir}, ${top.setupQualityScore}/100${rr}).`
    );
  }
  bullets.push(
    lang === 'vi'
      ? 'Bấm "Mở biểu đồ" ở mã quan tâm để kiểm tra trực quan vùng hỗ trợ/kháng cự và tin tức cơ bản trước khi quyết định.'
      : 'Open the chart for top candidates to inspect price action and fundamentals before sizing any trade.'
  );

  const cautions: string[] = [];
  if (unavailableCount > 0) {
    cautions.push(
      lang === 'vi'
        ? `Có ${unavailableCount} mã không thể quét vì chưa đủ nến lịch sử — kết quả chỉ phản ánh nhóm mã có đủ dữ liệu.`
        : `${unavailableCount} instruments were skipped due to insufficient candle history.`
    );
  }

  return { tone, headline, bullets, cautions };
}

// -----------------------------------------------------------------------------
// 5. Contract Specification Interpreter
// -----------------------------------------------------------------------------

export function interpretContractSpec(
  inst: InstrumentDefinition,
  lang: InsightLang = 'vi'
): AnalyticalInsight {
  const s = inst.specification;
  const verified = s.verificationStatus === 'VERIFIED';
  const tone: InsightTone = verified ? 'neutral' : 'warning';

  const headline =
    lang === 'vi'
      ? `${inst.productName} (${inst.exchange}:${inst.exchangeSymbol}): Quy cách 1 hợp đồng tiêu chuẩn và giá trị từng bước giá.`
      : `${inst.productName} (${inst.exchange}:${inst.exchangeSymbol}): Standard 1-contract mechanics and tick impact.`;

  const bullets: string[] = [];
  if (s.contractSize !== null && s.minimumTickSize !== null && s.tickValue !== null) {
    if (lang === 'vi') {
      bullets.push(
        `Mỗi 1 hợp đồng đại diện cho ${nfmt(s.contractSize, 0)} ${s.contractSizeUnit}. Khi giá nhích tối thiểu 1 tick (${s.minimumTickSize} ${s.quotationUnit}), lãi/lỗ thay đổi ${nfmt(s.tickValue, 2)} ${s.tradingCurrency}/hợp đồng.`
      );
    } else {
      bullets.push(
        `1 contract = ${nfmt(s.contractSize, 0)} ${s.contractSizeUnit}. A minimum 1-tick move (${s.minimumTickSize} ${s.quotationUnit}) changes PnL by ${nfmt(s.tickValue, 2)} ${s.tradingCurrency}.`
      );
    }
  } else {
    bullets.push(
      lang === 'vi'
        ? 'Một số thông số kích thước hoặc giá trị tick chưa có dữ liệu xác thực — dùng máy tính bước giá thận trọng.'
        : 'Some contract size or tick values are unavailable — check exchange specs before sizing.'
    );
  }

  if (inst.mxvMapping?.mxvSymbol) {
    bullets.push(
      lang === 'vi'
        ? `Liên thông MXV: Mã tại Việt Nam là ${inst.mxvMapping.mxvSymbol} (tham chiếu sàn ${inst.mxvMapping.internationalExchange}:${inst.mxvMapping.internationalSymbol}).`
        : `MXV linkage: local code ${inst.mxvMapping.mxvSymbol} linked to ${inst.mxvMapping.internationalExchange}:${inst.mxvMapping.internationalSymbol}.`
    );
  }

  const cautions: string[] = [];
  if (!verified) {
    cautions.push(
      lang === 'vi'
        ? 'Trạng thái thông số chưa xác thực đầy đủ (UNVERIFIED/UNAVAILABLE): cần đối chiếu lại biểu phí & ký quỹ mới nhất tại công ty môi giới MXV trước khi giao dịch thật.'
        : 'Specification is not fully verified: confirm margin and tick schedule with your licensed broker before trading live.'
    );
  }
  if (s.marginRequirement === null) {
    cautions.push(
      lang === 'vi'
        ? 'Chưa có mức ký quỹ ban đầu niêm yết trong hệ thống — cần hỏi thành viên môi giới để biết số vốn tối thiểu giữ 1 hợp đồng.'
        : 'Initial margin is not listed locally — verify capital requirement with your broker.'
    );
  }

  return { tone, headline, bullets, cautions };
}

// -----------------------------------------------------------------------------
// 6. Data Analysis Tabs Interpreters (Volatility, Drawdown, Correlation, Seasonality, Spreads)
// -----------------------------------------------------------------------------

export function interpretVolatilitySnapshot(
  params: {
    label: string;
    realizedAnn: number | null;
    parkinsonAnn: number | null;
    atrPct: number | null;
  },
  lang: InsightLang = 'vi'
): AnalyticalInsight {
  const vol = params.realizedAnn ?? params.parkinsonAnn;
  const dailyPct = vol !== null ? (vol * 100) / Math.sqrt(252) : null;
  const annPct = vol !== null ? vol * 100 : null;

  let tone: InsightTone = 'neutral';
  if (annPct !== null) {
    tone = annPct >= 40 ? 'warning' : annPct >= 25 ? 'neutral' : 'positive';
  }

  const headline =
    lang === 'vi'
      ? annPct !== null
        ? `${params.label}: Biến động quy năm ở mức ${nfmt(annPct, 1)}% (${annPct >= 40 ? 'rất cao' : annPct >= 25 ? 'trung bình–khá' : 'tương đối êm'}).`
        : `${params.label}: Chưa đủ dữ liệu để kết luận mức biến động.`
      : annPct !== null
        ? `${params.label}: Annualized volatility is ${nfmt(annPct, 1)}%.`
        : `${params.label}: Insufficient observations for volatility readout.`;

  const bullets: string[] = [];
  const cautions: string[] = [];

  if (dailyPct !== null) {
    bullets.push(
      lang === 'vi'
        ? `Quy đổi sang mức dao động điển hình 1 phiên: khoảng ±${nfmt(dailyPct, 2)}%/ngày (mức biến động thực tế có thể vượt gấp đôi vào ngày công bố báo cáo lớn).`
        : `Implied typical 1-day swing: roughly ±${nfmt(dailyPct, 2)}%/session.`
    );
  }
  if (params.realizedAnn !== null && params.parkinsonAnn !== null) {
    const gap = (params.parkinsonAnn - params.realizedAnn) * 100;
    if (Math.abs(gap) >= 3) {
      bullets.push(
        lang === 'vi'
          ? gap > 0
            ? `Biến động trong phiên (Parkinson ${nfmt(params.parkinsonAnn * 100, 1)}%) cao hơn biến động đóng cửa (${nfmt(params.realizedAnn * 100, 1)}%) → trong ngày giá hay giật râu nến mạnh rồi rút về.`
            : `Biến động đóng cửa (${nfmt(params.realizedAnn * 100, 1)}%) cao hơn Parkinson (${nfmt(params.parkinsonAnn * 100, 1)}%) → giá hay có khoảng nhảy gáp (gap) qua đêm.`
          : gap > 0
            ? 'Intraday Parkinson volatility exceeds close-to-close realized volatility (notable intraday wicks).'
            : 'Close-to-close volatility exceeds intraday range (overnight gaps play a larger role).'
      );
    }
  }
  if (params.atrPct !== null) {
    bullets.push(
      lang === 'vi'
        ? `Biên độ trung bình mỗi nến (ATR%): ${nfmt(params.atrPct, 2)}% — dùng làm thước đo đặt điểm cắt lỗ để tránh bị quét nhiễu.`
        : `Average True Range (ATR%): ${nfmt(params.atrPct, 2)}% per bar — useful baseline for stop distance.`
    );
  }
  if (annPct !== null && annPct >= 40) {
    cautions.push(
      lang === 'vi'
        ? 'Mức biến động ≥40%/năm là rất cao: cần giảm đòn bẩy và khối lượng hợp đồng so với mặt bằng thông thường.'
        : 'Annualized volatility ≥40% is elevated: scale down position size accordingly.'
    );
  }

  return { tone, headline, bullets, cautions };
}

export function interpretDrawdownSnapshot(
  params: {
    label: string;
    totalReturn: number | null;
    maxDrawdown: number | null;
    peakDate: string | null;
    troughDate: string | null;
    recoveryDate: string | null;
  },
  lang: InsightLang = 'vi'
): AnalyticalInsight {
  const tot = params.totalReturn !== null ? params.totalReturn * 100 : null;
  const dd = params.maxDrawdown !== null ? Math.abs(params.maxDrawdown) * 100 : null;

  const tone: InsightTone =
    dd !== null && dd >= 30 ? 'negative' : tot !== null && tot > 0 ? 'positive' : 'warning';

  const headline =
    lang === 'vi'
      ? `${params.label}: Tổng hiệu suất lịch sử ${tot !== null ? signedPct(tot, 1) : '—'} với mức sụt giảm sâu nhất từ đỉnh là -${dd !== null ? nfmt(dd, 1) : '—'}%.`
      : `${params.label}: Total return ${tot !== null ? signedPct(tot, 1) : '—'} with maximum peak-to-trough drawdown of -${dd !== null ? nfmt(dd, 1) : '—'}%.`;

  const bullets: string[] = [];
  const cautions: string[] = [];

  if (dd !== null && params.peakDate && params.troughDate) {
    const recoveryText =
      dd === 0
        ? lang === 'vi'
          ? 'không ghi nhận nhịp sụt giảm'
          : 'no drawdown recorded'
        : params.recoveryDate
          ? lang === 'vi'
            ? `đã hồi phục về đỉnh vào ${params.recoveryDate.slice(0, 10)}`
            : `recovered on ${params.recoveryDate.slice(0, 10)}`
          : lang === 'vi'
            ? 'đến cuối chuỗi dữ liệu VẪN CHƯA hồi phục lại đỉnh cũ'
            : 'still unrecovered by the end of the series';
    bullets.push(
      lang === 'vi'
        ? `Nhịp giảm nặng nhất diễn ra từ đỉnh ${params.peakDate.slice(0, 10)} xuống đáy ${params.troughDate.slice(0, 10)} (-${nfmt(dd, 1)}%), ${recoveryText}.`
        : `Worst drop ran from ${params.peakDate.slice(0, 10)} to ${params.troughDate.slice(0, 10)} (-${nfmt(dd, 1)}%), ${recoveryText}.`
    );
  }
  if (dd !== null && dd > 0) {
    const neededGain = (100 / (100 - Math.min(dd, 99)) - 1) * 100;
    bullets.push(
      lang === 'vi'
        ? `Ý nghĩa thực tế: nếu tài khoản/vị thế chịu mức giảm -${nfmt(dd, 1)}% mà không cắt lỗ, cần mức tăng lại +${nfmt(neededGain, 1)}% mới về hòa vốn.`
        : `Practical math: recovering from a -${nfmt(dd, 1)}% loss requires a +${nfmt(neededGain, 1)}% gain.`
    );
  }
  if (dd !== null && !params.recoveryDate && dd >= 15) {
    cautions.push(
      lang === 'vi'
        ? 'Chuỗi giá hiện chưa quay lại đỉnh cũ — tránh chiến lược "gồng lỗ" dài hạn không điểm thoát.'
        : 'Series has not yet reclaimed its prior peak — avoid holding unhedged drawdowns without a stop.'
    );
  }

  return { tone, headline, bullets, cautions };
}

export function interpretCorrelationMatrix(
  labels: readonly string[],
  matrix: readonly (readonly (number | null)[])[],
  lang: InsightLang = 'vi'
): AnalyticalInsight {
  let maxPair: { a: string; b: string; r: number } | null = null;
  let minPair: { a: string; b: string; r: number } | null = null;

  for (let i = 0; i < labels.length; i++) {
    for (let j = i + 1; j < labels.length; j++) {
      const val = matrix[i]?.[j];
      if (val === null || val === undefined || !Number.isFinite(val)) continue;
      if (!maxPair || val > maxPair.r) maxPair = { a: labels[i], b: labels[j], r: val };
      if (!minPair || val < minPair.r) minPair = { a: labels[i], b: labels[j], r: val };
    }
  }

  if (!maxPair) {
    return {
      tone: 'neutral',
      headline:
        lang === 'vi'
          ? 'Chưa đủ cặp dữ liệu trùng ngày để rút ra tương quan.'
          : 'Not enough overlapping observations to interpret pair correlations.',
      bullets: [],
      cautions: [],
    };
  }

  const highCorr = maxPair.r >= 0.65;
  const tone: InsightTone = highCorr ? 'warning' : 'neutral';
  const headline =
    lang === 'vi'
      ? highCorr
        ? `Cảnh báo trùng rủi ro: ${maxPair.a} và ${maxPair.b} biến động cùng chiều rất mạnh (r = ${nfmt(maxPair.r, 2)}).`
        : `Các mã đang chọn có mức tương quan tối đa r = ${nfmt(maxPair.r, 2)} — chưa quá tập trung vào một hướng.`
      : `Strongest pair correlation: ${maxPair.a} vs ${maxPair.b} (r = ${nfmt(maxPair.r, 2)}).`;

  const bullets: string[] = [];
  const cautions: string[] = [];

  if (lang === 'vi') {
    bullets.push(
      `Cặp đi cùng chiều nhất: ${maxPair.a} & ${maxPair.b} (r = ${nfmt(maxPair.r, 2)}). ${
        maxPair.r >= 0.65
          ? 'Nếu mở cùng lúc 2 vị thế cùng hướng trên cặp này, rủi ro thực tế gần như nhân đôi chứ không phân tán.'
          : 'Mức liên hệ cùng chiều ở mức vừa/thấp.'
      }`
    );
    if (minPair && (minPair.a !== maxPair.a || minPair.b !== maxPair.b)) {
      bullets.push(
        `Cặp ít liên hệ / đi ngược nhất: ${minPair.a} & ${minPair.b} (r = ${nfmt(minPair.r, 2)}) — phù hợp hơn nếu muốn đa dạng hoá danh mục.`
      );
    }
  } else {
    bullets.push(`Most positively correlated pair: ${maxPair.a} & ${maxPair.b} (r = ${nfmt(maxPair.r, 2)}).`);
    if (minPair && (minPair.a !== maxPair.a || minPair.b !== maxPair.b)) {
      bullets.push(`Most independent/inverse pair: ${minPair.a} & ${minPair.b} (r = ${nfmt(minPair.r, 2)}).`);
    }
  }

  if (highCorr) {
    cautions.push(
      lang === 'vi'
        ? `Không nên coi việc cầm cả ${maxPair.a} và ${maxPair.b} là "chia trứng nhiều giỏ" vì khi thị trường đảo chiều, cả hai thường lỗ cùng lúc.`
        : `Holding both ${maxPair.a} and ${maxPair.b} creates concentrated directional risk.`
    );
  }

  return { tone, headline, bullets, cautions };
}

export function interpretSeasonalityMonths(
  months: ReadonlyArray<{ month: number; count: number; mean: number | null; pctPositive: number | null }>,
  label: string,
  minYears: number,
  lang: InsightLang = 'vi'
): AnalyticalInsight {
  const valid = months.filter((m) => m.mean !== null && m.count > 0) as Array<{
    month: number;
    count: number;
    mean: number;
    pctPositive: number | null;
  }>;
  if (valid.length === 0) {
    return {
      tone: 'neutral',
      headline:
        lang === 'vi'
          ? `${label}: Chưa đủ số năm lịch sử để thống kê mùa vụ theo tháng.`
          : `${label}: Insufficient years for monthly seasonality statistics.`,
      bullets: [],
      cautions: [],
    };
  }

  const best = [...valid].sort((a, b) => b.mean - a.mean)[0];
  const worst = [...valid].sort((a, b) => a.mean - b.mean)[0];
  const mName = (m: number) => (lang === 'vi' ? `Tháng ${m}` : `Month ${m}`);

  const headline =
    lang === 'vi'
      ? `${label}: Theo lịch sử, ${mName(best.month)} mạnh nhất (${signedPct(best.mean * 100, 1)}) và ${mName(worst.month)} yếu nhất (${signedPct(worst.mean * 100, 1)}).`
      : `${label}: Historically strongest in ${mName(best.month)} (${signedPct(best.mean * 100, 1)}) and weakest in ${mName(worst.month)} (${signedPct(worst.mean * 100, 1)}).`;

  const bullets = [
    lang === 'vi'
      ? `${mName(best.month)}: hiệu suất trung bình ${signedPct(best.mean * 100, 2)}${best.pctPositive !== null ? `, xác suất tăng ${nfmt(best.pctPositive * 100, 0)}%` : ''} (qua ${best.count} năm).`
      : `${mName(best.month)}: avg return ${signedPct(best.mean * 100, 2)}${best.pctPositive !== null ? `, ${nfmt(best.pctPositive * 100, 0)}% positive` : ''} (${best.count} yrs).`,
    lang === 'vi'
      ? `${mName(worst.month)}: hiệu suất trung bình ${signedPct(worst.mean * 100, 2)}${worst.pctPositive !== null ? `, xác suất tăng ${nfmt(worst.pctPositive * 100, 0)}%` : ''} (qua ${worst.count} năm).`
      : `${mName(worst.month)}: avg return ${signedPct(worst.mean * 100, 2)}${worst.pctPositive !== null ? `, ${nfmt(worst.pctPositive * 100, 0)}% positive` : ''} (${worst.count} yrs).`,
  ];

  const cautions: string[] = [];
  if (best.count < minYears || worst.count < minYears) {
    cautions.push(
      lang === 'vi'
        ? `Một số tháng có ít hơn ${minYears} năm quan sát — chỉ dùng làm bối cảnh tham khảo, không phải quy luật chắc chắn.`
        : `Some months have fewer than ${minYears} years of data — treat as historical context only.`
    );
  } else {
    cautions.push(
      lang === 'vi'
        ? 'Mùa vụ là xác suất thống kê quá khứ; năm có thời tiết cực đoan (El Niño/La Niña) hoặc cú sốc vĩ mô vẫn có thể đi ngược mùa vụ.'
        : 'Seasonality reflects historical averages; weather or macro shocks can override seasonal tendencies.'
    );
  }

  return { tone: 'neutral', headline, bullets, cautions };
}

export function interpretSpreadZScore(
  latestSpread: number | null,
  latestZ: number | null,
  outputUnit: string,
  window: number,
  lang: InsightLang = 'vi'
): AnalyticalInsight {
  if (latestSpread === null) {
    return {
      tone: 'neutral',
      headline:
        lang === 'vi'
          ? 'Chưa đủ dữ liệu trùng khớp giữa các chân để tính chênh lệch.'
          : 'Insufficient overlapping timestamps across legs to compute spread.',
      bullets: [],
      cautions: [],
    };
  }

  const absZ = latestZ !== null ? Math.abs(latestZ) : 0;
  const tone: InsightTone = absZ >= 2 ? 'warning' : 'neutral';
  const unitSuffix = outputUnit ? ` ${outputUnit}` : '';

  let headline: string;
  if (latestZ === null) {
    headline =
      lang === 'vi'
        ? `Giá trị chênh lệch hiện tại là ${nfmt(latestSpread, 4)}${unitSuffix}.`
        : `Current spread is ${nfmt(latestSpread, 4)}${unitSuffix}.`;
  } else if (absZ >= 2) {
    headline =
      lang === 'vi'
        ? `Chênh lệch đang giãn ra vùng CỰC TRỊ thống kê (z-score = ${nfmt(latestZ, 2)} so với ${window} phiên gần nhất).`
        : `Spread is at a statistical extreme (z-score = ${nfmt(latestZ, 2)} vs ${window}-bar window).`;
  } else if (absZ >= 1) {
    headline =
      lang === 'vi'
        ? `Chênh lệch hơi lệch khỏi trung bình gần đây (z-score = ${nfmt(latestZ, 2)}).`
        : `Spread is moderately stretched from its recent mean (z-score = ${nfmt(latestZ, 2)}).`;
  } else {
    headline =
      lang === 'vi'
        ? `Chênh lệch đang nằm quanh vùng bình thường (z-score = ${nfmt(latestZ, 2)}).`
        : `Spread sits inside its normal historical band (z-score = ${nfmt(latestZ, 2)}).`;
  }

  const bullets: string[] = [
    lang === 'vi'
      ? `Chênh lệch mới nhất: ${nfmt(latestSpread, 4)}${unitSuffix}. Khi |z-score| ≥ 2.0, độ lệch đã vượt 2 độ lệch chuẩn so với trung bình ${window} phiên.`
      : `Latest spread: ${nfmt(latestSpread, 4)}${unitSuffix}. Readings beyond ±2.0 indicate >2 standard deviations from the ${window}-bar mean.`,
  ];

  const cautions: string[] =
    absZ >= 2
      ? [
          lang === 'vi'
            ? 'Spread vượt ±2σ thường thu hút giao dịch hồi quy trung bình (mean reversion), nhưng nếu có thay đổi cung–cầu cấu trúc thì spread có thể tiếp tục giãn.'
            : 'Extreme z-scores (|z| ≥ 2) can revert to the mean, or continue widening during structural supply shifts.',
        ]
      : [];

  return { tone, headline, bullets, cautions };
}
