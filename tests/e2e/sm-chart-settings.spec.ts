import { test, expect, type Page } from '@playwright/test';
import { readFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/**
 * Fixed-point variables, external C functions and the per-chart code prefix, end to end in the real app:
 * create all three, use the function in a state action, save, open the project in a fresh app, run
 * Validate and Generate C/H, and simulate a few steps.
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

async function addVariable(page: Page, name: string, type: string, initial: string) {
  await page.locator('[data-help-feature="app-variable-name"]').first().fill(name);
  await page.locator('[data-help-feature="app-variable-new-type"]').first().selectOption(type);
  await page.locator('[data-help-feature="app-variable-new-initial"]').first().fill(initial);
  await page.getByRole('button', { name: 'ADD', exact: true }).click();
}

/** Validate raises an error dialog for an error and lists warnings in the selected element's panel. */
async function expectValidationClean(page: Page) {
  await page.waitForTimeout(500);
  await expect(page.locator('p.text-red-300')).toHaveCount(0);
  await expect(page.getByText('Unknown identifier')).toHaveCount(0);
  await expect(page.getByText('⚠️ Warning')).toHaveCount(0);
}

test.use({ viewport: { width: 1920, height: 1080 } });
test.setTimeout(180_000);
test.use({ actionTimeout: 15_000 });

test.describe('State machine chart settings', () => {
  test('fixed-point variable, external function and code prefix survive save and reopen, validate, generate and simulate', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');
    await dismissOverlays(page);
    const canvas = page.locator('main').first();

    // One state with an entry action.
    await page.getByRole('button', { name: 'State', exact: true }).first().click();
    const box = (await canvas.boundingBox())!;
    await page.mouse.click(box.x + 200, box.y + 250);
    await expect(canvas.getByText('State_1')).toBeVisible();

    // Variables: an int32 result and a fixdt(1, 16, 8) level that is changed to fraction length 4.
    await addVariable(page, 'result', 'int32', '0');
    await page.locator('[data-help-feature="app-variable-name"]').first().fill('level');
    await page.locator('[data-help-feature="app-variable-new-type"]').first().selectOption('fixdt');
    await expect(page.getByTestId('fixed-point-editor')).toBeVisible();
    await expect(page.locator('[data-help-feature="app-variable-new-type"]').first().locator('option[value="fixdt"]')).toHaveText('fixdt (fixed-point)');
    // Inline validation: a fraction length larger than the word length is refused and not applied.
    const newFraction = page.getByLabel('Fraction length new variable');
    await newFraction.fill('17');
    await expect(page.getByRole('alert')).toContainText('0 to 16');
    await newFraction.fill('4');
    await expect(page.getByRole('alert')).toHaveCount(0);
    await page.locator('[data-help-feature="app-variable-new-initial"]').first().fill('1.5');
    await page.getByRole('button', { name: 'ADD', exact: true }).click();
    await expect(page.getByLabel('Fraction length level')).toHaveValue('4');
    await expect(page.getByLabel('Word length level')).toHaveValue('16');
    await expect(page.getByLabel('Signed level')).toBeChecked();

    // Chart settings: rounding Nearest and code prefix PUMP, with the file name hint.
    await page.getByLabel('Fixed-point rounding').selectOption('nearest');
    const prefix = page.getByLabel('Code prefix');
    await prefix.fill('pump');
    await expect(page.getByRole('alert')).toContainText('must match');
    await prefix.fill('PUMP');
    await expect(page.getByRole('alert')).toHaveCount(0);
    await expect(page.getByTestId('code-prefix-files')).toHaveText('Files: pump_core.c, pump_core.h');

    // External function twice(v) = v * 2 with an invalid name tried first.
    await page.getByRole('button', { name: 'ADD FUNCTION' }).click();
    const fnName = page.getByLabel('External function name ext_fn_1');
    await fnName.fill('1bad');
    await expect(page.getByRole('alert')).toContainText('not a valid C identifier');
    await fnName.fill('twice');
    await expect(page.getByRole('alert')).toHaveCount(0);
    await page.getByLabel('Header of twice').fill('twice.h');
    await page.getByLabel('Add parameter to twice').click();
    await page.getByLabel('Parameter 1 name of twice').fill('v');
    await page.getByLabel('Simulation expression of twice').fill('v * 2');
    await expect(page.getByRole('alert')).toHaveCount(0);

    // Use it in the entry action of State_1.
    await canvas.getByText('State_1').click({ force: true });
    const entry = page.locator('[data-help-feature="app-state-entry"]').first();
    await entry.fill('result = twice(21); level = 2.5;');
    await expect(page.getByText('Called in 1 place of the chart')).toBeVisible();

    // Validate: no error, and Generate C/H produces prefixed files.
    await page.getByRole('button', { name: 'Validate', exact: true }).click();
    await expectValidationClean(page);

    // Save: the .adia file carries all three.
    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    const download = await downloadPromise;
    const savedPath = join(mkdtempSync(join(tmpdir(), 'adia-chart-settings-')), 'chart-settings.adia');
    await download.saveAs(savedPath);
    const saved = JSON.parse(readFileSync(savedPath, 'utf8'));
    const level = saved.variables.find((v: { name: string }) => v.name === 'level');
    expect(level).toMatchObject({ type: 'fixdt', fixedPoint: { signed: true, wordLength: 16, fractionLength: 4 } });
    expect(saved.variables.find((v: { name: string }) => v.name === 'result').fixedPoint).toBeUndefined();
    expect(saved.fixedPointRounding).toBe('nearest');
    expect(saved.codePrefix).toBe('PUMP');
    expect(saved.externalFunctions).toEqual([expect.objectContaining({
      name: 'twice', header: 'twice.h', returnType: 'int32', params: [{ name: 'v', type: 'int32' }], simulation: 'v * 2',
    })]);

    // Open the saved project in a fresh app: all three survive.
    const app = await page.context().newPage();
    await page.close();
    await app.goto('/');
    await app.waitForLoadState('domcontentloaded');
    await expect(app.getByRole('button', { name: 'ADD FUNCTION' })).toBeAttached({ timeout: 90_000 });
    await dismissOverlays(app);
    await expect(app.getByLabel('External function name twice')).toHaveCount(0);
    await app.locator('input[type="file"][accept=".adia,.json"]').setInputFiles(savedPath);
    await expect(app.getByLabel('External function name twice')).toBeVisible();
    await app.getByRole('tab', { name: /Main State Machine/ }).click();
    await expect(app.getByLabel('Code prefix')).toHaveValue('PUMP');
    await expect(app.getByLabel('Fixed-point rounding')).toHaveValue('nearest');
    await expect(app.getByLabel('Fraction length level')).toHaveValue('4');
    await expect(app.getByLabel('Simulation expression of twice')).toHaveValue('v * 2');
    await expect(app.getByLabel('Header of twice')).toHaveValue('twice.h');

    // Validate and Generate C/H in the reopened project.
    await app.getByRole('button', { name: 'Validate', exact: true }).click();
    await expectValidationClean(app);
    await app.getByRole('button', { name: 'Generate C/H' }).click();
    const dialog = app.locator('.fixed.inset-0').filter({ hasText: 'pump_core.c' });
    await expect(dialog).toBeVisible({ timeout: 60_000 });
    await expect(dialog).toContainText('pump_core.h');
    await expect(dialog).not.toContainText('sm_core.c');
    await expect(dialog.getByText('Embedded C99 Code Generation')).toBeVisible();
    await expect(dialog.getByText(/Blocking Errors/)).toHaveCount(0);
    await app.keyboard.press('Escape');
    await app.mouse.click(5, 5);

    // Simulate a few steps: the entry action runs, result = 42 and level = 2.5.
    await app.getByRole('button', { name: 'Start' }).click();
    await app.getByRole('button', { name: 'Pause' }).click();
    for (let i = 0; i < 3; i += 1) await app.getByRole('button', { name: 'Step', exact: true }).click();
    const resultRow = app.locator('div.group', { hasText: 'result' }).filter({ has: app.locator('[data-help-feature="app-variable-live"]') }).first();
    await expect(resultRow.locator('[data-help-feature="app-variable-live"]')).toHaveValue('42');
    const levelRow = app.locator('div.group', { hasText: 'level' }).filter({ has: app.locator('[data-help-feature="app-variable-live"]') }).first();
    await expect(levelRow.locator('[data-help-feature="app-variable-live"]')).toHaveValue('2.5');

    // Deleting a function that is called asks first; declining keeps it.
    await app.getByRole('button', { name: 'Reset' }).click();
    app.once('dialog', (d) => { expect(d.message()).toContain("External function 'twice' is called in 1 place"); void d.dismiss(); });
    await app.getByLabel('Delete external function twice').click();
    await expect(app.getByLabel('External function name twice')).toBeVisible();
    app.once('dialog', (d) => { void d.accept(); });
    await app.getByLabel('Delete external function twice').click();
    await expect(app.getByLabel('External function name twice')).toHaveCount(0);

    // The call is now undeclared: Validate reports it.
    await app.getByRole('button', { name: 'Validate', exact: true }).click();
    await expect(app.locator('p.text-red-300').first()).toContainText(/twice/);
  });

  test('the chart settings, fixed-point and external function controls are reachable at phone width', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 800 });
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');
    await dismissOverlays(page);
    await page.getByRole('button', { name: 'Vars', exact: true }).click();
    await expect(page.getByLabel('Fixed-point rounding')).toBeVisible();
    await expect(page.getByLabel('Code prefix')).toBeVisible();
    await expect(page.getByRole('button', { name: 'ADD FUNCTION' })).toBeVisible();
    // "Enter at 1st step" is also in the chart settings, because the header strip lies off-screen on a phone (it scrolls sideways).
    const firstStep = page.getByLabel('Enter chart at first step (chart settings)');
    await firstStep.check();
    await expect(firstStep).toBeChecked();
    await page.locator('[data-help-feature="app-variable-new-type"]').first().selectOption('fixdt');
    await expect(page.getByLabel('Word length new variable')).toBeVisible();
  });
});
