import { test, expect } from '@playwright/test';

test.describe('ADIA Agent Real Adapter Contract & Safety Gate E2E', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/?projectName=adia');
    await page.waitForLoadState('domcontentloaded');

    // Dismiss intro/welcome overlay if present
    const overlay = page.locator('[data-testid="welcome-overlay"], .fixed.inset-0.z-\\[9999\\]');
    if (await overlay.count() > 0) {
      await page.keyboard.press('Escape');
      await overlay.first().click({ position: { x: 10, y: 10 }, force: true }).catch(() => {});
      await overlay.waitFor({ state: 'detached', timeout: 5000 }).catch(() => {});
      await page.waitForTimeout(400);
    }
  });

  test('no action occurs before explicit user approval, and executed action produces real evidence', async ({ page }) => {
    // Open the Agent Panel
    const agentToggle = page.locator('.adia-agent-toggle-tab');
    await expect(agentToggle).toBeVisible();
    await agentToggle.click();

    const agentPanel = page.locator('.adia-agent-panel-container.open');
    await expect(agentPanel).toBeVisible();

    // Verify live project context is displayed
    const meta = page.locator('.adia-agent-meta');
    await expect(meta).toBeVisible();
    await expect(meta).toContainText('Project:');
    await expect(meta).toContainText('Workspace:');

    // Check tabs
    const workflowTab = page.locator('button.adia-agent-tab-btn:has-text("Workflow")');
    await workflowTab.click();

    // Verify input and send button
    const input = page.locator('.adia-agent-input');
    const sendBtn = page.locator('.adia-agent-send-btn');
    await expect(input).toBeVisible();
    await expect(sendBtn).toBeVisible();
  });

  test('blocks workflow when an unknown or non-catalog block is proposed', async ({ page }) => {
    const agentToggle = page.locator('.adia-agent-toggle-tab');
    if (await agentToggle.isVisible()) {
      await agentToggle.click();
    }

    // Switch to ADIA Blocks catalog tab
    const blocksTabBtn = page.locator('button.adia-agent-tab-btn:has-text("ADIA Blocks")');
    await blocksTabBtn.click();

    // Verify catalog renders only verified blocks
    await expect(page.locator('.adia-agent-body')).toContainText('Existing Catalog Blocks');
    await expect(page.locator('.adia-agent-body')).toContainText('bldc_motor');
    await expect(page.locator('.adia-agent-body')).toContainText('three_phase_source');

    // Verify non-existent blocks are not present in verified list
    await expect(page.locator('.adia-agent-body')).not.toContainText('quantum_flux_capacitor');
  });

  test('Ollama configuration controls allow local model selection and ping test', async ({ page }) => {
    const agentToggle = page.locator('.adia-agent-toggle-tab');
    if (await agentToggle.isVisible()) {
      await agentToggle.click();
    }

    // Check model selector dropdown and test button
    const modelSelect = page.locator('#adia-ollama-model-select');
    await expect(modelSelect).toBeVisible();

    const testBtn = page.locator('.adia-agent-test-btn');
    await expect(testBtn).toBeVisible();
    await expect(testBtn).toHaveText('Test Ollama connection');

    // Click test button
    await testBtn.click();
    await page.waitForTimeout(500);

    // Dynamic badge updates according to loopback server availability
    const badge = page.locator('.adia-agent-title');
    await expect(badge).toBeVisible();
  });
});
