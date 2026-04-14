/**
 * ContentReaderService Tests
 * Phase 2: ContentReaderService
 * 
 * Tests for PDF, Markdown, and TXT content extraction
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';

// Import the service to test
import { ContentReaderService } from './content-reader.service';

// Mock the config
vi.mock('../../../config/ai-content.config', () => ({
  aiContentConfig: {
    contentChunkSize: 2000,
    contentChunkOverlap: 200,
    contentMaxFileSizeMb: 50,
    pdfMaxPages: 500,
    markdownExtractCodeBlocks: true,
    markdownExtractHeadings: true,
    textDetectEncoding: true,
    textNormalizeWhitespace: true,
  },
  SUPPORTED_CONTENT_TYPES: {
    pdf: {
      extensions: ['.pdf'],
      mimeTypes: ['application/pdf'],
      maxSize: 52428800,
    },
    markdown: {
      extensions: ['.md', '.markdown'],
      mimeTypes: ['text/markdown'],
      maxSize: 10485760,
    },
    text: {
      extensions: ['.txt', '.text'],
      mimeTypes: ['text/plain'],
      maxSize: 10485760,
    },
  },
}));

// Mock logger
vi.mock('../../../utils/logger', () => ({
  default: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    child: vi.fn(() => ({
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    })),
  },
}));

describe('ContentReaderService', () => {
  let service: ContentReaderService;
  let tempDir: string;

  beforeEach(async () => {
    service = new ContentReaderService();
    // Create a temporary directory for test files
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'content-reader-test-'));
  });

  afterEach(async () => {
    // Clean up temporary directory
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe('Constructor', () => {
    it('should create an instance successfully', () => {
      expect(service).toBeInstanceOf(ContentReaderService);
    });
  });

  describe('isSupported()', () => {
    it('should return true for PDF files', () => {
      expect(service.isSupported('document.pdf')).toBe(true);
      expect(service.isSupported('/path/to/file.PDF')).toBe(true);
    });

    it('should return true for Markdown files', () => {
      expect(service.isSupported('readme.md')).toBe(true);
      expect(service.isSupported('notes.markdown')).toBe(true);
    });

    it('should return true for text files', () => {
      expect(service.isSupported('log.txt')).toBe(true);
      expect(service.isSupported('data.text')).toBe(true);
    });

    it('should return false for unsupported files', () => {
      expect(service.isSupported('image.png')).toBe(false);
      expect(service.isSupported('archive.zip')).toBe(false);
      expect(service.isSupported('document.doc')).toBe(false);
    });
  });

  describe('getSupportedExtensions()', () => {
    it('should return all supported extensions', () => {
      const extensions = service.getSupportedExtensions();
      expect(extensions).toContain('.pdf');
      expect(extensions).toContain('.md');
      expect(extensions).toContain('.markdown');
      expect(extensions).toContain('.txt');
    });
  });

  describe('readContent()', () => {
    it('should return error for non-existent file', async () => {
      const result = await service.readContent('/non/existent/file.txt');
      
      expect(result.success).toBe(false);
      expect(result.error).toContain('not found');
    });

    it('should return error for file with unsupported extension', async () => {
      const testFile = path.join(tempDir, 'test.png');
      await fs.writeFile(testFile, 'fake image data');
      
      const result = await service.readContent(testFile);
      
      expect(result.success).toBe(false);
      expect(result.error).toContain('Unsupported');
    });

    it('should extract text from plain text file', async () => {
      const testFile = path.join(tempDir, 'test.txt');
      const testContent = 'Hello, this is a test file.\nIt has multiple lines.';
      await fs.writeFile(testFile, testContent);
      
      const result = await service.readContent(testFile);
      
      expect(result.success).toBe(true);
      expect(result.text).toBe(testContent);
      expect(result.metadata.sourceType).toBe('text');
      expect(result.metadata.fileName).toBe('test.txt');
      expect(result.metadata.charCount).toBe(testContent.length);
    });

    it('should extract text from markdown file', async () => {
      const testFile = path.join(tempDir, 'test.md');
      const testContent = `# Title

This is a paragraph.

## Section

Some content here.`;
      await fs.writeFile(testFile, testContent);
      
      const result = await service.readContent(testFile);
      
      expect(result.success).toBe(true);
      expect(result.text).toContain('Title');
      expect(result.text).toContain('Section');
      expect(result.metadata.sourceType).toBe('markdown');
      expect(result.metadata.fileName).toBe('test.md');
    });

    it('should count words when countWords option is true', async () => {
      const testFile = path.join(tempDir, 'words.txt');
      await fs.writeFile(testFile, 'one two three four five');
      
      const result = await service.readContent(testFile, { countWords: true });
      
      expect(result.success).toBe(true);
      expect(result.metadata.wordCount).toBe(5);
    });

    it('should not count words when countWords option is false', async () => {
      const testFile = path.join(tempDir, 'nowords.txt');
      await fs.writeFile(testFile, 'one two three');
      
      const result = await service.readContent(testFile, { countWords: false });
      
      expect(result.success).toBe(true);
      expect(result.metadata.wordCount).toBeUndefined();
    });

    it('should return error for file exceeding size limit', async () => {
      const testFile = path.join(tempDir, 'big.txt');
      // Create a file larger than 50MB (contentMaxFileSizeMb in mock config)
      // For testing, we test with a mock that simulates this
      const largeContent = 'x'.repeat(60 * 1024 * 1024); // 60MB
      await fs.writeFile(testFile, largeContent);
      
      const result = await service.readContent(testFile);
      
      expect(result.success).toBe(false);
      expect(result.error).toContain('too large');
    });
  });

  describe('processIntoChunks()', () => {
    it('should split text into chunks with default options', () => {
      const text = 'A'.repeat(5000); // 5000 chars
      const result = service.processIntoChunks(text, 'test.txt', 'text');
      
      expect(result.totalChunks).toBeGreaterThan(1);
      expect(result.totalChars).toBe(5000);
      expect(result.chunks[0]).toHaveProperty('id');
      expect(result.chunks[0]).toHaveProperty('content');
      expect(result.chunks[0]).toHaveProperty('index');
    });

    it('should respect custom chunk size', () => {
      const text = 'A'.repeat(1000);
      const result = service.processIntoChunks(text, 'test.txt', 'text', { 
        chunkSize: 200 // Default minimum is 100, so 200 is valid
      });
      
      expect(result.totalChunks).toBe(5);
      expect(result.chunks[0].content.length).toBe(200);
    });

    it('should create chunks with overlap', () => {
      const text = 'ABCDEFGHIJ'.repeat(50); // 500 chars
      const result = service.processIntoChunks(text, 'test.txt', 'text', {
        chunkSize: 200,
        chunkOverlap: 50,
      });
      
      // With 500 chars, 200 chunk size, 50 overlap -> multiple chunks with overlap
      expect(result.totalChunks).toBeGreaterThan(1);
      // Check that chunks have overlapping content
      expect(result.chunks[1].startPosition).toBeLessThan(result.chunks[0].endPosition);
    });

    it('should include source metadata in each chunk', () => {
      const text = 'test content';
      const result = service.processIntoChunks(text, 'document.pdf', 'pdf');
      
      expect(result.chunks[0].metadata.sourceType).toBe('pdf');
      expect(result.chunks[0].metadata.fileName).toBe('document.pdf');
    });

    it('should handle empty text', () => {
      const result = service.processIntoChunks('', 'empty.txt', 'text');
      
      expect(result.totalChunks).toBe(0);
      expect(result.chunks).toHaveLength(0);
    });

    it('should handle text smaller than chunk size', () => {
      const text = 'Short text';
      const result = service.processIntoChunks(text, 'short.txt', 'text');
      
      expect(result.totalChunks).toBe(1);
      expect(result.chunks[0].content).toBe('Short text');
    });

    it('should preserve source info', () => {
      const text = 'Content';
      const result = service.processIntoChunks(text, 'readme.md', 'markdown');
      
      expect(result.sourceInfo.type).toBe('markdown');
      expect(result.sourceInfo.fileName).toBe('readme.md');
    });
  });

  describe('Error handling', () => {
    it('should handle validation errors gracefully', async () => {
      // Empty file path should cause validation error
      const result = await service.readContent('');
      
      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid');
    });

    it('should handle invalid options gracefully', async () => {
      const testFile = path.join(tempDir, 'test.txt');
      await fs.writeFile(testFile, 'content');
      
      // Invalid chunk size (too small) - should fail validation gracefully
      const result = await service.readContent(testFile, { 
        chunkSize: 50 // Less than minimum 100
      });
      
      // Should fail gracefully with validation error (not throw)
      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid');
    });
  });
});

describe('ContentReaderService Integration', () => {
  let service: ContentReaderService;
  let tempDir: string;

  beforeEach(async () => {
    service = new ContentReaderService();
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'content-integration-'));
  });

  afterEach(async () => {
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore
    }
  });

  it('should complete full workflow: read, process, chunk', async () => {
    // Create test file
    const testFile = path.join(tempDir, 'workflow.md');
    const content = `# Test Document

This is the first paragraph with some content.

## Second Section

This is the second paragraph with more content.

### Third Subsection

Final paragraph content here.`;
    await fs.writeFile(testFile, content);

    // Step 1: Read content
    const extracted = await service.readContent(testFile);
    expect(extracted.success).toBe(true);
    expect(extracted.text).toContain('Test Document');

    // Step 2: Process into chunks
    const processed = service.processIntoChunks(
      extracted.text,
      extracted.metadata.fileName,
      extracted.metadata.sourceType,
      { chunkSize: 500, chunkOverlap: 100 }
    );

    expect(processed.totalChunks).toBeGreaterThan(0);
    expect(processed.sourceInfo.fileName).toBe('workflow.md');

    // Verify chunks have unique IDs
    const chunkIds = processed.chunks.map(c => c.id);
    const uniqueIds = new Set(chunkIds);
    expect(uniqueIds.size).toBe(chunkIds.length);
  });

  it('should handle multiple file types in sequence', async () => {
    // Test text file
    const txtFile = path.join(tempDir, 'sample.txt');
    await fs.writeFile(txtFile, 'Plain text content');
    const txtResult = await service.readContent(txtFile);
    expect(txtResult.success).toBe(true);
    expect(txtResult.metadata.sourceType).toBe('text');

    // Test markdown file
    const mdFile = path.join(tempDir, 'sample.md');
    await fs.writeFile(mdFile, '# Markdown content');
    const mdResult = await service.readContent(mdFile);
    expect(mdResult.success).toBe(true);
    expect(mdResult.metadata.sourceType).toBe('markdown');
  });
});