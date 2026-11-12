import { test, expect, type Page } from '@playwright/test';
import { readFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/**
 * Stateflow-style events, end to end in the real app: declare an input event, attach it to a transition,
 * save the project and open it in a fresh app, then run the simulation and post the event.
 */
async function dismissOverlays(page: Page) {
  const intro = page.locator('[data-testid="welcome-overlay"], .fixed.inset-0.z-\\[9999\\]');
  if (await intro.count() > 0) {
    await page.keyboard.press('Escape');
    await intro.first().click({ position: { x: 10, y: 10 }, force: true }).catch(() => {});
    await intro.waitFor({ state: 'detached', timeout: 5000 }).catch(() => {});
  }
  const closeDrawer = page.locator('button.adia-agent-close-btn').first();
  if (await closeDrawer.isVisible()) await closeDrawer.click({ force: true }).catch(() => {});
}

test.use({ viewport: { width: 1920, height: 1080 } });
test.setTimeout(120_000);
test.use({ actionTimeout: 15_000 });

test.describe('State machine events', () => {
  test('declares an input event, triggers a transition with it, persists it and simulates it', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');
    await dismissOverlays(page);
    const stateButton = page.getByRole('button', { name: 'State', exact: true }).first();
    const canvas = page.locator('main').first();
    const svg = canvas;
    const box = (await canvas.boundingBox())!;

    // Two states. New states appear at the same spot, so drag the second one aside.
    await stateButton.click();
    await page.mouse.click(box.x + 200, box.y + 250);
    await expect(svg.getByText('State_1')).toBeVisible();
    await stateButton.click();
    await page.mouse.click(box.x + 200, box.y + 250);
    const second = svg.getByText('State_2');
    await expect(second).toBeVisible();
    const at = (await second.boundingBox())!;
    await page.mouse.move(at.x + at.width / 2, at.y + at.height / 2);
    await page.mouse.down();
    await page.mouse.move(at.x + at.width / 2 + 150, at.y + at.height / 2 + 20, { steps: 8 });
    await page.mouse.move(at.x + at.width / 2 + 300, at.y + at.height / 2 + 40, { steps: 8 });
    await page.mouse.up();
    await page.keyboard.press('Escape');

    // Transition State_1 -> State_2 (State_1 is the initial state).
    await page.getByRole('button', { name: 'Connect', exact: true }).click();
    await svg.getByText('State_1').click({ force: true });
    await svg.getByText('State_2').click({ force: true });
    await expect(page.getByText('Transitions: 1')).toBeVisible();

    // Declare the input event GO in the Events section and rename the default name.
    await page.getByRole('button', { name: 'ADD EVENT' }).click();
    const nameInput = page.getByLabel('Event name EVENT_1');
    await expect(nameInput).toHaveValue('EVENT_1');
    await nameInput.fill('GO');
    await expect(page.getByLabel('Event name GO')).toBeVisible();
    await expect(page.getByLabel('Scope of event GO')).toHaveValue('input');

    // An invalid name is rejected with a visible error and not applied.
    await page.getByLabel('Event name GO').fill('1 bad');
    await expect(page.getByRole('alert')).toContainText('not a valid C identifier');
    await page.getByLabel('Event name GO').fill('GO');
    await expect(page.getByRole('alert')).toHaveCount(0);

    // Select the transition (its canvas label) and attach the event.
    const transitionLabel = canvas.getByText('[true]').first();
    await transitionLabel.click({ force: true });
    const eventSelect = page.getByTestId('transition-event-select');
    await expect(eventSelect).toBeVisible();
    await eventSelect.selectOption({ label: 'GO (Input)' });
    await expect(canvas.getByText('[true]')).toHaveCount(0);

    // Save: the .adia file carries the event declaration and the transition's reference to it.
    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    const download = await downloadPromise;
    const savedPath = join(mkdtempSync(join(tmpdir(), 'adia-events-')), 'events.adia');
    await download.saveAs(savedPath);
    const saved = JSON.parse(readFileSync(savedPath, 'utf8'));
    expect(saved.events).toEqual([expect.objectContaining({ name: 'GO', scope: 'input' })]);
    expect(saved.transitions).toHaveLength(1);
    expect(saved.transitions[0].event).toBe(saved.events[0].id);

    // Start the app again in a fresh page (a reload would raise the unsaved-changes prompt)
    // and open the saved project: the event and the transition trigger survive.
    const app = await page.context().newPage();
    await page.close();
    await app.goto('/');
    await app.waitForLoadState('domcontentloaded');
    await expect(app.getByRole('button', { name: 'ADD EVENT' })).toBeAttached({ timeout: 90_000 });
    await dismissOverlays(app);
    await expect(app.getByLabel('Event name GO')).toHaveCount(0);
    await app.locator('input[type="file"][accept=".adia,.json"]').setInputFiles(savedPath);
    await expect(app.getByLabel('Event name GO')).toBeVisible();
    // The project reopens on its last diagram tab; go back to the state machine.
    await app.getByRole('tab', { name: /Main State Machine/ }).click();
    const reopened = app.locator('main').first();
    await expect(reopened.getByText('State_2')).toBeVisible();
    // Canvas label: "(order) GO" -- the event name replaces the default [true] guard.
    const reopenedLabel = reopened.getByText(/\(\d+\)\s*GO$/);
    await expect(reopenedLabel).toBeVisible();
    await expect(reopened.getByText('[true]')).toHaveCount(0);
    // Select the transition on its curve to open its properties.
    await reopened.locator('path[data-help-feature="app-sm-curve"]').first().click({ force: true });
    await expect(app.getByTestId('transition-event-select')).toHaveValue(saved.events[0].id);

    // Simulate: State_1 is active; posting GO and stepping fires the event transition.
    const activeFill = 'rect[fill="var(--sysml-state-active-fill)"]';
    const stateGroup = (name: string) => reopened.locator('g[data-help-feature="app-state-layer"]', { hasText: name });
    await app.getByRole('button', { name: 'Start' }).click();
    await expect(stateGroup('State_1').locator(activeFill)).toHaveCount(1);
    await app.getByRole('button', { name: 'Pause' }).click();
    await app.getByRole('button', { name: 'Step', exact: true }).click();
    // Without the event the transition stays disabled.
    await expect(stateGroup('State_1').locator(activeFill)).toHaveCount(1);
    await expect(stateGroup('State_2').locator(activeFill)).toHaveCount(0);

    await app.getByTestId('post-event-GO').click();
    await app.getByRole('button', { name: 'Step', exact: true }).click();
    await expect(stateGroup('State_2').locator(activeFill)).toHaveCount(1);
    await expect(stateGroup('State_1').locator(activeFill)).toHaveCount(0);
  });
});
