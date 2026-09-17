import { test, expect } from '@playwright/test';

test.describe('Prompt-Driven ADIA Agent Approval Flow E2E', () => {
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

    // Answer the clarification questions
    const answers = [
      '200°C',
      '1800W',
      '230V AC',
      'NTC 100k',
      'PID',
      '240°C',
      'Heat in under 4 mins',
    ];

    for (const ans of answers) {
      await input.fill(ans);
      await sendBtn.click();
      await page.waitForTimeout(400);
    }

    // Specification approval card should be visible
    const approveSpecBtn = page.locator('.adia-agent-btn-approve:has-text("Approve Specification")');
    await expect(approveSpecBtn).toBeVisible({ timeout: 8000 });

    // Check specification tab has populated requirements
    const specTabBtn = page.locator('button.adia-agent-tab-btn:has-text("Specification")');
    await specTabBtn.click();
    await expect(page.locator('.adia-agent-body')).toContainText('Target System: air-fryer');

    // Switch back to Workflow & Chat
    const chatTabBtn = page.locator('button.adia-agent-tab-btn:has-text("Workflow & Chat")');
    await chatTabBtn.click();

    // Approve specification
    await approveSpecBtn.click();

    // Execution plan approval card should be visible
    const approvePlanBtn = page.locator('.adia-agent-btn-approve:has-text("Approve Execution Plan")');
    await expect(approvePlanBtn).toBeVisible({ timeout: 8000 });

    // Approve execution plan
    await approvePlanBtn.click();

    // First change action approval card should be visible
    const approveChangeBtn = page.locator('.adia-agent-btn-approve:has-text("Approve Change")');
    await expect(approveChangeBtn).toBeVisible({ timeout: 8000 });

    // Test rejection: clicking reject must record rejection without mutating workspace
    const rejectBtn = page.locator('.adia-agent-btn-reject');
    await expect(rejectBtn).toBeVisible();
    await rejectBtn.click();

    // Switch to Audit Trail tab and verify rejection event was recorded
    const auditTabBtn = page.locator('button.adia-agent-tab-btn:has-text("Audit Trail")');
    await auditTabBtn.click();
    await expect(page.locator('.adia-agent-body')).toContainText('APPROVAL_REJECTED');
  });

  test('displays truthful delegate readiness indicators in header', async ({ page }) => {
    const agentToggle = page.locator('.adia-agent-toggle-tab');
    if (await agentToggle.isVisible()) {
      await agentToggle.click();
    }

    // Verify readiness badges exist
    await expect(page.locator('.delegate-status-xbridges')).toBeVisible();
    await expect(page.locator('.delegate-status-sysml')).toBeVisible();
    await expect(page.locator('.delegate-status-report')).toBeVisible();
    await expect(page.locator('.delegate-status-simulation')).toBeVisible();
  });
});
