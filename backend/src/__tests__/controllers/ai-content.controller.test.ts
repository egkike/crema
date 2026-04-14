import { describe, it, expect } from 'vitest';

describe('AIContentController - Happy Paths', () => {
  it('should export AIContentController class', async () => {
    const { aiContentController } = await import('../../controllers/ai-content.controller');
    expect(aiContentController).toBeDefined();
  });

  it('should have assist method', async () => {
    const { aiContentController } = await import('../../controllers/ai-content.controller');
    expect(typeof aiContentController.assist).toBe('function');
  });

  it('should have generateQuiz method', async () => {
    const { aiContentController } = await import('../../controllers/ai-content.controller');
    expect(typeof aiContentController.generateQuiz).toBe('function');
  });

  it('should have transcribe method', async () => {
    const { aiContentController } = await import('../../controllers/ai-content.controller');
    expect(typeof aiContentController.transcribe).toBe('function');
  });

  it('should have getTranscriptionUsage method', async () => {
    const { aiContentController } = await import('../../controllers/ai-content.controller');
    expect(typeof aiContentController.getTranscriptionUsage).toBe('function');
  });
});

describe('AIContentController - Endpoints Definition', () => {
  it('should have 4 endpoint methods', async () => {
    const { aiContentController } = await import('../../controllers/ai-content.controller');
    
    const methods = [
      'assist',
      'generateQuiz',
      'transcribe',
      'getTranscriptionUsage',
    ];
    
    methods.forEach(method => {
      expect(typeof aiContentController[method]).toBe('function');
    });
  });
});

describe('AIContentController - Route Registration', () => {
  it('should have assist method as async function', async () => {
    const { aiContentController } = await import('../../controllers/ai-content.controller');
    expect(aiContentController.assist.constructor.name).toBe('AsyncFunction');
  });

  it('should have generateQuiz method as async function', async () => {
    const { aiContentController } = await import('../../controllers/ai-content.controller');
    expect(aiContentController.generateQuiz.constructor.name).toBe('AsyncFunction');
  });

  it('should have transcribe method as async function', async () => {
    const { aiContentController } = await import('../../controllers/ai-content.controller');
    expect(aiContentController.transcribe.constructor.name).toBe('AsyncFunction');
  });

  it('should have getTranscriptionUsage method as async function', async () => {
    const { aiContentController } = await import('../../controllers/ai-content.controller');
    expect(aiContentController.getTranscriptionUsage.constructor.name).toBe('AsyncFunction');
  });
});