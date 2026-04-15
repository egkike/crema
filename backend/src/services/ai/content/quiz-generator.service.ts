/**
 * Quiz Generator Service
 * Phase 4: QuizGeneratorService
 * 
 * Generates quizzes from content using AI
 * Integrates with ContentReaderService for content extraction
 */

import { z } from 'zod';

import logger from '../../../utils/logger';
import { aiContentConfig } from '../../../config/ai-content.config';
import { llmService, LLMMessage } from '../llm.service';
import { aiCreditService } from '../credits.service';

import { contentReaderService } from './content-reader.service';
import { ProductType } from './content-assistant.service';

// ============================================================================
// Quiz Types
// ============================================================================

export type QuizQuestionType = 'multiple-choice' | 'true-false' | 'fill-blank' | 'matching';

export interface QuizQuestion {
  id: string;
  type: QuizQuestionType;
  question: string;
  options?: string[];
  correctAnswer: string | number;
  explanation?: string;
}

export interface Quiz {
  id: string;
  title: string;
  description: string;
  productType: ProductType;
  questions: QuizQuestion[];
  metadata: {
    createdAt: Date;
    sourceLength: number;
    questionCount: number;
  };
}

export interface QuizGenerationOptions {
  /** Number of questions to generate */
  questionCount: number;
  /** Types of questions to include */
  questionTypes: QuizQuestionType[];
  /** Difficulty level */
  difficulty: 'easy' | 'medium' | 'hard';
  /** Language for questions */
  language: 'es' | 'en';
}

export interface QuizGenerationRequest {
  /** User ID for credit deduction (optional for backwards compatibility) */
  userId?: string;
  /** Content to generate quiz from (text or file path) */
  content: string;
  /** Optional file path */
  filePath?: string;
  /** Optional product type */
  productType?: ProductType;
  /** Quiz options */
  options?: Partial<QuizGenerationOptions>;
}

// ============================================================================
// Validation Schemas
// ============================================================================

export const quizGenerationOptionsSchema = z.object({
  questionCount: z.number().min(1).max(20).default(5),
  questionTypes: z.array(z.enum(['multiple-choice', 'true-false', 'fill-blank', 'matching'])).default(['multiple-choice']),
  difficulty: z.enum(['easy', 'medium', 'hard']).default('medium'),
  language: z.enum(['es', 'en']).default('es'),
});

export const quizGenerationRequestSchema = z.object({
  content: z.string().min(1),
  filePath: z.string().optional(),
  productType: z.enum(['course', 'book', 'article', 'document', 'podcast', 'video']).optional(),
  options: quizGenerationOptionsSchema.partial().optional(),
});

// ============================================================================
// Default Options
// ============================================================================

export const DEFAULT_QUIZ_OPTIONS: QuizGenerationOptions = {
  questionCount: 5,
  questionTypes: ['multiple-choice'],
  difficulty: 'medium',
  language: 'es',
};

// ============================================================================
// Question Type Prompts (module-level for easier access)
// ============================================================================

const QUESTION_TYPE_PROMPTS: Record<QuizQuestionType, string> = {
  'multiple-choice': 'questions with 4 options (A, B, C, D)',
  'true-false': 'true/false statements',
  'fill-blank': 'fill in the blank questions',
  'matching': 'matching questions with pairs',
};

// ============================================================================
// Quiz Generator Service Class
// ============================================================================

export class QuizGeneratorService {

  /**
   * Generate a quiz from content
   */
  async generate(request: QuizGenerationRequest): Promise<{ success: boolean; data?: Quiz; error?: string }> {
    // Validate request
    const validation = quizGenerationRequestSchema.safeParse({
      content: request.content,
      filePath: request.filePath,
      productType: request.productType,
      options: request.options,
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
            error: 'Insufficient credits for quiz generation',
          };
        }
      }

      // Merge options with defaults
      const options: QuizGenerationOptions = {
        ...DEFAULT_QUIZ_OPTIONS,
        ...request.options,
      };
      
      const optionsValidation = quizGenerationOptionsSchema.safeParse(options);
      const opts = optionsValidation.success ? optionsValidation.data : DEFAULT_QUIZ_OPTIONS;
      
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
      
      // Truncate content if too long
      const truncatedContent = contentText.slice(0, aiContentConfig.contentChunkSize);
      
      // Generate questions using LLM
      const questions = await this.generateQuestions(
        truncatedContent,
        opts,
        request.productType
      );
      
      // Create quiz object
      const quiz: Quiz = {
        id: this.generateId(),
        title: this.generateTitle(request.productType),
        description: this.generateDescription(opts),
        productType: request.productType || 'document',
        questions,
        metadata: {
          createdAt: new Date(),
          sourceLength: truncatedContent.length,
          questionCount: questions.length,
        },
      };
      
