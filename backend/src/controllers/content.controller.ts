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

    // 1. Validar el cuerpo de la petición (Zod)
    const { productId, lessonId, completed } = updateProgressSchema.parse(req.body);

    // 2. Validar acceso Y obtener el objeto producto en una sola operación
    // AccessService.getProtectedContent ya valida si el producto existe, está publicado
    // y si el usuario tiene permiso (compra o autoría).
    const product = await AccessService.getProtectedContent(user.id, productId);

    // 3. Guardar progreso en DB
    await productRepository.toggleLessonProgress(user.id, productId, lessonId, completed);

    // 4. LÓGICA DE AUTOMATIZACIÓN (Solo si marca como completado)
    if (completed) {
      // Pasamos el objeto 'product' que ya obtuvimos en el paso 2
      // Evitamos una consulta extra a la DB dentro de evaluateGuaranteeStatus
      await AccessService.evaluateGuaranteeStatus(user.id, productId, product);

      // Verificamos si con esta lección completó el 100% para el certificado
      await checkAndIssueCertificate(user.id, productId);
    }

    return res.status(200).json({
      success: true,
      message: completed ? 'Lección marcada como completada' : 'Lección marcada como pendiente',
      data: {
        lessonId,
        completed,
        productId,
      },
    });
  } catch (error: any) {
    // Manejo unificado de errores de validación (Zod)
    if (error instanceof z.ZodError) {
      logger.warn({ userId: req.user?.id, errors: error.issues }, 'Validación fallida en progreso');
      return res.status(400).json({
        success: false,
        message: 'Los datos enviados son incorrectos.',
        errors: error.issues.map(issue => ({
          path: issue.path.join('.'),
          message: issue.message,
        })),
      });
    }

    logger.error(
      { error: error.message, userId: req.user?.id, productId: req.body?.productId },
      'Error crítico al actualizar progreso'
    );
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

    // 1. Validar esquema de entrada
    const { productId, lessonId, answers } = submitQuizSchema.parse(req.body);

    // 2. Verificar acceso y obtener objeto producto (1 sola consulta)
    // Esto ya dispara el Safe-Guard para descargables si fuera el caso
    const product = await AccessService.getProtectedContent(user.id, productId);

    // 3. Obtener el examen real
    const quiz = await productRepository.getLessonQuiz(lessonId);
    if (!quiz) throw new AppError('Esta lección no contiene un examen.', 404);

    // 4. Calificar el examen
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

    // 5. Guardar el intento
    await productRepository.saveQuizAttempt({
      userId: user.id,
      quizId: quiz.id,
      score,
      passed,
      answers,
    });

    // 6. Si aprobó, automatizamos el progreso y las salvaguardas
    if (passed) {
      // Marcamos la lección como completada
      await productRepository.toggleLessonProgress(user.id, productId, lessonId, true);

      // --- LÓGICA SAFE-GUARD OPTIMIZADA ---
      // Usamos el objeto 'product' que ya tenemos para no re-consultar la DB
      await AccessService.evaluateGuaranteeStatus(user.id, productId, product);

      // Verificamos si merece certificado
      await checkAndIssueCertificate(user.id, productId);
    }

    return res.status(200).json({
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
    // Unificación de errores de validación Zod
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        success: false,
        message: 'Error en los datos del examen',
        errors: error.issues.map(i => ({ path: i.path.join('.'), message: i.message })),
      });
    }

    logger.error({ error: error.message, userId: req.user?.id }, 'Error en submitLessonQuiz');
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

export const getLessonDetail = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user?.id;
    const { lessonId } = req.params;

    if (!userId) throw new AppError('No autorizado', 401);

    if (typeof lessonId !== 'string') {
      throw new AppError('ID de lección inválido.', 400);
    }

    const lesson = await AccessService.getProtectedLesson(userId, lessonId);

    res.status(200).json({
      success: true,
      data: lesson,
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
  getLessonDetail,
};
