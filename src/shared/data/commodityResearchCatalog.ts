export interface SupplyDemandBlueprintItem {
  id: string;
  label: string;
  labelVi: string;
  unit: string;
  datasetKeywords: string[];
  sourceHint: string;
  bullishWhen: string;
}

const CORN_SD: SupplyDemandBlueprintItem[] = [
  {
    id: 'usda_wasde_ending_stocks',
    label: 'USDA WASDE Ending Stocks',
    labelVi: 'Tồn kho cuối kỳ USDA WASDE',
    unit: 'Million Bushels / MT',
    datasetKeywords: ['CORN', 'WASDE', 'ENDING_STOCKS', 'ZC'],
    sourceHint: 'USDA WASDE Monthly',
    bullishWhen: 'Giảm hoặc thấp hơn dự báo đồng thuận thị trường',
  },
  {
    id: 'ethanol_demand',
    label: 'US Ethanol Grind & Stocks',
    labelVi: 'Sản lượng sản xuất Ethanol Mỹ',
    unit: '000 bbl/day',
    datasetKeywords: ['ETHANOL', 'EIA_ETHANOL'],
    sourceHint: 'EIA Weekly Petroleum/Ethanol',
    bullishWhen: 'Sản lượng nghiền ngô cho Ethanol duy trì trên mức bình quân 5 năm',
  },
  {
    id: 'brazil_safrinha',
    label: 'Brazil Safrinha & CONAB Crop',
    labelVi: 'Mùa vụ Safrinha Brazil (CONAB)',
    unit: 'Million MT',
    datasetKeywords: ['CONAB', 'SAFRINHA', 'BRAZIL_CORN'],
    sourceHint: 'CONAB Brazil / USDA Brazil',
    bullishWhen: 'Khô hạn giai đoạn thụ phấn làm giảm ước tính sản lượng',
  },
  {
    id: 'us_export_sales',
    label: 'US Weekly Export Inspections',
    labelVi: 'Doanh số xuất khẩu ngô Mỹ',
    unit: '000 MT/week',
    datasetKeywords: ['CORN_EXPORT', 'EXPORT_SALES'],
    sourceHint: 'USDA FAS Weekly Exports',
    bullishWhen: 'Tăng tốc vượt tiến độ trung bình mùa vụ',
  },
  {
    id: 'fertilizer_crush_cost',
    label: 'Input & Production Cost Floor',
    labelVi: 'Chi phí phân bón & giá hòa vốn',
    unit: 'USD/bushel',
    datasetKeywords: ['CORN_COST', 'UREA', 'FERTILIZER'],
    sourceHint: 'USDA ERS Cost of Production',
    bullishWhen: 'Giá thị trường rơi xuống vùng chi phí sản xuất cận biên',
  },
];

const SOY_COMPLEX_SD: SupplyDemandBlueprintItem[] = [
  {
    id: 'soy_crush_margin',
    label: 'NOPA Soy Crush & Board Margin',
    labelVi: 'Biên lợi nhuận ép dầu (Crush Margin)',
    unit: 'USD/bushel',
    datasetKeywords: ['CRUSH', 'NOPA', 'SOYBEAN'],
    sourceHint: 'NOPA Monthly Crush / CME',
    bullishWhen: 'Crush spread mở rộng kích thích nhu cầu thu mua hạt đậu tương',
  },
  {
    id: 'south_america_harvest',
    label: 'Brazil & Argentina Soybean Crop',
    labelVi: 'Sản lượng Nam Mỹ (Brazil & Argentina)',
    unit: 'Million MT',
    datasetKeywords: ['BRAZIL_SOY', 'ARGENTINA_SOY', 'CONAB'],
    sourceHint: 'CONAB / Bolsa de Cereales / WASDE',
    bullishWhen: 'La Niña hoặc khô hạn cắt giảm ước tính thu hoạch',
  },
  {
    id: 'china_soy_imports',
    label: 'China Port Arrivals & Hog Herd',
    labelVi: 'Nhập khẩu Trung Quốc & Đàn lợn',
    unit: 'Million MT',
    datasetKeywords: ['CHINA_SOY', 'PORK', 'SOY_IMPORT'],
    sourceHint: 'China Customs / USDA FAS',
    bullishWhen: 'Tồn kho cảng Trung Quốc giảm và nhu cầu khô đậu phục hồi',
  },
  {
    id: 'biodiesel_rvo',
    label: 'Renewable Diesel / Biodiesel Demand',
    labelVi: 'Nhu cầu nhiên liệu sinh học (Biodiesel)',
    unit: 'Million Gallons',
    datasetKeywords: ['BIODIESEL', 'RVO', 'SOYOIL'],
    sourceHint: 'US EPA RFS / EIA Biofuels',
    bullishWhen: 'Tăng tỷ lệ pha trộn dầu thực vật',
  },
  {
    id: 'stocks_to_use',
    label: 'Global Stocks-to-Use Ratio',
    labelVi: 'Tỷ lệ Tồn kho / Tiêu thụ toàn cầu',
    unit: '%',
    datasetKeywords: ['WASDE', 'SOY', 'STOCKS_TO_USE'],
    sourceHint: 'USDA WASDE',
    bullishWhen: 'Tỷ lệ thu hẹp về vùng thắt chặt nguồn cung',
  },
];

