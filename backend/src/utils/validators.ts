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

// Mapa de validadores por moneda/campo
export const SpecialValidators: Record<string, Record<string, (val: string) => boolean>> = {
  ARS: {
    tax_id: validateCUIT,
    // Podrías agregar cbu: validateCBU si tuvieras el algoritmo
  },
  /* CLP: {
    tax_id: validateRUT 
  } 
  */
};
