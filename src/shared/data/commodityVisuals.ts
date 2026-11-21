import type { ProductCategory } from '../types/instrument';

const WEBP_URLS = import.meta.glob('../../assets/images/commodity_*.webp', {
  eager: true,
  query: '?url',
  import: 'default',
}) as Record<string, string>;

/** Resolve a bundled WebP (hashed URL in production builds). */
function webp(name: string): string {
  return WEBP_URLS[`../../assets/images/${name}.webp`] ?? `/src/assets/images/${name}.webp`;
}

/** Intrinsic size of the generated WebP images (16:9-ish), used to avoid layout shift. */
export const COMMODITY_IMAGE_WIDTH = 1376;
export const COMMODITY_IMAGE_HEIGHT = 768;

export interface CommodityVisualAsset {
  symbol: string;
  nameVi: string;
  groupVi: string;
  category: ProductCategory;
  imageUrl: string;
  imageAlt: string;
  accentHex: string;
  originTag: string;
}

export const COMMODITY_GROUP_LABELS_VI: Record<ProductCategory | 'ALL', string> = {
  ALL: 'Tất cả (20)',
  AGRICULTURE: 'Nông sản',
  SOFT_COMMODITIES: 'Nguyên liệu CN',
  METALS: 'Kim loại',
  ENERGY: 'Năng lượng',
};

/**
 * Each of the 20 commodities in MERGED_INSTRUMENTS maps strictly to its own unique
 * generated 16:9 domain photograph under /src/assets/images/ (zero shared stock images).
 */
