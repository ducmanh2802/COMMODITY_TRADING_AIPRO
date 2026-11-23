import type {
  CommodityAnalysisProfile,
  InstrumentDefinition,
  ProviderSymbolMapping,
} from '../../src/shared/types/instrument.ts';

/**
 * Owner-authored instrument enrichment (from origin/main e7a6c70, server/services/instrumentRegistry.ts),
 * merged into the verified Instrument Master (server/data/instruments.ts) by instrumentRegistry.ts.
 *
 * Merge policy:
 * - Contract specifications, MXV mappings and sources in server/data/instruments.ts are the source of
 *   truth. Only `commodityProfile` (descriptive research text, NOT verified market data) and
 *   `providerMappings` (external API symbols) are taken from here.
 * - `providerMappings.mxvCode` is overridden with the verified MXV symbol from instruments.ts (null where
 *   our MXV check found no listing: CL, BRN, NG, TIO).
 * - Profile prose (market-share figures, seasonal notes, trading-session text) is unsourced owner text.
 */
export interface OwnerInstrumentEnrichment {
  commodityProfile?: CommodityAnalysisProfile;
  providerMappings?: ProviderSymbolMapping;
}

export const OWNER_INSTRUMENT_ENRICHMENT: Record<string, OwnerInstrumentEnrichment> = {
  "ICE:RC": {
    "commodityProfile": {
      "vietnameseName": "Cà phê Robusta",
      "contractMonths": [
        "F",
        "H",
        "K",
        "N",
        "U",
        "X"
      ],
      "contractCycleSummary": "Tháng 1 (F), 3 (H), 5 (K), 7 (N), 9 (U), 11 (X)",
      "deliveryGrade": "Robusta tiêu chuẩn sàn ICE Futures Europe (tối thiểu 10 tấn/lô, kho châu Âu/nguồn gốc đạt chuẩn)",
      "vietnamTradingSessionsIct": "15:00–23:30 ICT (giờ mùa hè EU) / 16:00–00:30 ICT (giờ mùa đông EU)",
      "vietnamMarketRelevance": "Việt Nam là nhà sản xuất & xuất khẩu Robusta lớn nhất thế giới (chiếm ~35–40% sản lượng toàn cầu, tập trung tại Đắk Lắk, Lâm Đồng, Gia Lai, Đắk Nông). Giá LRC trên MXV là tham chiếu trực tiếp cho doanh nghiệp thu mua và nông dân Tây Nguyên.",
      "correlationGroup": "VIETNAM_KEY_EXPORTS",
      "fundamentalDrivers": [
        "Tiến độ thu hoạch & thời tiết Tây Nguyên Việt Nam (El Niño gây khô hạn ảnh hưởng ra hoa/đậu quả)",
        "Số liệu xuất khẩu hàng tháng của Tổng cục Hải quan Việt Nam & VICOFA",
        "Tồn kho Robusta đạt chuẩn (Certified Stocks) trên sàn ICE Futures Europe",
        "Sản lượng Conilon Brazil & thu hoạch tại Indonesia (Sumatra)"
      ],
      "seasonalPattern": "Việt Nam thu hoạch rộ từ tháng 10 đến tháng 1 năm sau (áp lực nguồn cung thường tăng Q4–Q1); Brazil thu hoạch Conilon từ tháng 4–7.",
      "fxSensitivity": "Đồng USD mạnh gây sức ép ngắn hạn lên giá cà phê quốc tế, nhưng tỷ giá USD/VND tăng lại hỗ trợ giá thu mua nội địa quy đổi VND/kg.",
      "riskNotes": "Biên độ dao động ngày lớn khi tồn kho ICE thấp; theo dõi chênh lệch giữa kỳ hạn gần và xa (Backwardation/Contango) tại ngày thông báo đầu tiên."
    },
    "providerMappings": {
      "alphaVantageFunction": "COFFEE",
      "alphaVantageNote": "Alpha Vantage COFFEE phản ánh giá tham chiếu cà phê Arabica quốc tế (khác giống Robusta LRC — chỉ dùng tham chiếu chéo tương quan).",
      "twelveDataSymbol": "RC1",
      "twelveDataNote": "Cần xác nhận quyền truy cập hợp đồng tương lai ICE Robusta trên gói Twelve Data trả phí.",
      "commoditiesApiSymbol": "COFFEE",
      "mxvCode": "LRC"
    }
  },
  "ICE:KC": {
    "commodityProfile": {
      "vietnameseName": "Cà phê Arabica",
      "contractMonths": [
        "H",
        "K",
        "N",
        "U",
        "Z"
      ],
      "contractCycleSummary": "Tháng 3 (H), 5 (K), 7 (N), 9 (U), 12 (Z)",
      "deliveryGrade": "ICE Coffee \"C\" Washed Arabica (37,500 lbs/hợp đồng)",
      "vietnamTradingSessionsIct": "15:15–00:30 ICT (giờ mùa hè US) / 16:15–01:30 ICT (giờ mùa đông US)",
      "vietnamMarketRelevance": "Việt Nam trồng Arabica tại Lâm Đồng (Cầu Đất), Sơn La, Quảng Trị; ngoài ra chênh lệch giá Arabica–Robusta (Arbitrage KC-RC) quyết định tỷ lệ phối trộn của các nhà rang xay toàn cầu.",
      "correlationGroup": "COFFEE_COMPLEX",
      "fundamentalDrivers": [
        "Báo cáo mùa vụ Brazil (CONAB) tại bang Minas Gerais — mưa xuân & nguy cơ sương giá",
        "Tồn kho Arabica đạt chuẩn trên sàn ICE US & xuất khẩu của Colombia/Trung Mỹ",
        "Tỷ giá USD/BRL (đồng Real Brazil yếu thúc đẩy nông dân Brazil đẩy mạnh bán hàng)",
        "Chênh lệch giá Arbitrage KC/RC tác động trực tiếp đến nhu cầu thay thế bằng Robusta Việt Nam"
      ],
      "seasonalPattern": "Mùa đông Brazil (tháng 6–8) nhạy cảm cao với rủi ro sương giá; vụ thu hoạch chính Brazil diễn ra tháng 5–9.",
      "fxSensitivity": "Rất nhạy với cặp USD/BRL và USD/VND khi quy đổi ký quỹ tại MXV.",
      "riskNotes": "1 tick = 0.05 cent/lb = 18.75 USD; biến động mạnh đầu phiên Mỹ (20:00–23:30 ICT)."
    },
    "providerMappings": {
      "alphaVantageFunction": "COFFEE",
      "alphaVantageNote": "Alpha Vantage COFFEE cung cấp chuỗi giá tham chiếu cà phê hàng ngày (USD cents/lb benchmark) để đồng bộ lịch sử D1.",
      "twelveDataSymbol": "KC",
      "fmpSymbol": "KCUSX",
      "commoditiesApiSymbol": "COFFEE",
      "mxvCode": "KCE"
    }
  },
  "ICE:SB": {
    "commodityProfile": {
      "vietnameseName": "Đường thô số 11",
      "contractMonths": [
        "H",
        "K",
        "N",
        "V"
      ],
      "contractCycleSummary": "Tháng 3 (H), 5 (K), 7 (N), 10 (V)",
      "deliveryGrade": "Raw Cane Centrifugal Sugar (FOB port of origin)",
      "vietnamTradingSessionsIct": "14:30–00:00 ICT (giờ mùa hè US)",
      "vietnamMarketRelevance": "Ảnh hưởng trực tiếp tới ngành mía đường Việt Nam, chính sách thuế chống bán phá giá đường và giá thành ngành đồ uống/thực phẩm nội địa.",
      "correlationGroup": "SOFTS_BIOFUEL",
      "fundamentalDrivers": [
        "Báo cáo ép mía vùng Trung–Nam Brazil (UNICA) & tỷ lệ phân bổ mía cho Ethanol vs Đường",
        "Chính sách hạn ngạch xuất khẩu đường của Ấn Độ & thời tiết gió mùa",
        "Sản lượng đường Thái Lan & giá dầu thô thế giới (tương quan Ethanol)"
      ],
      "seasonalPattern": "Brazil bước vào cao điểm ép mía từ tháng 4 đến tháng 11; Ấn Độ & Thái Lan ép mía từ tháng 11 đến tháng 3.",
      "fxSensitivity": "Tương quan nghịch với USD/BRL và tương quan thuận với giá xăng/dầu Brent.",
      "riskNotes": "Số liệu UNICA 2 tuần/lần thường gây nhảy giá mạnh vào đầu phiên Mỹ."
    },
    "providerMappings": {
      "alphaVantageFunction": "SUGAR",
      "alphaVantageNote": "Alpha Vantage SUGAR cung cấp giá đường thô số 11 benchmark hàng ngày (cents/lb).",
      "twelveDataSymbol": "SB",
      "fmpSymbol": "SBUSX",
      "commoditiesApiSymbol": "SUGAR",
      "mxvCode": "SBE"
    }
  },
  "ICE:CC": {
    "commodityProfile": {
      "vietnameseName": "Ca cao",
      "contractMonths": [
        "H",
        "K",
        "N",
        "U",
        "Z"
      ],
      "contractCycleSummary": "Tháng 3 (H), 5 (K), 7 (N), 9 (U), 12 (Z)",
      "deliveryGrade": "ICE Cocoa Standard (10 MT/hợp đồng)",
      "vietnamTradingSessionsIct": "15:45–00:30 ICT",
      "vietnamMarketRelevance": "Tham chiếu cho vùng nguyên liệu ca cao Đắk Lắk, Bến Tre, Bà Rịa-Vũng Tàu và ngành chế biến sô-cô-la/bánh kẹo xuất khẩu của Việt Nam.",
      "correlationGroup": "WEST_AFRICA_SOFTS",
      "fundamentalDrivers": [
        "Lượng hàng về cảng (Port Arrivals) tại Bờ Biển Ngà & Ghana (chiếm >60% nguồn cung toàn cầu)",
        "Báo cáo nghiền ca cao hàng quý (ICCO / ECA / CAA Châu Á / NCA Bắc Mỹ)",
        "Gió khô Harmattan tại Tây Phi & bệnh sưng chồi ca cao (CSSVD)"
      ],
      "seasonalPattern": "Vụ chính Tây Phi từ tháng 10–3; vụ phụ (Mid-crop) từ tháng 4–9.",
      "fxSensitivity": "Tương quan giữa hợp đồng ICE US (USD) và ICE London (GBP).",
      "riskNotes": "Biến động ATR rất cao khi tồn kho sàn xuống thấp; yêu cầu đặt dừng lỗ rộng và kiểm soát đòn bẩy chặt."
    },
    "providerMappings": {
      "twelveDataSymbol": "CC",
      "fmpSymbol": "CCUSD",
      "commoditiesApiSymbol": "COCOA",
      "mxvCode": "CCE"
    }
  },
  "ICE:CT": {
    "commodityProfile": {
      "vietnameseName": "Bông sợi số 2",
      "contractMonths": [
        "H",
        "K",
        "N",
        "V",
        "Z"
      ],
      "contractCycleSummary": "Tháng 3 (H), 5 (K), 7 (N), 10 (V), 12 (Z)",
      "deliveryGrade": "Strict Low Middling 1-1/16 inch US Cotton",
      "vietnamTradingSessionsIct": "08:00–01:20 ICT (bao trùm phiên Á – Âu – Mỹ)",
      "vietnamMarketRelevance": "Việt Nam là một trong những nước nhập khẩu bông nguyên liệu lớn nhất thế giới phục vụ ngành dệt may xuất khẩu. Giá CT là tham chiếu mua nguyên liệu đầu vào cho các nhà máy kéo sợi tại Việt Nam.",
      "correlationGroup": "TEXTILE_FIBERS",
      "fundamentalDrivers": [
        "Báo cáo xuất khẩu hàng tuần USDA Export Sales (Trung Quốc & Việt Nam thường nằm trong top điểm đến)",
        "Báo cáo cung cầu thế giới USDA WASDE hàng tháng",
        "Thời tiết bang Texas (Mỹ) & tiến độ gieo trồng/thu hoạch Ấn Độ, Brazil"
      ],
      "seasonalPattern": "Vụ gieo trồng Mỹ tháng 4–6; thu hoạch rộ Mỹ tháng 9–11.",
      "fxSensitivity": "Nhạy với tỷ giá USD/CNY và sức mua đơn hàng dệt may EU/US.",
      "riskNotes": "Theo dõi báo cáo USDA Export Sales phát hành tối thứ Năm hàng tuần (19:30 hoặc 20:30 ICT)."
    },
    "providerMappings": {
      "alphaVantageFunction": "COTTON",
      "alphaVantageNote": "Alpha Vantage COTTON trả về giá bông tham chiếu hàng ngày (cents/lb).",
      "twelveDataSymbol": "CT",
      "fmpSymbol": "CTUSX",
      "commoditiesApiSymbol": "COTTON",
      "usdaCommodity": "COTTON",
      "mxvCode": "CTE"
    }
  },
  "CBOT:ZS": {
    "commodityProfile": {
      "vietnameseName": "Đậu tương",
      "contractMonths": [
        "F",
        "H",
        "K",
        "N",
        "Q",
        "U",
        "X"
      ],
      "contractCycleSummary": "Tháng 1 (F), 3 (H), 5 (K), 7 (N), 8 (Q), 9 (U), 11 (X)",
      "deliveryGrade": "No. 2 Yellow Soybeans (CBOT Standard, 5,000 giạ ~ 136.08 tấn)",
      "vietnamTradingSessionsIct": "Phiên Á–Âu 07:00–19:45 ICT · Nghỉ giải lao 19:45–20:30 ICT · Phiên Mỹ 20:30–01:20 ICT",
      "vietnamMarketRelevance": "Việt Nam nằm trong nhóm quốc gia nhập khẩu đậu tương & khô đậu tương hàng đầu Đông Nam Á phục vụ ngành thức ăn chăn nuôi và ép dầu thực vật.",
      "correlationGroup": "SOY_COMPLEX",
      "fundamentalDrivers": [
        "Báo cáo USDA WASDE hàng tháng & Crop Progress hàng tuần (tỷ lệ Good/Excellent)",
        "Tiến độ thu hoạch tại Brazil (Mato Grosso) và Argentina (CONAB / Bolsa de Cereales)",
        "Nhu cầu nhập khẩu của Trung Quốc & sản lượng ép dầu NOPA (Mỹ)",
        "Biên lợi nhuận ép dầu (Crush Spread: ZS vs ZM + ZL)"
      ],
      "seasonalPattern": "Mùa thời tiết Bắc Mỹ tạo sóng mạnh tháng 6–8; thu hoạch Mỹ tháng 9–11; cao điểm xuất khẩu Brazil tháng 2–5.",
      "fxSensitivity": "Chịu ảnh hưởng mạnh từ tỷ giá USD/BRL và USD/ARS (thuế xuất khẩu Argentina).",
      "riskNotes": "Chú ý khoảng nghỉ giữa phiên sáng và phiên Mỹ (19:45–20:30 ICT) dễ tạo Gap mở cửa phiên Mỹ 20:30 ICT."
    },
    "providerMappings": {
      "twelveDataSymbol": "ZS",
      "fmpSymbol": "ZSUSX",
      "commoditiesApiSymbol": "SOYBEAN",
      "usdaCommodity": "SOYBEANS",
      "mxvCode": "ZSE"
    }
  },
  "CBOT:ZM": {
    "commodityProfile": {
      "vietnameseName": "Khô đậu tương",
      "contractMonths": [
        "F",
        "H",
        "K",
        "N",
        "Q",
        "U",
        "V",
        "Z"
      ],
      "contractCycleSummary": "Tháng 1 (F), 3 (H), 5 (K), 7 (N), 8 (Q), 9 (U), 10 (V), 12 (Z)",
      "deliveryGrade": "High-Protein Soybean Meal (min 47.5–48% protein)",
      "vietnamTradingSessionsIct": "07:00–19:45 ICT & 20:30–01:20 ICT",
      "vietnamMarketRelevance": "Việt Nam là một trong những nước nhập khẩu khô đậu tương lớn nhất châu Á (từ Argentina, Brazil, Mỹ) phục vụ chăn nuôi lợn, gia cầm và thủy sản. Giao dịch rất sôi động tại MXV.",
      "correlationGroup": "SOY_COMPLEX",
      "fundamentalDrivers": [
        "Sản lượng ép dầu & xuất khẩu khô đậu tương từ Argentina (nước xuất khẩu số 1 thế giới)",
        "Nhu cầu đàn lợn tại Trung Quốc & ngành chăn nuôi Đông Nam Á",
        "Diễn biến giá đậu tương nguyên liệu (ZS) & dầu đậu tương (ZL) trong Board Crush"
      ],
      "seasonalPattern": "Thường biến động mạnh trong giai đoạn Argentina đình công cảng hoặc hạn hán vụ Pampas (Q1–Q2) và vụ mùa Mỹ (Q3).",
      "fxSensitivity": "Tác động gián tiếp qua giá thức ăn chăn nuôi tại cảng Cái Mép/Hải Phòng quy đổi VND/kg.",
      "riskNotes": "Liên kết chặt với Dầu đậu tương (ZL) theo dòng tiền Oil Share Spread — tránh đánh ngược pha khi ZL/ZM tách rời."
    },
    "providerMappings": {
      "twelveDataSymbol": "ZM",
      "fmpSymbol": "ZMUSX",
      "usdaCommodity": "SOYBEANS",
      "mxvCode": "ZME"
    }
  },
  "CBOT:ZL": {
    "commodityProfile": {
      "vietnameseName": "Dầu đậu tương",
      "contractMonths": [
        "F",
        "H",
        "K",
        "N",
        "Q",
        "U",
        "V",
        "Z"
      ],
      "contractCycleSummary": "Tháng 1, 3, 5, 7, 8, 9, 10, 12",
      "deliveryGrade": "Crude Degummed Soybean Oil (60,000 lbs)",
      "vietnamTradingSessionsIct": "07:00–19:45 ICT & 20:30–01:20 ICT",
      "vietnamMarketRelevance": "Tham chiếu chi phí nguyên liệu cho các doanh nghiệp dầu thực vật, thủy sản và chế biến thực phẩm tại Việt Nam.",
      "correlationGroup": "SOY_COMPLEX",
      "fundamentalDrivers": [
        "Chính sách nhiên liệu sinh học (EPA Renewable Volume Obligations — Biodiesel Mỹ)",
        "Tương quan thay thế với giá Dầu cọ thô Malaysia (BMD CPO) & Dầu thô WTI/Brent",
        "Tồn kho dầu đậu tương NOPA hàng tháng tại Mỹ"
      ],
      "seasonalPattern": "Thường chịu lực hỗ trợ khi nhu cầu dầu cọ Ấn Độ/Trung Quốc tăng hoặc chính sách B40/B50 Indonesia thắt chặt nguồn cung dầu thực vật.",
      "fxSensitivity": "Tương quan thuận với giá dầu thô WTI/Brent thông qua mảng năng lượng sinh học.",
      "riskNotes": "Rất nhạy cảm với tin tức chính sách thuế/trợ cấp nhiên liệu sinh học từ EPA Mỹ."
    },
    "providerMappings": {
      "twelveDataSymbol": "ZL",
      "fmpSymbol": "ZLUSX",
      "mxvCode": "ZLE"
    }
  },
  "CBOT:ZC": {
    "commodityProfile": {
      "vietnameseName": "Ngô",
      "contractMonths": [
        "H",
        "K",
        "N",
        "U",
        "Z"
      ],
      "contractCycleSummary": "Tháng 3 (H), 5 (K), 7 (N), 9 (U), 12 (Z)",
      "deliveryGrade": "No. 2 Yellow Corn (CBOT Standard, 5,000 giạ ~ 127 tấn)",
      "vietnamTradingSessionsIct": "07:00–19:45 ICT & 20:30–01:20 ICT",
      "vietnamMarketRelevance": "Việt Nam là quốc gia nhập khẩu ngô lớn top đầu châu Á (~9–11 triệu tấn/năm) làm thức ăn chăn nuôi, chủ yếu từ Nam Mỹ (Argentina, Brazil). Nhà giao dịch Việt Nam theo dõi ZCE sát sao.",
      "correlationGroup": "GRAINS_COMPLEX",
      "fundamentalDrivers": [
        "Báo cáo diện tích gieo trồng (Prospective Plantings / Acreage) & WASDE của USDA",
        "Sản lượng Ethanol hàng tuần của EIA Mỹ (tiêu thụ ~35–40% sản lượng ngô Mỹ)",
        "Vụ ngô thứ 2 (Safrinha) tại Brazil & xuất khẩu Nam Mỹ/Biển Đen"
      ],
      "seasonalPattern": "Giai đoạn thụ phấn ngô Mỹ (tháng 7) nhạy cảm nhất với nắng nóng và thiếu mưa; áp lực thu hoạch Mỹ tháng 9–11.",
      "fxSensitivity": "Đồng USD tăng gây bất lợi cho xuất khẩu ngô Mỹ cạnh tranh với ngô Brazil/Argentina.",
      "riskNotes": "Báo cáo USDA Prospective Plantings cuối tháng 3 và WASDE hàng tháng (23:00/00:00 ICT) thường tạo biến động cực đại."
    },
    "providerMappings": {
      "alphaVantageFunction": "CORN",
      "alphaVantageNote": "Alpha Vantage CORN cung cấp chuỗi giá ngô tham chiếu hàng ngày (USD/bushel hoặc cents/bushel — kiểm tra metadata đơn vị khi đồng bộ).",
      "twelveDataSymbol": "ZC",
      "fmpSymbol": "ZCUSX",
      "commoditiesApiSymbol": "CORN",
      "usdaCommodity": "CORN",
      "mxvCode": "ZCE"
    }
  },
  "CBOT:ZW": {
    "commodityProfile": {
      "vietnameseName": "Lúa mì",
      "contractMonths": [
        "H",
        "K",
        "N",
        "U",
        "Z"
      ],
      "contractCycleSummary": "Tháng 3 (H), 5 (K), 7 (N), 9 (U), 12 (Z)",
      "deliveryGrade": "No. 2 Soft Red Winter (SRW) Wheat",
      "vietnamTradingSessionsIct": "07:00–19:45 ICT & 20:30–01:20 ICT",
      "vietnamMarketRelevance": "Việt Nam nhập khẩu hàng triệu tấn lúa mì mỗi năm cho chế biến bột mì, mì ăn liền, bánh kẹo và thức ăn thủy sản/chăn nuôi.",
      "correlationGroup": "GRAINS_COMPLEX",
      "fundamentalDrivers": [
        "Giá xuất khẩu lúa mì Nga & tình hình vận chuyển ngũ cốc Biển Đen",
        "Điều kiện lúa mì vụ đông Mỹ (USDA Crop Progress) & khô hạn tại Úc, EU, Canada",
        "Đấu thầu mua lúa mì từ Ai Cập (GASC), Bắc Phi & Đông Nam Á"
      ],
      "seasonalPattern": "Mùa đông phá băng/sinh trưởng (tháng 3–5) ở Bắc Bán Cầu và mùa thu hoạch Úc/Argentina (tháng 11–1).",
      "fxSensitivity": "Rất nhạy với chỉ số DXY & tỷ giá EUR/USD do cạnh tranh xuất khẩu giữa lúa mì Mỹ và EU/Nga.",
      "riskNotes": "Nhạy với tin tức địa chính trị khu vực Biển Đen; hay xuất hiện nến quét thanh khoản đầu phiên Mỹ."
    },
    "providerMappings": {
      "alphaVantageFunction": "WHEAT",
      "alphaVantageNote": "Alpha Vantage WHEAT cung cấp chuỗi giá lúa mì tham chiếu hàng ngày.",
      "twelveDataSymbol": "ZW",
      "fmpSymbol": "ZWUSX",
      "commoditiesApiSymbol": "WHEAT",
      "usdaCommodity": "WHEAT",
      "mxvCode": "ZWA"
    }
  },
  "CBOT:ZR": {
    "commodityProfile": {
      "vietnameseName": "Gạo thô CBOT",
      "contractMonths": [
        "F",
        "H",
        "K",
        "N",
        "U",
        "X"
      ],
      "contractCycleSummary": "Tháng 1 (F), 3 (H), 5 (K), 7 (N), 9 (U), 11 (X)",
      "deliveryGrade": "U.S. No. 2 Long Grain Rough Rice",
      "vietnamTradingSessionsIct": "07:00–19:45 ICT & 20:30–01:20 ICT",
      "vietnamMarketRelevance": "Mặc dù chưa giao dịch đại trà trên MXV, Việt Nam là nước xuất khẩu gạo top 3 thế giới (ĐBSCL). Theo dõi ZR kết hợp chính sách xuất khẩu gạo của Ấn Độ & giá gạo 5% tấm Việt Nam/Thái Lan rất hữu ích cho phân tích nông sản vĩ mô.",
      "correlationGroup": "ASIAN_STAPLES",
      "fundamentalDrivers": [
        "Chính sách hạn chế/thuế xuất khẩu gạo của Ấn Độ",
        "Nhu cầu nhập khẩu từ Philippines, Indonesia & châu Phi đối với gạo Việt Nam/Thái Lan",
        "Vụ Đông Xuân & Hè Thu tại Đồng bằng sông Cửu Long + hiện tượng El Niño/xâm nhập mặn"
      ],
      "seasonalPattern": "Việt Nam thu hoạch vụ Đông Xuân lớn nhất năm vào tháng 2–4; vụ Mỹ thu hoạch tháng 8–10.",
      "fxSensitivity": "Tác động gián tiếp thông qua cạnh tranh giá xuất khẩu USD/tấn FOB Sài Gòn vs Bangkok.",
      "riskNotes": "Thanh khoản hợp đồng ZR trên CBOT thấp hơn ZS/ZC — lưu ý độ giãn Bid/Ask."
    },
    "providerMappings": {
      "twelveDataSymbol": "ZR",
      "commoditiesApiSymbol": "RICE",
      "usdaCommodity": "RICE",
      "mxvCode": "ZRE"
    }
  },
  "COMEX:HG": {
    "commodityProfile": {
      "vietnameseName": "Đồng COMEX",
      "contractMonths": [
        "F",
        "G",
        "H",
        "J",
        "K",
        "M",
        "N",
        "Q",
        "U",
        "V",
        "X",
        "Z"
      ],
      "contractCycleSummary": "Giao dịch tích cực các tháng 3 (H), 5 (K), 7 (N), 9 (U), 12 (Z)",
      "deliveryGrade": "Grade 1 Electrolytic Copper Cathodes (25,000 lbs)",
      "vietnamTradingSessionsIct": "23h/ngày (05:00–04:00 ICT); thanh khoản cao nhất 14:00–00:00 ICT",
      "vietnamMarketRelevance": "Chỉ báo \"Dr. Copper\" cho tăng trưởng công nghiệp & hạ tầng; nguyên liệu đầu vào trực tiếp cho ngành dây cáp điện, linh kiện và xây dựng tại Việt Nam.",
      "correlationGroup": "BASE_METALS",
      "fundamentalDrivers": [
        "PMI sản xuất Trung Quốc, gói kích thích bất động sản/lưới điện Trung Quốc & nhu cầu xe điện/năng lượng tái tạo",
        "Sản lượng khai thác và sự cố đình công tại Chile (Codelco) & Peru",
        "Biến động tồn kho đồng tại LME, COMEX và Thượng Hải (SHFE)"
      ],
      "seasonalPattern": "Nhu cầu sản xuất công nghiệp thường tăng trước cao điểm xây dựng Q2 tại Bắc Bán Cầu.",
      "fxSensitivity": "Tương quan nghịch rõ rệt với chỉ số DXY và tương quan thuận với đồng CNY/CLP.",
      "riskNotes": "Chú ý chênh lệch (Spread) COMEX–LME có thể biến động bất thường khi có tin thuế quan hoặc thiếu hụt kho."
    },
    "providerMappings": {
      "alphaVantageFunction": "COPPER",
      "alphaVantageNote": "Alpha Vantage COPPER trả về giá đồng tham chiếu toàn cầu (USD/metric ton — cần lưu ý khác đơn vị USD/lb của COMEX HG!).",
      "twelveDataSymbol": "HG",
      "fmpSymbol": "HGUSD",
      "commoditiesApiSymbol": "COPPER",
      "mxvCode": "CPE"
    }
  },
  "COMEX:SI": {
    "commodityProfile": {
      "vietnameseName": "Bạc",
      "contractMonths": [
        "F",
        "H",
        "K",
        "N",
        "U",
        "Z"
      ],
      "contractCycleSummary": "Giao dịch chính: Tháng 3 (H), 5 (K), 7 (N), 9 (U), 12 (Z)",
      "deliveryGrade": "Refined Silver min .999 fineness (5,000 troy oz/lô)",
      "vietnamTradingSessionsIct": "05:00–04:00 ICT (biến động mạnh nhất khi tin Mỹ công bố lúc 19:30 / 20:30 ICT)",
      "vietnamMarketRelevance": "Kênh giao dịch kim loại quý hợp pháp phổ biến trên MXV (SIE) giúp nhà đầu tư Việt Nam tiếp cận sóng vàng/bạc quốc tế minh bạch mà không cần nắm giữ vật chất.",
      "correlationGroup": "PRECIOUS_METALS",
      "fundamentalDrivers": [
        "Lãi suất thực Mỹ (TIPS 10Y), kỳ vọng chính sách lãi suất Fed & chỉ số DXY",
        "Tương quan tỷ lệ Vàng/Bạc (Gold/Silver Ratio)",
        "Nhu cầu công nghiệp (tấm pin mặt trời PV, điện tử) & dòng vốn ETF (SLV)"
      ],
      "seasonalPattern": "Thường có động lực tích cực giai đoạn cuối năm và đầu Q1 theo chu kỳ trang sức/trú ẩn.",
      "fxSensitivity": "Rất nhạy với biến động DXY và lợi suất trái phiếu Kho bạc Mỹ kỳ hạn 10 năm.",
      "riskNotes": "Giá trị 1 điểm (1.00 USD) = $5,000 trên hợp đồng chuẩn SI! Tài khoản vốn nhỏ bắt buộc phải kiểm tra khối lượng micro hoặc nâng vốn chủ sở hữu trước khi vào lệnh."
    },
    "providerMappings": {
      "twelveDataSymbol": "XAG/USD",
      "twelveDataNote": "Twelve Data XAG/USD là giá giao ngay (Spot Silver) tính bằng USD/oz — sát với giá tương lai COMEX SI cộng/trừ phí tài trợ kỳ hạn.",
      "fmpSymbol": "SIUSD",
      "commoditiesApiSymbol": "XAG",
      "mxvCode": "SIE"
    }
  },
  "NYMEX:PL": {
    "commodityProfile": {
      "vietnameseName": "Bạch kim",
      "contractMonths": [
        "F",
        "J",
        "N",
        "V"
      ],
      "contractCycleSummary": "Tháng 1 (F), 4 (J), 7 (N), 10 (V)",
      "deliveryGrade": "Min 99.95% pure Platinum (50 troy oz)",
      "vietnamTradingSessionsIct": "05:00–04:00 ICT (sôi động phiên Âu–Mỹ 14:00–00:00 ICT)",
      "vietnamMarketRelevance": "Hợp đồng PLE trên MXV được nhiều trader Việt Nam ưa chuộng vì quy mô 50 oz ($5/tick = $50 mỗi 1 USD) dễ quản lý rủi ro hơn hợp đồng Bạc 5,000 oz.",
      "correlationGroup": "PRECIOUS_METALS",
      "fundamentalDrivers": [
        "Nguồn cung khai thác từ Nam Phi (chiếm >70% toàn cầu, nhạy cảm với khủng hoảng điện Eskom/đình công)",
        "Nhu cầu bộ chuyển đổi xúc tác ô tô (Catalytic Converters) & công nghệ pin nhiên liệu Hydro",
        "Chênh lệch giá Vàng–Bạch kim & tỷ giá USD/ZAR (Rand Nam Phi)"
      ],
      "seasonalPattern": "Thường biến động mạnh trước các đợt chuyển kỳ hạn tháng 1, 4, 7, 10.",
      "fxSensitivity": "Nhạy với DXY và USD/ZAR.",
      "riskNotes": "Thanh khoản thấp hơn Vàng/Bạc trong phiên Á — hạn chế đặt lệnh thị trường (Market Order) đầu buổi sáng ICT."
    },
    "providerMappings": {
      "twelveDataSymbol": "XPT/USD",
      "twelveDataNote": "Twelve Data XPT/USD phản ánh giá Bạch kim giao ngay (USD/oz).",
      "fmpSymbol": "PLUSD",
      "commoditiesApiSymbol": "XPT",
      "mxvCode": "PLE"
    }
  },
  "CME:TIO": {
    "commodityProfile": {
      "vietnameseName": "Quặng sắt 62% Fe",
      "contractMonths": [
        "F",
        "G",
        "H",
        "J",
        "K",
        "M",
        "N",
        "Q",
        "U",
        "V",
        "X",
        "Z"
      ],
      "contractCycleSummary": "12 tháng liên tiếp (tất toán tiền mặt theo chỉ số Platts IODEX 62% Fe CFR China)",
      "deliveryGrade": "62% Fe Iron Ore Fines CFR North China (Cash Settled)",
      "vietnamTradingSessionsIct": "07:00–19:00 ICT (bám sát giờ giao dịch sàn Đại Liên DCE & SGX Singapore)",
      "vietnamMarketRelevance": "Tham chiếu trực tiếp cho ngành thép xây dựng & tôn mạ Việt Nam (chi phí đầu vào quặng sắt, thép thanh Trung Quốc) — tương quan sát với giá thép trong nước.",
      "correlationGroup": "FERROUS_CHINA_CYCLE",
      "fundamentalDrivers": [
        "Sản lượng thép thô Trung Quốc (CISA), tồn kho quặng tại các cảng Trung Quốc & chính sách bất động sản Bắc Kinh",
        "Sản lượng xuất khẩu quặng sắt của Úc (Pilbara - BHP/Rio Tinto/FMG) & Brazil (Vale)",
        "Diễn biến giá quặng sắt & thép thanh trên sàn Đại Liên (DCE) / Thượng Hải (SHFE)"
      ],
      "seasonalPattern": "Mùa bão tại Tây Úc (Q1) thường làm gián đoạn bốc xếp cảng; cao điểm khởi công xây dựng Trung Quốc rơi vào Q2 và Q4.",
      "fxSensitivity": "Nhạy với cặp USD/CNH và AUD/USD.",
      "riskNotes": "Thông số quy mô lô đang ở trạng thái UNVERIFIED — không dùng để tính khối lượng tự động trước khi xác nhận."
    },
    "providerMappings": {
      "mxvCode": null
    }
  },
  "COMEX:GC": {
    "commodityProfile": {
      "vietnameseName": "Vàng COMEX (Tham chiếu quốc tế)",
      "contractMonths": [
        "G",
        "J",
        "M",
        "Q",
        "Z"
      ],
      "contractCycleSummary": "Tháng 2 (G), 4 (J), 6 (M), 8 (Q), 12 (Z)",
      "deliveryGrade": "Refined Gold min 995.0 fineness (100 troy oz/hợp đồng)",
      "vietnamTradingSessionsIct": "05:00–04:00 ICT",
      "vietnamMarketRelevance": "Chưa niêm yết giao dịch phái sinh trên MXV, nhưng GC/XAUUSD là thước đo chuẩn quốc tế để phân tích chênh lệch vàng Việt Nam (SJC/nhẫn 9999) và khẩu vị trú ẩn của dòng tiền toàn cầu.",
      "correlationGroup": "PRECIOUS_METALS",
      "fundamentalDrivers": [
        "Quyết định lãi suất FOMC (Fed), dữ liệu CPI/PCE & Bảng lương phi nông nghiệp Mỹ (NFP)",
        "Lợi suất thực trái phiếu Mỹ 10 năm & nhu cầu mua ròng của các Ngân hàng Trung ương (WGC)",
        "Rủi ro địa chính trị toàn cầu & dòng vốn ETF vàng (GLD)"
      ],
      "seasonalPattern": "Thường tăng nhu cầu vật chất vào mùa cưới Ấn Độ (Q4) và Tết Nguyên Đán châu Á (Q1).",
      "fxSensitivity": "Tương quan nghịch chặt chẽ với chỉ số DXY và lợi suất thực USD.",
      "riskNotes": "Chỉ dùng để phân tích tham chiếu thị trường quốc tế (không phải sản phẩm liên thông MXV)."
    },
    "providerMappings": {
      "twelveDataSymbol": "XAU/USD",
      "twelveDataNote": "Twelve Data XAU/USD là giá Vàng giao ngay (Spot Gold USD/oz).",
      "fmpSymbol": "GCUSD",
      "commoditiesApiSymbol": "XAU",
      "mxvCode": null
    }
  },
  "NYMEX:CL": {
    "commodityProfile": {
      "vietnameseName": "Dầu thô WTI",
      "contractMonths": [
        "F",
        "G",
        "H",
        "J",
        "K",
        "M",
        "N",
        "Q",
        "U",
        "V",
        "X",
        "Z"
      ],
      "contractCycleSummary": "Đáo hạn hàng tháng (12 kỳ hạn/năm; thanh khoản tập trung kỳ hạn gần nhất)",
      "deliveryGrade": "Light Sweet Crude Oil tại Cushing, Oklahoma (1,000 thùng/lô)",
      "vietnamTradingSessionsIct": "05:00–04:00 ICT (cao điểm 21:30 ICT thứ Tư hàng tuần khi công bố tồn kho EIA)",
      "vietnamMarketRelevance": "Hợp đồng năng lượng thanh khoản lớn nhất trên MXV (CLE & Mini WTI), đồng thời tác động trực tiếp đến lạm phát, chi phí vận tải biển và điều hành giá xăng dầu tại Việt Nam.",
      "correlationGroup": "ENERGY_COMPLEX",
      "fundamentalDrivers": [
        "Báo cáo tồn kho dầu thô & xăng chưng cất hàng tuần của EIA Mỹ (21:30/22:30 ICT thứ Tư) & API (03:30/04:30 ICT)",
        "Hạn ngạch cắt giảm/tăng sản lượng của OPEC+ & sản lượng dầu đá phiến Mỹ",
        "Rủi ro gián đoạn nguồn cung Trung Đông / Biển Đỏ & nhu cầu lọc dầu Trung Quốc"
      ],
      "seasonalPattern": "Mùa lái xe mùa hè Mỹ (tháng 5–8) và mùa bảo dưỡng nhà máy lọc dầu (Q1 & Q4).",
      "fxSensitivity": "Định giá USD; USD tăng mạnh thường kìm hãm đà tăng giá dầu.",
      "riskNotes": "Chú ý ngày hết hạn hợp đồng tháng gần (Rollover) của WTI vì có rủi ro giao nhận vật chất tại Cushing — đa số broker MXV yêu cầu tất toán trước 2–3 ngày."
    },
    "providerMappings": {
      "alphaVantageFunction": "WTI",
      "alphaVantageNote": "Alpha Vantage WTI cung cấp giá WTI Spot/Benchmark hàng ngày của EIA/DOE (USD/thùng).",
      "twelveDataSymbol": "CL",
      "fmpSymbol": "CLUSD",
      "commoditiesApiSymbol": "WTI",
      "eiaSeriesType": "WTI",
      "mxvCode": null
    }
  },
  "ICE:BRN": {
    "commodityProfile": {
      "vietnameseName": "Dầu thô Brent",
      "contractMonths": [
        "F",
        "G",
        "H",
        "J",
        "K",
        "M",
        "N",
        "Q",
        "U",
        "V",
        "X",
        "Z"
      ],
      "contractCycleSummary": "12 tháng liên tiếp (Cash Settled)",
      "deliveryGrade": "Brent-Forties-Oseberg-Ekofisk-Troll (BFOET) Bắc Hải",
      "vietnamTradingSessionsIct": "07:00–05:00 ICT (mở cửa sớm phiên Á phục vụ thị trường châu Á)",
      "vietnamMarketRelevance": "Chuẩn định giá trực tiếp cho dầu thô xuất khẩu của Việt Nam (Bạch Hổ) và nguyên liệu đầu vào các nhà máy lọc dầu Dung Quất, Nghi Sơn.",
      "correlationGroup": "ENERGY_COMPLEX",
      "fundamentalDrivers": [
        "Chính sách sản lượng OPEC+, xung đột địa chính trị vùng Vịnh/Nga",
        "Biên lợi nhuận lọc dầu châu Á–Âu (Crack Spreads) & tồn kho nổi trên biển",
        "Chênh lệch giá Brent–WTI Spread (phản ánh nhu cầu xuất khẩu dầu thô Mỹ sang châu Âu/Á)"
      ],
      "seasonalPattern": "Nhu cầu lọc dầu tăng trước mùa hè Bắc Bán Cầu và nhu cầu dầu sưởi mùa đông.",
      "fxSensitivity": "Tương quan nghịch với USD/DXY; tác động trực tiếp đến cán cân thương mại năng lượng châu Á.",
      "riskNotes": "Chú ý Brent kỳ hạn giao dịch trước WTI 1 tháng (ví dụ hợp đồng tháng mới mở trước sớm hơn)."
    },
    "providerMappings": {
      "alphaVantageFunction": "BRENT",
      "alphaVantageNote": "Alpha Vantage BRENT cung cấp giá dầu Brent Spot hàng ngày (USD/thùng).",
      "twelveDataSymbol": "BRN",
      "fmpSymbol": "BZUSD",
      "commoditiesApiSymbol": "BRENT",
      "eiaSeriesType": "BRENT",
      "mxvCode": null
    }
  },
  "NYMEX:NG": {
    "commodityProfile": {
      "vietnameseName": "Khí tự nhiên (Henry Hub)",
      "contractMonths": [
        "F",
        "G",
        "H",
        "J",
        "K",
        "M",
        "N",
        "Q",
        "U",
        "V",
        "X",
        "Z"
      ],
      "contractCycleSummary": "12 tháng liên tiếp (mùa đông các tháng 11–3 thường có mức giá cao hơn)",
      "deliveryGrade": "Henry Hub Natural Gas (Erath, Louisiana, 10,000 MMBtu)",
      "vietnamTradingSessionsIct": "05:00–04:00 ICT (biến động cực mạnh thứ Năm lúc 21:30/22:30 ICT khi EIA ra báo cáo tồn kho khí)",
      "vietnamMarketRelevance": "Tham chiếu cho thị trường khí hóa lỏng LNG nhập khẩu cho điện khí tại Việt Nam và là sản phẩm biên độ lớn phổ biến với trader lướt sóng/swing trên MXV (NGE).",
      "correlationGroup": "ENERGY_GAS",
      "fundamentalDrivers": [
        "Báo cáo tồn kho khí ngầm hàng tuần của EIA Mỹ (thứ Năm hàng tuần)",
        "Dự báo nhiệt độ 6–14 ngày của NOAA Mỹ (HDD mùa đông & CDD điều hòa mùa hè)",
        "Lưu lượng khí hóa lỏng xuất khẩu LNG tại Mỹ (Freeport, Sabine Pass)"
      ],
      "seasonalPattern": "Mùa bơm khí vào kho (Injection: tháng 4–10) và mùa rút khí sưởi ấm (Withdrawal: tháng 11–3).",
      "fxSensitivity": "Ít phụ thuộc vào DXY hơn vàng/dầu; 80% dẫn dắt bởi thời tiết Mỹ và cân bằng cung cầu nội địa/LNG.",
      "riskNotes": "Khí tự nhiên có ATR% cao nhất nhóm hàng hóa cơ bản. Cần quản trị rủi ro cực kỳ chặt và tránh giữ lệnh qua báo cáo EIA thứ Năm nếu stop hẹp."
    },
    "providerMappings": {
      "alphaVantageFunction": "NATURAL_GAS",
      "alphaVantageNote": "Alpha Vantage NATURAL_GAS cung cấp giá khí Henry Hub hàng ngày (USD/MMBtu).",
      "twelveDataSymbol": "NG",
      "fmpSymbol": "NGUSD",
      "commoditiesApiSymbol": "NG",
      "eiaSeriesType": "NATURAL_GAS",
      "mxvCode": null
    }
  }
};

