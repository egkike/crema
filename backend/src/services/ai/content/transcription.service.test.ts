/**
 * TranscriptionService Tests
 * Phase 5: AI Content Assistant - TranscriptionService
 * 
 * Tests for audio/video transcription with Whisper API
 * Plan Pro integration (60 min/month), credits system
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Import the service to test
import { TranscriptionService } from './transcription.service';

// Mock config
vi.mock('../../../config/index', () => ({
  config: {
    ai: {
      openaiApiKey: 'test-api-key',
    },
  },
}));

// Mock configService
vi.mock('../../../services/config.service', () => ({
  configService: {
    get: vi.fn().mockResolvedValue('whisper-1'),
    getNumber: vi.fn().mockResolvedValue(0),
    getBoolean: vi.fn().mockResolvedValue(false),
  },
}));

vi.mock('../../../config/ai-content.config', () => ({
  aiContentConfig: {
    transcriptionMaxFileSizeMb: 25,
    transcriptionProMonthlyMinutes: 60,
    transcriptionExtraCostPerMinuteArs: 12,
    transcriptionExtraCostPerMinuteCredits: 3,
  },
  SUPPORTED_TRANSCRIPTION_FORMATS: {
    audio: {
      extensions: ['.mp3', '.wav', '.m4a', '.aac', '.ogg'],
      mimeTypes: ['audio/mpeg', 'audio/wav', 'audio/mp4'],
      maxSize: 26214400, // 25MB
    },
    video: {
      extensions: ['.mp4', '.webm', '.mov', '.avi'],
      mimeTypes: ['video/mp4', 'video/webm'],
      maxSize: 26214400,
    },
  },
}));

// Mock subscription repository
vi.mock('../../../repositories/subscription.repository', () => ({
  subscriptionRepository: {
    getActiveSubscription: vi.fn(),
  },
}));

// Mock credits service
vi.mock('../credits.service', () => ({
  aiCreditService: {
    hasSufficientCredits: vi.fn().mockResolvedValue(true),
    useCredits: vi.fn().mockResolvedValue({ balance: 100 }),
  },
}));

// Mock AppError
vi.mock('../../../errors/AppError', () => ({
  AppError: class AppError extends Error {
    constructor(message: string, _statusCode: number) {
      super(message);
      this.name = 'AppError';
    }
  },
}));

// Mock logger
vi.mock('../../../utils/logger', () => ({
  default: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

describe('TranscriptionService', () => {
  let service: TranscriptionService;

  beforeEach(() => {
    service = new TranscriptionService();
    vi.clearAllMocks();
  });

  describe('Constructor', () => {
    it('should create an instance successfully', () => {
      expect(service).toBeInstanceOf(TranscriptionService);
    });
  });

  describe('isSupported()', () => {
    it('should return true for mp3 files', () => {
      expect(service.isSupported('audio.mp3')).toBe(true);
      expect(service.isSupported('audio.MP3')).toBe(true);
    });

    it('should return true for wav files', () => {
      expect(service.isSupported('audio.wav')).toBe(true);
    });

    it('should return true for m4a files', () => {
      expect(service.isSupported('podcast.m4a')).toBe(true);
    });

    it('should return true for mp4 video files', () => {
      expect(service.isSupported('video.mp4')).toBe(true);
    });

    it('should return true for webm files', () => {
      expect(service.isSupported('video.webm')).toBe(true);
    });

    it('should return false for unsupported files', () => {
      expect(service.isSupported('document.pdf')).toBe(false);
      expect(service.isSupported('image.png')).toBe(false);
      expect(service.isSupported('video.flv')).toBe(false);
    });
  });

  describe('getSupportedExtensions()', () => {
    it('should return all supported audio extensions', () => {
      const extensions = service.getSupportedExtensions();
      expect(extensions).toContain('.mp3');
      expect(extensions).toContain('.wav');
      expect(extensions).toContain('.m4a');
    });

    it('should return all supported video extensions', () => {
      const extensions = service.getSupportedExtensions();
      expect(extensions).toContain('.mp4');
      expect(extensions).toContain('.webm');
    });
  });

  describe('getFileType()', () => {
    it('should return audio for mp3', () => {
      expect(service.getFileType('audio.mp3')).toBe('audio');
    });

    it('should return audio for wav', () => {
      expect(service.getFileType('sound.wav')).toBe('audio');
    });

    it('should return video for mp4', () => {
      expect(service.getFileType('movie.mp4')).toBe('video');
    });

    it('should return video for webm', () => {
      expect(service.getFileType('clip.webm')).toBe('video');
    });

    it('should return null for unsupported', () => {
      expect(service.getFileType('doc.pdf')).toBeNull();
    });
  });

  describe('validateFile()', () => {
    it('should return valid for supported file', () => {
      const buffer = Buffer.alloc(1024);
      const result = service.validateFile(buffer, 'audio.mp3');
      expect(result.valid).toBe(true);
    });

    it('should return error for unsupported format', () => {
      const buffer = Buffer.alloc(1024);
      const result = service.validateFile(buffer, 'image.png');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Unsupported');
    });

    it('should return error for file too large', () => {
      // Create buffer larger than 25MB
      const buffer = Buffer.alloc(26 * 1024 * 1024);
      const result = service.validateFile(buffer, 'audio.mp3');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('too large');
    });

    it('should accept file at maximum size limit', () => {
      // 25MB - 1 byte should be valid
      const buffer = Buffer.alloc(25 * 1024 * 1024 - 1);
      const result = service.validateFile(buffer, 'audio.mp3');
      expect(result.valid).toBe(true);
    });
  });

  describe('calculateCost()', () => {
    it('should return included for Plan Pro within quota', () => {
      const cost = service.calculateCost(30, true);
      expect(cost.chargeType).toBe('included');
      expect(cost.costArs).toBe(0);
      expect(cost.costCredits).toBe(0);
    });

    it('should return ars for Plan Pro exceeding quota', () => {
      const cost = service.calculateCost(70, true);
      expect(cost.chargeType).toBe('ars');
      expect(cost.minutesExcess).toBe(10);
      expect(cost.costArs).toBe(120); // 10 * 12 ARS
    });

    it('should return credits for no Plan Pro', () => {
      const cost = service.calculateCost(10, false);
      expect(cost.chargeType).toBe('credits');
      expect(cost.costCredits).toBe(30); // 10 * 3 credits
    });

    it('should handle exactly at quota limit', () => {
      const cost = service.calculateCost(60, true);
      expect(cost.chargeType).toBe('included');
      expect(cost.minutesExcess).toBe(0);
    });

    it('should calculate 0 minutes correctly', () => {
      const cost = service.calculateCost(0, true);
      expect(cost.minutesUsed).toBe(0);
      expect(cost.minutesExcess).toBe(0);
    });
  });

  describe('getMonthlyUsage()', () => {
    it('should return 0 usage for new user', async () => {
      const { subscriptionRepository } = await import('../../../repositories/subscription.repository');
      vi.mocked(subscriptionRepository.getActiveSubscription).mockResolvedValue(null);
      
      const usage = await service.getMonthlyUsage('new-user');
      
      expect(usage.minutesUsed).toBe(0);
      expect(usage.hasProPlan).toBe(false);
    });

    it('should detect Plan Pro subscription', async () => {
      const { subscriptionRepository } = await import('../../../repositories/subscription.repository');
      vi.mocked(subscriptionRepository.getActiveSubscription).mockResolvedValue({
        id: 'sub-1',
        user_id: 'user-1',
        plan_id: 'plan-pro-ars',
        status: 'active',
        currency: 'ARS',
      });
      
      const usage = await service.getMonthlyUsage('user-1');
      
      expect(usage.hasProPlan).toBe(true);
    });

    it('should calculate remaining minutes for Plan Pro', async () => {
      const { subscriptionRepository } = await import('../../../repositories/subscription.repository');
      vi.mocked(subscriptionRepository.getActiveSubscription).mockResolvedValue({
        id: 'sub-1',
        user_id: 'user-1',
        plan_id: 'plan-pro',
        status: 'active',
        currency: 'ARS',
      });
      
      const usage = await service.getMonthlyUsage('user-1');
      
      expect(usage.minutesRemaining).toBe(60);
      expect(usage.minutesUsed).toBe(0);
    });
  });

  describe('transcribe()', () => {
    it('should return error for unsupported file format', async () => {
      const result = await service.transcribe({
        userId: 'user-1',
        file: Buffer.alloc(1024),
        fileName: 'document.pdf',
      });
      
      expect(result.success).toBe(false);
      expect(result.error).toContain('Unsupported');
    });

    it('should return error for file too large', async () => {
      const largeBuffer = Buffer.alloc(26 * 1024 * 1024);
      
      const result = await service.transcribe({
        userId: 'user-1',
        file: largeBuffer,
        fileName: 'audio.mp3',
      });
      
      expect(result.success).toBe(false);
      expect(result.error).toContain('too large');
    });

    it('should return error for insufficient credits (non-Pro)', async () => {
      const { subscriptionRepository } = await import('../../../repositories/subscription.repository');
      const { aiCreditService } = await import('../credits.service');
      
      vi.mocked(subscriptionRepository.getActiveSubscription).mockResolvedValue(null);
      vi.mocked(aiCreditService.hasSufficientCredits).mockResolvedValue(false);
      
      const result = await service.transcribe({
        userId: 'user-no-plan',
        file: Buffer.alloc(1024),
        fileName: 'audio.mp3',
      });
      
      expect(result.success).toBe(false);
      expect(result.error).toContain('Insufficient credits');
    });
  });

  describe('Error handling', () => {
    it('should handle empty filename gracefully', () => {
      expect(service.isSupported('')).toBe(false);
      expect(service.getFileType('')).toBeNull();
    });

    it('should handle file without extension', () => {
      expect(service.isSupported('audiofile')).toBe(false);
    });

    it('should handle files with path separators', () => {
      expect(service.isSupported('/path/to/audio.mp3')).toBe(true);
      expect(service.getFileType('/path/to/video.mp4')).toBe('video');
    });
  });

  describe('resetMonthlyUsage()', () => {
    it('should reset user usage', async () => {
      // First, transcribe to add usage (this would normally add to cache)
      // For this test, we just verify the method doesn't throw
      await expect(service.resetMonthlyUsage('user-1')).resolves.not.toThrow();
    });
  });
});

describe('TranscriptionService Integration', () => {
  let service: TranscriptionService;

  beforeEach(() => {
    service = new TranscriptionService();
  });

  it('should complete full workflow: validate, get type, calculate cost', async () => {
    // Step 1: Validate file
    const buffer = Buffer.alloc(1024);
    const validation = service.validateFile(buffer, 'podcast.mp3');
    expect(validation.valid).toBe(true);

    // Step 2: Get file type
    const fileType = service.getFileType('podcast.mp3');
    expect(fileType).toBe('audio');

    // Step 3: Calculate cost
    const cost = service.calculateCost(45, true);
    expect(cost.chargeType).toBe('included');
    expect(cost.minutesExcess).toBe(0);
  });

  it('should handle multiple file formats in sequence', () => {
    const formats = ['audio.mp3', 'audio.wav', 'podcast.m4a', 'video.mp4', 'clip.webm'];
    
    for (const format of formats) {
      expect(service.isSupported(format)).toBe(true);
      expect(service.getFileType(format)).not.toBeNull();
    }
  });

  it('should correctly distinguish audio from video', () => {
    expect(service.getFileType('song.mp3')).toBe('audio');
    expect(service.getFileType('song.wav')).toBe('audio');
    expect(service.getFileType('movie.mp4')).toBe('video');
    expect(service.getFileType('clip.webm')).toBe('video');
  });
});