const WHEAT_RICE_SD: SupplyDemandBlueprintItem[] = [
  {
    id: 'black_sea_corridor',
    label: 'Black Sea & Major Exporter Stocks',
    labelVi: 'Tồn kho các nước xuất khẩu & Biển Đen',
    unit: 'Million MT',
    datasetKeywords: ['WHEAT', 'RICE', 'BLACK_SEA', 'EXPORT'],
    sourceHint: 'USDA WASDE / IGC / FAO',
    bullishWhen: 'Gián đoạn vận tải hoặc thu hẹp tồn kho tại khu vực xuất khẩu chính',
  },
  {
    id: 'drought_crop_condition',
    label: 'Winter/Spring Crop Good-Excellent %',
    labelVi: 'Chất lượng mùa vụ (Good/Excellent)',
    unit: '%',
    datasetKeywords: ['CROP_PROGRESS', 'WINTER_WHEAT', 'RICE_CROP'],
    sourceHint: 'USDA NASS / MARD VN',
    bullishWhen: 'Tỷ lệ cây trồng tốt sụt giảm do hạn hán hoặc sương giá',
  },
  {
    id: 'india_export_policy',
    label: 'Asian Export Policy (India/VN/Thai)',
    labelVi: 'Chính sách xuất khẩu Ấn Độ & ĐNA',
    unit: 'Policy / MT',
    datasetKeywords: ['INDIA_RICE', 'VN_RICE', 'EXPORT_BAN'],
    sourceHint: 'FAO / VFA / India DGFT',
    bullishWhen: 'Siết hạn ngạch hoặc áp thuế tối thiểu',
  },
  {
    id: 'global_import_tenders',
    label: 'Sovereign Import Tenders (GASC/PH/ID)',
    labelVi: 'Nhu cầu đấu thầu nhập khẩu quốc gia',
    unit: '000 MT',
    datasetKeywords: ['TENDER', 'GASC', 'BULOG'],
    sourceHint: 'Trade Tender Bulletins',
    bullishWhen: 'Khối lượng mua dự trữ lương thực tăng đột biến',
  },
];

const COFFEE_SD: SupplyDemandBlueprintItem[] = [
  {
    id: 'ice_certified_stocks',
    label: 'ICE Certified Warehouse Stocks',
    labelVi: 'Tồn kho đạt chuẩn sàn ICE',
    unit: 'Bags / Lots',
    datasetKeywords: ['ICE_COFFEE', 'CERTIFIED_STOCKS', 'ROBUSTA_STOCKS', 'ARABICA_STOCKS'],
    sourceHint: 'ICE Futures Europe / US Daily',
    bullishWhen: 'Tồn kho rút liên tục về vùng thấp kỷ lục nhiều năm',
  },
  {
    id: 'vietnam_customs_export',
    label: 'Vietnam Coffee Export Volume',
    labelVi: 'Xuất khẩu cà phê Việt Nam (Tây Nguyên)',
    unit: '000 MT',
    datasetKeywords: ['VN_COFFEE', 'VICOFA', 'ROBUSTA_EXPORT'],
    sourceHint: 'Tổng cục Hải quan VN / VICOFA',
    bullishWhen: 'Lượng hàng giao cảng thắt chặt cuối vụ trước tháng 10',
  },
  {
    id: 'brazil_conab_weather',
    label: 'Brazil Conab Estimate & Frost/Drought',
    labelVi: 'Mùa vụ Brazil (CONAB) & Khô hạn',
    unit: 'Million Bags',
    datasetKeywords: ['CONAB', 'BRAZIL_COFFEE', 'MINAS_GERAIS'],
    sourceHint: 'CONAB / Somar / ICO',
    bullishWhen: 'Nhiệt độ cao/hạn hán giai đoạn phân hóa mầm hoa',
  },
  {
    id: 'kc_rc_arbitrage',
    label: 'Arabica–Robusta Quality Arbitrage',
    labelVi: 'Chênh lệch KC–RC & Nhu cầu rang xay',
    unit: 'USD/MT equiv',
    datasetKeywords: ['ARBITRAGE', 'ICO', 'COFFEE_DEMAND'],
    sourceHint: 'ICO / European Coffee Federation',
    bullishWhen: 'Nhu cầu phối trộn tăng hoặc thiếu hụt hàng giao ngay',
  },
];

