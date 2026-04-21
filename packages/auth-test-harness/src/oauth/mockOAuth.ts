import { Page } from '@playwright/test';

export async function mockOAuthProvider(page: Page, provider: 'google' | 'outlook' | 'microsoft-entra-id', mockResponse: any = { success: true }) {
  await page.route(`**/api/integrations/${provider}/callback*`, async route => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(mockResponse),
    });
  });

  await page.route(`**/api/auth/callback/${provider}*`, async route => {
     await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(mockResponse),
    });
  });
}
