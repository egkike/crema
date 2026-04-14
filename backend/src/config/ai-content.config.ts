/**
 * AI Content Assistant - Configuration
 * Phase 1: Infrastructure & Setup
 * 
 * Configuration for content reading and processing features
 */

import { z } from 'zod';

// ============================================
// Environment Schema
// ============================================

const aiContentEnvSchema = z.object({
  // Content Processing
  CONTENT_CHUNK_SIZE: z.coerce.number().default(2000),
  CONTENT_CHUNK_OVERLAP: z.coerce.number().default(200),
  CONTENT_MAX_FILE_SIZE_MB: z.coerce.number().default(50),
  
  // Storage paths
  CONTENT_UPLOAD_DIR: z.string().default('./uploads/content'),
  CONTENT_TEMP_DIR: z.string().default('./uploads/temp'),
  
  // AI Processing
  CONTENT_ANALYSIS_ENABLED: z.boolean().default(true),
  CONTENT_SUMMARY_MAX_TOKENS: z.coerce.number().default(500),
  CONTENT_TOPIC_EXTRACTION_COUNT: z.number().default(5),
  CONTENT_QUESTION_SUGGESTION_COUNT: z.number().default(3),
  
  // PDF Processing
  PDF_EXTRACT_IMAGES: z.boolean().default(false),
  PDF_EXTRACT_TABLES: z.boolean().default(true),
  PDF_MAX_PAGES: z.coerce.number().default(500),
  
  // Markdown Processing
  MARKDOWN_EXTRACT_CODE_BLOCKS: z.boolean().default(true),
  MARKDOWN_EXTRACT_HEADINGS: z.boolean().default(true),
  
  // Text Processing
  TEXT_DETECT_ENCODING: z.boolean().default(true),
  TEXT_NORMALIZE_WHITESPACE: z.boolean().default(true),
  
  // Cache settings
  CONTENT_CACHE_ENABLED: z.boolean().default(true),
  CONTENT_CACHE_TTL_SECONDS: z.coerce.number().default(3600),
  
  // Rate limiting
  CONTENT_RATE_LIMIT_ENABLED: z.boolean().default(true),
  CONTENT_RATE_LIMIT_MAX_PER_HOUR: z.coerce.number().default(20),

  // Transcription (Whisper)
  TRANSCRIPTION_MAX_FILE_SIZE_MB: z.coerce.number().default(25),
  TRANSCRIPTION_PRO_MONTHLY_MINUTES: z.coerce.number().default(60),
  TRANSCRIPTION_EXTRA_COST_PER_MINUTE_ARS: z.coerce.number().default(12),
  TRANSCRIPTION_EXTRA_COST_PER_MINUTE_CREDITS: z.coerce.number().default(3),
});

// Parse environment
const rawData = process.env;
const parsedEnv = aiContentEnvSchema.safeParse(rawData);

// Use validated data or fallback to defaults
const env = parsedEnv.success 
  ? parsedEnv.data 
  : aiContentEnvSchema.parse({}); // Fallback to defaults

// ============================================
// Configuration Object
// ============================================

export const aiContentConfig = {
  // Content Processing
  contentChunkSize: env.CONTENT_CHUNK_SIZE,
  contentChunkOverlap: env.CONTENT_CHUNK_OVERLAP,
  contentMaxFileSizeMb: env.CONTENT_MAX_FILE_SIZE_MB,
  
  // Storage
  contentUploadDir: env.CONTENT_UPLOAD_DIR,
  contentTempDir: env.CONTENT_TEMP_DIR,
  
  // AI Features
  contentAnalysisEnabled: env.CONTENT_ANALYSIS_ENABLED,
  contentSummaryMaxTokens: env.CONTENT_SUMMARY_MAX_TOKENS,
  contentTopicExtractionCount: env.CONTENT_TOPIC_EXTRACTION_COUNT,
  contentQuestionSuggestionCount: env.CONTENT_QUESTION_SUGGESTION_COUNT,
  
  // PDF Processing
  pdfExtractImages: env.PDF_EXTRACT_IMAGES,
  pdfExtractTables: env.PDF_EXTRACT_TABLES,
  pdfMaxPages: env.PDF_MAX_PAGES,
  
  // Markdown Processing
  markdownExtractCodeBlocks: env.MARKDOWN_EXTRACT_CODE_BLOCKS,
  markdownExtractHeadings: env.MARKDOWN_EXTRACT_HEADINGS,
  
  // Text Processing
  textDetectEncoding: env.TEXT_DETECT_ENCODING,
  textNormalizeWhitespace: env.TEXT_NORMALIZE_WHITESPACE,
  
  // Cache
  contentCacheEnabled: env.CONTENT_CACHE_ENABLED,
  contentCacheTtlSeconds: env.CONTENT_CACHE_TTL_SECONDS,
  
  // Rate Limiting
  contentRateLimitEnabled: env.CONTENT_RATE_LIMIT_ENABLED,
  contentRateLimitMaxPerHour: env.CONTENT_RATE_LIMIT_MAX_PER_HOUR,

  // Transcription (Whisper)
  transcriptionMaxFileSizeMb: env.TRANSCRIPTION_MAX_FILE_SIZE_MB,
  transcriptionProMonthlyMinutes: env.TRANSCRIPTION_PRO_MONTHLY_MINUTES,
  transcriptionExtraCostPerMinuteArs: env.TRANSCRIPTION_EXTRA_COST_PER_MINUTE_ARS,
  transcriptionExtraCostPerMinuteCredits: env.TRANSCRIPTION_EXTRA_COST_PER_MINUTE_CREDITS,
} as const;

// ============================================
// Supported Formats
// ============================================

export const SUPPORTED_CONTENT_TYPES: Record<string, { extensions: string[]; mimeTypes: string[]; maxSize: number }> = {
  pdf: {
    extensions: ['.pdf'],
    mimeTypes: ['application/pdf'],
    maxSize: 50 * 1024 * 1024, // 50MB
  },
  markdown: {
    extensions: ['.md', '.markdown', '.mdown', '.mkd'],
    mimeTypes: ['text/markdown', 'text/plain'],
    maxSize: 10 * 1024 * 1024, // 10MB
  },
  text: {
    extensions: ['.txt', '.text', '.log'],
    mimeTypes: ['text/plain'],
    maxSize: 10 * 1024 * 1024, // 10MB
  },
};

// ============================================
 // Supported Audio/Video Formats for Transcription
 // ============================================

 export const SUPPORTED_TRANSCRIPTION_FORMATS: Record<string, { extensions: string[]; mimeTypes: string[]; maxSize: number }> = {
   audio: {
     extensions: ['.mp3', '.wav', '.m4a', '.aac', '.ogg'],
     mimeTypes: ['audio/mpeg', 'audio/wav', 'audio/mp4', 'audio/aac', 'audio/ogg'],
     maxSize: 25 * 1024 * 1024, // 25MB
   },
   video: {
     extensions: ['.mp4', '.webm', '.mov', '.avi'],
     mimeTypes: ['video/mp4', 'video/webm', 'video/quicktime', 'video/x-msvideo'],
     maxSize: 25 * 1024 * 1024, // 25MB
   },
 };

 // ============================================
 // Type Exports
 // ============================================

 export type ContentConfig = typeof aiContentConfig;
 export type SupportedContentFormat = keyof typeof SUPPORTED_CONTENT_TYPES;