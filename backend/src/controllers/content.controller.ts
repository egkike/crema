import path from 'path';
import fs from 'fs';

import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';

import { productRepository } from '../repositories/product.repository';
import { AccessService } from '../services/access.service';
import { AppError } from '../errors/AppError';
import logger from '../utils/logger';

// --- ESQUEMAS DE VALIDACIÓN ---
const updateProgressSchema = z.object({
  productId: z.string().uuid('ID de producto inválido'),
  lessonId: z.string().uuid('ID de lección inválido'),
  completed: z.boolean(), // Sin objetos de error complejos para evitar conflictos con TS
});

const submitQuizSchema = z.object({
  productId: z.string().uuid('ID de producto inválido'),
  lessonId: z.string().uuid('ID de lección inválido'),
  answers: z.array(
    z.object({
      questionId: z.number(),
      selectedOption: z.number(),
    })
  ),
});

const checkAndIssueCertificate = async (userId: string, productId: string) => {
  const progress = await productRepository.getUserProductProgress(productId, userId);

  // Si el progreso es 100%, emitimos el certificado
  if (progress.percent === 100) {
    await productRepository.issueCertificate(userId, productId);
    logger.info({ userId, productId }, 'Certificado emitido automáticamente');
  }
};

/**
 * Helper para centralizar la validación de Safe-Guard al actualizar progreso
 */
const evaluateSafeGuard = async (userId: string, productId: string) => {
  const product = await productRepository.getProductById(productId);
  if (product) {
    // Llamamos al método que creamos en el AccessService
    await AccessService.evaluateGuaranteeStatus(userId, productId, product);
  }
};

export const getProductContent = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { user } = req;
    const { productId } = req.params;

    // 1. Verificación de identidad y tipo
    if (!user?.id) {
      throw new AppError('Usuario no identificado.', 401);
    }

    if (typeof productId !== 'string') {
      throw new AppError('ID de producto no válido.', 400);
    }

    // 1. Verificar acceso (esto ya valida si el usuario compró el producto)
    // El AccessService ahora ya internamente llama a evaluateGuaranteeStatus
    // Esto cubre el caso de Ebooks/Descargables al primer acceso.
    const accessInfo = await AccessService.getProtectedContent(user.id, productId);

    // 2. Si es contenido estructurado (Cursos), buscamos el árbol completo
    if (accessInfo.has_structured_content) {
      const fullContent = await productRepository.getProductWithNestedContent(productId, user.id);

      // Traemos el cálculo de progreso
      const progress = await productRepository.getUserProductProgress(productId, user.id);

      return res.status(200).json({
        success: true,
        message: 'Acceso concedido a la estructura del curso',
        data: {
          title: fullContent.title,
          type: fullContent.type,
          modules: fullContent.modules || [],
          progress: progress, // <-- Aquí enviamos { total_lessons, completed_lessons, percent }
        },
      });
    }

    // 3. Lógica original para archivos simples (Ebooks, etc.)

    // CASO A: Link externo
    if (accessInfo.contentUrl && accessInfo.contentUrl.startsWith('http')) {
      return res.status(200).json({
        success: true,
        message: 'Acceso concedido a link externo',
        data: accessInfo,
      });
    }

    // CASO B: Archivo local (Ebook/ZIP)
    if (accessInfo.contentUrl && accessInfo.contentUrl.startsWith('/uploads/')) {
      const relativePath = accessInfo.contentUrl.startsWith('/')
        ? accessInfo.contentUrl.substring(1)
        : accessInfo.contentUrl;

      const filePath = path.join(process.cwd(), relativePath);

      if (!fs.existsSync(filePath)) {
        logger.error({ filePath, productId }, 'Archivo físico no encontrado');
        throw new AppError('El archivo no existe en el servidor.', 404);
      }

      const fileName = path.basename(filePath);
      const cleanName = fileName.includes('-') ? fileName.split('-').slice(1).join('-') : fileName;

      return res.download(filePath, cleanName);
    }

    // Caso por defecto
    res.status(200).json({
      success: true,
      message: 'Acceso concedido (sin contenido multimedia)',
      data: accessInfo,
    });
  } catch (error: any) {
    logger.error(
      { error: error.message, userId: req.user?.id, productId: req.params.productId },
      'Error al intentar entregar contenido'
    );
    next(error);
  }
};

