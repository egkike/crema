/**
 * Content Assistant Service
 * Phase 3: ContentAssistantService
 * 
 * Unified AI agent for content analysis with type detection
 * for 6 product types: courses, books, articles, documents, podcasts, videos
 */

import logger from '../../../utils/logger';
import { aiContentConfig } from '../../../config/ai-content.config';
import { llmService, LLMMessage } from '../llm.service';
import { aiCreditService } from '../credits.service';
import {
  ContentAnalysis,
  contentAnalysisRequestSchema,
} from '../../../types/ai-content.types';

import { contentReaderService } from './content-reader.service';

// ============================================================================
// Product Types
// ============================================================================

export type ProductType = 'course' | 'book' | 'article' | 'document' | 'podcast' | 'video';

export const PRODUCT_TYPES: ProductType[] = ['course', 'book', 'article', 'document', 'podcast', 'video'];

// ============================================================================
// Request/Response Types
// ============================================================================

export interface ContentAssistantRequest {
  /** User ID for credit deduction (optional for backwards compatibility) */
  userId?: string;
  /** Content to analyze (can be text or file path) */
  content: string;
  /** Optional file path for content extraction */
  filePath?: string;
  /** Type of product (auto-detected if not specified) */
  productType?: ProductType;
  /** Type of analysis to perform */
  analysisType: 'summary' | 'topics' | 'questions' | 'full';
  /** Maximum length for summary output */
  maxSummaryLength?: number;
}

export interface ContentAssistantResponse {
  success: boolean;
  data?: ContentAnalysis;
  detectedProductType?: ProductType;
  error?: string;
}

// ============================================================================
// Prompt Templates by Product Type
// ============================================================================

const PROMPT_TEMPLATES: Record<ProductType, { system: string; user: string }> = {
  course: {
    system: `Eres un asistente educativo experto. Analizas contenido de cursos y materiales educativos.
Tu objetivo es identificar:
- Objetivos de aprendizaje
- Conceptos clave enseñados
- Prerrequisitos necesarios
- Estructura del curso
- Sugerencias de práctica

Responde siempre en formato JSON válido con esta estructura:
{
  "summary": "Resumen del contenido en 2-3 oraciones",
  "keyTopics": ["Tema 1", "Tema 2", "Tema 3"],
  "suggestedQuestions": ["Pregunta 1?", "Pregunta 2?", "Pregunta 3?"],
  "language": "es" o "en"
}`,
    user: `Analiza el siguiente contenido de curso:

{content}

{formatInstructions}`,
  },

  book: {
    system: `Eres un asistente literario experto. Analizas contenido de libros y publicaciones extensas.
Tu objetivo es identificar:
- Temática principal y género
- Argumento o ideas principales
- Personajes o conceptos clave
- Estilo del autor
- Conclusiones principales

Responde siempre en formato JSON válido con esta estructura:
{
  "summary": "Resumen del contenido en 2-3 oraciones",
  "keyTopics": ["Tema 1", "Tema 2", "Tema 3"],
  "suggestedQuestions": ["Pregunta 1?", "Pregunta 2?", "Pregunta 3?"],
  "language": "es" o "en"
}`,
    user: `Analiza el siguiente contenido de libro:

{content}

{formatInstructions}`,
  },

  article: {
    system: `Eres un asistente de análisis de contenido periodístico y académico.
Analizas artículos y ensayos con enfoque en:
- Tesis principal
- Evidencias y argumentos
- Contexto relevante
- Conclusiones del autor
- Calidad de las fuentes

Responde siempre en formato JSON válido con esta estructura:
{
  "summary": "Resumen del contenido en 2-3 oraciones",
  "keyTopics": ["Tema 1", "Tema 2", "Tema 3"],
  "suggestedQuestions": ["Pregunta 1?", "Pregunta 2?", "Pregunta 3?"],
  "language": "es" o "en"
}`,
    user: `Analiza el siguiente artículo:

{content}

{formatInstructions}`,
  },

  document: {
    system: `Eres un asistente de análisis documental profesional.
Analizas documentos técnicos, legales o corporativos con enfoque en:
- Propósito del documento
- Partes involucradas
- Puntos clave y términos importantes
- Requisitos o acciones necesarias
- Secciones principales

Responde siempre en formato JSON válido con esta estructura:
{
  "summary": "Resumen del contenido en 2-3 oraciones",
  "keyTopics": ["Tema 1", "Tema 2", "Tema 3"],
  "suggestedQuestions": ["Pregunta 1?", "Pregunta 2?", "Pregunta 3?"],
  "language": "es" o "en"
}`,
    user: `Analiza el siguiente documento:

{content}

{formatInstructions}`,
  },

  podcast: {
    system: `Eres un asistente de análisis de contenido de audio/podcast.
Analizas transcripciones de podcasts con enfoque en:
- Tema principal discutido
- Entrevistador y entrevistado/expertos
- Puntos clave de la conversación
- Recursos o enlaces mencionados
- Resumen de conclusiones

Responde siempre en formato JSON válido con esta estructura:
{
  "summary": "Resumen del contenido en 2-3 oraciones",
  "keyTopics": ["Tema 1", "Tema 2", "Tema 3"],
  "suggestedQuestions": ["Pregunta 1?", "Pregunta 2?", "Pregunta 3?"],
  "language": "es" o "en"
}`,
    user: `Analiza la siguiente transcripción de podcast:

{content}

{formatInstructions}`,
  },

  video: {
    system: `Eres un asistente de análisis de contenido de video.
Analizas transcripciones de videos con enfoque en:
- Tema principal del video
- Estructura y secciones
- Puntos clave explicados
- Recursos o materiales mencionados
- Llamado a la acción

Responde siempre en formato JSON válido con esta estructura:
{
  "summary": "Resumen del contenido en 2-3 oraciones",
  "keyTopics": ["Tema 1", "Tema 2", "Tema 3"],
  "suggestedQuestions": ["Pregunta 1?", "Pregunta 2?", "Pregunta 3?"],
  "language": "es" o "en"
}`,
    user: `Analiza la siguiente transcripción de video:

{content}

{formatInstructions}`,
  },
};

