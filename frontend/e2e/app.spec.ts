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

test('selects and persists the Hand Rhythm difficulty', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('combobox', { name: /dificultad/i })).toHaveCount(0);

  await page.getByRole('button', { name: /ritmo de manos/i }).click();
  const difficultySelect = page.getByRole('combobox', { name: /dificultad/i });
  await expect(difficultySelect).toHaveValue(/media/i);

  await difficultySelect.click();
  await page.getByRole('option', { name: /difícil/i }).click();
  await expect(difficultySelect).toHaveValue(/difícil/i);

  await page.reload();
  await expect(page.getByRole('combobox', { name: /dificultad/i })).toHaveValue(/difícil/i);
});

test('opens the tracking documentation route', async ({ page }) => {
  await page.goto('/docs/tracking-internals');

  await expect(page.getByLabel(/documentación interna de seguimiento/i)).toBeVisible();
  await expect(page.getByLabel(/juego principal/i)).toHaveCount(0);
});

test('selects and persists a detector backend', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: /seguimiento avanzado/i }).click();

  const detectorSelect = page.getByRole('combobox', { name: /detector/i });
  await detectorSelect.click();
  await page.getByRole('option', { name: /Python WebRTC/i }).click();
  await expect(detectorSelect).toHaveValue(/Python WebRTC/i);
  await expect(page.getByText('ws://127.0.0.1:8765')).toBeVisible();

  await page.reload();
  await page.getByRole('button', { name: /seguimiento avanzado/i }).click();
  await expect(page.getByRole('combobox', { name: /detector/i })).toHaveValue(/Python WebRTC/i);
});
