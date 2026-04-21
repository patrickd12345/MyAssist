export function assertAuthTestMode(): void {
  const isProduction = process.env.NODE_ENV === 'production';
  const isTest = process.env.NODE_ENV === 'test' || process.env.NODE_ENV === 'development';
  const isPlaywright = process.env.PLAYWRIGHT_TEST === '1' || process.env.PW_TEST_REPORTER;
  const isExplicitAuthTestMode = process.env.E2E_AUTH_TEST_MODE === 'true';

  if (isProduction) {
    throw new Error('assertAuthTestMode: This test utility cannot be used in a production environment.');
  }

  if (!isTest && !isPlaywright && !isExplicitAuthTestMode) {
    throw new Error('assertAuthTestMode: No test context flag detected. Test utilities should only be used in test environments.');
  }
}