// ============================================================================
// Product Type Detection
// ============================================================================

/**
 * Detect product type from content characteristics
 */
function detectProductType(content: string, filePath?: string): ProductType {
  const lowerContent = content.toLowerCase();
  
  // Check file extension if provided
  if (filePath) {
    const ext = filePath.toLowerCase();
    if (ext.endsWith('.pdf')) {
      // PDFs could be books, articles, or documents
      // Use content heuristics
      if (lowerContent.includes('chapter') || lowerContent.includes('book') || lowerContent.includes('part ')) {
        return 'book';
      }
      if (lowerContent.includes('article') || lowerContent.includes('journal') || lowerContent.includes('research')) {
        return 'article';
      }
      return 'document';
    }
    if (ext.endsWith('.md') || ext.endsWith('.markdown')) {
      if (lowerContent.includes('course') || lowerContent.includes('lesson') || lowerContent.includes('module')) {
        return 'course';
      }
      return 'article';
    }
    if (ext.endsWith('.txt')) {
      if (lowerContent.includes('podcast') || lowerContent.includes('episode') || lowerContent.includes('interview')) {
        return 'podcast';
      }
      if (lowerContent.includes('video') || lowerContent.includes('youtube') || lowerContent.includes('tutorial')) {
        return 'video';
      }
      return 'document';
    }
  }
  
  // Content-based detection heuristics
  // Course indicators
  const courseIndicators = ['lesson', 'module', 'chapter', 'exercise', 'practice', 'prerequisite', 'learning objective'];
  if (courseIndicators.some(ind => lowerContent.includes(ind))) {
    return 'course';
  }
  
  // Book indicators
  const bookIndicators = ['chapter', 'part i', 'part ii', 'edition', 'author', 'publisher'];
  if (bookIndicators.some(ind => lowerContent.includes(ind))) {
    return 'book';
  }
  
  // Podcast indicators
  const podcastIndicators = ['podcast', 'episode', 'interview', 'guest', 'host'];
  if (podcastIndicators.some(ind => lowerContent.includes(ind))) {
    return 'podcast';
  }
  
  // Video indicators
  const videoIndicators = ['video', 'tutorial', 'demo', 'showcase', 'youtube', 'watch'];
  if (videoIndicators.some(ind => lowerContent.includes(ind))) {
    return 'video';
  }
  
  // Article indicators
  const articleIndicators = ['abstract', 'introduction', 'conclusion', 'references', 'doi'];
  if (articleIndicators.some(ind => lowerContent.includes(ind))) {
    return 'article';
  }
  
  // Default to document
  return 'document';
}

