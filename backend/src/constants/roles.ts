export const USER_LEVELS = {
  GUEST: 0,
  USER: 1, // Usuario básico / Comprador
  AFILIADO: 2, // Puede promocionar
  CREATOR: 3, // Puede crear productos (según tu middleware de planes)
  STAFF: 10, // Moderadores / Soporte
  ADMIN: 99, // Control total
};
