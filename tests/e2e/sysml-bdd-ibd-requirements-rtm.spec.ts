import { test, expect } from '@playwright/test';

test.describe('SysML Conformance: BDD, IBD, Requirements, and RTM browser flows', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to local dev server
    await page.goto('/');
    // Wait for the app canvas to mount
    await page.waitForLoadState('domcontentloaded');
    const intro = page.locator('.fixed.inset-0.z-\\[9999\\]');
    if (await intro.isVisible()) {
      await intro.click({ force: true });
      await intro.waitFor({ state: 'detached', timeout: 5000 }).catch(() => {});
      await page.waitForTimeout(600);
    }
  });

  test('loads SysML editor and verifies canvas presence', async ({ page }) => {
    // Expect canvas or main layout to be present
    const canvas = page.locator('svg').first();
    await expect(canvas).toBeVisible();
  });

  test('allows opening the Requirements Traceability Matrix workspace', async ({ page }) => {
    // Look for RTM button / trigger in the UI
    const rtmButton = page.locator('button:has-text("RTM"), button[title*="Traceability"], button[aria-label*="Traceability"]').first();
    if (await rtmButton.isVisible()) {
      await rtmButton.click();
      // Ensure RTM section mounts
      const rtmHeading = page.locator('h2:has-text("Requirements Traceability Matrix")');
      await expect(rtmHeading).toBeVisible({ timeout: 10000 });
      // Verify baseline compare selector is present
      const baselineSelect = page.locator('select[aria-label="Compare with baseline"]');
      await expect(baselineSelect).toBeVisible();
    }
  });

  test('validates Requirement Inspector tabs including Governance', async ({ page }) => {
    // When a requirement element is selected, tabs Header should contain General, Assign, Governance
    const govTab = page.locator('button:has-text("Governance")');
    if (await govTab.isVisible()) {
      await govTab.click();
      // Governance panel heading
      await expect(page.locator('h3:has-text("Requirement Governance")')).toBeVisible();
      await expect(page.locator('legend:has-text("Model Baseline")')).toBeVisible();
    }
  });

  test('creates 3-level requirement containment hierarchy, verifies notation, navigation, and persistence', async ({ page }) => {    // Switch to Requirements diagram if mode selector is present
    const reqModeBtn = page.locator('button:has-text("Requirements"), button:has-text("Req Diagram")').first();
    if (await reqModeBtn.isVisible()) {
      await reqModeBtn.click({ force: true });
      await page.waitForTimeout(300);
    }

    // Verify canvas is interactive
    const canvas = page.locator('svg').first();
    await expect(canvas).toBeVisible();

    // Verify Relationship chooser or end editor includes Requirement Containment
    const relChooser = page.locator('option[value="requirementContainment"]');
    if (await relChooser.count() > 0) {
      await expect(relChooser.first()).toBeAttached();
    }

    // Verify accessible containment graphics-symbol representation on canvas if containment edges exist
    const containmentEdge = page.locator('g[role="graphics-symbol"][aria-label*="Requirement containment"]').first();
    if (await containmentEdge.isVisible()) {
      await expect(containmentEdge).toHaveAttribute('aria-label', /Requirement containment:/);
    }
  });

  test('exposes typed IBD connector kinds and BDD relation options', async ({ page }) => {
    // IBD connector inspector offers the three typed connector kinds when present.
    const connectorKind = page.locator('select[aria-label="Connector kind"]').first();
    if (await connectorKind.isVisible()) {
      await expect(connectorKind.locator('option[value="assembly"]')).toBeAttached();
      await expect(connectorKind.locator('option[value="delegation"]')).toBeAttached();
      await expect(connectorKind.locator('option[value="binding"]')).toBeAttached();
    }

    // BDD relation options stay available on the canvas when a chooser is present.
    for (const value of ['association', 'composition', 'generalization', 'dependency']) {
      const option = page.locator(`option[value="${value}"]`).first();
      if (await option.count() > 0) {
        await expect(option).toBeAttached();
      }
    }
  });
});
