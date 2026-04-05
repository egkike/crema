import { describe, it, expect } from 'vitest';

// Set up env vars BEFORE importing config
process.env.NODE_ENV = 'test';
process.env.SECRET_JWT_KEY = 'static-test-secret-32-chars-long-!!';
process.env.SECRET_REFRESH_JWT_KEY = 'static-refresh-secret-32-chars-long-!!';
process.env.DB_USER = 'test_user';
process.env.DB_PASSWORD = 'test_pass';
process.env.DB_NAME = 'test_db';
process.env.MERCADO_PAGO_ACCESS_TOKEN = 'test_access_token_min_30_chars_long';
process.env.MERCADO_PAGO_PUBLIC_KEY = 'test_public_key_min_30_chars_long';
process.env.CLOUDFLARE_ACCOUNT_ID = 'test_account_id';
process.env.CLOUDFLARE_STREAM_KEY_ID = 'test_key_id';
process.env.CLOUDFLARE_STREAM_KEY_SECRET = 'test_key_secret';
process.env.MUX_TOKEN_ID = 'test_token_id';
process.env.MUX_TOKEN_SECRET = 'test_token_secret';
process.env.MUX_SIGNING_KEY_ID = 'test_signing_key_id';
process.env.MUX_SIGNING_KEY = 'test_signing_key_base64';

import { config } from '../../config/index';

describe('config', () => {
  describe('basic structure', () => {
    it('should export config object', () => {
      expect(config).toBeDefined();
    });

    it('should have nodeEnv defined', () => {
      expect(config.nodeEnv).toBe('test');
    });
  });

  describe('jwt config', () => {
    it('should have jwt configuration', () => {
      expect(config.jwt).toBeDefined();
      expect(config.jwt.secret).toBeDefined();
    });
  });
});
