/**
 * Report navigation: every in-report hyperlink (contents, figure/table lists, requirement links, breadcrumbs,
 * links drawn inside diagrams) can be followed and then undone with Back, the way a browser does, also when the
 * report is shown inside the app's Report Preview (an iframe with srcdoc, where the browser's own Back does not
 * return to the link).
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { chromium, type Browser, type Frame, type Page } from 'playwright';
import { buildSystemReport } from './buildSystemReport';
import { sectionId } from './numbering';
import { richReportInput } from './systemReport.fixture';

const html = buildSystemReport(richReportInput());

describe('report navigation: document', () => {
  it('has a navigation bar with Back, Forward, Contents and Top', () => {
    const nav = /<nav class="report-nav"[^>]*aria-label="Report navigation"[^>]*>([\s\S]*?)<\/nav>/.exec(html);
    expect(nav, 'nav bar').not.toBeNull();
    for (const action of ['back', 'forward', 'contents', 'top']) {
      expect(nav![1]).toMatch(new RegExp(`<button[^>]*data-nav="${action}"`));
    }
    // Nothing to go back to before the first link is followed.
    expect(nav![1]).toMatch(/<button[^>]*data-nav="back"[^>]*disabled/);
    expect(nav![1]).toMatch(/<button[^>]*data-nav="forward"[^>]*disabled/);
  });

  it('gives the Contents heading an anchor', () => {
    expect(html).toMatch(/<h2[^>]*id="contents"[^>]*>Contents<\/h2>/);
  });

  it('keeps the navigation bar off paper', () => {
    expect(html).toMatch(/@media print[^{]*\{[^@]*\.report-nav[^}]*display:\s*none/);
  });

  it('never rewrites the location (srcdoc preview has no URL to change)', () => {
    const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]).join('\n');
    expect(scripts).not.toMatch(/location\.hash\s*=/);
    expect(scripts).not.toMatch(/history\.(pushState|replaceState)/);
  });
});

// ---------------------------------------------------------------------------
// Behaviour in a real browser, inside the app's Report Preview iframe.
// ---------------------------------------------------------------------------

const PREVIEW_SANDBOX = 'allow-scripts allow-same-origin allow-popups allow-modals';
let browser: Browser | undefined;
let page: Page;
let frame: Frame;

const scrollY = () => frame.evaluate(() => Math.round(window.scrollY));
const topOf = (selector: string) => frame.evaluate(s => document.querySelector(s)!.getBoundingClientRect().top, selector);
const navBottom = () => frame.evaluate(() => document.querySelector('.report-nav')!.getBoundingClientRect().bottom);
const isDisabled = (action: string) => frame.evaluate(a => (document.querySelector(`.report-nav [data-nav="${a}"]`) as HTMLButtonElement).disabled, action);
const nav = (action: string) => frame.click(`.report-nav [data-nav="${action}"]`);
const settle = () => page.waitForTimeout(150);

/** Brings a link into view the way a reader would before clicking it; returns that scroll position. */
async function showLink(selector: string): Promise<number> {
  await frame.evaluate(s => document.querySelector(s)!.scrollIntoView({ block: 'center' }), selector);
  await settle();
  return scrollY();
}

/** The target heading is in view and not hidden behind the navigation bar. */
async function expectInView(selector: string) {
  const top = await topOf(selector);
  expect(top, `${selector} top`).toBeGreaterThanOrEqual((await navBottom()) - 2);
  expect(top, `${selector} top`).toBeLessThan(300);
}

beforeAll(async () => {
  browser = await chromium.launch();
  page = await browser.newPage({ viewport: { width: 1100, height: 800 } });
  await page.setContent(`<!DOCTYPE html><html><body style="margin:0"><iframe id="preview" sandbox="${PREVIEW_SANDBOX}" style="width:1000px;height:760px;border:0"></iframe></body></html>`);
  await page.$eval('#preview', (el, doc) => { (el as HTMLIFrameElement).srcdoc = doc; }, html);
  await page.waitForFunction(() => {
    const d = (document.getElementById('preview') as HTMLIFrameElement).contentDocument;
    return !!d && d.readyState === 'complete' && !!d.querySelector('.report-nav');
  });
  frame = (await (await page.$('#preview'))!.contentFrame())!;
}, 60_000);