const SOFT_INDUSTRIAL_SD: SupplyDemandBlueprintItem[] = [
  {
    id: 'region_crush_yield',
    label: 'Primary Producer Output / Harvest',
    labelVi: 'Sản lượng thu hoạch vùng trọng điểm',
    unit: 'MT / Bales',
    datasetKeywords: ['UNICA', 'COCOA', 'COTTON', 'RUBBER', 'SUGAR'],
    sourceHint: 'UNICA / ICCO / USDA / ANRPC',
    bullishWhen: 'Sản lượng thu hoạch thấp hơn kỳ vọng do thời tiết cực đoan',
  },
  {
    id: 'grindings_mill_demand',
    label: 'Industrial Processing / Mill Demand',
    labelVi: 'Nhu cầu nghiền / Dệt may / Sản xuất lốp',
    unit: '% YoY / MT',
    datasetKeywords: ['GRINDINGS', 'TEXTILE', 'TIRE', 'DEMAND'],
    sourceHint: 'ECA / CAA / ANRPC / USDA',
    bullishWhen: 'Tốc độ tiêu thụ phục hồi bất chấp tồn kho thấp',
  },
  {
    id: 'global_deficit_surplus',
    label: 'Global Supply Balance (Deficit/Surplus)',
    labelVi: 'Cán cân Cung – Cầu toàn cầu',
    unit: '000 MT',
    datasetKeywords: ['BALANCE', 'DEFICIT', 'SURPLUS', 'ICCO', 'ISO'],
    sourceHint: 'ISO / ICCO / ICAC / IRSG',
    bullishWhen: 'Chuyển từ dư cung sang thâm hụt cơ cấu',
  },
  {
    id: 'origin_fx_logistics',
    label: 'Origin FX & Container Logistics',
    labelVi: 'Tỷ giá nước xuất khẩu & Chi phí vận tải',
    unit: 'Index / FX',
    datasetKeywords: ['USDBRL', 'USDVND', 'FREIGHT'],
    sourceHint: 'Central Banks / Freightos',
    bullishWhen: 'Đồng nội tệ nước sản xuất mạnh lên làm chậm bán ra',
  },
];

const ENERGY_CRUDE_SD: SupplyDemandBlueprintItem[] = [
  {
    id: 'eia_crude_inventories',
    label: 'US EIA Crude & Cushing Inventories',
    labelVi: 'Tồn kho dầu thô Mỹ & Điểm giao Cushing',
    unit: 'Million Barrels',
    datasetKeywords: ['EIA_CRUDE', 'CUSHING', 'PETROLEUM'],
    sourceHint: 'U.S. EIA Weekly Petroleum Status',
    bullishWhen: 'Tồn kho rút mạnh hơn dự báo trong mùa lái xe/bảo dưỡng',
  },
  {
    id: 'opec_compliance',
    label: 'OPEC+ Quotas & Spare Capacity',
    labelVi: 'Sản lượng OPEC+ & Công suất dự phòng',
    unit: 'Million bbl/day',
    datasetKeywords: ['OPEC', 'CRUDE_SUPPLY'],
    sourceHint: 'OPEC MOMR / IEA Oil Market Report',
    bullishWhen: 'Gia hạn cắt giảm sản lượng và tuân thủ hạn ngạch cao',
  },
  {
    id: 'refinery_crack_spread',
    label: 'Refinery Utilization & 3-2-1 Crack',
    labelVi: 'Công suất lọc dầu & Biên lợi nhuận Crack',
    unit: '% / USD/bbl',
    datasetKeywords: ['REFINERY', 'CRACK_SPREAD'],
    sourceHint: 'EIA / Crack Benchmark',
    bullishWhen: 'Biên lọc dầu tăng kéo nhu cầu dầu thô đầu vào',
  },
  {
    id: 'brent_wti_curve',
    label: 'Term Structure (Backwardation/Contango)',
    labelVi: 'Cấu trúc kỳ hạn (Bù hoãn bán / Bù hoãn mua)',
    unit: 'USD/bbl',
    datasetKeywords: ['SPREAD', 'BACKWARDATION'],
    sourceHint: 'NYMEX / ICE Settlements',
    bullishWhen: 'Thị trường giao ngay thắt chặt đẩy kỳ hạn gần cao hơn kỳ hạn xa',
  },
];

