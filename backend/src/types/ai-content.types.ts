/**
 * AI Content Assistant - Type Definitions
 * Phase 1: Infrastructure & Setup
 * 
 * Types for the content reading and processing features
 */

import { z } from 'zod';

// ============================================
// Content Source Types
// ============================================

export type ContentSourceType = 'pdf' | 'markdown' | 'text';

export interface ContentSource {
  type: ContentSourceType;
  fileName: string;
  filePath: string;
  size: number;
  mimeType: string;
}

// ============================================
// Content Reading Types
// ============================================

export interface ContentMetadata {
  sourceType: ContentSourceType;
  fileName: string;
  fileSize: number;
  extractedAt: Date;
  pageCount?: number;
  wordCount?: number;
  charCount?: number;
  encoding?: string;
}

export interface ExtractedContent {
  text: string;
  metadata: ContentMetadata;
  success: boolean;
  error?: string;
}

// ============================================
// Content Processing Types
// ============================================

export interface ContentChunk {
  id: string;
  content: string;
  index: number;
  startPosition: number;
  endPosition: number;
  metadata: {
    sourceType: ContentSourceType;
    fileName: string;
  };
}

export interface ProcessedContent {
  chunks: ContentChunk[];
  totalChunks: number;
  totalChars: number;
  sourceInfo: {
    type: ContentSourceType;
    fileName: string;
  };
}

// ============================================
// AI Processing Types
// ============================================

export interface ContentAnalysis {
  summary: string;
  keyTopics: string[];
  suggestedQuestions: string[];
  language: string;
  wordCount: number;
}

export interface ContentSummary {
  text: string;
  keyPoints: string[];
  metadata: {
    originalLength: number;
    summaryLength: number;
    compressionRatio: number;
  };
}

// ============================================
// Validation Schemas
// ============================================

/**
 * Schema for validating content source input
 */
export const contentSourceSchema = z.object({
  type: z.enum(['pdf', 'markdown', 'text']),
  fileName: z.string().min(1).max(255),
  filePath: z.string().min(1),
  size: z.number().positive().max(50 * 1024 * 1024), // 50MB max
  mimeType: z.string(),
});

/**
 * Schema for validating extracted content
 */
export const extractedContentSchema = z.object({
  text: z.string(),
  metadata: z.object({
    sourceType: z.enum(['pdf', 'markdown', 'text']),
    fileName: z.string(),
    fileSize: z.number(),
    extractedAt: z.date(),
    pageCount: z.number().optional(),
    wordCount: z.number().optional(),
    charCount: z.number().optional(),
    encoding: z.string().optional(),
  }),
  success: z.boolean(),
  error: z.string().optional(),
});

/**
 * Schema for content processing options
 */
export const contentProcessingOptionsSchema = z.object({
  chunkSize: z.number().min(100).max(10000).default(2000),
  chunkOverlap: z.number().min(0).max(1000).default(200),
  extractMetadata: z.boolean().default(true),
  countWords: z.boolean().default(true),
});

/**
 * Schema for content analysis request
 */
export const contentAnalysisRequestSchema = z.object({
  content: z.string().min(1),
  analysisType: z.enum(['summary', 'topics', 'questions', 'full']).default('full'),
  maxSummaryLength: z.number().min(50).max(5000).optional(),
});

/**
 * Schema for reading content from file path
 */
export const readContentRequestSchema = z.object({
  filePath: z.string().min(1),
  options: contentProcessingOptionsSchema.partial().optional(),
});

// ============================================
// Type Exports
// ============================================

export type ContentSourceInput = z.infer<typeof contentSourceSchema>;
export type ContentProcessingOptions = z.infer<typeof contentProcessingOptionsSchema>;
export type ContentAnalysisRequest = z.infer<typeof contentAnalysisRequestSchema>;
export type ReadContentRequest = z.infer<typeof readContentRequestSchema>;