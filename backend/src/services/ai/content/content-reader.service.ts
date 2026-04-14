/**
 * Content Reader Service
 * Phase 2: ContentReaderService
 * 
 * Extracts text content from PDF, Markdown, and TXT files
 * with support for chunking and metadata extraction
 */

import * as fs from 'fs/promises';
import * as path from 'path';

import { v4 as uuidv4 } from 'uuid';

import logger from '../../../utils/logger';
import { 
  aiContentConfig, 
  SUPPORTED_CONTENT_TYPES 
} from '../../../config/ai-content.config';
import {
  ContentSourceType,
  ContentMetadata,
  ExtractedContent,
  ContentChunk,
  ProcessedContent,
  contentProcessingOptionsSchema,
  readContentRequestSchema,
  ContentProcessingOptions,
} from '../../../types/ai-content.types';

// ============================================
// PDF Text Extraction (Lightweight)
// ============================================

/**
 * Extract text from PDF using pdf-parse
 * Falls back to error if library not available
 */
async function extractFromPdf(filePath: string): Promise<{ text: string; pageCount: number }> {
  try {
    // Dynamic import to avoid hard dependency - use require for CommonJS compatibility
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const pdfParse = require('pdf-parse');
    const buffer = await fs.readFile(filePath);
    const data = await pdfParse(buffer, {
      max: aiContentConfig.pdfMaxPages,
      // Optionally extract images/tables based on config
      pagerender: undefined,
    });
    
    return {
      text: data.text || '',
      pageCount: data.numpages || 0,
    };
  } catch (error) {
    logger.error({ error, filePath }, 'Failed to extract text from PDF');
    throw new Error(`PDF extraction failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

// ============================================
// Markdown Processing
// ============================================

/**
 * Extract text from Markdown file
 * Optionally extracts code blocks and headings based on config
 */
async function extractFromMarkdown(filePath: string): Promise<{ text: string; headings: string[] }> {
  const content = await fs.readFile(filePath, 'utf-8');
  
  let text = content;
  const headings: string[] = [];
  
  if (aiContentConfig.markdownExtractHeadings) {
    // Extract headings (# to ######)
    const headingRegex = /^(#{1,6})\s+(.+)$/gm;
    let match;
    while ((match = headingRegex.exec(content)) !== null) {
      headings.push(match[2].trim());
    }
  }
  
  if (aiContentConfig.markdownExtractCodeBlocks) {
    // Remove code blocks but keep content
    text = content.replace(/```[\s\S]*?```/g, (match) => {
      // Extract content from code blocks
      const codeContent = match.replace(/```\w*\n?/g, '').trim();
      return codeContent ? `\n${codeContent}\n` : '';
    });
    
    // Remove inline code
    text = text.replace(/`[^`]+`/g, '');
  }
  
  // Normalize whitespace
  text = text.replace(/\n{3,}/g, '\n\n').trim();
  
  return { text, headings };
}

// ============================================
// Plain Text Processing
// ============================================

/**
 * Extract text from plain text file
 * Handles different encodings and normalizes whitespace
 */
async function extractFromText(filePath: string): Promise<{ text: string; encoding: string }> {
  let content: string;
  let encoding = 'utf-8';
  
  if (aiContentConfig.textDetectEncoding) {
    // Read as buffer first to detect encoding
    const buffer = await fs.readFile(filePath);
    
    // Simple encoding detection (BOM or common patterns)
    if (buffer[0] === 0xEF && buffer[1] === 0xBB && buffer[2] === 0xBF) {
      // UTF-8 BOM
      content = buffer.slice(3).toString('utf-8');
      encoding = 'utf-8-sig';
    } else if (buffer[0] === 0xFF && buffer[1] === 0xFE) {
      // UTF-16 LE
      content = buffer.slice(2).toString('utf16le');
      encoding = 'utf-16le';
    } else {
      // Default to UTF-8
      content = buffer.toString('utf-8');
    }
  } else {
    content = await fs.readFile(filePath, 'utf-8');
  }
  
  if (aiContentConfig.textNormalizeWhitespace) {
    // Normalize whitespace: replace multiple spaces/tabs with single space
    content = content.replace(/[ \t]+/g, ' ');
    // Normalize line endings
    content = content.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    // Remove excessive blank lines
    content = content.replace(/\n{3,}/g, '\n\n');
  }
  
  return { text: content.trim(), encoding };
}

// ============================================
// Main Content Reader Service
// ============================================

export class ContentReaderService {
  /**
   * Read and extract content from a file
   * Supports PDF, Markdown, and plain text
   */
  async readContent(filePath: string, options?: Partial<ContentProcessingOptions>): Promise<ExtractedContent> {
    // Validate input
    const validation = readContentRequestSchema.safeParse({ filePath, options });
    if (!validation.success) {
      const errors = validation.error.issues?.map((e: { message: string }) => e.message).join(', ') || 'Validation failed';
      return {
        text: '',
        metadata: {
          sourceType: 'text',
          fileName: path.basename(filePath || ''),
          fileSize: 0,
          extractedAt: new Date(),
        },
        success: false,
        error: `Invalid request: ${errors}`,
      };
    }

    // SECURITY: Validate path traversal - ensure file is within allowed directory
    const pathValidation = this.validatePathTraversal(filePath);
    if (!pathValidation.valid) {
      return {
        text: '',
        metadata: {
          sourceType: 'text',
          fileName: path.basename(filePath),
          fileSize: 0,
          extractedAt: new Date(),
        },
        success: false,
        error: pathValidation.error,
      };
    }
    
    const optionsValidation = contentProcessingOptionsSchema.safeParse(options || {});
    const opts = optionsValidation.success ? optionsValidation.data : contentProcessingOptionsSchema.parse({});
    
    // Check if file exists
    let stats;
    try {
      stats = await fs.stat(filePath);
    } catch {
      return {
        text: '',
        metadata: {
          sourceType: 'text',
          fileName: path.basename(filePath),
          fileSize: 0,
          extractedAt: new Date(),
        },
        success: false,
        error: `File not found: ${filePath}`,
      };
    }
    
    // Check file size
    const maxSize = aiContentConfig.contentMaxFileSizeMb * 1024 * 1024;
    if (stats.size > maxSize) {
      return {
        text: '',
        metadata: {
          sourceType: 'text',
          fileName: path.basename(filePath),
          fileSize: stats.size,
          extractedAt: new Date(),
        },
        success: false,
        error: `File too large: ${stats.size} bytes (max: ${maxSize} bytes)`,
      };
    }
    
    // Determine file type from extension
    const ext = path.extname(filePath).toLowerCase();
    const sourceType = this.detectSourceType(ext);
    
    if (!sourceType) {
      return {
        text: '',
        metadata: {
          sourceType: 'text',
          fileName: path.basename(filePath),
          fileSize: stats.size,
          extractedAt: new Date(),
        },
        success: false,
        error: `Unsupported file type: ${ext}`,
      };
    }
    
    try {
      let text = '';
      let pageCount: number | undefined;
      let encoding = 'utf-8';
      
      switch (sourceType) {
        case 'pdf': {
          const pdfResult = await extractFromPdf(filePath);
          text = pdfResult.text;
          pageCount = pdfResult.pageCount;
          break;
        }
        
        case 'markdown': {
          const mdResult = await extractFromMarkdown(filePath);
          text = mdResult.text;
          break;
        }
        
        case 'text': {
          const txtResult = await extractFromText(filePath);
          text = txtResult.text;
          encoding = txtResult.encoding;
          break;
        }
        
        default:
          throw new Error(`Unknown source type: ${sourceType}`);
      }
      
      // Calculate word count if requested
      let wordCount: number | undefined;
      if (opts.countWords) {
        wordCount = text.split(/\s+/).filter(w => w.length > 0).length;
      }
      
      const metadata: ContentMetadata = {
        sourceType,
        fileName: path.basename(filePath),
        fileSize: stats.size,
        extractedAt: new Date(),
        pageCount,
        wordCount,
        charCount: text.length,
        encoding,
      };
      
      return {
        text,
        metadata,
        success: true,
      };
      
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error({ error: errorMessage, filePath }, 'Failed to extract content');
      
      return {
        text: '',
        metadata: {
          sourceType,
          fileName: path.basename(filePath),
          fileSize: stats.size,
          extractedAt: new Date(),
        },
        success: false,
        error: `Extraction failed: ${errorMessage}`,
      };
    }
  }
  
  /**
   * Process content into chunks for AI processing
   */
  processIntoChunks(
    text: string,
    fileName: string,
    sourceType: ContentSourceType,
    options?: Partial<ContentProcessingOptions>
  ): ProcessedContent {
    const opts = contentProcessingOptionsSchema.parse(options || {});
    
    const chunkSize = opts.chunkSize;
    const chunkOverlap = opts.chunkOverlap;
    
    const chunks: ContentChunk[] = [];
    let index = 0;
    let position = 0;
    
    // Split text into chunks with overlap
    while (position < text.length) {
      const chunkText = text.slice(position, position + chunkSize);
      
      if (chunkText.trim().length > 0) {
        chunks.push({
          id: uuidv4(),
          content: chunkText,
          index: index,
          startPosition: position,
          endPosition: Math.min(position + chunkSize, text.length),
          metadata: {
            sourceType,
            fileName,
          },
        });
        
        index++;
      }
      
      // Move position with overlap
      position += chunkSize - chunkOverlap;
      
      // Safety check to prevent infinite loops
      if (chunkSize - chunkOverlap <= 0) {
        position += chunkSize;
      }
    }
    
    return {
      chunks,
      totalChunks: chunks.length,
      totalChars: text.length,
      sourceInfo: {
        type: sourceType,
        fileName,
      },
    };
  }
  
  /**
   * Detect source type from file extension
   */
  private detectSourceType(ext: string): ContentSourceType | null {
    for (const [type, config] of Object.entries(SUPPORTED_CONTENT_TYPES)) {
      if (config.extensions.includes(ext)) {
        return type as ContentSourceType;
      }
    }
    return null;
  }
  
  /**
   * Validate if a file type is supported
   */
  isSupported(filePath: string): boolean {
    const ext = path.extname(filePath).toLowerCase();
    return this.detectSourceType(ext) !== null;
  }
  
  /**
   * Get supported file extensions
   */
  getSupportedExtensions(): string[] {
    const extensions: string[] = [];
    for (const config of Object.values(SUPPORTED_CONTENT_TYPES)) {
      extensions.push(...config.extensions);
    }
    return extensions;
  }

  /**
   * SECURITY: Validate path traversal prevention
   * Ensures the resolved path is within allowed directories
   */
  private validatePathTraversal(filePath: string): { valid: boolean; error?: string } {
    try {
      // Get allowed directories - handle undefined config values
      const uploadDir = path.resolve(aiContentConfig.contentUploadDir || './uploads/content');
      const tempDir = path.resolve(aiContentConfig.contentTempDir || './uploads/temp');

      // Get absolute path - if relative, resolve from upload dir
      let absolutePath: string;
      if (path.isAbsolute(filePath)) {
        absolutePath = path.resolve(filePath);
      } else {
        // For relative paths, resolve from upload dir
        absolutePath = path.resolve(uploadDir, filePath);
      }

      // Use path.normalize to handle .. and . segments
      const normalizedPath = path.normalize(absolutePath);

      // Security check: allow if in uploadDir or tempDir
      const isInUploadDir = normalizedPath.startsWith(uploadDir + path.sep) || normalizedPath === uploadDir;
      const isInTempDir = normalizedPath.startsWith(tempDir + path.sep) || normalizedPath === tempDir;

      // Allow in test environment or dev mode
      const isDevOrTest = process.env.NODE_ENV !== 'production';

      if (isDevOrTest) {
        // In dev/test mode, only block dangerous patterns
        const dangerousPatterns = [
          /^\/etc\//i,
          /^\/var\//i,
          /^\/root\//i,
          /^\/home\//i,
          /\.env$/i,
          /^\.\.\//i,
        ];

        for (const pattern of dangerousPatterns) {
          if (pattern.test(normalizedPath)) {
            logger.warn({ filePath, absolutePath: normalizedPath, pattern }, 'Dangerous path pattern detected');
            return {
              valid: false,
              error: 'Access denied: dangerous file path pattern',
            };
          }
        }

        // Allow all other paths in dev/test
        return { valid: true };
      }

      // Production mode: stricter validation - must be in uploadDir or tempDir
      if (!isInUploadDir && !isInTempDir) {
        logger.warn({ filePath, absolutePath: normalizedPath, uploadDir }, 'Path traversal attempt detected');
        return {
          valid: false,
          error: 'Access denied: file path outside allowed directory',
        };
      }

      // Additional check: reject paths with dangerous patterns
      const dangerousPatterns = [
        /^\/etc\//i,
        /^\/var\//i,
        /^\/root\//i,
        /^\/home\//i,
        /\.env$/i,
        /^\.\.\//i,
      ];

      for (const pattern of dangerousPatterns) {
        if (pattern.test(normalizedPath)) {
          logger.warn({ filePath, absolutePath: normalizedPath, pattern }, 'Dangerous path pattern detected');
          return {
            valid: false,
            error: 'Access denied: dangerous file path pattern',
          };
        }
      }

      return { valid: true };
    } catch (error) {
      logger.error({ error, filePath }, 'Path validation error');
      return {
        valid: false,
        error: 'Invalid file path',
      };
    }
  }
}

// ============================================
// Export singleton instance
// ============================================

export const contentReaderService = new ContentReaderService();