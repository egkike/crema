import { describe, it, expect, vi, beforeEach } from 'vitest';
import supertest from 'supertest';

import { app } from '../../app';
import '../setup';
import { generateTestAccessToken, CREATOR_ID, USER_ID, PRODUCT_ID } from '../setup';

// Mock interactive agent service
vi.mock('../../services/ai/interactive-agent.service', () => ({
  interactiveAgentService: {
    getFields: vi.fn(),
    createFields: vi.fn(),
    getUserData: vi.fn(),
    saveUserData: vi.fn(),
    updateUserData: vi.fn(),
    analyzeData: vi.fn(),
    getAnalytics: vi.fn(),
  },
}));

// Import after mock
import { interactiveAgentService } from '../../services/ai/interactive-agent.service';

const request = supertest(app);

// Test tokens
const creatorToken = generateTestAccessToken({
  id: CREATOR_ID,
  username: 'creator',
  email: 'creator@test.com',
  level: 3,
});

const userToken = generateTestAccessToken({
  id: USER_ID,
  username: 'user',
  email: 'user@test.com',
  level: 1,
});

describe('Interactive Routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // =========================================================================
  // POST /interactive/fields/:productId
  // =========================================================================

  describe('POST /api/interactive/fields/:productId', () => {
    const validBody = {
      moduleKey: 'test_module',
      fields: [
        {
          fieldName: 'test_field',
          fieldType: 'string',
          fieldLabel: 'Test Field',
          fieldRequired: true,
        },
      ],
    };

    it('should reject non-CREATOR users', async () => {
      const res = await request
        .post(`/api/interactive/fields/${PRODUCT_ID}`)
        .set('Cookie', `access_token=${userToken}; Path=/; HttpOnly`)
        .send(validBody);

      expect(res.status).toBe(403);
    });

    it('should reject unauthenticated requests', async () => {
      const res = await request
        .post(`/api/interactive/fields/${PRODUCT_ID}`)
        .send(validBody);

      expect(res.status).toBe(401);
    });

    it('should reject invalid field config', async () => {
      const res = await request
        .post(`/api/interactive/fields/${PRODUCT_ID}`)
        .set('Cookie', `access_token=${creatorToken}; Path=/; HttpOnly`)
        .send({
          moduleKey: 'test_module',
          fields: [], // empty fields
        });

      expect(res.status).toBe(400);
    });

    it('should reject invalid productId format', async () => {
      const res = await request
        .post('/api/interactive/fields/invalid-id')
        .set('Cookie', `access_token=${creatorToken}; Path=/; HttpOnly`)
        .send(validBody);

      expect(res.status).toBe(400);
    });

    it('should accept valid field config from CREATOR', async () => {
      vi.mocked(interactiveAgentService.createFields).mockResolvedValue(undefined);

      const res = await request
        .post(`/api/interactive/fields/${PRODUCT_ID}`)
        .set('Cookie', `access_token=${creatorToken}; Path=/; HttpOnly`)
        .send(validBody);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(interactiveAgentService.createFields).toHaveBeenCalledWith(
        PRODUCT_ID,
        CREATOR_ID,
        'test_module',
        validBody.fields
      );
    });
  });

  // =========================================================================
  // GET /interactive/fields/:productId
  // =========================================================================

  describe('GET /api/interactive/fields/:productId', () => {
    it('should reject unauthenticated requests', async () => {
      const res = await request.get(`/api/interactive/fields/${PRODUCT_ID}`);

      expect(res.status).toBe(401);
    });

    it('should return fields for authenticated user', async () => {
      vi.mocked(interactiveAgentService.getFields).mockResolvedValue([
        {
          moduleKey: 'test_module',
          fields: [
            {
              moduleKey: 'test_module',
              fieldName: 'field1',
              fieldType: 'string',
              fieldLabel: 'Field 1',
              fieldRequired: true,
            },
          ],
        },
      ]);

      const res = await request
        .get(`/api/interactive/fields/${PRODUCT_ID}`)
        .set('Cookie', `access_token=${userToken}; Path=/; HttpOnly`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.modules).toBeDefined();
    });
  });

  // =========================================================================
  // POST /interactive/data/:productId
  // =========================================================================

  describe('POST /api/interactive/data/:productId', () => {
    const validBody = {
      moduleKey: 'test_module',
      inputData: { field1: 'value1', field2: 42 },
    };

    it('should reject unauthenticated requests', async () => {
      const res = await request
        .post(`/api/interactive/data/${PRODUCT_ID}`)
        .send(validBody);

      expect(res.status).toBe(401);
    });

    it('should reject invalid body', async () => {
      const res = await request
        .post(`/api/interactive/data/${PRODUCT_ID}`)
        .set('Cookie', `access_token=${userToken}; Path=/; HttpOnly`)
        .send({
          moduleKey: 'test_module',
          // missing inputData
        });

      expect(res.status).toBe(400);
    });

    it('should accept valid save from authenticated buyer', async () => {
      vi.mocked(interactiveAgentService.saveUserData).mockResolvedValue(
        new Date().toISOString()
      );

      const res = await request
        .post(`/api/interactive/data/${PRODUCT_ID}`)
        .set('Cookie', `access_token=${userToken}; Path=/; HttpOnly`)
        .send(validBody);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.savedAt).toBeDefined();
      expect(interactiveAgentService.saveUserData).toHaveBeenCalledWith(
        PRODUCT_ID,
        USER_ID,
        'test_module',
        validBody.inputData
      );
    });
  });

  // =========================================================================
  // PUT /interactive/data/:productId/:moduleKey
  // =========================================================================

  describe('PUT /api/interactive/data/:productId/:moduleKey', () => {
    const validBody = {
      inputData: { field1: 'updated_value' },
    };

    it('should reject unauthenticated requests', async () => {
      const res = await request
        .put(`/api/interactive/data/${PRODUCT_ID}/test_module`)
        .send(validBody);

      expect(res.status).toBe(401);
    });

    it('should reject invalid module key format', async () => {
      const res = await request
        .put(`/api/interactive/data/${PRODUCT_ID}/INVALID-KEY`)
        .set('Cookie', `access_token=${userToken}; Path=/; HttpOnly`)
        .send(validBody);

      expect(res.status).toBe(400);
    });

    it('should accept valid update from authenticated buyer', async () => {
      vi.mocked(interactiveAgentService.updateUserData).mockResolvedValue(
        new Date().toISOString()
      );

      const res = await request
        .put(`/api/interactive/data/${PRODUCT_ID}/test_module`)
        .set('Cookie', `access_token=${userToken}; Path=/; HttpOnly`)
        .send(validBody);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.savedAt).toBeDefined();
    });
  });

  // =========================================================================
  // GET /interactive/data/:productId
  // =========================================================================

  describe('GET /api/interactive/data/:productId', () => {
    it('should reject unauthenticated requests', async () => {
      const res = await request.get(`/api/interactive/data/${PRODUCT_ID}`);

      expect(res.status).toBe(401);
    });

    it('should return user data for authenticated buyer', async () => {
      vi.mocked(interactiveAgentService.getUserData).mockResolvedValue([
        {
          moduleKey: 'test_module',
          inputData: { field1: 'value1' },
          outputAnalysis: { analysis: 'test' },
          updatedAt: new Date().toISOString(),
        },
      ]);

      const res = await request
        .get(`/api/interactive/data/${PRODUCT_ID}`)
        .set('Cookie', `access_token=${userToken}; Path=/; HttpOnly`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.modules).toBeDefined();
    });

    it('should accept moduleKey query param', async () => {
      vi.mocked(interactiveAgentService.getUserData).mockResolvedValue([]);

      const res = await request
        .get(`/api/interactive/data/${PRODUCT_ID}?moduleKey=test_module`)
        .set('Cookie', `access_token=${userToken}; Path=/; HttpOnly`);

      expect(res.status).toBe(200);
      expect(interactiveAgentService.getUserData).toHaveBeenCalledWith(
        PRODUCT_ID,
        USER_ID,
        'test_module'
      );
    });

    it('should reject invalid moduleKey query param', async () => {
      const res = await request
        .get(`/api/interactive/data/${PRODUCT_ID}?moduleKey=INVALID-KEY`)
        .set('Cookie', `access_token=${userToken}; Path=/; HttpOnly`);

      expect(res.status).toBe(400);
    });
  });

  // =========================================================================
  // POST /interactive/analyze/:productId/:moduleKey
  // =========================================================================

  describe('POST /api/interactive/analyze/:productId/:moduleKey', () => {
    it('should reject unauthenticated requests', async () => {
      const res = await request
        .post(`/api/interactive/analyze/${PRODUCT_ID}/test_module`);

      expect(res.status).toBe(401);
    });

    it('should reject invalid module key format', async () => {
      const res = await request
        .post(`/api/interactive/analyze/${PRODUCT_ID}/INVALID-KEY`)
        .set('Cookie', `access_token=${userToken}; Path=/; HttpOnly`);

      expect(res.status).toBe(400);
    });

    it('should return analysis result', async () => {
      vi.mocked(interactiveAgentService.analyzeData).mockResolvedValue({
        analysis: 'Test analysis',
        recommendations: ['Rec 1'],
        nextSteps: ['Step 1'],
        metrics: { score: 85 },
        creditsUsed: 3,
      });

      const res = await request
        .post(`/api/interactive/analyze/${PRODUCT_ID}/test_module`)
        .set('Cookie', `access_token=${userToken}; Path=/; HttpOnly`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.analysis).toBe('Test analysis');
      expect(res.body.data.creditsUsed).toBe(3);
    });

    it('should throw 402 if insufficient credits', async () => {
      const { AppError } = await import('../../errors/AppError');
      vi.mocked(interactiveAgentService.analyzeData).mockRejectedValue(
        new AppError('INTERACTIVE_INSUFFICIENT_CREDITS', 402)
      );

      const res = await request
        .post(`/api/interactive/analyze/${PRODUCT_ID}/test_module`)
        .set('Cookie', `access_token=${userToken}; Path=/; HttpOnly`);

      expect(res.status).toBe(402);
    });
  });

  // =========================================================================
  // GET /interactive/analytics/:productId
  // =========================================================================

  describe('GET /api/interactive/analytics/:productId', () => {
    it('should reject non-CREATOR users', async () => {
      const res = await request
        .get(`/api/interactive/analytics/${PRODUCT_ID}`)
        .set('Cookie', `access_token=${userToken}; Path=/; HttpOnly`);

      expect(res.status).toBe(403);
    });

    it('should reject unauthenticated requests', async () => {
      const res = await request.get(`/api/interactive/analytics/${PRODUCT_ID}`);

      expect(res.status).toBe(401);
    });

    it('should return analytics for CREATOR', async () => {
      vi.mocked(interactiveAgentService.getAnalytics).mockResolvedValue({
        totalUsers: 25,
        completedModules: 50,
        averageCompletion: 0.75,
        fieldStats: [],
      });

      const res = await request
        .get(`/api/interactive/analytics/${PRODUCT_ID}`)
        .set('Cookie', `access_token=${creatorToken}; Path=/; HttpOnly`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.totalUsers).toBe(25);
      expect(res.body.data.completedModules).toBe(50);
    });
  });
});