// ============================================================================
// Content Assistant Service Class
// ============================================================================

export class ContentAssistantService {
  /**
   * Analyze content with AI assistance
   */
  async analyze(request: ContentAssistantRequest): Promise<ContentAssistantResponse> {
    // Validate request
    const validation = contentAnalysisRequestSchema.safeParse({
      content: request.content,
      analysisType: request.analysisType,
      maxSummaryLength: request.maxSummaryLength,
    });
    
    if (!validation.success) {
      return {
        success: false,
        error: `Invalid request: ${validation.error.issues?.map((e: { message: string }) => e.message).join(', ') || 'Validation failed'}`,
      };
    }
    
    try {
      // CREDITS: Verify and reserve credits before processing (if userId provided)
      let creditsCost = 0;
      if (request.userId) {
        creditsCost = aiCreditService.getOperationCost('chat'); // 5 credits
        const hasCredits = await aiCreditService.hasSufficientCredits(request.userId, creditsCost);
        
        if (!hasCredits) {
          return {
            success: false,
            error: 'Insufficient credits for content analysis',
          };
        }
      }

      // Extract content from file if provided
      let contentText = request.content;
      
      if (request.filePath) {
        const extracted = await contentReaderService.readContent(request.filePath);
        if (!extracted.success) {
          return {
            success: false,
            error: `Failed to read content: ${extracted.error}`,
          };
        }
        contentText = extracted.text;
      }
      
      // Detect or use provided product type
      const productType = request.productType || detectProductType(contentText, request.filePath);
      
      // Get prompt template
      const template = PROMPT_TEMPLATES[productType];
      
      // Build format instructions based on analysis type
      const formatInstructions = this.getFormatInstructions(request.analysisType, request.maxSummaryLength);
      
      // Build messages for LLM
      const messages: LLMMessage[] = [
        { role: 'system', content: template.system },
        {
          role: 'user',
          content: template.user
            .replace('{content}', contentText.slice(0, aiContentConfig.contentChunkSize))
            .replace('{formatInstructions}', formatInstructions),
        },
      ];
      
      // Call LLM service
      const response = await llmService.chat({
        messages,
        temperature: 0.5,
        maxTokens: request.maxSummaryLength || aiContentConfig.contentSummaryMaxTokens,
      });
      
      // CREDITS: Deduct credits after successful processing (if userId provided)
      if (request.userId && creditsCost > 0) {
        await aiCreditService.useCredits(request.userId, creditsCost, 'Content Assistant analysis');
      }
      
      // Parse response
      const analysis = this.parseLLMResponse(response.content);
      
      return {
        success: true,
        data: analysis,
        detectedProductType: productType,
      };
      
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error({ error: errorMessage }, 'ContentAssistantService: Analysis failed');
      
      return {
        success: false,
        error: `Analysis failed: ${errorMessage}`,
      };
    }
  }
  
  /**
   * Analyze content from file path
   */
  async analyzeFromFile(
    filePath: string,
    analysisType: ContentAssistantRequest['analysisType'] = 'full',
    productType?: ProductType
  ): Promise<ContentAssistantResponse> {
    return this.analyze({
      content: '', // Empty, will use filePath
      filePath,
      productType,
      analysisType,
    });
  }
  
