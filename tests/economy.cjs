// Run: node tests/economy.cjs [--file] (Chrome or Edge, no npm dependencies).
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
  const url = process.argv.includes('--file')
    ? require('node:url').pathToFileURL(path.join(root, 'index.html')).href
    : `http://127.0.0.1:${server.address().port}/index.html`;
  await send('Page.navigate', { url });
  await evaluate(`new Promise((resolve, reject) => {
    let tries = 0;
    const poll = setInterval(() => {
      if (window.game) { clearInterval(poll); Promise.all([NavalArt.ready, GameArt.load()]).then(resolve); }
      else if (++tries > 100) { clearInterval(poll); reject(new Error('Game failed to initialize')); }
    }, 50);
  })`);

  const result = await evaluate(`(() => {
    const check = (value, message) => { if (!value) throw new Error(message); };
    const game = window.game;
    localStorage.removeItem('tds-completed-maps'); refreshMapLocks();
    game.loadMap('PORT'); check(game.mapData === null, 'Locked map loaded');
    game.loadMap('VALLEY'); check(game.energy === 100, 'Starting coins');
    check(unitCategory('ARCHER') === 'weak' && unitCategory('CANNON') === 'strong', 'DPS categories');
    check(unitCategory('ARCHER', {damage: 15.5, attackSpeed: 1}) === 'strong', 'Fractional DPS boundary');
    const free = () => { for (let r=0;r<15;r++) for(let c=0;c<25;c++) if(game.grid[r][c]===0) return [c,r]; };
    const build = type => { game.selectedBuildType=type; game.handleCanvasClick(...free()); return game.selectedTower; };
    game.energy=0; build('ARCHER'); check(game.towers.length===0, 'Purchase without money');
    game.energy=10000;
    for(let i=0;i<6;i++) build('ARCHER');
    build('ARCHER'); check(game.counts().weak===6, 'Weak limit');
    game.shopTab='weak'; game.refreshShop();
    const archerCard=document.querySelector('[data-type="ARCHER"]');
    check(archerCard.disabled && archerCard.textContent.includes('6/6'), 'Limit button');
    for(let i=0;i<4;i++) build('CANNON');
    build('CANNON'); check(game.counts().strong===4, 'Strong limit');
    const archer=game.towers.find(t=>t.typeId==='ARCHER');
    check(!game.canUpgradeTower(archer), 'Upgrade exceeds strong limit');
    const cannon=game.towers.find(t=>t.typeId==='CANNON');
    game.selectedTower=cannon; const money=game.energy; game.dom.btnSellTower.click();
    check(game.energy-money===132 && game.counts().strong===3, 'Sale refund or slot');
    check(game.canUpgradeTower(archer), 'Upgrade slot did not reopen');
    game.selectedTower=archer; game.dom.btnUpgradeTower.click();
    check(game.counts().weak===5 && game.counts().strong===4, 'Upgrade category transfer');
    const farm=build('FARM'); check(farm.investedEnergy===60, 'Farm price');
    check(game.buildCost('FARM')===72, 'Farm price growth');
    const before=game.energy; farm.update(3,game); check(game.energy===before+5, 'Passive income');
    game.state='PAUSED'; const paused=game.energy; game.update(3); check(game.energy===paused, 'Pause income'); game.state='PLAYING';
    for(let i=1;i<6;i++) build('FARM'); build('FARM'); check(game.counts().farm===6, 'Independent farm limit');
    game.energy=0; game.shopTab='weak'; game.refreshShop();
    check(document.querySelector('[data-type="WATCHER"]').textContent.includes('бракує 100'), 'Missing coins label');
    game.energy=10000;
    const watcher=build('WATCHER');
    const enemy=new Enemy({type:'NORMAL',hp:100,speed:0,reward:10,isStealth:true}, game.pathPixelPoints);
    enemy.x=watcher.x; enemy.y=watcher.y;
    check(game.canSee(enemy), 'Detector coverage');
    const ally=new Tower('ARCHER',watcher.col,watcher.row,40);
    ally.findTarget([enemy],200); check(ally.target===enemy, 'Allies cannot target revealed enemy');
    enemy.x=watcher.x+CONFIG.detectorRange+1;
    check(!game.canSee(enemy), 'Detection outside radius'); enemy.x=watcher.x;
    game.towers=game.towers.filter(t=>t!==watcher);
    check(!game.canSee(enemy), 'No detector');
    ally.findTarget([enemy],200); check(ally.target===null, 'Undetected enemy selected');
    const hp=enemy.hp; enemy.takeDamage(20,game); check(enemy.hp===hp, 'Undetected enemy damaged');
    game.enemies=[enemy]; enemy.x=farm.x; enemy.y=farm.y;
    farm.hp=0.1; game.update(0.1); check(!game.towers.includes(farm) && game.grid[farm.row][farm.col]===0, 'Destroyed farm slot');
    game.enemies=[]; game.spawnQueue=[]; game.currentWaveIndex=game.waves.length; game.isWaveInProgress=false; game.checkGameEnd();
    check(mapUnlocked('LAVA') && !mapUnlocked('PORT'), 'Map progression');
    game.loadMap('LAVA'); game.currentWaveIndex=game.waves.length; game.checkGameEnd(); check(mapUnlocked('PORT'), 'Port unlock');
    game.loadMap('PORT'); check(!document.getElementById('stealth-hint').hidden && game.getAvailableBuildTypes().includes('WATCHER'), 'Port detector access');
    check(game.waves.some(w=>w.queue.some(e=>e.isStealth)), 'No invisible waves');
    game.dom.btnSpeed.click(); check(game.gameSpeed===2,'x2'); game.dom.btnSpeed.click(); check(game.gameSpeed===1,'x1');
    for(const id of CONFIG.mapOrder) { game.loadMap(id); game.draw(); }
    game.dom.btnVictoryRestart.click(); check(game.currentWaveIndex===0 && game.energy===100,'Replay');
    game.state='PAUSED';
    document.getElementById('main-menu-overlay').style.display='none';
    return {limits:true,economy:true,farms:true,stealth:true,progression:true};
  })()`);
  for (const width of [390, 1440]) {
    await send('Emulation.setDeviceMetricsOverride', { width, height: 1000, deviceScaleFactor:1, mobile:width<500 });
    assert(await evaluate('document.documentElement.scrollWidth <= innerWidth'), 'Horizontal page overflow');
    const shot=await send('Page.captureScreenshot',{format:'png'});
    fs.writeFileSync(path.join(os.tmpdir(),'defense-economy-'+width+'.png'),Buffer.from(shot.data,'base64'));
  }
  assert.deepEqual(errors, [], 'Browser runtime errors');
  console.log('PASS', result);

})().catch(error => { console.error(error); process.exitCode = 1; }).finally(async () => {
  if (socket) socket.close();
  server.close();
  browser.kill();
  await delay(300);
  // Only the unique test profile created above is removed.
  fs.rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
});
