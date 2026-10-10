// Run: node tests/naval-art.cjs (Chrome or Edge, no npm dependencies).
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const { spawn } = require('node:child_process');

const browsers = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
];
const browserPath = browsers.find(file => fs.existsSync(file));
assert(browserPath, 'Chrome or Edge is required');
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'defense-naval-test-'));
const browser = spawn(browserPath, [
  '--headless', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
  '--remote-debugging-port=0', `--user-data-dir=${profile}`, 'about:blank'
], { windowsHide: true, stdio: 'ignore' });
let socket;
const root = path.resolve(__dirname, '..');
const server = http.createServer((req, res) => {
  const file = path.resolve(root, '.' + decodeURIComponent(new URL(req.url, 'http://localhost').pathname));
  if (!file.startsWith(root + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
    res.writeHead(404); res.end(); return;
  }
  const type = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.webp': 'image/webp' }[path.extname(file)];
  res.setHeader('Content-Type', type || 'application/octet-stream');
  fs.createReadStream(file).pipe(res);
});
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const portFile = path.join(profile, 'DevToolsActivePort');
  for (let i = 0; i < 100 && !fs.existsSync(portFile); i++) await delay(100);
  assert(fs.existsSync(portFile), 'Browser did not start');
  const port = fs.readFileSync(portFile, 'utf8').split('\n')[0];
  const pages = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
  socket = new WebSocket(pages.find(page => page.type === 'page').webSocketDebuggerUrl);
  await new Promise(resolve => socket.addEventListener('open', resolve, { once: true }));
  let nextId = 0;
  const pending = new Map(), errors = [];
  socket.addEventListener('message', event => {
    const message = JSON.parse(event.data);
    if (message.method === 'Runtime.exceptionThrown') errors.push(message.params.exceptionDetails.text);
    if (message.id) {
      const request = pending.get(message.id);
      pending.delete(message.id);
      if (message.error) request.reject(new Error(message.error.message));
      else request.resolve(message.result);
    }
  });
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++nextId;
    pending.set(id, { resolve, reject });
    socket.send(JSON.stringify({ id, method, params }));
  });
  const evaluate = async expression => {
    const result = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    assert(!result.exceptionDetails, JSON.stringify(result.exceptionDetails));
    return result.result.value;
  };
  await send('Runtime.enable');
  await send('Page.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });
  await send('Page.navigate', { url: `http://127.0.0.1:${server.address().port}/index.html` });
  await evaluate(`new Promise((resolve, reject) => {
    let tries = 0;
    const poll = setInterval(() => {
      if (window.game) { clearInterval(poll); NavalArt.ready.then(resolve); }
      else if (++tries > 100) { clearInterval(poll); reject(new Error('Game failed to initialize')); }
    }, 50);
  })`);

  const result = await evaluate(`(() => {
    const check = (value, message) => { if (!value) throw new Error(message); };
    check(Object.keys(NavalArt.images).length === 12, 'Not all twelve images loaded');
    const game = window.game;
    document.getElementById('main-menu-overlay').style.display = 'none';
    for (const id of ['VALLEY', 'LAVA', 'PORT']) { game.loadMap(id); game.draw(); }
    game.state = 'PAUSED';
    for (let r = 0; r < game.rows; r++) for (let c = 0; c < game.cols; c++) {
      check((game.grid[r][c] !== 0) || !NavalArt.isWater(game.mapData, c, r), 'Building allowed in water');
      if (game.grid[r][c] === 1) check(NavalArt.isWater(game.mapData, c, r), 'Ship route is on concrete');
    }
    check(game.grid[10][4] === 2 && game.grid[8][4] === 2, 'Port props do not block placement');
    const types = ['LANDING', 'DESTROYER', 'SUBMARINE', 'BOSS'];
    game.enemies = types.map((type, i) => {
      const data = { type, id: type === 'BOSS' ? 'ADMIRAL' : type, hp: 1000, speed: 30, reward: 10,
        radius: type === 'BOSS' ? 32 : 18, isSubmerged: type === 'SUBMARINE' };
      const enemy = new Enemy(data, game.pathPixelPoints);
      enemy.x = [80, 320, 540, 650][i]; enemy.y = [220, 100, 200, 500][i];
      enemy.heading = [0, 0, Math.PI / 2, 0][i];
      enemy.pathIndex = [0, 2, 3, 7][i];
      check(enemy.navalSprite && NavalArt.images[enemy.navalSprite], 'Missing ship mapping');
      enemy.slowTimer = i === 0 ? 2 : 0;
      enemy.poisonTicks = i === 1 ? 3 : 0;
      enemy.freezeTimer = i === 2 ? 2 : 0;
      return enemy;
    });
    const turning = new Enemy({ type: 'DESTROYER', hp: 100, speed: 30, reward: 1 }, [{x: 0,y: 0},{x: 0,y: 100}]);
    turning.update(0.1, game);
    check(turning.heading > 0 && turning.heading < Math.PI / 2, 'Ship did not turn smoothly');
    game.towers = ['COASTAL_GUN','ROCKET_BOAT','SEA_DRONE'].map((type,i) => new Tower(type, 8+i, 6, 40));
    game.towers.forEach(tower => { tower.level = 5; tower.draw(game.ctx, false); });
    const pixels = game.bgCtx.getImageData(0,0,1000,600).data;
    game.navalTime = 2;
    game.draw();
    const original = NavalArt.images.destroyer;
    delete NavalArt.images.destroyer;
    game.enemies[1].draw(game.ctx); game.towers[1].draw(game.ctx, false);
    NavalArt.images.destroyer = original;
    game.draw();
    const after = game.bgCtx.getImageData(0,0,1000,600).data;
    check(pixels.every((p,i) => p === after[i]), 'Drawing mutated the cached harbor');
    return { images: Object.keys(NavalArt.images).length, maps: 3, ships: 4, towers: 3, fallback: true };
  })()`);
  const pausedTime = await evaluate('window.game.navalTime');
  await delay(150);
  assert.equal(await evaluate('window.game.navalTime'), pausedTime, 'Harbor animation advances while paused');
  const screenshot = await send('Page.captureScreenshot', { format: 'png' });
  const screenshotPath = path.join(os.tmpdir(), 'defense-naval-preview.png');
  fs.writeFileSync(screenshotPath, Buffer.from(screenshot.data, 'base64'));
  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await delay(100);
  assert(await evaluate('window.game.canvas.getBoundingClientRect().width <= 390'), 'Canvas does not fit mobile width');
  const mobileScreenshot = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(path.join(os.tmpdir(), 'defense-naval-mobile-preview.png'), Buffer.from(mobileScreenshot.data, 'base64'));
  assert.deepEqual(errors, [], 'Browser runtime errors');
  console.log('PASS', JSON.stringify({ ...result, mobile: true, pause: true }));
  console.log('Preview:', screenshotPath);
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(async () => {
  if (socket) socket.close();
  server.close();
  browser.kill();
  await delay(300);
  // Only the unique test profile created above is removed.
  fs.rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
});
