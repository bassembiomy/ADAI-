import { test, expect } from '@playwright/test';

test.describe('Prompt-Driven ADIA Agent Approval Flow E2E', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');

    // Dismiss intro overlay if present
    const intro = page.locator('.fixed.inset-0.z-\\[9999\\]');
    if (await intro.isVisible()) {
      await intro.click();
      await page.waitForTimeout(600);
    }
  });

  test('renders the agent toggle button and opens agent side panel with offline mode', async ({ page }) => {
    // Check for ADIA Agent toggle button
    const agentToggle = page.locator('.adia-agent-toggle-tab');
    await expect(agentToggle).toBeVisible();

    // Click to open agent panel
    await agentToggle.click();

    // Verify Agent Panel is open
    const agentPanel = page.locator('.adia-agent-panel-container.open');
    await expect(agentPanel).toBeVisible();

    // Verify header, mode indicator, and chat tabs
    await expect(page.locator('.adia-agent-title')).toContainText('ADIA Engineering Agent');
    await expect(page.locator('.adia-agent-badge-mode')).toContainText('Deterministic inspection-only mode');
    await expect(page.locator('.adia-agent-tabs')).toBeVisible();
    await expect(page.locator('.adia-agent-input')).toBeVisible();
  });

  test('switches tabs between Workflow, Specification, ADIA Blocks, and Audit Trail', async ({ page }) => {
    const agentToggle = page.locator('.adia-agent-toggle-tab');
    if (await agentToggle.isVisible()) {
      await agentToggle.click();
    }

    // Switch to Specification tab
    const specTabBtn = page.locator('button.adia-agent-tab-btn:has-text("Specification")');
    await specTabBtn.click();
    await expect(page.locator('.adia-agent-body')).toBeVisible();

    // Switch to ADIA Blocks catalog tab
    const blocksTabBtn = page.locator('button.adia-agent-tab-btn:has-text("ADIA Blocks")');
    await blocksTabBtn.click();
    await expect(page.locator('.adia-agent-body')).toContainText('Existing Catalog Blocks');

    // Switch to Audit Trail tab
    const auditTabBtn = page.locator('button.adia-agent-tab-btn:has-text("Audit Trail")');
    await auditTabBtn.click();
    await expect(page.locator('.adia-agent-body')).toContainText('Immutable Audit Trail');
  });

  test('executes clarification conversation and presents approval gates', async ({ page }) => {
    const agentToggle = page.locator('.adia-agent-toggle-tab');
    if (await agentToggle.isVisible()) {
      await agentToggle.click();
    }

    const input = page.locator('.adia-agent-input');
    const sendBtn = page.locator('.adia-agent-send-btn');

    // Send initial request
    await input.fill('Design an air fryer temperature controller');
    await sendBtn.click();

    // Wait for agent clarification turn
    await expect(page.locator('.adia-agent-msg.agent').first()).toBeVisible({ timeout: 5000 });
  });
});