export const COMMODITY_VISUALS: Record<string, CommodityVisualAsset> = {
  'CBOT:ZC': {
    symbol: 'CBOT:ZC',
    nameVi: 'Ngô',
    groupVi: 'Nông sản',
    category: 'AGRICULTURE',
    imageUrl: webp('commodity_corn_zc_1795004527595'),
    imageAlt: 'Cánh đồng ngô vàng chín rộ dưới nắng chiều',
    accentHex: '#F59E0B',
    originTag: 'US Midwest · Brazil · MXV ZCE',
  },
  'CBOT:ZS': {
    symbol: 'CBOT:ZS',
    nameVi: 'Đậu tương',
    groupVi: 'Nông sản',
    category: 'AGRICULTURE',
    imageUrl: webp('commodity_soybean_zs_1795004528866'),
    imageAlt: 'Cánh đồng đậu tương và hạt đậu tương thu hoạch',
    accentHex: '#EAB308',
    originTag: 'US · Brazil · Argentina · MXV ZSE',
  },
  'CBOT:ZM': {
    symbol: 'CBOT:ZM',
    nameVi: 'Khô đậu tương',
    groupVi: 'Nông sản',
    category: 'AGRICULTURE',
    imageUrl: webp('commodity_soymeal_zm_1795004528393'),
    imageAlt: 'Khô đậu tương chế biến làm thức ăn chăn nuôi',
    accentHex: '#D97706',
    originTag: 'Thức ăn chăn nuôi VN · MXV ZME',
  },
  'CBOT:ZL': {
    symbol: 'CBOT:ZL',
    nameVi: 'Dầu đậu tương',
    groupVi: 'Nông sản',
    category: 'AGRICULTURE',
    imageUrl: webp('commodity_soyoil_zl_1795004528523'),
    imageAlt: 'Dầu đậu tương tinh luyện ánh vàng hổ phách',
    accentHex: '#CA8A04',
    originTag: 'Dầu thực vật & Biodiesel · MXV ZLE',
  },
  'CBOT:ZW': {
    symbol: 'CBOT:ZW',
    nameVi: 'Lúa mì',
    groupVi: 'Nông sản',
    category: 'AGRICULTURE',
    imageUrl: webp('commodity_wheat_zw_1795004530168'),
    imageAlt: 'Cánh đồng lúa mì vàng óng mùa thu hoạch',
    accentHex: '#F59E0B',
    originTag: 'Biển Đen · US Plains · MXV ZWA',
  },
  'CBOT:ZR': {
    symbol: 'CBOT:ZR',
    nameVi: 'Gạo thô',
    groupVi: 'Nông sản',
    category: 'AGRICULTURE',
    imageUrl: webp('commodity_rice_zr_1795004529547'),
    imageAlt: 'Ruộng lúa bậc thang vàng chín ở Đông Nam Á',
    accentHex: '#C9B58A',
    originTag: 'ĐBSCL Việt Nam · Thái Lan · Ấn Độ',
  },
  'ICE:KC': {
    symbol: 'ICE:KC',
    nameVi: 'Cà phê Arabica',
    groupVi: 'Nguyên liệu CN',
    category: 'SOFT_COMMODITIES',
    imageUrl: webp('commodity_arabica_kc_1795004530565'),
    imageAlt: 'Vườn cà phê Arabica quả chín đỏ vùng cao nguyên',
    accentHex: '#E3A9C8',
    originTag: 'Brazil · Colombia · Lâm Đồng',
  },
  'ICE:RC': {
    symbol: 'ICE:RC',
    nameVi: 'Cà phê Robusta',
    groupVi: 'Nguyên liệu CN',
    category: 'SOFT_COMMODITIES',
    imageUrl: webp('commodity_robusta_rc_1795004530552'),
    imageAlt: 'Hạt cà phê Robusta Tây Nguyên Việt Nam và cây cà phê xanh',
    accentHex: '#8FC9C3',
    originTag: 'Tây Nguyên VN (#1 Thế giới) · MXV LRC',
  },
  'ICE:SB': {
    symbol: 'ICE:SB',
    nameVi: 'Đường thô số 11',
    groupVi: 'Nguyên liệu CN',
    category: 'SOFT_COMMODITIES',
    imageUrl: webp('commodity_sugar_sb_1795004530789'),
    imageAlt: 'Cánh đồng mía đường xanh mướt dưới ánh nắng sớm',
    accentHex: '#7FB2E5',
    originTag: 'Brazil UNICA · Ấn Độ · Thái Lan',
  },
  'ICE:CC': {
    symbol: 'ICE:CC',
    nameVi: 'Ca cao',
    groupVi: 'Nguyên liệu CN',
    category: 'SOFT_COMMODITIES',
    imageUrl: webp('commodity_cocoa_cc_1795004531055'),
    imageAlt: 'Quả ca cao chín vàng cam trên thân cây nhiệt đới',
    accentHex: '#EA580C',
    originTag: 'Bờ Biển Ngà · Ghana · ICE CC',
  },
  'ICE:CT': {
    symbol: 'ICE:CT',
    nameVi: 'Bông sợi',
    groupVi: 'Nguyên liệu CN',
    category: 'SOFT_COMMODITIES',
    imageUrl: webp('commodity_cotton_ct_1795004597242'),
    imageAlt: 'Cánh đồng bông trắng muốt mùa thu hoạch hoàng hôn',
    accentHex: '#94A3B8',
    originTag: 'Dệt may Việt Nam · US Texas · MXV CT',
  },
  'MXV:JRU': {
    symbol: 'MXV:JRU',
    nameVi: 'Cao su RSS3',
    groupVi: 'Nguyên liệu CN',
    category: 'SOFT_COMMODITIES',
    imageUrl: webp('commodity_rubber_jru_1795004598580'),
    imageAlt: 'Rừng cao su cạo mủ buổi sáng tại Việt Nam',
    accentHex: '#14B8A6',
    originTag: 'Đông Nam Bộ VN · Thái Lan · MXV JRU',
  },
  'NYMEX:CL': {
    symbol: 'NYMEX:CL',
    nameVi: 'Dầu thô WTI',
    groupVi: 'Năng lượng',
    category: 'ENERGY',
    imageUrl: webp('commodity_wti_cl_1795004598926'),
    imageAlt: 'Giàn khoan dầu khí ngoài khơi lúc chạng vạng',
    accentHex: '#F97316',
    originTag: 'Cushing OK · OPEC+ · NYMEX CL',
  },
  'ICE:BRN': {
    symbol: 'ICE:BRN',
    nameVi: 'Dầu thô Brent',
    groupVi: 'Năng lượng',
    category: 'ENERGY',
    imageUrl: webp('commodity_brent_brn_1795004598669'),
    imageAlt: 'Tàu chở dầu và cảng xuất khẩu dầu thô Biển Bắc',
    accentHex: '#38BDF8',
    originTag: 'Biển Bắc · Định chuẩn xăng dầu VN',
  },
  'NYMEX:NG': {
    symbol: 'NYMEX:NG',
    nameVi: 'Khí tự nhiên',
    groupVi: 'Năng lượng',
    category: 'ENERGY',
    imageUrl: webp('commodity_natgas_ng_1795004598590'),
    imageAlt: 'Nhà máy nén khí tự nhiên hóa lỏng LNG hiện đại',
    accentHex: '#6366F1',
    originTag: 'Henry Hub · LNG Châu Á/EU',
  },
  'COMEX:GC': {
    symbol: 'COMEX:GC',
    nameVi: 'Vàng',
    groupVi: 'Kim loại',
    category: 'METALS',
    imageUrl: webp('commodity_gold_gc_1795004600284'),
    imageAlt: 'Các thỏi vàng 999.9 trong kho lưu trữ',
    accentHex: '#FBBF24',
    originTag: 'COMEX GC · Ngân hàng Trung ương',
  },
  'COMEX:SI': {
    symbol: 'COMEX:SI',
    nameVi: 'Bạc',
    groupVi: 'Kim loại',
    category: 'METALS',
    imageUrl: webp('commodity_silver_si_1795004600314'),
    imageAlt: 'Thỏi bạc nguyên chất và hạt bạc công nghiệp trên đá tối',
    accentHex: '#CBD5E1',
    originTag: 'COMEX SI · Điện mặt trời & Tiền tệ',
  },
  'COMEX:HG': {
    symbol: 'COMEX:HG',
    nameVi: 'Đồng',
    groupVi: 'Kim loại',
    category: 'METALS',
    imageUrl: webp('commodity_copper_hg_1795004600627'),
    imageAlt: 'Đồng cathode nguyên chất và cuộn dây đồng công nghiệp',
    accentHex: '#EA580C',
    originTag: 'Chile · Trung Quốc · MXV CPE',
  },
  'NYMEX:PL': {
    symbol: 'NYMEX:PL',
    nameVi: 'Bạch kim',
    groupVi: 'Kim loại',
    category: 'METALS',
    imageUrl: webp('commodity_platinum_pl_1795004601518'),
    imageAlt: 'Thỏi bạch kim tinh luyện và lưới xúc tác công nghiệp',
    accentHex: '#94A3B8',
    originTag: 'Nam Phi · Công nghiệp ô tô · MXV PLE',
  },
  'CME:TIO': {
    symbol: 'CME:TIO',
    nameVi: 'Quặng sắt',
    groupVi: 'Kim loại',
    category: 'METALS',
    imageUrl: webp('commodity_ironore_tio_1795004602229'),
    imageAlt: 'Khai trường quặng sắt lộ thiên quy mô lớn',
    accentHex: '#B59CE0',
    originTag: 'Úc · Brazil · Thép Trung Quốc & VN',
  },
};

export function getCommodityVisual(symbolOrId: string): CommodityVisualAsset | null {
  return COMMODITY_VISUALS[symbolOrId.trim().toUpperCase()] ?? null;
}
