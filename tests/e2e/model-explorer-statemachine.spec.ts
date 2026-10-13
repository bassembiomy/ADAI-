import { test, expect } from '@playwright/test';

/**
 * End-to-end authoring scenarios for Cameo-style Model Explorer in State Machine mode.
 * Deterministic execution verifying creation, inline rename, relationship wizard, and search filter.
 */
test.describe('Model Explorer - State Machine Real Authoring (Task 17)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');

    // Dismiss welcome overlay if present
    const intro = page.locator('[data-testid="welcome-overlay"], .fixed.inset-0.z-\\[9999\\]');
    if (await intro.count() > 0) {
      await page.keyboard.press('Escape');
      await intro.first().click({ position: { x: 10, y: 10 }, force: true }).catch(() => {});
      await intro.waitFor({ state: 'detached', timeout: 5000 }).catch(() => {});
      await page.waitForTimeout(300);
    }
  });

  test('creates states, performs inline rename with F2, and creates a transition via Relationship Wizard', async ({ page }) => {
    const explorer = page.locator('.model-explorer-container');
    await expect(explorer).toBeVisible();

    // 1. Locate Root in containment tree
    const rootRow = page.locator('[role="treeitem"]').first();
    await expect(rootRow).toBeVisible();

    // 2. Open context menu on Root and create first state
    await rootRow.click({ button: 'right' });
    const menu = page.locator('[role="menu"]');
    await expect(menu).toBeVisible();

    const createStateOption = menu.locator('[role="menuitem"]:has-text("State")').first();
    await expect(createStateOption).toBeVisible();
    await createStateOption.click();

    // Context menu dismisses and new state appears
    await expect(menu).not.toBeVisible();
    const firstState = page.locator('[role="treeitem"]:has-text("State")').last();
    await expect(firstState).toBeVisible();

    // 3. Inline rename using F2 keyboard shortcut
    await firstState.click();
    await expect(firstState).toHaveAttribute('aria-selected', 'true');
    await page.keyboard.press('F2');

    const renameInput = page.locator('.model-explorer-container [role="treeitem"] input[type="text"]');
    await expect(renameInput).toBeVisible();
    await renameInput.fill('OperationalMode');
    await page.keyboard.press('Enter');

    // Check renamed label in the tree
    const renamedRow = page.locator('[role="treeitem"]:has-text("OperationalMode")');
    await expect(renamedRow).toBeVisible();

    // 4. Create second state for relationship target
    await rootRow.click({ button: 'right' });
    await expect(menu).toBeVisible();
    await menu.locator('[role="menuitem"]:has-text("State")').first().click();
    await expect(menu).not.toBeVisible();

    // 5. Open context menu on OperationalMode to create a Transition
    await renamedRow.click({ button: 'right' });
    await expect(menu).toBeVisible();

    const transitionOption = menu.locator('[role="menuitem"]:has-text("Transition")').first();
    await expect(transitionOption).toBeVisible();
    await transitionOption.click();

    // 6. Relationship Wizard dialog opens
    const wizard = page.locator('[role="dialog"][aria-labelledby="relationship-wizard-title"]');
    await expect(wizard).toBeVisible();
    await expect(wizard.locator('#relationship-wizard-title')).toHaveText('Create Relationship');

    // Confirm creation in wizard
    const createBtn = wizard.locator('button:has-text("Create")');
    await expect(createBtn).toBeEnabled();
    await createBtn.click();

    // Wizard closes and transition is established
    await expect(wizard).not.toBeVisible();
  });

  test('filters model elements via search input and clears filter deterministically', async ({ page }) => {
    const explorer = page.locator('.model-explorer-container');
    await expect(explorer).toBeVisible();

    const searchInput = page.locator('.model-explorer-toolbar input[type="text"]');
    await expect(searchInput).toBeVisible();

    // Filter by non-existent query
    await searchInput.fill('UnmatchedQuery999');
    const emptyNotice = page.locator('.model-explorer-container:has-text("No model elements matching")');
    await expect(emptyNotice).toBeVisible();

    // Clear search using clear button
    const clearBtn = page.locator('button[aria-label="Clear Search"]');
    await expect(clearBtn).toBeVisible();
    await clearBtn.click();

    // Treeitem is restored
    await expect(page.locator('[role="treeitem"]').first()).toBeVisible();
  });
});