  /**
   * Get format instructions based on analysis type
   */
  private getFormatInstructions(analysisType: string, maxLength?: number): string {
    const max = maxLength || aiContentConfig.contentSummaryMaxTokens;
    
    switch (analysisType) {
      case 'summary':
        return `Proporciona un resumen conciso de máximo ${max} caracteres. Enfócate en las ideas principales.`;
      
      case 'topics':
        return `Identifica exactamente ${aiContentConfig.contentTopicExtractionCount} temas clave. Lista solo los temas, sin explicaciones adicionales.`;
      
      case 'questions':
        return `Genera exactamente ${aiContentConfig.contentQuestionSuggestionCount} preguntas de comprensión. Una por línea.`;
      
      case 'full':
      default:
        return `Proporciona análisis completo con resumen, temas clave (${aiContentConfig.contentTopicExtractionCount}) y preguntas (${aiContentConfig.contentQuestionSuggestionCount}).`;
    }
  }
  
  /**
   * Parse LLM response into ContentAnalysis
   */
  private parseLLMResponse(response: string): ContentAnalysis {
    // Try to extract JSON from response
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    
    if (jsonMatch) {
      try {
        const parsed = JSON.parse(jsonMatch[0]);
        return {
          summary: parsed.summary || '',
          keyTopics: Array.isArray(parsed.keyTopics) ? parsed.keyTopics : [],
          suggestedQuestions: Array.isArray(parsed.suggestedQuestions) ? parsed.suggestedQuestions : [],
          language: parsed.language || 'es',
          wordCount: response.split(/\s+/).length,
        };
      } catch {
        // Failed to parse JSON, use text extraction
        return this.extractFromText(response);
      }
    }
    
    return this.extractFromText(response);
  }
  
  /**
   * Extract analysis from plain text response
   */
  private extractFromText(text: string): ContentAnalysis {
    const lines = text.split('\n').filter(line => line.trim());
    const keyTopics: string[] = [];
    const suggestedQuestions: string[] = [];
    
    let currentSection: 'summary' | 'topics' | 'questions' | null = 'summary';
    
    for (const line of lines) {
      const trimmed = line.trim();
      
      if (trimmed.toLowerCase().includes('topic') || trimmed.toLowerCase().includes('tema')) {
        currentSection = 'topics';
        continue;
      }
      if (trimmed.toLowerCase().includes('question') || trimmed.toLowerCase().includes('pregunta')) {
        currentSection = 'questions';
        continue;
      }
      if (trimmed.toLowerCase().includes('summary') || trimmed.toLowerCase().includes('resumen')) {
        currentSection = 'summary';
        continue;
      }
      
      if (trimmed.startsWith('-') || trimmed.startsWith('*') || /^\d+\./.test(trimmed)) {
        const cleanText = trimmed.replace(/^[-*]\s*/, '').replace(/^\d+\.\s*/, '');
        
        if (currentSection === 'topics') {
          keyTopics.push(cleanText);
        } else if (currentSection === 'questions') {
          suggestedQuestions.push(cleanText);
        }
      }
    }
    
    // If no structured sections found, create from first paragraphs
    if (keyTopics.length === 0 && suggestedQuestions.length === 0) {
      const sentences = text.split(/[.!?]/).filter(s => s.trim().length > 10);
      
      return {
        summary: sentences.slice(0, 2).join('. ').trim() + '.',
        keyTopics: sentences.slice(2, 2 + aiContentConfig.contentTopicExtractionCount).map(s => s.trim()),
        suggestedQuestions: [],
        language: 'es',
        wordCount: text.split(/\s+/).length,
      };
    }
    
    return {
      summary: lines.slice(0, 2).join(' ').slice(0, 500),
      keyTopics: keyTopics.slice(0, aiContentConfig.contentTopicExtractionCount),
      suggestedQuestions: suggestedQuestions.slice(0, aiContentConfig.contentQuestionSuggestionCount),
      language: 'es',
      wordCount: text.split(/\s+/).length,
    };
  }
  
  /**
   * Get supported product types
   */
  getSupportedProductTypes(): ProductType[] {
    return [...PRODUCT_TYPES];
  }
  
  /**
   * Check if a product type is valid
   */
  isValidProductType(type: string): type is ProductType {
    return PRODUCT_TYPES.includes(type as ProductType);
  }
}

// ============================================================================
// Export singleton instance
// ============================================================================

export const contentAssistantService = new ContentAssistantService();