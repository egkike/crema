/**
 * AI Content Controller
 * Phase 6: API Routes
 * 
 * REST endpoints for AI Content Assistant services:
 * - POST /api/ai/content/assist - AI content analysis
 * - POST /api/ai/quiz/generate - Generate quizzes
 * - POST /api/ai/transcribe - Transcribe audio/video
 * - GET /api/ai/transcription/usage - Check transcription usage
 */

import { Request, Response, NextFunction } from 'express';

import logger from '../utils/logger';
import { AppError } from '../errors/AppError';
import { aiContentConfig } from '../config/ai-content.config';
import { contentReaderService } from '../services/ai/content/content-reader.service';
import { contentAssistantService, ProductType } from '../services/ai/content/content-assistant.service';
import { quizGeneratorService } from '../services/ai/content/quiz-generator.service';
import { transcriptionService } from '../services/ai/content/transcription.service';
import { aiCreditService } from '../services/ai/credits.service';

// ============================================================================
// AI Content Controller
// ============================================================================

export class AIContentController {
  /**
   * POST /api/ai/content/assist
   * Analyze content using AI
   * 
   * Body:
   * - content: string (required) - Text content to analyze
   * - filePath?: string - Optional file path for content extraction
   * - productType?: 'course' | 'book' | 'article' | 'document' | 'podcast' | 'video'
   * - analysisType?: 'summary' | 'topics' | 'questions' | 'full' (default: 'full')
   * - maxSummaryLength?: number (50-5000)
   * 
   * Credits: 1 credit per analysis (unless content extracted from file)
   */
  async assist(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = req.user?.id;
      const { content, filePath, productType, analysisType, maxSummaryLength } = req.body;

      // Extract content from file if provided
      let contentToAnalyze = content;
      if (filePath) {
        const extracted = await contentReaderService.readContent(filePath);
        if (!extracted.success) {
          throw new AppError(extracted.error || 'Error extracting content', 400);
        }
        contentToAnalyze = extracted.text;
      }

      // Validate content length
      if (contentToAnalyze.length > aiContentConfig.maxContentLength) {
        throw new AppError(
          `Contenido excede el máximo de ${aiContentConfig.maxContentLength} caracteres`,
          400
        );
      }

      // Check credits if user is authenticated
      if (userId) {
        const { balance } = await aiCreditService.getBalance(userId);
        if (balance < aiContentConfig.creditsPerAnalysis) {
          throw new AppError(
            `Créditos insuficientes. Necesitás ${aiContentConfig.creditsPerAnalysis} credits`,
            402
          );
        }
        
        // Deduct credits
        await aiCreditService.useCredits(
          userId,
          aiContentConfig.creditsPerAnalysis,
          'content_analysis'
        );
      }

      // Call the service
      const result = await contentAssistantService.analyze({
        userId,
        content: contentToAnalyze,
        filePath,
        productType: productType as ProductType | undefined,
        analysisType: analysisType || 'full',
        maxSummaryLength,
      });

      res.json({
        success: true,
        data: result.data,
        detectedProductType: result.detectedProductType,
        creditsUsed: userId ? aiContentConfig.creditsPerAnalysis : 0,
      });
    } catch (error) {
      logger.error({ error, body: req.body }, 'Error in AI content assist');
      next(error);
    }
  }

  /**
   * POST /api/ai/quiz/generate
   * Generate quiz from content
   * 
   * Body:
   * - content: string (required) - Text content
   * - filePath?: string - Optional file path
   * - productType?: 'course' | 'book' | 'article' | 'document' | 'podcast' | 'video'
   * - options?: {
   *     questionCount?: number (1-20, default: 5)
   *     questionTypes?: string[]
   *     difficulty?: 'easy' | 'medium' | 'hard'
   *     language?: 'es' | 'en'
   *   }
   * 
   * Credits: 2 credits per quiz
   */
  async generateQuiz(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = req.user?.id;
      const { content, filePath, productType, options } = req.body;

      // Extract content from file if provided
      let contentToUse = content;
      if (filePath) {
        const extracted = await contentReaderService.readContent(filePath);
        if (!extracted.success) {
          throw new AppError(extracted.error || 'Error extracting content', 400);
        }
        contentToUse = extracted.text;
      }

      // Validate content length
      if (contentToUse.length > aiContentConfig.maxContentLength) {
        throw new AppError(
          `Contenido excede el máximo de ${aiContentConfig.maxContentLength} caracteres`,
          400
        );
      }

      // Check credits if user is authenticated
      if (userId) {
        const { balance } = await aiCreditService.getBalance(userId);
        if (balance < aiContentConfig.creditsPerQuiz) {
          throw new AppError(
            `Créditos insuficientes. Necesitás ${aiContentConfig.creditsPerQuiz} credits`,
            402
          );
        }
        
        // Deduct credits
        await aiCreditService.useCredits(
          userId,
          aiContentConfig.creditsPerQuiz,
          'quiz_generation'
        );
      }

      // Call the service
      const result = await quizGeneratorService.generate({
        userId,
        content: contentToUse,
        filePath,
        productType: productType as ProductType | undefined,
        options,
      });

      res.json({
        success: true,
        data: result,
        creditsUsed: userId ? aiContentConfig.creditsPerQuiz : 0,
      });
    } catch (error) {
      logger.error({ error, body: req.body }, 'Error generating quiz');
      next(error);
    }
  }

  /**
   * POST /api/ai/transcribe
   * Transcribe audio/video file
   * 
   * Body (multipart/form-data):
   * - file: File (required) - Audio/video file
   * 
   * Headers:
   * - Content-Type: multipart/form-data
   * 
   * Credits: Based on transcription usage (Plan Pro: 60min/month, otherwise charged)
   */
  async transcribe(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = req.user?.id;
      
      if (!userId) {
        throw new AppError('Authentication required for transcription', 401);
      }

      // Check if file exists in request
      if (!req.file) {
        throw new AppError('No se detectó ningún archivo', 400);
      }

      const file = req.file;

      // Validate file size
      if (file.size > 25 * 1024 * 1024) {
        throw new AppError('El archivo excede el máximo de 25MB', 400);
      }

      // Validate file type
      if (!transcriptionService.isSupported(file.originalname)) {
        throw new AppError(
          `Tipo de archivo no soportado. Formatos válidos: mp3, wav, mp4, webm, m4a`,
          400
        );
      }

      // Get usage before transcription
      const usage = await transcriptionService.getMonthlyUsage(userId);

      // Check if user has quota or credits
      // If hasProPlan, usage is included. If not, charge per minute
      const needsCredits = !usage.hasProPlan;
      const creditsNeeded = needsCredits 
        ? Math.ceil(((usage.minutesUsed || 0) - (usage.minutesRemaining || 0)) * aiContentConfig.creditsPerTranscriptionMinute)
        : 0;
      
      if (needsCredits && creditsNeeded > 0) {
        const { balance } = await aiCreditService.getBalance(userId);
        if (balance < creditsNeeded) {
          throw new AppError(
            `Créditos insuficientes. Necesitás ${creditsNeeded} credits para transcribir`,
            402
          );
        }
      }

      // Transcribe
      const result = await transcriptionService.transcribe({
        userId,
        file: req.file.buffer,
        fileName: file.originalname,
        mimeType: file.mimetype,
      });

      if (!result.success) {
        throw new AppError(result.error || 'Transcription failed', 500);
      }

      // Deduct credits if needed
      if (creditsNeeded > 0) {
        await aiCreditService.useCredits(
          userId,
          creditsNeeded,
          'transcription'
        );
      }

      res.json({
        success: true,
        transcription: result.transcription,
        language: result.language,
        duration: result.duration,
        minutesUsed: result.duration ? Math.ceil(result.duration / 60) : 0,
      });
    } catch (error) {
      logger.error({ error, file: req.file }, 'Error in transcription');
      next(error);
    }
  }

  /**
   * GET /api/ai/transcription/usage
   * Get transcription usage for current month
   * 
   * Response:
   * - minutesUsed: number
   * - minutesRemaining: number (0 for non-Pro)
   * - hasProPlan: boolean
   * - costArs?: number (if exceeded)
   */
  async getTranscriptionUsage(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = req.user?.id;
      
      if (!userId) {
        throw new AppError('Authentication required', 401);
      }

      const usage = await transcriptionService.getMonthlyUsage(userId);

      res.json({
        success: true,
        data: usage,
      });
    } catch (error) {
      logger.error({ error }, 'Error getting transcription usage');
      next(error);
    }
  }
}

// Export singleton instance
export const aiContentController = new AIContentController();