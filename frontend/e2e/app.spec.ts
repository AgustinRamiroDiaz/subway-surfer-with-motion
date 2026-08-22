import { expect, test } from '@playwright/test';

test('selects and persists a runner level', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: /carrera lateral/i })).toBeVisible();

  await page.getByRole('button', { name: /ritmo de manos/i }).click();
  await expect(page.getByRole('heading', { name: /ritmo de manos/i })).toBeVisible();
  await page.reload();

  await expect(page.getByRole('button', { name: /ritmo de manos/i })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('heading', { name: /ritmo de manos/i })).toBeVisible();
});

test('opens the tracking documentation route', async ({ page }) => {
  await page.goto('/docs/tracking-internals');

  await expect(page.getByLabel(/documentación interna de seguimiento/i)).toBeVisible();
  await expect(page.getByLabel(/juego principal/i)).toHaveCount(0);
});
