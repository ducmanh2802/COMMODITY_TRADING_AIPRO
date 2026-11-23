export const DIAGRAM_IDS = ['candle', 'margin', 'hedge', 'curve', 'dow', 'srflip', 'pinbar', 'roll'] as const;
export type DiagramId = (typeof DIAGRAM_IDS)[number];
