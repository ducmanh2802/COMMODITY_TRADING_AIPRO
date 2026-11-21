export type WeatherFlag = 'KHÔ_HẠN' | 'MƯA_NHIỀU' | 'NẮNG_NÓNG' | 'SƯƠNG_GIÁ_RISK';

export interface WeatherDaily {
  date: string;
  precipMm: number;
  tmax: number;
  tmin: number;
}

export interface WeatherRegionResult {
  regionId: string;
  nameVi: string;
  instruments: string[];
  points: Array<{ lat: number; lon: number; label: string }>;
  next14d: {
    precipMm: number;
    precipNormalMm: number;
    precipAnomalyPct: number | null;
    tmaxAvg: number;
    tmaxNormal: number;
    tmaxAnomalyC: number;
    tminMin: number;
  };
  daily: WeatherDaily[];
  flags: WeatherFlag[];
  source: 'Open-Meteo';
  retrievedAt: string;
}

export interface WeatherRegionsResponse {
  retrievedAt: string;
  regions: WeatherRegionResult[];
}
