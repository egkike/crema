// Minimal setup for repository unit tests - NO global mocks
// This file is used by repository tests to get clean module resolution

import { vi } from 'vitest';

// Just set up the test globals - no repository mocks
vi.setConfig({
  testTimeout: 10000,
});
