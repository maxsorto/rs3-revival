// Headless WebKit (Safari engine) check of the audio path with iPhone emulation. node scripts/webkit-audio-test.mjs [url]
import { webkit, devices } from 'playwright';
const url = process.argv[2] ?? 'http://localhost:4790/?track=0&car=0';
const browser = await webkit.launch();
const ctx = await browser.newContext({ ...devices['iPhone 13'] });
const page = await ctx.newPage();
page.on('console', m => { if (m.type() === 'error' || /audio|Audio/.test(m.text())) console.log('[console]', m.type(), m.text()); });
page.on('pageerror', e => console.log('[pageerror]', e.message));
await page.goto(url, { waitUntil: 'load' });
await page.waitForFunction(() => { const g = document.querySelector('#rs3-ld-go'); return g && g.style.display === 'block'; }, null, { timeout: 120000 });
console.log('loaded; tapping');
await page.tap('body');
await page.waitForTimeout(3000);
console.log('audio', JSON.stringify(await page.evaluate(() => window.rs3.audio.debug())));
// hold gas 2s via the touch pad
const gas = page.locator('div', { hasText: /^GAS$/ }).first();
await gas.dispatchEvent('pointerdown', { pointerId: 3, bubbles: true });
await page.waitForTimeout(2000);
console.log('after gas', JSON.stringify(await page.evaluate(() => ({ kmh: Math.round(window.rs3.car.speedNorm() * 3.6), audio: window.rs3.audio.debug() }))));
await browser.close();
