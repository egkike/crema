import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

import multer from 'multer';

import { config } from '../../config/index';

// ============================================================================
// ALLOWLISTS - Only these extensions and MIME types are permitted
// ============================================================================

const ALLOWED_EXTENSIONS = [
  // Documents
  'pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'txt', 'rtf', 'odt',
  // Images
  'jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp', 'ico',
  // Video/Audio
  'mp4', 'webm', 'mov', 'avi', 'mkv', 'mp3', 'wav', 'ogg', 'm4a',
  // Archives
  'zip', 'rar', '7z', 'tar', 'gz',
  // Code (for digital products)
  'html', 'css', 'js', 'json', 'xml', 'md',
  // Other
  'epub', 'mobi', 'azw3',
];

const ALLOWED_MIME_TYPES = [
  // Documents
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'text/plain',
  'application/rtf',
  'application/vnd.oasis.opendocument.text',
  // Images
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'image/svg+xml',
  'image/bmp',
  'image/x-icon',
  // Video
  'video/mp4',
  'video/webm',
  'video/quicktime',
  'video/x-msvideo',
  'video/x-matroska',
  // Audio
  'audio/mpeg',
  'audio/wav',
  'audio/ogg',
  'audio/mp4',
  // Archives
  'application/zip',
  'application/x-rar-compressed',
  'application/x-7z-compressed',
  'application/x-tar',
  'application/gzip',
  // Code
  'text/html',
  'text/css',
  'application/javascript',
  'application/json',
  'text/xml',
  'text/markdown',
  // Other
  'application/epub+zip',
  'application/x-mobipocket-ebook',
  'application/vnd.amazon.ebook',
];

// ============================================================================
// UTILITIES
// ============================================================================

/**
 * Sanitize filename - remove path components and dangerous characters
 */
function sanitizeFilename(filename: string): string {
  // Get only the basename (remove any path components)
  const basename = path.basename(filename);
  
  // Remove dangerous characters but keep basic punctuation
  return basename
    .replace(/[^a-zA-Z0-9._-]/g, '_')  // Replace dangerous chars with underscore
    .replace(/\.+/g, '.')               // Remove multiple dots
    .replace(/^-+|-+$/g, '')            // Remove leading/trailing dashes
    .substring(0, 200);                 // Limit length
}

/**
 * Validate and sanitize extension
 */
function getSafeExtension(filename: string): string | null {
  const ext = path.extname(filename).toLowerCase().replace(/^\./, '');
  return ALLOWED_EXTENSIONS.includes(ext) ? ext : null;
}

/**
 * Validate MIME type (basic check - can be spoofed, but adds a layer)
 */
function isAllowedMimeType(mimeType: string): boolean {
  return ALLOWED_MIME_TYPES.includes(mimeType.toLowerCase());
}

// ============================================================================
// MULTER CONFIGURATION
// ============================================================================

const storage = multer.diskStorage({
  destination: (_req, file, cb) => {
    // Use originalname to create subdirs - this is safe after sanitization
    const tempPath = path.join(process.cwd(), 'uploads', 'temp');
    if (!fs.existsSync(tempPath)) {
      fs.mkdirSync(tempPath, { recursive: true });
    }
    cb(null, tempPath);
  },
  filename: (_req, file, cb) => {
    // Generate unique filename with UUID to prevent collisions and guessing
    const safeName = sanitizeFilename(file.originalname);
    const uniqueSuffix = crypto.randomUUID();
    cb(null, `${uniqueSuffix}-${safeName}`);
  },
});

// File filter for upload validation
function fileFilter(_req: Express.Multer.Request, file: Express.Multer.File, cb: multer.FileFilterCallback) {
  const ext = getSafeExtension(file.originalname);
  const mimeType = file.mimetype.toLowerCase();
  
  // Check extension
  if (!ext) {
    const error = new Error(`Extension not allowed. Allowed: ${ALLOWED_EXTENSIONS.join(', ')}`);
    cb(error, false);
    return;
  }
  
  // Check MIME type (with fallback for common mismatches)
  // Some browsers send different MIME types, so we also accept common variations
  const mimeMatches = isAllowedMimeType(mimeType) || 
    // Common variations
    (ext === 'jpg' && mimeType === 'image/jpg') ||
    (ext === 'jpeg' && mimeType === 'image/jpg') ||
    (ext === 'svg' && mimeType === 'image/svg') ||
    (ext === 'webm' && mimeType === 'video/webm');
  
  if (!mimeMatches) {
    const error = new Error(`MIME type not allowed: ${mimeType}`);
    cb(error, false);
    return;
  }
  
  // All good
  cb(null, true);
}

export const upload = multer({
  storage,
  fileFilter,
  limits: { 
    fileSize: config?.storage?.maxGlobalSizeBytes || 100 * 1024 * 1024,
    files: 10,  // Max 10 files per request
  },
});

// Export allowlist for reference in other modules
export { ALLOWED_EXTENSIONS, ALLOWED_MIME_TYPES };
