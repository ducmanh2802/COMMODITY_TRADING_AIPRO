import { useState } from 'react';
import { Wheat, Flame, Gem, Sprout } from 'lucide-react';
import { getCommodityVisual } from '../../shared/data/commodityVisuals';
import type { ProductCategory } from '../../shared/types/instrument';

interface CommodityHeroImageProps {
  symbol: string;
  name: string;
  category?: ProductCategory;
  className?: string;
  imgClassName?: string;
  priority?: boolean;
}

function getCategoryFallbackIcon(category?: ProductCategory) {
  switch (category) {
    case 'AGRICULTURE':
      return Wheat;
    case 'SOFT_COMMODITIES':
      return Sprout;
    case 'ENERGY':
      return Flame;
    case 'METALS':
      return Gem;
    default:
      return Sprout;
  }
}

export function CommodityHeroImage({
  symbol,
  name,
  category,
  className = '',
  imgClassName = '',
  priority = false,
}: CommodityHeroImageProps) {
  const [errored, setErrored] = useState(false);
  const visual = getCommodityVisual(symbol);
  const FallbackIcon = getCategoryFallbackIcon(category ?? visual?.category);
  const accent = visual?.accentHex ?? '#6366F1';

  if (!visual || errored) {
    return (
      <div
        className={`relative overflow-hidden bg-gradient-to-br from-[#172033] via-[#111622] to-[#0B0E14] flex flex-col items-center justify-center p-4 text-center ${className}`}
        style={{
          backgroundImage: `radial-gradient(circle at 25% 25%, ${accent}24 0%, transparent 60%)`,
        }}
      >
        <FallbackIcon className="w-8 h-8 mb-2 opacity-80" style={{ color: accent }} aria-hidden="true" />
        <span className="text-xs font-medium text-white/85">{visual?.nameVi ?? name}</span>
        <span className="text-[11px] font-mono text-white/45 mt-0.5">{symbol}</span>
      </div>
    );
  }

  return (
    <div className={`relative overflow-hidden bg-[#0B0E14] ${className}`}>
      <img
        src={visual.imageUrl}
        alt={visual.imageAlt}
        referrerPolicy="no-referrer"
        loading={priority ? 'eager' : 'lazy'}
        onError={() => setErrored(true)}
        className={`w-full h-full object-cover ${imgClassName}`}
      />
    </div>
  );
}
