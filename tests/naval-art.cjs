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
  const type = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.webp': 'image/webp' }[path.extname(file)];
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
      if (window.game) { clearInterval(poll); Promise.all([NavalArt.ready, GameArt.load()]).then(resolve); }
      else if (++tries > 100) { clearInterval(poll); reject(new Error('Game failed to initialize')); }
    }, 50);
  })`);

  const result = await evaluate(`(() => {
    const check = (value, message) => { if (!value) throw new Error(message); };
    check(Object.keys(NavalArt.images).length === 12, 'Not all twelve images loaded');
    check(Object.keys(GameArt.images).length === 3, 'Generated art did not load');
    check(getComputedStyle(document.body).margin === '0px', 'External stylesheet did not load');
    const game = window.game;
    const random = Math.random;
    Math.random = () => 0.25;
    try {
      for (const mapId of ['VALLEY', 'LAVA', 'PORT']) {
        let previous;
        for (const id of ['NORMAL', 'HARD', 'NIGHTMARE']) {
          document.querySelector('[data-mode="' + id + '"]').click();
          check(game.selectedDifficulty === id, 'Menu did not select difficulty');
          game.loadMap(mapId);
          const settings = GAME_DIFFICULTIES[id];
          check(game.energy === settings.startEnergy && game.lives === settings.lives, 'Starting resources ignore difficulty');
          check(document.getElementById('map-difficulty-summary').textContent.includes(settings.name), 'Map summary is stale');
          const first = game.waves[0].queue[0];
          const stats = { hp: first.hp, speed: first.speed, delay: first.delay, count: game.waves[0].queue.length };
          if (previous) {
            check(stats.hp > previous.hp && stats.speed > previous.speed, 'Harder mode has weaker enemies');
            check(stats.delay < previous.delay && stats.count > previous.count, 'Harder mode has no additional pressure');
          }
          previous = stats;
          const bosses = game.waves.flatMap(w => w.queue).filter(e => e.type === 'BOSS').length;
          const originalWaves = mapId === 'PORT' ? generatePortWaveConfig() : generateWaveConfig();
          check(bosses === originalWaves.flatMap(w => w.queue).filter(e => e.type === 'BOSS').length, 'Difficulty duplicated a boss');
          game.loadMap(mapId);
          check(game.waves[0].queue[0].hp === stats.hp, 'Restart compounds difficulty scaling');
          game.currentWaveIndex = settings.airEvery - 1;
          game.startNextWave();
          check(game.spawnQueue.some(e => e.type === 'BOMBER'), 'Air raid frequency ignores difficulty');
          const gold = game.energy, queueSize = game.spawnQueue.length;
          game.handleSkipClick();
          check(game.energy === gold && game.spawnQueue.length === queueSize && game.isWaveInProgress, 'Skip erased the active wave');
          game.state = 'PAUSED';
          const waveIndex = game.currentWaveIndex;
          game.isWaveInProgress = false;
          game.startNextWave();
          check(game.currentWaveIndex === waveIndex, 'Started a wave while paused');
        }
      }
    } finally {
      Math.random = random;
      document.querySelector('[data-mode="NORMAL"]').click();
    }
    game.loadMap('VALLEY');
    const profileCoins = window.playerProfile.coins;
    check(game.getAvailableBuildTypes().includes('POWER_PLANT'), 'Power plant requires a loadout slot');
    const tiles = [];
    for (let r = 0; r < game.rows; r++) for (let c = 0; c < game.cols; c++) {
      if (game.grid[r][c] === 0) tiles.push({ col: c, row: r });
    }
    const startingEnergy = game.energy;
    game.selectBuildCard('POWER_PLANT');
    game.handleCanvasClick(tiles[0].col, tiles[0].row);
    const plant = game.selectedTower;
    check(plant.typeId === 'POWER_PLANT' && game.energy === startingEnergy - 100, 'Plant purchase did not use energy');
    plant.update(10, game);
    check(plant.storedEnergy === 0, 'Plant farms energy between waves');
    game.isWaveInProgress = true;
    plant.update(2.35, game);
    check(Math.abs(plant.storedEnergy - 23.5) < 0.001 && game.energy === startingEnergy - 100, 'Energy was not stored for manual collection');
    game.state = 'PAUSED';
    plant.update(10, game);
    check(Math.abs(plant.storedEnergy - 23.5) < 0.001 && game.collectEnergy(plant) === 0, 'Plant operates while paused');
    game.state = 'PLAYING';
    const beforeCollect = game.energy;
    game.dom.btnCollectEnergy.click();
    check(game.energy === beforeCollect + 23 && Math.abs(plant.storedEnergy - 0.5) < 0.001, 'Collection lost fractional charge');
    check(game.collectEnergy(plant) === 0, 'Collected the same energy twice');
    plant.update(100, game);
    check(plant.storedEnergy === 100, 'Plant exceeded battery capacity');
    game.handleCanvasClick(plant.col, plant.row);
    check(plant.storedEnergy === 0, 'Clicking the plant did not collect energy');
    const beforeUpgrade = game.energy;
    game.dom.btnUpgradeTower.click();
    check(plant.level === 2 && game.energy === beforeUpgrade - 200, 'Plant upgrade did not consume energy');
    plant.update(1, game);
    check(plant.storedEnergy === 18 && plant.getLevelData().capacity === 200, 'Upgrade did not improve production and capacity');
    game.energy = 10000;
    game.updateUI();
    for (let i = 0; i < 3; i++) game.dom.btnUpgradeTower.click();
    check(plant.level === 5 && !plant.canUpgrade() && plant.getLevelData().energyRate === 75, 'Plant cannot reach its final level');
    const maxEnergy = game.energy;
    game.dom.btnUpgradeTower.click();
    check(game.energy === maxEnergy && plant.level === 5, 'Max level charged another upgrade');
    game.selectBuildCard('SCOUT');
    const beforeBuild = game.energy;
    game.handleCanvasClick(tiles[1].col, tiles[1].row);
    check(game.selectedTower.typeId === 'SCOUT' && game.energy === beforeBuild - TOWER_TYPES.SCOUT.levels[0].cost, 'Defense did not consume energy');
    game.selectedTower = plant;
    const beforeSell = game.energy, refund = plant.getSellValue(), charge = Math.floor(plant.storedEnergy);
    game.dom.btnSellTower.click();
    check(game.energy === beforeSell + refund + charge && !game.towers.includes(plant), 'Selling lost stored energy or paid an incorrect refund');
    check(game.collectEnergy(plant) === 0, 'Sold plant still generates spendable energy');
    check(window.playerProfile.coins === profileCoins, 'Battle energy changed menu coins');
    game.loadMap('VALLEY');
    check(game.energy === GAME_DIFFICULTIES.NORMAL.startEnergy && !game.towers.length && !game.spawnQueue.length, 'Restart kept old energy, buildings or queued enemies');
    for (const type of GameArt.towerTypes) new Tower(type, 8, 6, 40).draw(game.ctx, true);
    for (const type of ['NORMAL', 'FAST', 'TANK', 'BOSS', 'MARINE', 'ARMORED', 'ROCKET_S']) {
      const enemy = new Enemy({ type, hp: 100, speed: 30, radius: 18, reward: 1 }, [{x: 0,y: 0},{x: 100,y: 0}]);
      enemy.draw(game.ctx);
    }
    const atlas = GameArt.images.units;
    delete GameArt.images.units;
    new Tower('SCOUT', 8, 6, 40).draw(game.ctx, false);
    GameArt.images.units = atlas;
    document.getElementById('main-menu-overlay').style.display = 'none';
    for (const id of ['VALLEY', 'LAVA', 'PORT']) {
      game.loadMap(id);
      game.startNextWave();
      check(!game.spawnQueue.some(e => e.type === 'BOMBER'), 'Aircraft appeared before wave three');
      game.isWaveInProgress = false;
      game.currentWaveIndex = 2;
      game.startNextWave();
      const data = game.spawnQueue.find(e => e.type === 'BOMBER');
      check(data && data.livesPenalty === 2, 'Wave three has no bomber');
      const bomber = new Enemy(data, game.pathPixelPoints);
      check(bomber.path.length === 2, 'Bomber follows the ground route');
      check(bomber.path[1].x >= 40 && bomber.path[1].x <= 960 && bomber.path[1].y <= 560, 'Bomb target is outside the map');
      bomber.draw(game.ctx);
      const image = GameArt.images.units;
      delete GameArt.images.units;
      bomber.draw(game.ctx);
      GameArt.images.units = image;
      const lives = game.lives;
      for (let i = 0; i < 2000 && !bomber.dead; i++) bomber.update(1 / 60, game);
      check(bomber.reachedEnd && game.lives === lives - 2, 'Bomber did not damage the base');
      bomber.reachExit(game);
      check(game.lives === lives - 2, 'Bomber damaged the base twice');
      const intercepted = new Enemy(data, game.pathPixelPoints);
      const tower = new Tower('SCOUT', 8, 6, 40);
      intercepted.x = tower.x + 10; intercepted.y = tower.y;
      tower.findTarget([intercepted], 150);
      check(tower.target === intercepted, 'Tower cannot target aircraft');
      intercepted.takeDamage(intercepted.maxHp + 1, game, 'EXPLOSIVE');
      intercepted.update(20, game);
      check(intercepted.dead && !intercepted.reachedEnd && game.lives === lives - 2, 'Intercepted bomber damaged the base');
      game.draw();
    }
    game.loadMap('PORT');
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
  await evaluate(`(() => {
    const game = window.game;
    game.loadMap('VALLEY');
    const plant = new Tower('POWER_PLANT', 7, 4, 40);
    plant.upgrade(); plant.upgrade(); plant.storedEnergy = 275;
    game.towers = [plant, new Tower('SCOUT', 7, 3, 40)];
    game.selectedTower = plant;
    game.state = 'PAUSED';
    game.dom.waveAnnouncer.style.display = 'none';
    game.updateUI(); game.draw();
  })()`);
  const energyScreenshot = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(path.join(os.tmpdir(), 'defense-energy-mobile-preview.png'), Buffer.from(energyScreenshot.data, 'base64'));
  assert.deepEqual(errors, [], 'Browser runtime errors');
  console.log('PASS', JSON.stringify({ ...result, difficulties: 3, energy: true, manualCollection: true, upgrades: 5, mobile: true, pause: true }));
  console.log('Preview:', screenshotPath);
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(async () => {
  if (socket) socket.close();
  server.close();
  browser.kill();
  await delay(300);
  // Only the unique test profile created above is removed.
  fs.rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
});