/**
 * Instruments the owner added that are not in the verified master. Kept fail-closed: specification
 * and MXV mapping stay UNVERIFIED with null size/tick until confirmed on an official MXV/OSE source.
 */
export const OWNER_ADDED_INSTRUMENTS: InstrumentDefinition[] = [
  {
    "id": "MXV:JRU",
    "productName": "Rubber RSS3",
    "category": "SOFT_COMMODITIES",
    "exchange": "MXV",
    "exchangeSymbol": "JRU",
    "contractMonth": null,
    "contractYear": null,
    "isMvxListed": true,
    "specification": {
      "contractSize": 5000,
      "contractSizeUnit": "kg (5 tons/lot per MXV)",
      "minimumTickSize": 0.1,
      "tickValue": 500,
      "tradingCurrency": "JPY",
      "quotationUnit": "JPY/kg",
      "expirationDate": null,
      "firstNoticeDate": null,
      "tradingHoursTimezone": "Asia/Ho_Chi_Minh",
      "tradingHoursSummary": "MXV page (timezone not stated on page, assumed Vietnam time): Mon-Fri session 1 07:00-13:45, session 2 15:00-17:00",
      "marginRequirement": null,
      "marginCurrency": null,
      "settlementMethod": "PHYSICAL",
      "dataSource": "https://en.mxv.com.vn/product/softs-and-other-raw-material/rss3-rubber.html (retrieved 2026-11-23; size/tick/currency/hours/series/LTD confirmed; MXV code on that page is TRU, not JRU; tickValue = 5000 kg x 0.1 JPY/kg = 500 JPY, in JPY not USD)",
      "verificationStatus": "UNVERIFIED"
    },
    "mxvMapping": {
      "mxvSymbol": "JRU",
      "internationalSymbol": "JRU",
      "internationalExchange": "MXV",
      "mappingStatus": "UNVERIFIED",
      "notes": "MXV official page lists OSE RSS3 Rubber under commodity code TRU (e.g. TRUZ26), not JRU; symbol JRU unconfirmed (checked 2026-11-23). Cao su RSS3 liên thông OSE (Nhật Bản) qua MXV niêm yết bằng JPY/kg. Risk Engine yêu cầu xác minh quy tắc quy đổi lô & tỷ giá JPY/VND trước khi tính khối lượng tự động."
    },
    "commodityProfile": {
      "vietnameseName": "Cao su RSS3",
      "contractMonths": [
        "F",
        "G",
        "H",
        "J",
        "K",
        "M",
        "N",
        "Q",
        "U",
        "V",
        "X",
        "Z"
      ],
      "contractCycleSummary": "12 tháng gần nhất (theo trang MXV OSE RSS3 Rubber, 2026-11-23)",
      "deliveryGrade": "Ribbed Smoked Sheet No. 3 (RSS3) tiêu chuẩn quốc tế",
      "vietnamTradingSessionsIct": "Phiên Á 07:00–13:15 ICT · Phiên đêm 14:30–03:30 ICT",
      "vietnamMarketRelevance": "Việt Nam thuộc top 3 nước xuất khẩu cao su thiên nhiên lớn nhất thế giới (Bình Phước, Tây Ninh, Bình Dương, Gia Lai). Công cụ phòng hộ giá trực tiếp cho doanh nghiệp chế biến và xuất khẩu cao su Việt Nam.",
      "correlationGroup": "VIETNAM_KEY_EXPORTS",
      "fundamentalDrivers": [
        "Nhu cầu sản xuất lốp xe từ Trung Quốc (chỉ số PMI sản xuất & tồn kho tại Thanh Đảo/SHFE)",
        "Mùa rụng lá (Wintering season) tại Thái Lan, Indonesia, Việt Nam (tháng 2–5)",
        "Giá dầu thô (ảnh hưởng chi phí sản xuất cao su tổng hợp)",
        "Tỷ giá USD/JPY (hợp đồng OSE định giá bằng Yên Nhật)"
      ],
      "seasonalPattern": "Nguồn cung thu hẹp mạnh vào mùa cây cao su thay lá (tháng 2–5) và cao điểm khai thác mủ tại Đông Nam Á từ tháng 8–12.",
      "fxSensitivity": "Chịu tác động kép từ USD/JPY và JPY/VND khi tất toán tài khoản MXV.",
      "riskNotes": "Chú ý rủi ro tỷ giá JPY/VND và thanh khoản thấp ở các kỳ hạn quá gần ngày đáo hạn."
    },
    "providerMappings": {
      "mxvCode": "JRU"
    },
    "enabled": true
  }
];
