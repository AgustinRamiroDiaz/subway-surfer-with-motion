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
  const playerScores = page.getByLabel(/puntuación del jugador/i);
  await expect(playerScores).toHaveCount(2);
  await expect(playerScores.nth(0)).toContainText(/aciertos\s*0/i);
  await expect(playerScores.nth(0)).toContainText(/fallos\s*0/i);
  await expect(page.getByLabel(/estadísticas del juego/i)).toHaveCount(0);

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

test('changes and persists the live game render FPS limit', async ({ page }) => {
  await page.goto('/');
  const renderFpsSlider = page.getByRole('slider', { name: /fps de renderizado/i });

  await expect(renderFpsSlider).toHaveAttribute('aria-valuenow', '60');
  await renderFpsSlider.focus();
  await renderFpsSlider.press('End');
  await expect(renderFpsSlider).toHaveAttribute('aria-valuenow', '165');

  await page.reload();
  await expect(page.getByRole('slider', { name: /fps de renderizado/i })).toHaveAttribute('aria-valuenow', '165');
});

test('normalizes an invalid saved game render FPS', async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem(
      'motion-runner:detection-preferences:v1',
      JSON.stringify({ gameRenderFps: 999 })
    );
  });
  await page.goto('/');

  await expect(page.getByRole('slider', { name: /fps de renderizado/i })).toHaveAttribute('aria-valuenow', '165');
});

test('keeps the render FPS control usable in a narrow viewport', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  const renderFpsSlider = page.getByRole('slider', { name: /fps de renderizado/i });

  await renderFpsSlider.scrollIntoViewIfNeeded();
  await expect(renderFpsSlider).toBeVisible();
  const bounds = await renderFpsSlider.boundingBox();
  expect(bounds).not.toBeNull();
  expect(bounds!.x).toBeGreaterThanOrEqual(0);
  expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(390);
});

test('expands the game view and camera overlay when the controls collapse', async ({ page }) => {
  await page.goto('/');

  const stage = page.locator('.game-stage');
  const canvas = page.locator('.game-canvas');
  const overlay = page.locator('.in-game-camera');
  const hidePanel = page.getByRole('button', { name: /ocultar panel/i });

  await expect.poll(async () => {
    const stageBox = await stage.boundingBox();
    const overlayBox = await overlay.boundingBox();
    return stageBox && overlayBox ? overlayBox.width / stageBox.width : 0;
  }).toBeCloseTo(1, 2);

  const expandedStage = await stage.boundingBox();
  const expandedOverlay = await overlay.boundingBox();
  expect(expandedOverlay).not.toBeNull();
  expect(expandedOverlay!.width / expandedOverlay!.height).toBeCloseTo(4 / 3, 2);
  await hidePanel.click();
  await expect(page.getByRole('button', { name: /mostrar panel/i })).toBeVisible();
  await page.waitForTimeout(250);

  const collapsedStage = await stage.boundingBox();
  const collapsedCanvas = await canvas.boundingBox();
  const collapsedOverlay = await overlay.boundingBox();
  expect(expandedStage).not.toBeNull();
  expect(collapsedStage).not.toBeNull();
  expect(collapsedCanvas).not.toBeNull();
  expect(collapsedOverlay).not.toBeNull();
  expect(collapsedStage!.width).toBeGreaterThan(expandedStage!.width);
  expect(collapsedCanvas!.width).toBeCloseTo(collapsedStage!.width, 0);
  expect(collapsedOverlay!.x).toBeCloseTo(collapsedStage!.x, 0);
  expect(collapsedOverlay!.width).toBeCloseTo(collapsedStage!.width, 0);
  expect(collapsedOverlay!.width / collapsedOverlay!.height).toBeCloseTo(4 / 3, 2);
  expect(collapsedOverlay!.y).toBeLessThan(collapsedStage!.y);
  expect(collapsedOverlay!.y + collapsedOverlay!.height).toBeGreaterThan(
    collapsedStage!.y + collapsedStage!.height
  );
});