const NATGAS_SD: SupplyDemandBlueprintItem[] = [
  {
    id: 'eia_ng_storage',
    label: 'EIA Weekly Natural Gas Storage',
    labelVi: 'Tồn kho khí đốt ngầm EIA (So với TB 5 năm)',
    unit: 'Bcf',
    datasetKeywords: ['EIA_NATGAS', 'NG_STORAGE', 'BCF'],
    sourceHint: 'U.S. EIA Weekly Natural Gas Storage',
    bullishWhen: 'Rút kho lớn hơn TB 5 năm hoặc bơm kho thấp kỷ lục',
  },
  {
    id: 'lng_feedgas_exports',
    label: 'US LNG Feedgas & EU Storage %',
    labelVi: 'Xuất khẩu LNG & Dự trữ khí châu Âu',
    unit: 'Bcf/d / %',
    datasetKeywords: ['LNG', 'EU_GAS'],
    sourceHint: 'EIA / AGSI+',
    bullishWhen: 'Lưu lượng cấp cho trạm LNG đạt công suất tối đa',
  },
  {
    id: 'hdd_cdd_weather',
    label: 'HDD / CDD Heating & Cooling Degree Days',
    labelVi: 'Dự báo thời tiết (Độ ngày sưởi ấm/làm mát)',
    unit: 'Degree Days',
    datasetKeywords: ['HDD', 'CDD', 'WEATHER_GAS'],
    sourceHint: 'NOAA CPC 6-14 Day Outlook',
    bullishWhen: 'Không khí lạnh sâu mùa đông hoặc nắng nóng mùa hè',
  },
  {
    id: 'dry_gas_rig_count',
    label: 'Dry Gas Production & Baker Hughes Rigs',
    labelVi: 'Sản lượng khai thác & Số giàn khoan khí',
    unit: 'Bcf/d / Rigs',
    datasetKeywords: ['GAS_PROD', 'RIG_COUNT'],
    sourceHint: 'EIA / Baker Hughes',
    bullishWhen: 'Nhà sản xuất cắt giảm giàn khoan khi giá dưới chi phí biên',
  },
];

const PRECIOUS_METALS_SD: SupplyDemandBlueprintItem[] = [
  {
    id: 'real_yields_tips',
    label: 'US Real Yield (10Y TIPS) & Fed Path',
    labelVi: 'Lợi suất thực Mỹ 10 năm & Chu kỳ lãi suất Fed',
    unit: '%',
    datasetKeywords: ['REAL_YIELD', 'TIPS', 'FED_FUNDS', 'US_10Y'],
    sourceHint: 'US Treasury / FRED',
    bullishWhen: 'Lợi suất thực tạo đỉnh và kỳ vọng nới lỏng tiền tệ gia tăng',
  },
  {
    id: 'central_bank_buying',
    label: 'Central Bank Official Sector Purchases',
    labelVi: 'Nhu cầu mua ròng của Ngân hàng Trung ương',
    unit: 'Tonnes / Quarter',
    datasetKeywords: ['CENTRAL_BANK_GOLD', 'WGC'],
    sourceHint: 'World Gold Council / IMF',
    bullishWhen: 'Ngân hàng Trung ương duy trì tích trữ dự trữ ngoại hối',
  },
  {
    id: 'etf_physical_flows',
    label: 'Physical ETF Holdings & COMEX Vaults',
    labelVi: 'Dòng vốn quỹ ETF vật chất & Kho COMEX',
    unit: 'Million Oz / Tonnes',
    datasetKeywords: ['GOLD_ETF', 'SILVER_ETF', 'COMEX_VAULT'],
    sourceHint: 'WGC / CME Registrar',
    bullishWhen: 'Dòng tiền ETF đảo chiều mua ròng sau giai đoạn rút vốn',
  },
  {
    id: 'industrial_solar_auto',
    label: 'Industrial / Solar / Auto Catalyst Demand',
    labelVi: 'Nhu cầu công nghiệp (Điện mặt trời / Xúc tác)',
    unit: 'Million Oz',
    datasetKeywords: ['SOLAR_SILVER', 'PLATINUM_AUTO', 'JM_PGM'],
    sourceHint: 'Silver Institute / WPIC',
    bullishWhen: 'Thâm hụt nguồn cung vật chất kéo dài nhiều năm',
  },
];