afterAll(async () => { await browser?.close(); });

describe('report navigation: in the Report Preview', () => {
  it('Back returns to the exact place a contents link was followed from, Forward goes again', async () => {
    expect(await isDisabled('back')).toBe(true);
    const target = `#${sectionId('8')}`;
    const from = await showLink(`.toc a[href="${target}"]`);
    await frame.click(`.toc a[href="${target}"]`);
    await settle();
    await expectInView(target);
    expect(await scrollY()).toBeGreaterThan(from + 500);
    expect(await isDisabled('back')).toBe(false);

    await nav('back');
    await settle();
    expect(Math.abs((await scrollY()) - from)).toBeLessThanOrEqual(2);
    expect(await isDisabled('back')).toBe(true);
    expect(await isDisabled('forward')).toBe(false);

    await nav('forward');
    await settle();
    await expectInView(target);
    expect(await isDisabled('forward')).toBe(true);
  });

  it('keeps the navigation bar on screen wherever the reader is', async () => {
    await frame.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await settle();
    const box = await frame.evaluate(() => {
      const r = document.querySelector('.report-nav')!.getBoundingClientRect();
      return { top: r.top, bottom: r.bottom, h: window.innerHeight };
    });
    expect(box.top).toBeGreaterThanOrEqual(0);
    expect(box.bottom).toBeLessThanOrEqual(box.h);
  });

  it('Back names the place it returns to', async () => {
    await frame.evaluate(() => window.scrollTo(0, 0));
    await frame.click('.report-nav [data-nav="contents"]');
    await settle();
    await expectInView('#contents');
    await frame.click(`.toc a[href="#${sectionId('3')}"]`);
    await settle();
    const title = await frame.getAttribute('.report-nav [data-nav="back"]', 'title');
    expect(title ?? '').toMatch(/Contents/);
  });

  it('follows links drawn inside diagrams and comes back from them', async () => {
    const link = await frame.evaluate(() => {
      const a = [...document.querySelectorAll('svg a')].find(x => (x.getAttribute('href') || x.getAttribute('xlink:href') || '').startsWith('#'));
      if (!a) return null;
      a.scrollIntoView({ block: 'center' });
      return a.getAttribute('href') || a.getAttribute('xlink:href');
    });
    expect(link, 'a diagram with a link').not.toBeNull();
    await settle();
    const from = await scrollY();
    await frame.evaluate(h => {
      const a = [...document.querySelectorAll('svg a')].find(x => (x.getAttribute('href') || x.getAttribute('xlink:href')) === h)!;
      const t = (a.querySelector('rect,text,path') ?? a) as Element;
      t.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
    }, link!);
    await settle();
    await expectInView(link!.replace(/^#(.*)$/, (_m, id) => `[id="${id}"]`));
    await nav('back');
    await settle();
    expect(Math.abs((await scrollY()) - from)).toBeLessThanOrEqual(2);
  });

  it('Alt+Left and Alt+Right work like Back and Forward', async () => {
    const from = await showLink(`.toc a[href="#${sectionId('5')}"]`);
    await frame.click(`.toc a[href="#${sectionId('5')}"]`);
    await settle();
    await page.keyboard.press('Alt+ArrowLeft');
    await settle();
    expect(Math.abs((await scrollY()) - from)).toBeLessThanOrEqual(2);
    await page.keyboard.press('Alt+ArrowRight');
    await settle();
    await expectInView(`#${sectionId('5')}`);
  });

  it('Top goes to the start of the report and can be undone', async () => {
    await frame.evaluate(() => window.scrollTo(0, 1500));
    await settle();
    await nav('top');
    await settle();
    expect(await scrollY()).toBe(0);
    await nav('back');
    await settle();
    expect(Math.abs((await scrollY()) - 1500)).toBeLessThanOrEqual(2);
  });

  it('is not printed', async () => {
    await page.emulateMedia({ media: 'print' });
    const display = await frame.evaluate(() => getComputedStyle(document.querySelector('.report-nav')!).display);
    await page.emulateMedia({ media: 'screen' });
    expect(display).toBe('none');
  });
});
