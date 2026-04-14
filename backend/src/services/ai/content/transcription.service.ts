/**
 * TranscriptionService
 * Phase 5: AI Content Assistant - Transcription
 * 
 * Transcribes audio/video files using OpenAI Whisper API
 * Features:
 * - Supports mp3, wav, mp4, webm, m4a (max 25MB)
 * - Plan Pro: 60 min/month included (doesn't accumulate)
 * - Extra: 12 ARS/min or AI Credits if quota exceeded
 */

import type { Readable } from 'stream';

import { config } from '../../../config/index';
import { aiContentConfig, SUPPORTED_TRANSCRIPTION_FORMATS } from '../../../config/ai-content.config';
import { subscriptionRepository } from '../../../repositories/subscription.repository';
import { aiCreditService } from '../credits.service';
import { AppError } from '../../../errors/AppError';
import logger from '../../../utils/logger';

// ============================================================================
// Types
// ============================================================================

export type TranscriptionFileType = 'audio' | 'video';

export interface TranscriptionRequest {
  /** User ID */
  userId: string;
  /** File path or Buffer containing audio/video */
  file: Buffer | Readable;
  /** Original filename */
  fileName?: string;
  /** File MIME type (auto-detected if not provided) */
  mimeType?: string;
}

export interface TranscriptionResult {
  success: boolean;
  transcription?: string;
  language?: string;
  duration?: number;
  fileName?: string;
  fileType?: TranscriptionFileType;
  error?: string;
}

export interface TranscriptionUsageResult {
  /** Minutes used this month */
  minutesUsed: number;
  /** Minutes remaining in current billing cycle */
  minutesRemaining: number;
  /** Whether user has Plan Pro */
  hasProPlan: boolean;
  /** Cost for exceeded minutes in ARS */
  costArs?: number;
  /** Cost for exceeded minutes in credits */
  costCredits?: number;
}

export interface TranscriptionCostResult {
  minutesUsed: number;
  minutesIncluded: number;
  minutesExcess: number;
  costArs: number;
  costCredits: number;
  chargeType: 'included' | 'ars' | 'credits';
}

// ============================================================================
// Constants
// ============================================================================

const WHISPER_MODEL = 'whisper-1';
const DEFAULT_LANGUAGE = 'es';

// ============================================================================
// Transcription Service Class
// ============================================================================

export class TranscriptionService {
  /**
   * Check if a file type is supported for transcription
   */
  isSupported(fileName: string): boolean {
    const ext = fileName.toLowerCase().slice(fileName.lastIndexOf('.'));
    
    for (const format of Object.values(SUPPORTED_TRANSCRIPTION_FORMATS)) {
      if (format.extensions.includes(ext)) {
        return true;
      }
    }
    
    return false;
  }

  /**
   * Get supported file extensions
   */
  getSupportedExtensions(): string[] {
    const extensions: string[] = [];
    
    for (const format of Object.values(SUPPORTED_TRANSCRIPTION_FORMATS)) {
      extensions.push(...format.extensions);
    }
    
    return extensions;
  }

  /**
   * Get file type from filename
   */
  getFileType(fileName: string): TranscriptionFileType | null {
    const ext = fileName.toLowerCase().slice(fileName.lastIndexOf('.'));
    const audioFormats = SUPPORTED_TRANSCRIPTION_FORMATS.audio.extensions;
    const videoFormats = SUPPORTED_TRANSCRIPTION_FORMATS.video.extensions;
    
    if (audioFormats.includes(ext)) {
      return 'audio';
    }
    
    if (videoFormats.includes(ext)) {
      return 'video';
    }
    
    return null;
  }

  /**
   * Validate file for transcription
   */
  validateFile(file: Buffer, fileName: string): { valid: boolean; error?: string } {
    // Check file extension
    if (!this.isSupported(fileName)) {
      return {
        valid: false,
        error: `Unsupported file format. Supported: ${this.getSupportedExtensions().join(', ')}`,
      };
    }
    
    // Check file size
    const maxSize = aiContentConfig.transcriptionMaxFileSizeMb * 1024 * 1024;
    if (file.length > maxSize) {
      return {
        valid: false,
        error: `File too large. Maximum size: ${aiContentConfig.transcriptionMaxFileSizeMb}MB`,
      };
    }
    
    return { valid: true };
  }

  /**
   * Get user's transcription usage for current month (Plan Pro)
   */
  async getMonthlyUsage(userId: string): Promise<TranscriptionUsageResult> {
    // Get user's subscription
    const subscription = await subscriptionRepository.getActiveSubscription(userId);
    
    const hasProPlan: boolean = subscription?.plan_id === 'plan-pro' || 
      subscription?.plan_id === 'plan-pro-ars' ||
      subscription?.plan_id?.includes('pro') ||
      false;
    
    // For now, we store usage in memory (in production, use database)
    const usage = this.getUsageFromMemory(userId);
    
    const included = hasProPlan ? aiContentConfig.transcriptionProMonthlyMinutes : 0;
    const remaining = Math.max(0, included - usage.minutesUsed);
    
    return {
      minutesUsed: usage.minutesUsed,
      minutesRemaining: remaining,
      hasProPlan,
      costArs: usage.minutesUsed > included 
        ? (usage.minutesUsed - included) * aiContentConfig.transcriptionExtraCostPerMinuteArs
        : undefined,
      costCredits: undefined,
    };
  }

