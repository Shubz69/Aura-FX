export const AURA_CHART_COLORS = {
  background: '#070b14',
  text: 'rgba(198, 210, 230, 0.84)',
  grid: 'rgba(120, 145, 178, 0.10)',
  scaleBorder: 'rgba(120, 145, 178, 0.28)',
  crosshair: 'rgba(198, 210, 230, 0.34)',
  bullish: '#2fd6c7',
  bearish: '#ff6f7f',
  lineAccent: '#7ea8ff',
  areaTop: 'rgba(126, 168, 255, 0.22)',
  areaBottom: 'rgba(126, 168, 255, 0.02)',
  volumeBullish: 'rgba(47, 214, 199, 0.28)',
  volumeBearish: 'rgba(255, 111, 127, 0.28)',
};

export const AURA_CANDLE_SERIES_OPTIONS = {
  upColor: AURA_CHART_COLORS.bullish,
  downColor: AURA_CHART_COLORS.bearish,
  borderUpColor: AURA_CHART_COLORS.bullish,
  borderDownColor: AURA_CHART_COLORS.bearish,
  wickUpColor: AURA_CHART_COLORS.bullish,
  wickDownColor: AURA_CHART_COLORS.bearish,
};

export const AURA_LINE_SERIES_OPTIONS = {
  color: AURA_CHART_COLORS.lineAccent,
  lineWidth: 2,
};

export const AURA_AREA_SERIES_OPTIONS = {
  lineColor: AURA_CHART_COLORS.lineAccent,
  topColor: AURA_CHART_COLORS.areaTop,
  bottomColor: AURA_CHART_COLORS.areaBottom,
  lineWidth: 2,
};

export function getAuraVolumeColor(open, close) {
  return close >= open ? AURA_CHART_COLORS.volumeBullish : AURA_CHART_COLORS.volumeBearish;
}

export function buildAuraChartOptions({
  ColorType,
  width,
  height,
  attributionLogo = true,
  timeScale = {},
  rightPriceScale = {},
  leftPriceScale = {},
}) {
  return {
    width,
    height,
    layout: {
      background: { type: ColorType.Solid, color: AURA_CHART_COLORS.background },
      textColor: AURA_CHART_COLORS.text,
      attributionLogo,
    },
    grid: {
      vertLines: { color: AURA_CHART_COLORS.grid },
      horzLines: { color: AURA_CHART_COLORS.grid },
    },
    crosshair: {
      vertLine: { color: AURA_CHART_COLORS.crosshair, width: 1, style: 0, labelVisible: true },
      horzLine: { color: AURA_CHART_COLORS.crosshair, width: 1, style: 0, labelVisible: true },
    },
    timeScale: {
      borderColor: AURA_CHART_COLORS.scaleBorder,
      ...timeScale,
    },
    rightPriceScale: {
      borderColor: AURA_CHART_COLORS.scaleBorder,
      ...rightPriceScale,
    },
    leftPriceScale: {
      borderColor: AURA_CHART_COLORS.scaleBorder,
      ...leftPriceScale,
    },
  };
}
