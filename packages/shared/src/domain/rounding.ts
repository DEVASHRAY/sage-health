export function roundToNearest(value: number, step: number): number {
  return Math.round(value / step) * step;
}

export function roundToOneDecimal(value: number): number {
  return Math.round(value * 10) / 10;
}
