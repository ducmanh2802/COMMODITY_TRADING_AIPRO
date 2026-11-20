import { GoogleGenAI, Type } from '@google/genai';
import { z } from 'zod';
import type {
  CommodityProfileDossier,
  DailyResearchReportPayload,
  EightQuestionVerdict,
} from '../../src/shared/types/cycle.ts';

const EightQuestionsSchema = z.object({
  q1CyclePhase: z.string(),
  q2SupplyDemandState: z.string(),
  q3ValuableOrTrap: z.string(),
  q4BottomProbabilityAssessment: z.string(),
  q5KeyDriversAndRisks: z.string(),
  q6ShouldActNowOrWait: z.string(),
  q7EntryZoneInvalidationTargets: z.string(),
  q8ConfirmationTriggers: z.string(),
});

const ExecutiveBriefingSchema = z.object({
  headline: z.string(),
  macroRegimeSummary: z.string(),
  vietnamFocusCommentary: z.string(),
  bottomWatchHighlights: z.array(z.string()),
  riskWarnings: z.array(z.string()),
  actionableChecklist: z.array(z.string()),
});

function createGeminiClient(): GoogleGenAI | null {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) return null;
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

export async function generateEightQuestionVerdict(
  dossier: CommodityProfileDossier
): Promise<EightQuestionVerdict> {
  const now = new Date().toISOString();
  const { summary, bottomDetection, tradePlans, timeframes } = dossier;

  // Fail closed when neither price nor OHLCV history is available
  if (
    summary.dataStatus === 'UNAVAILABLE' &&
    dossier.historicalCandlesCount < 30
  ) {
    return {
      symbol: summary.instrument.id,
      generatedAt: now,
      model: 'gemini-4-hydrogen',
      status: 'DATA_UNAVAILABLE',
      message:
        'DATA_UNAVAILABLE — Cần tối thiểu dữ liệu giá hoặc >= 30 nến D1 trước khi AI Verdict phân tích 8 câu hỏi chu kỳ.',
      answers: null,
    };
  }

  const ai = createGeminiClient();
  if (!ai) {
    return {
      symbol: summary.instrument.id,
      generatedAt: now,
      model: 'gemini-4-hydrogen',
      status: 'AI_UNCONFIGURED',
      message:
        'Chưa có khoá Gemini nên AI Verdict tạm tắt. Lấy khoá miễn phí tại aistudio.google.com/apikey, thêm dòng GEMINI_API_KEY=... vào file .env rồi khởi động lại server. Bảng "Đánh giá các mã" vẫn có nhận xét miễn phí theo công thức.',
      answers: null,
    };
  }

  const groundedContext = {
    symbol: summary.instrument.id,
    name: summary.instrument.productName,
    vietnameseName: summary.instrument.commodityProfile?.vietnameseName,
    mxvSymbol: summary.instrument.mxvMapping?.mxvSymbol,
    vietnamRelevance: summary.instrument.commodityProfile?.vietnamMarketRelevance,
    quote: {
      price: summary.quote.price,
      currency: summary.quote.currency,
      unit: summary.quote.unit,
      status: summary.quote.status,
      source: summary.quote.source,
    },
    cyclePhase: summary.cyclePhase,
    timeframes,
    bottomDetection: {
      totalScore: bottomDetection.totalScore,
      classification: bottomDetection.classification,
      modelConfidenceScore: bottomDetection.modelConfidenceScore,
      observedWeight: bottomDetection.observedWeight,
      factors: bottomDetection.factors,
      confirmationConditions: bottomDetection.confirmationConditions,
      invalidationTriggers: bottomDetection.invalidationTriggers,
    },
    tradePlans,
    supplyDemandMatrix: dossier.supplyDemandMatrix,
    cotSnapshot: dossier.cotSnapshot,
    returns: summary.returns,
  };

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-4-hydrogen',
      contents: `Trả lời đúng 8 câu hỏi nghiên cứu chu kỳ hàng hóa bằng tiếng Việt chuyên nghiệp dựa CHỈ trên JSON định lượng sau đây (không bịa số liệu):\n${JSON.stringify(
        groundedContext
      )}`,
      config: {
        systemInstruction: [
          'Bạn là Chuyên gia Phân tích Chu kỳ Hàng hóa Phái sinh (COMMODITY TRADING AI PRO - CYCLE HUNTER), tập trung vào MXV Việt Nam và các sàn quốc tế.',
          'Chỉ sử dụng số liệu có trong JSON được cung cấp. Nếu một dữ liệu là null hoặc UNAVAILABLE, hãy nêu rõ là chưa có dữ liệu chứ tuyệt đối không bịa con số.',
          'Không bao giờ khẳng định chắc chắn đã tạo đáy hay cam kết lợi nhuận; diễn giải Bottom Score & Confidence Score như thước đo định lượng nội bộ cần điều kiện xác nhận.',
          'Trả lời ngắn gọn, súc tích, thực chiến cho nhà đầu tư Việt Nam cho cả 8 trường JSON.',
        ].join(' '),
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            q1CyclePhase: { type: Type.STRING, description: '1. Hàng hóa đang ở giai đoạn nào của chu kỳ?' },
            q2SupplyDemandState: { type: Type.STRING, description: '2. Trạng thái Cung - Cầu đang thắt chặt hay dư thừa?' },
            q3ValuableOrTrap: { type: Type.STRING, description: '3. Giá đã thực sự rẻ/giá trị hay là bẫy giảm giá?' },
            q4BottomProbabilityAssessment: { type: Type.STRING, description: '4. Đánh giá điểm tạo đáy & mức độ tin cậy của mô hình?' },
            q5KeyDriversAndRisks: { type: Type.STRING, description: '5. Động lực chính và rủi ro lớn nhất hiện tại là gì?' },
            q6ShouldActNowOrWait: { type: Type.STRING, description: '6. Nên hành động ngay hay chờ xác nhận thêm?' },
            q7EntryZoneInvalidationTargets: { type: Type.STRING, description: '7. Vùng mua tối ưu, điểm vô hiệu kịch bản và mục tiêu giá theo hệ thống?' },
            q8ConfirmationTriggers: { type: Type.STRING, description: '8. Tín hiệu kỹ thuật / vĩ mô cần xuất hiện để xác nhận?' },
          },
          required: [
            'q1CyclePhase',
            'q2SupplyDemandState',
            'q3ValuableOrTrap',
            'q4BottomProbabilityAssessment',
            'q5KeyDriversAndRisks',
            'q6ShouldActNowOrWait',
            'q7EntryZoneInvalidationTargets',
            'q8ConfirmationTriggers',
          ],
        },
      },
    });

    const parsedJson = JSON.parse((response.text ?? '{}').trim());
    const validated = EightQuestionsSchema.parse(parsedJson);
    return {
      symbol: summary.instrument.id,
      generatedAt: now,
      model: 'gemini-4-hydrogen',
      status: 'OK',
      answers: validated,
    };
  } catch (err) {
    return {
      symbol: summary.instrument.id,
      generatedAt: now,
      model: 'gemini-4-hydrogen',
      status: 'AI_ERROR',
      message: err instanceof Error ? err.message : 'Lỗi gọi Gemini AI Verdict.',
      answers: null,
    };
  }
}