const BASE_METALS_SD: SupplyDemandBlueprintItem[] = [
  {
    id: 'china_pmi_credit',
    label: 'China Manufacturing PMI & Grid Spend',
    labelVi: 'PMI sản xuất Trung Quốc & Đầu tư lưới điện',
    unit: 'Index / YoY %',
    datasetKeywords: ['CHINA_PMI', 'COPPER_DEMAND', 'STEEL_PMI'],
    sourceHint: 'NBS China / Caixin',
    bullishWhen: 'PMI vượt mốc 50 kèm gói kích thích hạ tầng/năng lượng sạch',
  },
  {
    id: 'lme_shfe_comex_stocks',
    label: 'Global Exchange Visible Stocks (LME/SHFE/COMEX)',
    labelVi: 'Tồn kho hiển thị tại LME, SHFE & COMEX',
    unit: '000 MT',
    datasetKeywords: ['LME_STOCKS', 'SHFE_STOCKS', 'COPPER_STOCKS'],
    sourceHint: 'LME / SHFE / COMEX',
    bullishWhen: 'Tồn kho xuống vùng nguy hiểm kèm phí giao ngay (Yangshan premium) tăng',
  },
  {
    id: 'mine_tc_rc_disruptions',
    label: 'Mine Disruptions & Smelter TC/RC Charges',
    labelVi: 'Gián đoạn mỏ & Phí luyện quặng TC/RC',
    unit: 'USD/MT',
    datasetKeywords: ['TC_RC', 'MINE_SUPPLY', 'CHILE_COPPER', 'IRON_ORE_SHIP'],
    sourceHint: 'ICSG / Cochilco / Port Hedland',
    bullishWhen: 'Phí TC/RC sụt giảm mạnh phản ánh thiếu hụt tinh quặng đầu vào',
  },
  {
    id: 'steel_margin_blast_furnace',
    label: 'Downstream Utilization / Steel Margin',
    labelVi: 'Biên lợi nhuận nhà máy & Công suất lò cao',
    unit: '% / CNY/MT',
    datasetKeywords: ['BLAST_FURNACE', 'STEEL_MARGIN'],
    sourceHint: 'Mysteel / CISA',
    bullishWhen: 'Tái tích trữ tồn kho nguyên liệu khi biên lợi nhuận phục hồi',
  },
];

export function getTailoredSupplyDemandBlueprint(symbol: string): SupplyDemandBlueprintItem[] {
  const s = symbol.trim().toUpperCase();
  if (s === 'CBOT:ZC' || s === 'ZC') return CORN_SD;
  if (s === 'CBOT:ZS' || s === 'ZS' || s === 'CBOT:ZM' || s === 'ZM' || s === 'CBOT:ZL' || s === 'ZL') {
    return SOY_COMPLEX_SD;
  }
  if (s === 'CBOT:ZW' || s === 'ZW' || s === 'CBOT:ZR' || s === 'ZR') return WHEAT_RICE_SD;
  if (s === 'ICE:RC' || s === 'RC' || s === 'ICE:KC' || s === 'KC') return COFFEE_SD;
  if (s === 'ICE:SB' || s === 'SB' || s === 'ICE:CC' || s === 'CC' || s === 'ICE:CT' || s === 'CT' || s === 'MXV:JRU' || s === 'JRU') {
    return SOFT_INDUSTRIAL_SD;
  }
  if (s === 'NYMEX:CL' || s === 'CL' || s === 'ICE:BRN' || s === 'BRN') return ENERGY_CRUDE_SD;
  if (s === 'NYMEX:NG' || s === 'NG') return NATGAS_SD;
  if (s === 'COMEX:GC' || s === 'GC' || s === 'COMEX:SI' || s === 'SI' || s === 'NYMEX:PL' || s === 'PL') {
    return PRECIOUS_METALS_SD;
  }
  if (s === 'COMEX:HG' || s === 'HG' || s === 'CME:TIO' || s === 'TIO') return BASE_METALS_SD;
  return SOFT_INDUSTRIAL_SD;
}
