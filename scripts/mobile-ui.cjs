const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } = require('node:fs');
const { tmpdir } = require('node:os');
const path = require('node:path');
const { setTimeout: delay } = require('node:timers/promises');

// Launch a separate process so Chromium releases its profile before cleanup on Windows.
if (!process.versions.electron) {
  const profile = mkdtempSync(path.join(tmpdir(), 'mise-phone-ui-'));
  try {
    const env = { ...process.env, MISE_UI_PROFILE: profile };
    delete env.ELECTRON_RUN_AS_NODE;
    const child = spawnSync(require('electron'), [__filename, '--headless', '--disable-gpu'], {
      env, cwd: profile, stdio: 'ignore', windowsHide: true, timeout: 60000,
    });
    if (child.error) throw child.error;
    const result = path.join(profile, 'result.txt');
    if (child.status !== 0 || !existsSync(result)) {
      throw new Error(existsSync(result) ? readFileSync(result, 'utf8') : `Electron exited with status ${child.status}`);
    }
    console.log(readFileSync(result, 'utf8'));
  } finally {
    rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 150 });
  }
} else {
  const { app, BrowserWindow } = require('electron');
  app.setPath('userData', process.env.MISE_UI_PROFILE);
  const result = path.join(process.env.MISE_UI_PROFILE, 'result.txt');
  app.disableHardwareAcceleration();
  app.whenReady().then(async () => {
    const window = new BrowserWindow({ show: false, webPreferences: { offscreen: true, backgroundThrottling: false } });
    await run(window.webContents);
    writeFileSync(result, 'Phone UI passed: landscape ingredient taps and portrait method position after navigation and reload.');
    app.exit(0);
  }).catch(error => { writeFileSync(result, error.stack); app.exit(1); });
}

async function until(description, probe) {
  const deadline = Date.now() + 6000;
  do {
    const result = await probe();
    if (result) return result;
    await delay(25);
  } while (Date.now() < deadline);
  throw new Error(`Timed out waiting for ${description}`);
}

async function run(page) {
  await page.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
  page.debugger.attach('1.3');
  const cdp = (method, params) => page.debugger.sendCommand(method, params);
  const read = (fn, ...args) => page.executeJavaScript(`(${fn})(${args.map(arg => JSON.stringify(arg)).join(',')})`);
  async function phone(width, height) {
    await cdp('Emulation.setDeviceMetricsOverride', { width, height, mobile: true, deviceScaleFactor: 1 });
    await cdp('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
  }
  async function tap({ x, y }) {
    await cdp('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
    await cdp('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  }
  async function button(name) {
    const point = await until(`tappable “${name}” button`, () => read(label => {
      const element = [...document.querySelectorAll('button')].find(button =>
        (button.getAttribute('aria-label') ?? button.innerText.trim()) === label && button.offsetHeight);
      if (!element) return null;
      element.scrollIntoView({ block: 'nearest' });
      const rect = element.getBoundingClientRect();
      const x = rect.x + rect.width / 2;
      const y = rect.y + rect.height / 2;
      return element.contains(document.elementFromPoint(x, y)) ? { x, y } : null;
    }, name));
    await tap(point);
  }

  await phone(568, 320);
  await button('Recipe box');
  await button('Add example recipe');
  await button('Add Veggie Stir Fry');
  await until('stir-fry recipe', () => read(() => document.querySelector('h1')?.textContent === 'Veggie Stir Fry'));
  await button('Ingredients');
  const visibleIngredients = () => read(() => {
    const list = document.querySelector('.ingredient-checklist');
    if (!list) return [];
    const viewport = list.getBoundingClientRect();
    return [...list.querySelectorAll('li')].flatMap(row => {
      const box = row.getBoundingClientRect();
      const label = row.querySelector('label');
      const target = label.getBoundingClientRect();
      const x = target.x + target.width / 2;
      const y = target.y + target.height / 2;
      if (box.top < viewport.top - 1 || box.bottom > viewport.bottom + 1 ||
          !label.contains(document.elementFromPoint(x, y))) return [];
      return [{ name: label.innerText.trim(), x, y }];
    });
  });
  await until('ingredient checklist', async () => (await visibleIngredients()).length);
  const [first] = await visibleIngredients();
  assert.equal(first.name, 'Noodles');
  await tap(first);
  const readyCount = () => read(() => document.querySelector('.ingredient-progress span')?.textContent);
  await until('first gathered ingredient', async () => await readyCount() === '1 of 17 ready');
  const rows = await visibleIngredients();
  assert.ok(rows.length >= 2, `Only ${rows.length} whole ingredient rows remain tappable at 568×320`);
  await tap(rows[1]);
  await until('second gathered ingredient', async () => await readyCount() === '2 of 17 ready');

  await phone(390, 844);
  await button('Method');
  const method = () => read(() => {
    const panel = document.querySelector('.method-panel');
    if (!panel) return null;
    const rect = panel.getBoundingClientRect();
    return { top: panel.scrollTop, max: panel.scrollHeight - panel.clientHeight,
      x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
  });
  await until('nine-step method', () => read(() => document.querySelectorAll('.cook-row').length === 9));
  await read(async () => { await document.fonts.ready; });
  const start = await method();
  assert.ok(start.max > 200);
  for (let swipe = 0; swipe < 10 && (await method()).top < start.max - 4; swipe++) {
    await cdp('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: start.x, y: start.y + 80 }] });
    for (let move = 1; move <= 10; move++) {
      await cdp('Input.dispatchTouchEvent', { type: 'touchMove',
        touchPoints: [{ x: start.x, y: start.y + 80 - move * 16 }] });
      await delay(20);
    }
    await cdp('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await delay(100);
  }
  const place = await until('near-bottom reading position after touch scroll', async () => {
    const current = await method();
    return current.top >= current.max - 4 && current;
  });
  async function restored(after) {
    await until(`method scroll position ${place.top}px after ${after}`, async () => {
      const current = await method();
      return current && Math.abs(current.top - place.top) <= 2;
    });
  }
  await button('Ingredients');
  await until('gathered ingredients in portrait', async () => await readyCount() === '2 of 17 ready');
  await button('Method');
  await restored('returning from Ingredients');
  const loaded = new Promise(resolve => page.once('did-finish-load', resolve));
  page.reload();
  await loaded;
  await read(async () => { await document.fonts.ready; });
  await restored('reload');
}