/**
 * Actualiza el progreso de una lección para el usuario
 */
export const updateLessonProgress = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { user } = req;
    if (!user?.id) throw new AppError('Usuario no identificado.', 401);

    // Validar el cuerpo de la petición
    const { productId, lessonId, completed } = updateProgressSchema.parse(req.body);

    // 1. Validar que el usuario tiene acceso al producto antes de marcar progreso
    await AccessService.getProtectedContent(user.id, productId);

    // 2. Guardar progreso en DB
    await productRepository.toggleLessonProgress(user.id, productId, lessonId, completed);

    // --- LÓGICA SAFE-GUARD ---
    // Si marca como completado, evaluamos si superó el umbral del 30%
    if (completed) {
      await evaluateSafeGuard(user.id, productId);
      await checkAndIssueCertificate(user.id, productId);
    }

    res.status(200).json({
      success: true,
      message: completed ? 'Lección marcada como completada' : 'Lección marcada como pendiente',
      data: { lessonId, completed },
    });
  } catch (error: any) {
    // Si es un error de validación de Zod
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        success: false,
        message: 'Datos de validación inválidos',
        errors: error.issues, // .issues es la forma más compatible de obtener la lista de errores
      });
    }

    logger.error({ error: error.message, userId: req.user?.id }, 'Error al actualizar progreso');
    next(error);
  }
};

export const getMyLearningDashboard = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { user } = req;
    if (!user?.id) throw new AppError('No autorizado', 401);

    const products = await productRepository.getMyPurchasedProductsWithProgress(user.id);

    res.status(200).json({
      success: true,
      data: products,
    });
  } catch (error) {
    next(error);
  }
};

export const submitLessonQuiz = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { user } = req;
    if (!user?.id) throw new AppError('Usuario no identificado.', 401);

    const { productId, lessonId, answers } = submitQuizSchema.parse(req.body);

    // 1. Verificar acceso al producto
    await AccessService.getProtectedContent(user.id, productId);

    // 2. Obtener el examen real (con las respuestas correctas)
    const quiz = await productRepository.getLessonQuiz(lessonId);
    if (!quiz) throw new AppError('Esta lección no contiene un examen.', 404);

    // 3. Calificar el examen
    const totalQuestions = quiz.questions.length;
    let correctCount = 0;

    quiz.questions.forEach((q: any) => {
      const userAns = answers.find(a => a.questionId === q.id);
      if (userAns && userAns.selectedOption === q.correct) {
        correctCount++;
      }
    });

    const score = Math.round((correctCount / totalQuestions) * 100);
    const passed = score >= quiz.passing_score;

    // 4. Guardar el intento en el historial
    await productRepository.saveQuizAttempt({
      userId: user.id,
      quizId: quiz.id,
      score,
      passed,
      answers, // Guardamos lo que eligió para revisión futura
    });

    // 5. Si aprobó, marcar la lección como completada automáticamente
    if (passed) {
      await productRepository.toggleLessonProgress(user.id, productId, lessonId, true);
      // --- LÓGICA SAFE-GUARD ---
      // Al aprobar una lección mediante quiz, también evaluamos progreso
      await evaluateSafeGuard(user.id, productId);
      await checkAndIssueCertificate(user.id, productId);
    }

    res.status(200).json({
      success: true,
      message: passed
        ? '¡Felicidades! Has aprobado el examen.'
        : 'No has alcanzado el puntaje mínimo.',
      data: {
        score,
        passed,
        passingScore: quiz.passing_score,
        correctAnswers: correctCount,
        totalQuestions,
      },
    });
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ success: false, errors: error.issues });
    }
    next(error);
  }
};

export const verifyCertificate = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { code } = req.params;

    if (typeof code !== 'string') {
      throw new AppError('El código de certificado proporcionado no es válido.', 400);
    }

    const certificate = await productRepository.getCertificateByCode(code);

    if (!certificate) {
      throw new AppError('Certificado no válido o inexistente.', 404);
    }

    res.status(200).json({
      success: true,
      data: certificate,
    });
  } catch (error) {
    next(error);
  }
};

export const contentController = {
  getProductContent,
  updateLessonProgress,
  getMyLearningDashboard,
  submitLessonQuiz,
  verifyCertificate,
};
