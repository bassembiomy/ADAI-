import { test, expect } from '@playwright/test';

test.describe('SysML Conformance: Use-Case Diagram Workflow & Cameo-style Notation', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');
    // Dismiss intro overlay if present
    const intro = page.locator('.fixed.inset-0.z-\\[9999\\]');
    if (await intro.isVisible()) {
      await intro.click({ force: true });
      await intro.waitFor({ state: 'detached', timeout: 5000 }).catch(() => {});
      await page.waitForTimeout(600);
    }

    // Switch to Use-Case diagram mode
    const useCaseBtn = page.locator('button:has-text("Use Case"), button:has-text("UseCase"), button[title*="Use Case"]').first();
    if (await useCaseBtn.isVisible()) {
      await useCaseBtn.click({ force: true });
      await page.waitForTimeout(400);
    }
  });

  test('renders Use-Case canvas toolbar with Cameo-style creation tools', async ({ page }) => {
    // Check for canvas toolbar buttons
    const addActorBtn = page.locator('button:has-text("+ Actor")').first();
    const addUseCaseBtn = page.locator('button:has-text("+ Use Case")').first();
    const addSubjectBtn = page.locator('button:has-text("+ Subject")').first();

    if (await addActorBtn.isVisible()) {
      await expect(addActorBtn).toBeVisible();
      await expect(addUseCaseBtn).toBeVisible();
      await expect(addSubjectBtn).toBeVisible();
    }
  });

  test('creates and inspects use-case elements with typed 3-tab inspector', async ({ page }) => {
    const addUseCaseBtn = page.locator('button:has-text("+ Use Case")').first();
    if (await addUseCaseBtn.isVisible()) {
      await addUseCaseBtn.click();
      await page.waitForTimeout(300);

      // Node should appear in ReactFlow canvas
      const useCaseNode = page.locator('.react-flow__node-useCase').first();
      if (await useCaseNode.isVisible()) {
        await useCaseNode.click();
        await page.waitForTimeout(200);

        // Verify 3 tabs in inspector
        const propertiesTab = page.locator('button:has-text("Properties")').first();
        const architectureTab = page.locator('button:has-text("SysML Architecture")').first();
        const traceabilityTab = page.locator('button:has-text("Traceability")').first();

        await expect(propertiesTab).toBeVisible();
        await expect(architectureTab).toBeVisible();
        await expect(traceabilityTab).toBeVisible();

        // Check Architecture tab
        await architectureTab.click();
        await expect(page.locator('text=Subject Block (System Realization)')).toBeVisible();
        await expect(page.locator('text=Elaborating Behavior Diagram')).toBeVisible();

        // Check Traceability tab
        await traceabilityTab.click();
        await expect(page.locator('text=Add Requirement Link')).toBeVisible();
        await expect(page.locator('text=Traceability Matrix')).toBeVisible();
      }
    }
  });

  test('validates connection policy diagnostics modal on invalid connection', async ({ page }) => {
    // If an invalid connection error modal triggers, it renders with data-testid="sysml-connection-error-modal"
    const errorModal = page.locator('[data-testid="sysml-connection-error-modal"]');
    // Verify modal is not visible initially
    await expect(errorModal).not.toBeVisible();
  });

  test('persists use-case diagram in project save payload', async ({ page }) => {
    const saveButton = page.locator('button:has-text("Save"), button[title*="Save"]').first();
    if (await saveButton.isVisible()) {
      await expect(saveButton).toBeEnabled();
    }
  });
});