  /**
   * Calculate cost for transcription
   */
  calculateCost(minutes: number, hasProPlan: boolean): TranscriptionCostResult {
    const included = hasProPlan ? aiContentConfig.transcriptionProMonthlyMinutes : 0;
    const excess = Math.max(0, minutes - included);
    const withinQuota = hasProPlan && minutes <= included;
    
    // Determine charge type: only 'included' if has Pro AND within quota
    let chargeType: 'included' | 'ars' | 'credits';
    if (withinQuota) {
      chargeType = 'included';
    } else if (excess > 0) {
      chargeType = hasProPlan ? 'ars' : 'credits';
    } else {
      chargeType = 'credits';
    }
    
    return {
      minutesUsed: minutes,
      minutesIncluded: included,
      minutesExcess: excess,
      costArs: excess * aiContentConfig.transcriptionExtraCostPerMinuteArs,
      costCredits: withinQuota ? 0 : minutes * aiContentConfig.transcriptionExtraCostPerMinuteCredits,
      chargeType,
    };
  }

  /**
   * Transcribe audio/video file
   * This method handles the full transcription flow including quota checks
   */
  async transcribe(request: TranscriptionRequest): Promise<TranscriptionResult> {
    const { userId, file, fileName = 'audio.mp3' } = request;
    
    try {
      // Validate file
      const fileBuffer = Buffer.isBuffer(file) ? file : await this.readStreamToBuffer(file);
      const validation = this.validateFile(fileBuffer, fileName);
      
      if (!validation.valid) {
        return {
          success: false,
          error: validation.error,
        };
      }
      
      // Get file type
      const fileType = this.getFileType(fileName);
      if (!fileType) {
        return {
          success: false,
          error: 'Unable to determine file type',
        };
      }
      
      // Check usage and calculate cost
      const usage = await this.getMonthlyUsage(userId);
      
      // Estimate duration (Whisper processes roughly in real-time)
      // For accurate duration, we'd need to analyze the audio
      const estimatedMinutes = await this.estimateDuration(fileBuffer);
      
      if (usage.hasProPlan) {
        // Check if within included quota
        if (usage.minutesRemaining < estimatedMinutes) {
          const excessMinutes = estimatedMinutes - usage.minutesRemaining;
          const costArs = excessMinutes * aiContentConfig.transcriptionExtraCostPerMinuteArs;
          
          logger.info(
            { userId, estimatedMinutes, excessMinutes, costArs },
            'Transcription exceeds Plan Pro quota, will charge ARS'
          );
          
          // Charge ARS for excess minutes - add to user's pending balance
          // This would integrate with the payment/balance system
          await this.chargeExcessUsage(userId, costArs, excessMinutes);
        }
      } else {
        // No plan - need credits or charge ARS
        const creditsNeeded = estimatedMinutes * aiContentConfig.transcriptionExtraCostPerMinuteCredits;
        
        // Check if user has credits
        const hasCredits = await aiCreditService.hasSufficientCredits(userId, creditsNeeded);
        
        if (!hasCredits) {
          return {
            success: false,
            error: `Insufficient credits. Need ${creditsNeeded} credits, please purchase credits first.`,
          };
        }
        
        // Use credits
        await aiCreditService.useCredits(
          userId,
          creditsNeeded,
          `Transcription: ${fileName} (${estimatedMinutes} min)`,
          undefined
        );
      }
      
      // Perform transcription using Whisper API
      const transcription = await this.callWhisperAPI(fileBuffer, fileName);
      
      // Update usage tracking
      await this.updateUsage(userId, estimatedMinutes);
      
      return {
        success: true,
        transcription: transcription.text,
        language: transcription.language,
        duration: estimatedMinutes,
        fileName,
        fileType,
      };
      
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error({ userId, fileName, error: errorMessage }, 'Transcription failed');
      
      return {
        success: false,
        error: `Transcription failed: ${errorMessage}`,
      };
    }
  }