      // CREDITS: Deduct credits after successful generation (if userId provided)
      if (request.userId && creditsCost > 0) {
        await aiCreditService.useCredits(request.userId, creditsCost, 'Quiz generation');
      }
      
      return {
        success: true,
        data: quiz,
      };
      
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error({ error: errorMessage }, 'QuizGeneratorService: Generation failed');
      
      return {
        success: false,
        error: `Quiz generation failed: ${errorMessage}`,
      };
    }
  }
  
  /**
   * Generate quiz from file path
   */
  async generateFromFile(
    filePath: string,
    options?: Partial<QuizGenerationOptions>
  ): Promise<{ success: boolean; data?: Quiz; error?: string }> {
    return this.generate({
      content: '',
      filePath,
      options,
    });
  }
  
  /**
   * Generate questions from content
   */
  private async generateQuestions(
    content: string,
    options: QuizGenerationOptions,
    productType?: ProductType
  ): Promise<QuizQuestion[]> {
    const { questionTypes, language } = options;
    
    // Build prompt for quiz generation
    const prompt = this.buildQuizPrompt(content, options, productType);
    
    const messages: LLMMessage[] = [
      { role: 'system', content: this.getSystemPrompt(language) },
      { role: 'user', content: prompt },
    ];
    
    const response = await llmService.chat({
      messages,
      temperature: 0.5,
      maxTokens: 2000,
    });
    
    // Parse questions from response
    return this.parseQuestions(response.content, questionTypes, language);
  }
  
  /**
   * Build quiz generation prompt
   */
  private buildQuizPrompt(
    content: string,
    options: QuizGenerationOptions,
    productType?: ProductType
  ): string {
    const { questionCount, questionTypes, difficulty } = options;
    const typeList = questionTypes.map(t => QUESTION_TYPE_PROMPTS[t]).join(', ');
    
    const contextHint = this.getProductTypeHint(productType);
    
    return `
Genera un quiz de evaluación sobre el siguiente contenido:

---
${content}
---

REQUISITOS OBLIGATORIOS:
- Debes generar EXACTAMENTE ${questionCount} preguntas (ni más, ni menos)
- Tipos de preguntas: ${typeList}
- Dificultad: ${difficulty}
- CADA pregunta debe tener opciones específicas relacionadas con el contenido (no uses "Opción A", "Opción B", "Opción C", "Opción D" genéricas)
- Incluye explicación breve para cada respuesta correcta
${contextHint}

Formato de respuesta (SOLO JSON array, sin markdown):
[
  {
    "type": "multiple-choice",
    "question": "Pregunta específica sobre el contenido?",
    "options": ["Opción específica A", "Opción específica B", "Opción específica C", "Opción específica D"],
    "correctAnswer": 0,
    "explanation": "Explicación específica de por qué es correcta"
  }
]

IMPORTANTE: 
- Responde SOLO con JSON válido
- NO uses bloques de código markdown (\`\`\`)
- Cada opción debe ser específica al contenido, no genérica
`.trim();
  }
  
  /**
   * Get system prompt based on language
   * Improved: More explicit instructions for better compliance
   */
  private getSystemPrompt(language: 'es' | 'en'): string {
    if (language === 'en') {
      return `You are an expert quiz generator. Generate educational quizzes from provided content.

CRITICAL INSTRUCTIONS:
- Generate EXACTLY the number of questions specified in the user prompt
- NEVER generate fewer questions than requested
- Each question must have specific options related to the content (NOT generic "Option A, B, C, D")
- Always respond with valid JSON array format.
- Include brief explanations for correct answers.
- NEVER include markdown code blocks (no \`\`\`json or \`\`\`)`;
    }
    
    return `Eres un experto en generación de quizzes educativos. Genera quizzes de evaluación del contenido proporcionado.

INSTRUCCIONES CRÍTICAS:
- Genera EXACTAMENTE el número de preguntas especificado en el prompt del usuario
- NUNCA generes menos preguntas de las solicitadas
- Cada pregunta debe tener opciones específicas relacionadas con el contenido (NO opciones genéricas "Opción A, B, C, D")
- Siempre responde en formato válido de JSON array.
- Incluye explicaciones breves para las respuestas correctas.
- NUNCA incluyas bloques de código markdown (no uses \`\`\`json o \`\`\`)`;
  }
  
  /**
   * Get product type hint for prompt
   */
  private getProductTypeHint(productType?: ProductType): string {
    if (!productType) return '';
    
    const hints: Record<ProductType, string> = {
      course: '- Enfoca en conceptos y habilidades del curso',
      book: '- Enfoca en argumentos y personajes del libro',
      article: '- Enfoca en tesis y evidencias del artículo',
      document: '- Enfoca en requisitos y puntos clave del documento',
      podcast: '- Enfoca en temas discutidos en el podcast',
      video: '- Enfoca en conceptos explicados en el video',
    };
    
    return hints[productType];
  }
  
  /**
   * Parse questions from LLM response
   */
  private parseQuestions(
    response: string,
    questionTypes: QuizQuestionType[],
    language: 'es' | 'en'
  ): QuizQuestion[] {
    // Try to find JSON array in response
    const jsonMatch = response.match(/\[[\s\S]*\]/);
    
    if (!jsonMatch) {
      logger.warn({ response: response.slice(0, 200) }, 'QuizGeneratorService: No JSON found in response');
      return this.createFallbackQuestions(response, questionTypes[0], language);
    }
    
    try {
      const parsed = JSON.parse(jsonMatch[0]);
      
      if (!Array.isArray(parsed)) {
        return this.createFallbackQuestions(response, questionTypes[0], language);
      }
      
return parsed.map((item: Record<string, unknown>, index: number) => {
        const typeValue = questionTypes[index % questionTypes.length];
        return {
          id: this.generateId(),
          type: typeValue as QuizQuestionType,
          question: String(item.question || ''),
          options: Array.isArray(item.options) ? item.options.map(String) : undefined,
          correctAnswer: typeof item.correctAnswer === 'number' 
            ? item.correctAnswer 
            : String(item.correctAnswer || 0),
          explanation: String(item.explanation || ''),
        };
      });
      
    } catch (error) {
      logger.warn({ error }, 'QuizGeneratorService: Failed to parse JSON');
      return this.createFallbackQuestions(response, questionTypes[0], language);
    }
  }
  
  /**
   * Create fallback questions from plain text response
   */
  private createFallbackQuestions(
    text: string,
    type: QuizQuestionType,
    language: 'es' | 'en'
  ): QuizQuestion[] {
    const questions: QuizQuestion[] = [];
    
    // Split by numbered list or lines starting with Q
    const lines = text.split('\n').filter(line => 
      line.trim().length > 10 && 
      (line.match(/^\d+[.)]/) || line.startsWith('Q'))
    );
    
    for (let i = 0; i < Math.min(lines.length, 5); i++) {
      const line = lines[i].replace(/^\d+[.)]\s*/, '').replace(/^Q\d+[):]\s*/, '');
      
      questions.push({
        id: this.generateId(),
        type,
        question: line,
        options: type === 'multiple-choice' 
          ? ['Opción A', 'Opción B', 'Opción C', 'Opción D']
          : undefined,
        correctAnswer: 0,
      });
    }
    
    // If no questions found, create a generic one
    if (questions.length === 0) {
      questions.push({
        id: this.generateId(),
        type,
        question: language === 'es' 
          ? '¿Cuál es el tema principal del contenido?' 
          : 'What is the main topic of the content?',
        options: ['Opción A', 'Opción B', 'Opción C', 'Opción D'],
        correctAnswer: 0,
      });
    }
    
    return questions;
  }
  
  /**
   * Generate quiz title
   */
  private generateTitle(productType?: ProductType): string {
    const titles: Record<ProductType, string> = {
      course: 'Quiz de Evaluación del Curso',
      book: 'Quiz de Comprensión del Libro',
      article: 'Quiz de Análisis del Artículo',
      document: 'Quiz de Evaluación Documental',
      podcast: 'Quiz del Podcast',
      video: 'Quiz del Video',
    };
    
    return productType ? titles[productType] : 'Quiz de Evaluación';
  }
  
  /**
   * Generate quiz description
   */
  private generateDescription(options: QuizGenerationOptions): string {
    const difficultyText = {
      easy: 'básico',
      medium: 'intermedio',
      hard: 'avanzado',
    };
    
    return `Quiz ${difficultyText[options.difficulty]} con ${options.questionCount} preguntas`;
  }
  
  /**
   * Generate unique ID
   */
  private generateId(): string {
    return `quiz_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
  }
  
  /**
   * Get default quiz options
   */
  getDefaultOptions(): QuizGenerationOptions {
    return { ...DEFAULT_QUIZ_OPTIONS };
  }
  
  /**
   * Validate quiz options
   */
  validateOptions(options: Partial<QuizGenerationOptions>): { valid: boolean; error?: string } {
    const validation = quizGenerationOptionsSchema.safeParse(options);
    
    if (!validation.success) {
      return {
        valid: false,
        error: validation.error.issues?.map((e: { message: string }) => e.message).join(', '),
      };
    }
    
    return { valid: true };
  }
}

// ============================================================================
// Export singleton instance
// ============================================================================

export const quizGeneratorService = new QuizGeneratorService();