/**
 * Utilidad para redondeo financiero a 2 decimales.
 */
export const roundToTwo = (num: number): number => {
  return Math.round((num + Number.EPSILON) * 100) / 100;
};
