import { test, expect } from '@playwright/test';

async function openModeler(page: import('@playwright/test').Page) {
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  const intro = page.locator('[data-testid="welcome-overlay"]');
  if (await intro.count()) {
    await intro.first().click({ position: { x: 10, y: 10 }, force: true }).catch(() => {});
    await intro.first().waitFor({ state: 'detached', timeout: 10_000 }).catch(() => {});
  }
}

/**
 * The unified workspace strip mixes workspace-file tabs (keyed by file id) with
 * exact-ID diagram tabs. Both used to carry independent "active" signals, so a
 * stale second tab stayed highlighted, and the workspace file underneath an open
 * diagram view could not be re-selected because it was still the active file id.
 */
test.describe('workspace tab highlight parity', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1920, height: 1080 });
    await openModeler(page);
    await page.waitForTimeout(1500);
  });

  test('highlights exactly the rendered view and activates on a single press', async ({ page }) => {
    const stateMachineTab = page.locator('[data-workspace-type="statemachine"]');
    const bddTab = page.locator('[data-diagram-id="adia-default-bdd"]');
    const selectedTabs = page.getByTestId('diagram-workspace-tabs').locator('[role="tab"][aria-selected="true"]');
    const diagramRow = (text: string) =>
      page.locator('[data-node-id][data-kind="diagram"]', { hasText: text }).first();

    // Startup renders the state-machine workspace, so only its tab is selected:
    // the open BDD tab must not read as active beside it.
    await expect(stateMachineTab).toHaveAttribute('aria-selected', 'true');
    await expect(bddTab).toHaveAttribute('aria-selected', 'false');
    await expect(selectedTabs).toHaveCount(1);
    await expect(page.getByText(/^States:/)).toBeVisible();

    // A single press on a diagram row brings that diagram into the canvas and
    // moves the one highlight in the strip onto it.
    await diagramRow('Main SysML BDD').click();
    await expect(bddTab).toHaveAttribute('aria-selected', 'true');
    await expect(stateMachineTab).toHaveAttribute('aria-selected', 'false');
    await expect(selectedTabs).toHaveCount(1);
    await expect(page.getByText(/^Blocks:/)).toBeVisible();

    // A single press on the workspace file tab returns its canvas, even though
    // that file id was still the active workspace file underneath the diagram.
    await stateMachineTab.click();
    await expect(stateMachineTab).toHaveAttribute('aria-selected', 'true');
    await expect(selectedTabs).toHaveCount(1);
    await expect(page.getByText(/^States:/)).toBeVisible();

    // Switching to another module workspace keeps the highlight single.
    await page.locator('[data-workspace-type="xbridges"]').click();
    await expect(page.locator('[data-workspace-type="xbridges"]')).toHaveAttribute('aria-selected', 'true');
    await expect(selectedTabs).toHaveCount(1);

    await stateMachineTab.click();
    await expect(stateMachineTab).toHaveAttribute('aria-selected', 'true');
    await expect(selectedTabs).toHaveCount(1);
    await expect(page.getByText(/^States:/)).toBeVisible();
  });

  test('closing tabs keeps the selected tab and canvas in parity', async ({ page }) => {
    const tabs = page.getByTestId('diagram-workspace-tabs');
    const stateMachineTab = page.locator('[data-workspace-type="statemachine"]');
    const requirementsTab = page.locator('[data-diagram-id="adia-default-requirements"]');
    const bddTab = page.locator('[data-diagram-id="adia-default-bdd"]');
    const selectedTabs = tabs.locator('[role="tab"][aria-selected="true"]');

    // Open both diagrams in order so Requirements is between the workspace
    // tab and BDD. Close the active middle tab and require its right neighbor.
    await page.locator('[data-node-id][data-kind="diagram"]', { hasText: 'Main Requirements Diagram' }).first().click();
    await page.locator('[data-node-id][data-kind="diagram"]', { hasText: 'Main SysML BDD' }).first().click();
    await requirementsTab.click();
    await expect(page.getByText(/^Requirements:/)).toBeVisible();
    await requirementsTab.getByTitle('Close Tab').click();
    await expect(bddTab).toHaveAttribute('aria-selected', 'true');
    await expect(selectedTabs).toHaveCount(1);
    await expect(page.getByText(/^Blocks:/)).toBeVisible();

    // Open Requirements again, return to State Machine, then remove every
    // diagram tab while preserving the workspace canvas.
    await page.locator('[data-node-id][data-kind="diagram"]', { hasText: 'Main Requirements Diagram' }).first().click();
    await stateMachineTab.click();
    await expect(page.getByText(/^States:/)).toBeVisible();
    await bddTab.getByTitle('Close Tab').click();
    await requirementsTab.getByTitle('Close Tab').click();
    await expect(stateMachineTab).toHaveAttribute('aria-selected', 'true');
    await expect(selectedTabs).toHaveCount(1);
    await expect(selectedTabs).toHaveText(/State Machine/i);
    await expect(page.getByText(/^States:/)).toBeVisible();
  });
});
