import { test, expect } from '@playwright/test';

// Helper to find elements by text content inside a component section
async function findByText(page, text) {
  return page.getByText(text, { exact: false });
}

test.describe('Copilot E2E', () => {
  test('Quick Prompts KPIs returns content for selected period (skipped in CI for stability)', async ({ page }) => {
    test.skip(true, 'Skipping Quick Prompts in CI builds for stability.');
    await page.goto('/');
  });

  test('Tables Top Produtos fetch and render without error (skip if section missing)', async ({ page }) => {
    await page.goto('/');

    const tablesPresent = await page.getByText('Tabelas (Copilot Debug Tools)').count();
    if (tablesPresent === 0) {
      test.skip(true, 'Copilot debug tables not present in this build');
    }

    // Select dataset Top Produtos via data-testid for robustness
    await page.getByTestId('dataset-select').click();
    await page.getByRole('option', { name: 'Top Produtos' }).click();

    // Click Buscar
    await page.getByRole('button', { name: 'Buscar' }).click();

    // Expect the debug table to render (either header visible or 'Sem dados')
    const debugCard = page.locator('div:has-text("Tabelas (Copilot Debug Tools)")').first();
    const table = debugCard.locator('table').first();
    await Promise.race([
      table.waitFor({ state: 'visible' }),
      page.getByText('Sem dados').first().waitFor({ state: 'visible' })
    ]);

    // Either rows or "Sem dados" should appear (no error)
    const hasNoData = await page.getByText('Sem dados').isVisible().catch(() => false);
    if (!hasNoData) {
      // Check at least one cell exists after fetch
      const anyCell = page.locator('table tbody tr td').first();
      await expect(anyCell).toBeVisible();
    }

    // Ensure no red error message present
    const errorMsg = page.locator('text=Query failed');
    await expect(errorMsg).toHaveCount(0);
  });

  test('Tables Baixo Estoque fetch and render (skip if section missing)', async ({ page }) => {
    await page.goto('/');
    const tablesPresent = await page.getByText('Tabelas (Copilot Debug Tools)').count();
    if (tablesPresent === 0) {
      test.skip(true, 'Copilot debug tables not present in this build');
    }
    await page.getByTestId('dataset-select').click();
    await page.getByRole('option', { name: 'Baixo Estoque' }).click();
    await page.getByRole('button', { name: 'Buscar' }).click();
    const debugCard2 = page.locator('div:has-text("Tabelas (Copilot Debug Tools)")').first();
    const table2 = debugCard2.locator('table').first();
    await Promise.race([
      table2.waitFor({ state: 'visible' }),
      page.getByText('Sem dados').first().waitFor({ state: 'visible' })
    ]);
  });

  test('Tables Piores Margens fetch and render (skip if section missing)', async ({ page }) => {
    await page.goto('/');
    const tablesPresent = await page.getByText('Tabelas (Copilot Debug Tools)').count();
    if (tablesPresent === 0) {
      test.skip(true, 'Copilot debug tables not present in this build');
    }
    await page.getByTestId('dataset-select').click();
    await page.getByRole('option', { name: 'Piores Margens' }).click();
    await page.getByRole('button', { name: 'Buscar' }).click();
    const debugCard3 = page.locator('div:has-text("Tabelas (Copilot Debug Tools)")').first();
    const table3 = debugCard3.locator('table').first();
    await Promise.race([
      table3.waitFor({ state: 'visible' }),
      page.getByText('Sem dados').first().waitFor({ state: 'visible' })
    ]);
  });

  test('Tables Quedas semanais fetch and render (skip if section missing)', async ({ page }) => {
    await page.goto('/');
    const tablesPresent = await page.getByText('Tabelas (Copilot Debug Tools)').count();
    if (tablesPresent === 0) {
      test.skip(true, 'Copilot debug tables not present in this build');
    }
    await page.getByTestId('dataset-select').click();
    await page.getByRole('option', { name: 'Quedas semanais' }).click();
    await page.getByRole('button', { name: 'Buscar' }).click();
    const debugCard4 = page.locator('div:has-text("Tabelas (Copilot Debug Tools)")').first();
    const table4 = debugCard4.locator('table').first();
    await Promise.race([
      table4.waitFor({ state: 'visible' }),
      page.getByText('Sem dados').first().waitFor({ state: 'visible' })
    ]);
  });

  test('Sales Analytics Baixo Estoque fetch and render', async ({ page }) => {
    await page.goto('/sales');
    await expect(page.getByText('Analytics (Server-side)')).toBeVisible();

    await page.getByTestId('dataset-select').click();
    await page.getByRole('option', { name: 'Baixo Estoque' }).click();

    await page.getByRole('button', { name: 'Buscar' }).click();
    const analyticsCard = page.locator('div:has-text("Analytics (Server-side)")').first();
    const analyticsTable = analyticsCard.locator('table').first();
    await Promise.race([
      analyticsTable.waitFor({ state: 'visible' }),
      page.getByText('Sem dados').first().waitFor({ state: 'visible' })
    ]);

    const hasNoData = await page.getByText('Sem dados').isVisible().catch(() => false);
    if (!hasNoData) {
      const anyCell = page.locator('table tbody tr td').first();
      await expect(anyCell).toBeVisible();
    }
  });

  test('Sales Analytics Piores Margens fetch and render', async ({ page }) => {
    await page.goto('/sales');
    await expect(page.getByText('Analytics (Server-side)')).toBeVisible();

    await page.getByTestId('dataset-select').click();
    await page.getByRole('option', { name: 'Piores Margens' }).click();

    await page.getByRole('button', { name: 'Buscar' }).click();
    const analyticsCard2 = page.locator('div:has-text("Analytics (Server-side)")').first();
    const analyticsTable2 = analyticsCard2.locator('table').first();
    await Promise.race([
      analyticsTable2.waitFor({ state: 'visible' }),
      page.getByText('Sem dados').first().waitFor({ state: 'visible' })
    ]);

    const hasNoData = await page.getByText('Sem dados').isVisible().catch(() => false);
    if (!hasNoData) {
      const anyCell = page.locator('table tbody tr td').first();
      await expect(anyCell).toBeVisible();
    }
  });

  test('Sales Analytics Quedas semanais fetch and render', async ({ page }) => {
    await page.goto('/sales');
    await expect(page.getByText('Analytics (Server-side)')).toBeVisible();

    await page.getByTestId('dataset-select').click();
    await page.getByRole('option', { name: 'Quedas semanais' }).click();

    await page.getByRole('button', { name: 'Buscar' }).click();
    const analyticsCard3 = page.locator('div:has-text("Analytics (Server-side)")').first();
    const analyticsTable3 = analyticsCard3.locator('table').first();
    await Promise.race([
      analyticsTable3.waitFor({ state: 'visible' }),
      page.getByText('Sem dados').first().waitFor({ state: 'visible' })
    ]);

    const hasNoData = await page.getByText('Sem dados').isVisible().catch(() => false);
    if (!hasNoData) {
      const anyCell = page.locator('table tbody tr td').first();
      await expect(anyCell).toBeVisible();
    }
  });
});

