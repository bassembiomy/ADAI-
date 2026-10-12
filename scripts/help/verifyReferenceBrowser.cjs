const { chromium } = require('@playwright/test');
const fs = require('node:fs');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  const results = [];
  const assert = (condition, message) => { if (!condition) throw new Error(message); };
  try {
    await page.goto('http://localhost:3000', { waitUntil: 'domcontentloaded' });
    const welcome = page.locator('[data-testid="welcome-overlay"]');
    if (await welcome.isVisible()) await welcome.click({ position: { x: 10, y: 10 }, force: true });
    await page.keyboard.press('F1');
    const dialog = page.getByRole('dialog', { name: 'ADIA Help' });
    await dialog.waitFor({ state: 'visible' });
    const search = dialog.getByRole('searchbox', { name: 'Search Help' });
    await dialog.getByRole('button', { name: 'Element reference', exact: true }).click();
    await dialog.getByRole('button', { name: 'SysML: Block', exact: true }).click();
    await dialog.getByRole('heading', { name: 'SysML: Block', exact: true }).waitFor();
    assert(await dialog.locator('#help-section-properties tbody tr').count() > 0, 'Block inspector properties missing');
    assert(await dialog.locator('#help-section-example svg').count() === 1, 'Block example diagram missing');
    await page.screenshot({ path: 'docs/help/audit/help-element-reference-dark.png' });
    results.push('Element catalog, live inspector properties and example diagram');
    await search.fill('Fork');
    await dialog.getByRole('button', { name: /^Fork Splits/ }).click();
    assert((await dialog.locator('main').innerText()).includes('concurrent'), 'Individual Fork reference missing');
    results.push('Behavior element full-text search');
    await dialog.getByRole('button', { name: 'Documentation', exact: true }).click();
    await search.fill('');
    const topicIndex = dialog.getByRole('complementary', { name: 'Help topics' });
    assert(await topicIndex.getByRole('button').count() < 100, 'Guide index overwhelmed by generated controls');
    await topicIndex.getByRole('button', { name: 'Diagram reference', exact: true }).click();
    assert(await dialog.locator('#help-section-choose tbody tr').count() === 13, 'Diagram family index incomplete');
    await page.screenshot({ path: 'docs/help/audit/help-diagram-reference-dark.png' });
    await dialog.getByRole('button', { name: 'Internal Block Diagram (IBD)', exact: true }).last().click();
    assert(await dialog.locator('#help-section-symbols tbody tr').count() > 0, 'IBD symbols missing');
    await dialog.getByRole('navigation', { name: 'On this page' }).getByRole('button', { name: 'Reference example' }).click();
    assert(await dialog.locator('#help-section-reference-example svg').count() === 1, 'IBD diagram missing');
    await page.screenshot({ path: 'docs/help/audit/help-ibd-reference-dark.png' });
    results.push('Compact guides, 13-family diagram index, IBD reference and section jump');
    await dialog.getByRole('button', { name: 'Block reference', exact: true }).click();
    await search.fill('resistor');
    await dialog.getByRole('button', { name: /^Resistor V-Lab/ }).click();
    await dialog.getByRole('navigation', { name: 'On this page' }).getByRole('button', { name: 'Parameters', exact: true }).click();
    assert((await dialog.locator('main').innerText()).includes('voltage'), 'Physical parameter explanation missing');
    await page.screenshot({ path: 'docs/help/audit/help-physical-reference-dark.png' });
    results.push('Qualified physical block, parameter meanings and block page contents');
    for (const theme of ['dark', 'light']) {
      await page.evaluate(theme => {
        document.documentElement.dataset.theme = theme;
        document.documentElement.classList.remove('light', 'dark');
        document.documentElement.classList.add(theme);
      }, theme);
      const colors = await dialog.evaluate(element => {
        const style = getComputedStyle(element);
        const root = getComputedStyle(document.documentElement);
        return { background: style.backgroundColor, expected: root.getPropertyValue('--surface-canvas').trim(), text: style.color, border: style.borderTopColor };
      });
      const canvasColor = await page.evaluate(() => {
        const sample = document.createElement('div'); sample.style.backgroundColor = 'var(--surface-canvas)';
        document.body.append(sample); const value = getComputedStyle(sample).backgroundColor; sample.remove(); return value;
      });
      assert(colors.background === canvasColor, `${theme}: Help surface does not follow app theme`);
      assert(colors.border !== 'rgba(0, 0, 0, 0)', `${theme}: reference border is invisible`);
      await dialog.getByRole('button', { name: 'Documentation', exact: true }).click();
      await search.fill('');
      await dialog.getByRole('complementary', { name: 'Help topics' }).getByRole('button', { name: 'Software Architecture Explorer', exact: true }).click();
      await dialog.getByRole('button', { name: 'Open Architecture Explorer' }).click();
      const explorer = dialog.locator('main > div');
      assert(await explorer.evaluate(element => getComputedStyle(element).backgroundColor) === canvasColor, `${theme}: explorer surface differs from app theme`);
      await page.screenshot({ path: `docs/help/audit/help-architecture-reference-${theme}.png` });
      await dialog.getByRole('button', { name: 'Close explorer' }).click();
      results.push(`${theme} theme: Help and Architecture Explorer follow app surfaces`);
    }
    await page.setViewportSize({ width: 390, height: 844 });
    await search.fill('');
    await dialog.getByRole('button', { name: 'Element reference', exact: true }).click();
    await dialog.getByRole('button', { name: 'SysML: Block', exact: true }).click();
    assert(await dialog.evaluate(element => element.scrollWidth <= element.clientWidth), 'Mobile dialog overflows horizontally');
    await page.screenshot({ path: 'docs/help/audit/help-element-reference-mobile-light.png' });
    await page.keyboard.press('Escape');
    await dialog.waitFor({ state: 'hidden' });
    results.push('Mobile element reference, contained tables and Escape');
    assert(errors.length === 0, errors.join('\n'));
    fs.writeFileSync('docs/help/audit/2026-10-08-reference-browser-verification.json', JSON.stringify({ results, pageErrors: errors }, null, 2));
    console.log(JSON.stringify({ passed: results.length, pageErrors: errors }));
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
