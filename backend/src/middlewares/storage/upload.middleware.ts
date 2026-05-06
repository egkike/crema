import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

import multer from 'multer';
import type { Request } from 'express';

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

// ============================================================================
// EXECUTABLE EXTENSIONS - Blocked with specific error message
// ============================================================================

const EXECUTABLE_EXTENSIONS = [
  // Windows executables
  'exe', 'bat', 'cmd', 'msi', 'com', 'pif', 'scr',
  // Unix scripts
  'sh', 'bash', 'csh', 'tcsh', 'zsh',
  // Scripting
  'vbs', 'vbe', 'js', 'jse', 'wsf', 'wsh',
  // Other executables
  'app', 'bin', 'dmg', 'pkg', 'deb', 'rpm',
  // Shortcuts
  'lnk', 'inf', 'reg',
] as const;

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
 * Multer file interface - replaces `any` types
 */
interface MulterFile {
  originalname: string;
  mimetype: string;
}

/**
 * Compatible file filter callback - avoids union overload ambiguity
 */
type FileFilterCb = (error: Error | null, acceptFile?: boolean) => void;
function sanitizeFilename(filename: string): string {
  // Get only the basename (remove any path components)
  const basename = path.basename(filename);

  // Remove dangerous characters but keep basic punctuation
  const sanitized = basename
    .replace(/[^a-zA-Z0-9._-]/g, '_')  // Replace dangerous chars with underscore
    .replace(/\.+/g, '.')             // Remove multiple dots
    .replace(/^-+|-+$/g, '');         // Remove leading/trailing dashes

  // Reject filenames that reduce to path special entries
  if (sanitized === '.' || sanitized === '..') {
    return 'invalid_filename';
  }

  // Reject hidden files (starting with dot)
  if (sanitized.startsWith('.')) {
    return 'dot_' + sanitized.slice(1);
  }

  // Reject filenames ending with a dot (causes extname() to return empty)
  if (sanitized.endsWith('.')) {
    return sanitized.slice(0, -1) + '_dot';
  }

  // Limit length accounting for UUID prefix (37 chars) + hyphen
  return sanitized.slice(0, 180);
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
  destination: (_req, _file, cb) => {
    // Use originalname to create subdirs - this is safe after sanitization
    const tempPath = path.join(process.cwd(), 'uploads', 'temp');
    // Use recursive:true directly - idempotent, avoids TOCTOU race of exists+mkdir
    fs.mkdirSync(tempPath, { recursive: true });
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
function fileFilter(_req: Request, file: MulterFile, cb: FileFilterCb) {
  const originalName = file.originalname;
  const ext = path.extname(originalName).toLowerCase().replace(/^\./, '');
  const mimeType = file.mimetype.toLowerCase();

  // Reject path traversal attempts - check for path separators in filename
  if (originalName.includes('/') || originalName.includes('\\') || originalName.includes('..')) {
    cb(new Error('Invalid filename. Path components not allowed.'), false);
    return;
  }

  // Check for executable extension - specific error message
  if (ext && (EXECUTABLE_EXTENSIONS as readonly string[]).includes(ext)) {
    cb(
      new Error(
        `Executable files are not allowed. Use .zip, .rar, or .7z format for software. ` +
        `.exe files require malware scanning (CS-18 pending implementation).`
      ),
      false
    );
    return;
  }

  // Check extension (allowlist)
  if (!ext) {
    cb(new Error('File has no extension'), false);
    return;
  }

  if (!ALLOWED_EXTENSIONS.includes(ext)) {
    cb(new Error(`Extension not allowed. Allowed: ${ALLOWED_EXTENSIONS.join(', ')}`), false);
    return;
  }

  // Check MIME type (with fallback for common mismatches)
  const mimeMatches = isAllowedMimeType(mimeType) ||
    // Common variations
    (ext === 'jpg' && mimeType === 'image/jpg') ||
    (ext === 'jpeg' && mimeType === 'image/jpg') ||
    (ext === 'svg' && mimeType === 'image/svg') ||
    (ext === 'webm' && mimeType === 'video/webm');

  if (!mimeMatches) {
    cb(new Error('File type not allowed'), false);
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
export { ALLOWED_EXTENSIONS, ALLOWED_MIME_TYPES, EXECUTABLE_EXTENSIONS };