  /**
   * Call Whisper API for transcription
   */
  private async callWhisperAPI(
    fileBuffer: Buffer,
    fileName: string
  ): Promise<{ text: string; language: string }> {
    const apiKey = config.ai.openaiApiKey;
    
    if (!apiKey) {
      throw new AppError('OpenAI API key not configured', 500);
    }
    
    // Create FormData with the audio file
    const formData = new FormData();
    // Convert Node.js Buffer to Uint8Array for browser Blob compatibility
    const uint8Array = new Uint8Array(fileBuffer);
    const blob = new Blob([uint8Array]);
    formData.append('file', blob, fileName);
    formData.append('model', WHISPER_MODEL);
    formData.append('language', DEFAULT_LANGUAGE);
    formData.append('response_format', 'json');
    
    const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
      },
      body: formData as unknown as BodyInit,
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      throw new AppError(`Whisper API error: ${response.status} - ${errorText}`, 500);
    }
    
    const result = await response.json() as { text?: string };
    
    return {
      text: result.text || '',
      language: DEFAULT_LANGUAGE,
    };
  }

  /**
   * Estimate audio duration (basic estimation)
   * In production, use a proper audio analysis library
   */
  private async estimateDuration(buffer: Buffer): Promise<number> {
    // Rough estimation: ~128kbps for mp3, ~256kbps for other formats
    // This is a simplified estimation
    // In production, use ffprobe or audio-decode library
    
    // Estimate based on file size
    const bytes = buffer.length;
    const avgBitrate = 192000; // 192 kbps average
    const seconds = (bytes * 8) / avgBitrate;
    const minutes = Math.ceil(seconds / 60);
    
    // Return at least 1 minute, max 10 minutes per file
    return Math.max(1, Math.min(minutes, 10));
  }

  /**
   * Get MIME type from extension
   */
  private getMimeType(ext: string): string {
    const mimeTypes: Record<string, string> = {
      '.mp3': 'audio/mpeg',
      '.wav': 'audio/wav',
      '.m4a': 'audio/mp4',
      '.aac': 'audio/aac',
      '.ogg': 'audio/ogg',
      '.mp4': 'video/mp4',
      '.webm': 'video/webm',
      '.mov': 'video/quicktime',
      '.avi': 'video/x-msvideo',
    };
    
    return mimeTypes[ext.toLowerCase()] || 'audio/mpeg';
  }

  /**
   * Read stream to buffer
   */
  private async readStreamToBuffer(stream: Readable): Promise<Buffer> {
    const chunks: Uint8Array[] = [];
    
    for await (const chunk of stream) {
      chunks.push(chunk);
    }
    
    return Buffer.concat(chunks);
  }

  // ============================================================================
  // Usage Tracking (In-memory for demo, use Redis/database in production)
  // ============================================================================

  private usageCache = new Map<string, { minutesUsed: number; month: string }>();

  private getUsageKey(userId: string): string {
    const now = new Date();
    return `${userId}-${now.getFullYear()}-${now.getMonth() + 1}`;
  }

  private getUsageFromMemory(userId: string): { minutesUsed: number } {
    const key = this.getUsageKey(userId);
    const usage = this.usageCache.get(key);
    return usage || { minutesUsed: 0 };
  }

  private async updateUsage(userId: string, minutes: number): Promise<void> {
    const key = this.getUsageKey(userId);
    const current = this.getUsageFromMemory(userId);
    
    this.usageCache.set(key, {
      minutesUsed: current.minutesUsed + minutes,
      month: key,
    });
  }

  /**
   * Reset monthly usage (for testing or admin)
   */
  async resetMonthlyUsage(userId: string): Promise<void> {
    const key = this.getUsageKey(userId);
    this.usageCache.delete(key);
    logger.info({ userId }, 'Transcription monthly usage reset');
  }

  /**
   * Charge excess usage for Pro plan quota exceeded
   * Adds charge to user's pending balance (would integrate with payment system)
   */
  private async chargeExcessUsage(userId: string, costArs: number, minutes: number): Promise<void> {
    // In a real implementation, this would:
    // 1. Create a pending charge record
    // 2. Send notification to user
    // 3. Integrate with payment service for next billing cycle
    
    logger.warn(
      { userId, costArs, minutes, reason: 'Pro quota exceeded' },
      'User exceeded Plan Pro transcription quota - charge queued'
    );
    
    // For now, track this as a credit usage so we can see who is overquota
    // In production, this would add to user's balance/payment due
    // Using AI credits as a fallback: 1 credit per 1 ARS (rough approximation)
    const creditsEquivalent = Math.ceil(costArs);
    
    try {
      // Try to charge via credits as fallback
      const hasCredits = await aiCreditService.hasSufficientCredits(userId, creditsEquivalent);
      if (hasCredits) {
        await aiCreditService.useCredits(
          userId,
          creditsEquivalent,
          `Transcription excess: ${minutes} min (Pro quota exceeded)`,
          undefined
        );
        logger.info({ userId, creditsCharged: creditsEquivalent }, 'Excess transcription charged to credits');
      } else {
        // If no credits either, warn but allow transcription (graceful degradation)
        logger.warn(
          { userId, costArs, creditsEquivalent },
          'User has no credits for excess transcription - allowing with warning'
        );
      }
    } catch (error) {
      logger.error({ error, userId, costArs }, 'Failed to charge excess transcription');
      // Don't block transcription on charge failure - log and continue
    }
  }
}

// ============================================================================
// Export singleton instance
// ============================================================================

export const transcriptionService = new TranscriptionService();