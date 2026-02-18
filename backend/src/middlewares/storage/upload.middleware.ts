import multer from 'multer';

// Configuración temporal en memoria para validar antes de persistir
const storage = multer.memoryStorage(); 

export const upload = multer({
  storage,
  limits: {
    fileSize: 100 * 1024 * 1024, // Límite físico absoluto (ej: 100MB)
  }
});