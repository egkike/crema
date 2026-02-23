import fs from 'fs';
import path from 'path';

import multer from 'multer';

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    // Carpeta temporal para validación
    const tempPath = path.join(process.cwd(), 'uploads', 'temp');
    if (!fs.existsSync(tempPath)) fs.mkdirSync(tempPath, { recursive: true });
    cb(null, tempPath);
  },
  filename: (req, file, cb) => {
    // Nombre único para evitar colisiones en temp
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, uniqueSuffix + '-' + file.originalname);
  },
});

export const upload = multer({
  storage,
  limits: { fileSize: 100 * 1024 * 1024 }, // 100MB
});
