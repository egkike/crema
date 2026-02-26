export const validateCUIT = (cuit: string): boolean => {
  const cleanCuit = cuit.replace(/-/g, '');
  if (cleanCuit.length !== 11 || !/^\d+$/.test(cleanCuit)) return false;
  const factors = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];
  let sum = 0;
  for (let i = 0; i < 10; i++) sum += parseInt(cleanCuit[i]) * factors[i];
  let checkDigit = 11 - (sum % 11);
  if (checkDigit === 11) checkDigit = 0;
  if (checkDigit === 10) checkDigit = 9;
  return checkDigit === parseInt(cleanCuit[10]);
};

/**
 * Valida la integridad de un CBU (Clave Bancaria Uniforme) de Argentina.
 * Verifica los dígitos verificadores del bloque 1 (banco/sucursal)
 * y bloque 2 (número de cuenta).
 */
export const validateCBU = (cbu: string): boolean => {
  if (!/^\d{22}$/.test(cbu)) return false;

  const v = cbu.split('').map(n => parseInt(n));

  // Validación Bloque 1 (Posiciones 0 a 7)
  const weights1 = [7, 1, 3, 9, 7, 1, 3];
  let sum1 = 0;
  for (let i = 0; i < 7; i++) sum1 += v[i] * weights1[i];
  let check1 = 10 - (sum1 % 10);
  if (check1 === 10) check1 = 0;
  if (check1 !== v[7]) return false;

  // Validación Bloque 2 (Posiciones 8 a 21)
  const weights2 = [3, 9, 7, 1, 3, 9, 7, 1, 3, 9, 7, 1, 3];
  let sum2 = 0;
  for (let i = 0; i < 13; i++) sum2 += v[8 + i] * weights2[i];
  let check2 = 10 - (sum2 % 10);
  if (check2 === 10) check2 = 0;
  if (check2 !== v[21]) return false;

  return true;
};

// Mapa de validadores
export const SpecialValidators: Record<string, Record<string, (val: string) => boolean>> = {
  ARS: {
    tax_id: validateCUIT,
    cbu: validateCBU,
  },
};