export async function enrichDailyReportWithAi(
  baseReport: DailyResearchReportPayload
): Promise<DailyResearchReportPayload> {
  const ai = createGeminiClient();
  if (!ai) {
    return {
      ...baseReport,
      aiStatus: 'AI_UNCONFIGURED',
      message: 'GEMINI_API_KEY chưa được cấu hình trên server.',
    };
  }

  const contextPayload = {
    generatedAt: baseReport.generatedAt,
    topWatch: baseReport.topWatch.map((c) => ({
      id: c.instrument.id,
      name: c.instrument.commodityProfile?.vietnameseName ?? c.instrument.productName,
      mxv: c.instrument.mxvMapping?.mxvSymbol,
      price: c.quote.price,
      phase: c.cyclePhase,
      bottomScore: c.bottomScore,
      sdBias: c.supplyDemandBias,
    })),
    topBottomCandidates: baseReport.topBottomCandidates.map((c) => ({
      id: c.instrument.id,
      bottomScore: c.bottomScore,
      classification: c.bottomClassification,
    })),
    topDownsideRisk: baseReport.topDownsideRisk.map((c) => ({
      id: c.instrument.id,
      percentile10Y: c.percentile10Y,
      phase: c.cyclePhase,
    })),
    supplyDemandShifts: baseReport.supplyDemandShifts,
    vietnamEventsToday: baseReport.vietnamEventsToday,
  };

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-4-hydrogen',
      contents: `Tổng hợp Báo cáo Nghiên cứu Chu kỳ Hàng hóa (ưu tiên góc nhìn thị trường Việt Nam & MXV) bằng tiếng Việt từ JSON dữ liệu đã kiểm định sau:\n${JSON.stringify(
        contextPayload
      )}`,
      config: {
        systemInstruction: [
          'Bạn là Trưởng bộ phận Nghiên cứu Hàng hóa tại Việt Nam cho nền tảng COMMODITY TRADING AI PRO.',
          'Không bịa đặt giá cả, tồn kho hay số liệu ngoài JSON đầu vào.',
          'Nếu dữ liệu giá hiện đang DATA_UNAVAILABLE, nêu rõ trọng tâm theo dõi sự kiện lịch kinh tế giờ Việt Nam (ICT) và các nhóm hàng hóa xuất nhập khẩu chủ lực như Robusta (LRC), Cao su (JRU), Đậu tương/Khô đậu (ZSE/ZME), Dầu thô.',
        ].join(' '),
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            headline: { type: Type.STRING },
            macroRegimeSummary: { type: Type.STRING },
            vietnamFocusCommentary: { type: Type.STRING },
            bottomWatchHighlights: { type: Type.ARRAY, items: { type: Type.STRING } },
            riskWarnings: { type: Type.ARRAY, items: { type: Type.STRING } },
            actionableChecklist: { type: Type.ARRAY, items: { type: Type.STRING } },
          },
          required: [
            'headline',
            'macroRegimeSummary',
            'vietnamFocusCommentary',
            'bottomWatchHighlights',
            'riskWarnings',
            'actionableChecklist',
          ],
        },
      },
    });

    const parsedJson = JSON.parse((response.text ?? '{}').trim());
    const validated = ExecutiveBriefingSchema.parse(parsedJson);
    return {
      ...baseReport,
      aiStatus: 'OK',
      model: 'gemini-4-hydrogen',
      aiExecutiveBriefing: validated,
    };
  } catch (err) {
    return {
      ...baseReport,
      aiStatus: 'AI_ERROR',
      message: err instanceof Error ? err.message : 'Không thể tạo báo cáo AI lúc này.',
    };
  }
}
