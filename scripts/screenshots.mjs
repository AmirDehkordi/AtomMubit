#!/usr/bin/env node
// Captures the README screenshots from the running app with the locally installed Chrome.
// Needs desks that already have filings and a few views (use the app first).
//
//   WEB_URL=http://localhost:3101 HERO_DESK=<projectId> COMPARE_DESK=<projectId> READER_FILING="Q2 FY2027" READER_SECTION="Section 8" node scripts/screenshots.mjs
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer-core';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = (name) => join(root, 'docs', 'images', name);
const WEB = process.env.WEB_URL ?? 'http://localhost:3100';
const HERO = process.env.HERO_DESK;
const COMPARE = process.env.COMPARE_DESK ?? HERO;
/** Text of a filing row in the compare desk's sources, e.g. "Q2 FY2027", to photograph in the reader. */
const READER_FILING = process.env.READER_FILING;
const READER_SECTION = process.env.READER_SECTION;
const CHROME =
  process.env.CHROME_PATH ??
  ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/google-chrome'].find(existsSync);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

async function clickText(page, selector, text) {
  const handle = await page.evaluateHandle(
    (sel, t) => [...document.querySelectorAll(sel)].find((el) => el.textContent?.includes(t)),
    selector,
    text,
  );
  const el = handle.asElement();
  if (!el) throw new Error(`No ${selector} containing "${text}"`);
  await el.click();
}

const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ['--hide-scrollbars'] });
try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1600, height: 1000, deviceScaleFactor: 2 });

  // Empty desk.
  await page.goto(WEB, { waitUntil: 'networkidle0' });
  await wait(1500);
  await page.screenshot({ path: out('empty-desk.png') });

  // Hero: the pinned overview.
  await page.goto(`${WEB}/p/${HERO}`, { waitUntil: 'load' }); // the event stream never goes idle
  await wait(5000);
  await clickText(page, 'nav[aria-label="Dashboard tabs"] button', 'overview');
  await wait(5000);
  await page.screenshot({ path: out('hero.png') });

  // A metric over time.
  await clickText(page, 'nav[aria-label="Dashboard tabs"] button', 'margin');
  await wait(5000);
  await page.screenshot({ path: out('metric-detail.png') });

  // The Mubit panel.
  await clickText(page, 'button', 'Mubit');
  await wait(1500);
  await page.screenshot({ path: out('mubit-panel.png') });
  await page.keyboard.press('Escape');
  await wait(800);

  // A comparison across companies (a fresh page, so no state carries over).
  await page.close();
  const second = await browser.newPage();
  await second.setViewport({ width: 1600, height: 1000, deviceScaleFactor: 2 });
  await second.goto(`${WEB}/p/${COMPARE}`, { waitUntil: 'load' });
  await wait(5000);
  // A compare-only desk opens on its comparison; on a mixed desk, pick the compare tab.
  await clickText(second, 'nav[aria-label="Dashboard tabs"] button', ':').catch(() => undefined);
  await wait(3000);
  await second.screenshot({ path: out('compare.png') });

  // The filing reader: a filing the extraction module has read, on READER_SECTION or its section with the most figures.
  if (READER_FILING) {
    await second.click('button[aria-controls="desk-sources"]');
    await wait(800);
    await clickText(second, '#desk-sources li button', READER_FILING);
    await wait(4000);
    await second.evaluate((name) => {
      // Each section button holds its name and its figure count in separate spans.
      const items = [...document.querySelectorAll('nav li button')].map((el) => {
        const [title, detail] = [...el.querySelectorAll('span')].map((s) => s.textContent?.trim() ?? '');
        return { el, title, n: Number(/(\d+) (figure|block)/.exec(detail ?? '')?.[1] ?? 0) };
      });
      const named = name ? items.find((i) => i.title === name) : undefined;
      (named ?? items.sort((a, b) => b.n - a.n)[0])?.el.click();
    }, READER_SECTION);
    await wait(3000);
    await second.screenshot({ path: out('reader.png') });
  }
} finally {
  await browser.close();
}
console.log('Screenshots written to docs/images');
