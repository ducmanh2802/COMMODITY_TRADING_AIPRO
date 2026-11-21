/** Key growing regions (2-3 centroid points each) mapped to instruments in server/data/instruments.ts. */
export interface RegionDef {
  regionId: string;
  nameVi: string;
  instruments: string[];
  points: Array<{ lat: number; lon: number; label: string }>;
  frostWatch?: boolean;
}

export const WEATHER_REGIONS: RegionDef[] = [
  {
    regionId: 'tay-nguyen',
    nameVi: 'Tây Nguyên (VN)',
    instruments: ['ICE:RC'],
    points: [
      { lat: 12.67, lon: 108.04, label: 'Buôn Ma Thuột' },
      { lat: 11.94, lon: 108.44, label: 'Đà Lạt' },
      { lat: 14.35, lon: 108.0, label: 'Kon Tum' },
    ],
  },
  {
    regionId: 'minas-gerais',
    nameVi: 'Minas Gerais / Sul de Minas (BR)',
    instruments: ['ICE:KC'],
    frostWatch: true,
    points: [
      { lat: -21.55, lon: -45.43, label: 'Varginha' },
      { lat: -18.92, lon: -46.99, label: 'Patrocínio' },
      { lat: -20.0, lon: -45.0, label: 'Oeste Minas' },
    ],
  },
  {
    regionId: 'mato-grosso-parana',
    nameVi: 'Mato Grosso / Paraná (BR)',
    instruments: ['CBOT:ZS', 'CBOT:ZM', 'CBOT:ZL', 'CBOT:ZC'],
    points: [
      { lat: -12.55, lon: -55.72, label: 'Sorriso (MT)' },
      { lat: -15.6, lon: -56.1, label: 'Cuiabá (MT)' },
      { lat: -23.31, lon: -51.16, label: 'Londrina (PR)' },
    ],
  },
  {
    regionId: 'us-corn-belt',
    nameVi: 'Vành đai ngô Mỹ (Iowa/Illinois)',
    instruments: ['CBOT:ZC', 'CBOT:ZS', 'CBOT:ZM', 'CBOT:ZL'],
    points: [
      { lat: 42.03, lon: -93.62, label: 'Iowa' },
      { lat: 40.11, lon: -88.24, label: 'Illinois' },
    ],
  },
  {
    regionId: 'us-plains',
    nameVi: 'Đồng bằng lớn Mỹ (lúa mì)',
    instruments: ['CBOT:ZW', 'ICE:CT'],
    points: [
      { lat: 37.69, lon: -97.34, label: 'Kansas' },
      { lat: 35.47, lon: -97.52, label: 'Oklahoma' },
      { lat: 33.58, lon: -101.85, label: 'Tây Texas' },
    ],
  },
  {
    regionId: 'west-africa-cocoa',
    nameVi: 'Bờ Biển Ngà / Ghana (ca cao)',
    instruments: ['ICE:CC'],
    points: [
      { lat: 6.82, lon: -5.28, label: 'Yamoussoukro' },
      { lat: 6.88, lon: -6.45, label: 'Daloa' },
      { lat: 6.69, lon: -1.62, label: 'Kumasi' },
    ],
  },
  {
    regionId: 'se-asia-rubber',
    nameVi: 'Thái Lan / Indonesia (cao su)',
    instruments: [],
    points: [
      { lat: 7.0, lon: 100.5, label: 'Nam Thái Lan' },
      { lat: 3.59, lon: 98.67, label: 'Sumatra (Medan)' },
      { lat: -2.99, lon: 104.76, label: 'Palembang' },
    ],
  },
];
