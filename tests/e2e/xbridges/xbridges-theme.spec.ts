/**
 * V8 end-to-end, spec 8: the X-Bridges workspace in the dark and the light theme renders without console errors and
 * keeps the canvas, the library panel and the properties panel visible. No pixel snapshot: the computed background
 * colours of the three areas must differ between the themes.
 */
import { test, expect, type Locator } from '@playwright/test';
import { useLocalChromium, trackErrors, openXbridges, dropBlock, selectNode } from './xbHelpers';

useLocalChromium();

/** First non-transparent background colour walking up from the element. */
async function effectiveBackground(loc: Locator): Promise<string> {
  return loc.evaluate(el => {
    let cur: Element | null = el;
    while (cur) {
      const bg = getComputedStyle(cur).backgroundColor;
      if (bg && bg !== 'rgba(0, 0, 0, 0)' && bg !== 'transparent') return bg;
      cur = cur.parentElement;
    }
    return 'rgba(0, 0, 0, 0)';
  });
}

test('light and dark theme: no console errors, canvas, library and properties panel visible, backgrounds differ', async ({ page }) => {
  test.setTimeout(120_000);
  const log = trackErrors(page);
  await openXbridges(page);
  const constant = await dropBlock(page, 'Constant', 'SOURCES');
  await selectNode(page, constant);

  const areas = {
    canvas: page.locator('.react-flow'),
    library: page.getByPlaceholder('Search Logic...'),
    properties: page.getByText('Properties', { exact: true }).first(),
    toolbar: page.getByRole('button', { name: 'Run Engine', exact: true }),
  };
  const snapshot = async () => {
    const out: Record<string, string> = {};
    for (const [name, loc] of Object.entries(areas)) {
      await expect(loc, `${name} visible`).toBeVisible();
      out[name] = await effectiveBackground(loc);
    }
    return out;
  };

  const theme = async () => page.evaluate(() => document.documentElement.className + '|' + (document.documentElement.getAttribute('data-theme') ?? ''));
  const before = await snapshot();
  const themeBefore = await theme();

  await page.getByTitle('Switch to Light Mode').click();
  await page.waitForTimeout(1200);
  await selectNode(page, constant);
  const light = await snapshot();
  expect(await theme()).not.toBe(themeBefore);

  for (const area of ['canvas', 'library', 'properties'] as const) {
    expect(light[area], `${area} background changes between themes`).not.toBe(before[area]);
  }

  await page.getByTitle('Switch to Dark Mode').click();
  await page.waitForTimeout(1200);
  await selectNode(page, constant);
  const dark = await snapshot();
  expect(dark).toEqual(before);
  expect(log.errors).toEqual([]);
});
