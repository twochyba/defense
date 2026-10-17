// One atlas and two cached terrain images; existing canvas art handles load failures.
const GameArt = {
  images: {},
  portraitTypes: ['SCOUT', 'GUNNER', 'SNIPER', 'ENGINEER', 'MEDIC', 'FLAMETHROWER',
    'ROCKETEER', 'DRONE_OPERATOR', 'TANKER', 'GENERAL', 'FALCON', 'FACTORY', 'MILITARY_BASE', 'POWER_PLANT'],

  portrait(type, fallback) {
    return this.portraitTypes.includes(type)
      ? `<img class="unit-art" src="assets/images/ui/${type.toLowerCase()}.webp" alt="" width="384" height="384" decoding="async" loading="lazy">`
      : fallback;
  },
  towerTypes: ['SCOUT', 'GUNNER', 'SNIPER', 'ENGINEER', 'MEDIC',
    'FLAMETHROWER', 'ROCKETEER', 'DRONE_OPERATOR', 'TANKER', 'GENERAL',
    'ARCHER', 'CANNON', 'MAGE', 'TESLA', 'POISON',
    'COASTAL_GUN', 'ROCKET_BOAT', 'SEA_DRONE', 'FALCON', 'FACTORY', 'MILITARY_BASE'],

  load() {
    if (this.ready) return this.ready;
    this.ready = Promise.all(['units', 'valley', 'lava', 'road', 'pine', 'rock'].map(name => new Promise(resolve => {
      const image = new Image();
      image.onload = () => { this.images[name] = image; resolve(true); };
      image.onerror = () => resolve(false);
      const file = ['valley', 'lava'].includes(name) ? `${name}-v2` : name;
      image.src = `assets/images/battlefield/${file}.webp`;
    })));
    return this.ready;
  },

  sprite(ctx, index, x, y, size, angle = 0) {
    const image = this.images.units;
    if (!image || index < 0) return false;
    const w = image.width / 5, h = image.height / 5;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);
    const height = size * h / w;
    ctx.drawImage(image, (index % 5) * w, Math.floor(index / 5) * h, w, h,
      -size / 2, -height / 2, size, height);
    ctx.restore();
    return true;
  },

  tower(ctx, tower) {
    if (tower.typeId === 'POWER_PLANT') {
      const data = tower.getLevelData();
      const charge = Math.floor(tower.storedEnergy);
      ctx.save();
      ctx.fillStyle = '#0f172a';
      ctx.fillRect(-15, -14, 30, 28);
      ctx.strokeStyle = data.color;
      ctx.lineWidth = 2;
      ctx.strokeRect(-15, -14, 30, 28);
      for (let i = 0; i < tower.level; i++) {
        ctx.fillStyle = data.color;
        ctx.fillRect(-12 + i * 5, 8, 3, 3);
      }
      ctx.fillStyle = '#334155';
      ctx.fillRect(-11, -10, 8, 14);
      ctx.fillRect(5, -10, 6, 14);
      ctx.shadowColor = data.color;
      ctx.shadowBlur = charge > 0 ? 8 : 0;
      ctx.fillStyle = data.color;
      ctx.beginPath();
      ctx.arc(0, -2, 7, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.fillStyle = '#0f172a';
      ctx.beginPath();
      ctx.moveTo(1, -8); ctx.lineTo(-4, -1); ctx.lineTo(0, -1);
      ctx.lineTo(-1, 5); ctx.lineTo(5, -3); ctx.lineTo(1, -3);
      ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#0f172a';
      ctx.fillRect(-17, 18, 34, 4);
      ctx.fillStyle = tower.storedEnergy >= data.capacity ? '#4ade80' : data.color;
      ctx.fillRect(-17, 18, 34 * tower.storedEnergy / data.capacity, 4);
      if (charge > 0) {
        ctx.font = 'bold 11px sans-serif';
        ctx.textAlign = 'center';
        ctx.lineWidth = 3;
        const label = `⚡${charge}`;
        ctx.strokeStyle = '#0f172a';
        ctx.strokeText(label, 0, -23);
        ctx.fillText(label, 0, -23);
      }
      ctx.restore();
      return true;
    }
    return this.sprite(ctx, this.towerTypes.indexOf(tower.typeId), 0, 0,
      38 + tower.level * 1.5, tower.angle || 0);
  },

  enemy(ctx, enemy) {
    if (enemy.type === 'BOMBER') {
      const target = enemy.path[enemy.path.length - 1];
      ctx.save();
      ctx.strokeStyle = '#ef4444';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(target.x, target.y, 18 + Math.sin(enemy.animTimer * 5) * 3, 0, Math.PI * 2);
      ctx.moveTo(target.x - 26, target.y); ctx.lineTo(target.x + 26, target.y);
      ctx.moveTo(target.x, target.y - 26); ctx.lineTo(target.x, target.y + 26);
      ctx.stroke();
      ctx.fillStyle = '#fca5a5';
      ctx.font = 'bold 11px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('✈ −2 ♥', target.x, target.y - 30);
      const drawn = this.sprite(ctx, 18, enemy.x, enemy.y, 64, enemy.heading);
      if (!drawn) {
        ctx.translate(enemy.x, enemy.y);
        ctx.rotate(enemy.heading);
        ctx.fillStyle = '#ef4444';
        ctx.beginPath();
        ctx.moveTo(25, 0); ctx.lineTo(-18, -18); ctx.lineTo(-10, 0); ctx.lineTo(-18, 18);
        ctx.closePath(); ctx.fill();
      }
      ctx.restore();
      return true;
    }
    const index = enemy.isBoss ? 24 :
      ({ NORMAL: 21, FAST: 22, TANK: 23, MARINE: 21, ARMORED: 23, ROCKET_S: 21 })[enemy.type];
    if (index === undefined) return false;
    return this.sprite(ctx, index, enemy.x, enemy.y, enemy.radius * 3,
      enemy.heading || 0);
  },

  background(ctx, id, width, height) {
    const image = this.images[id.toLowerCase()];
    if (image) ctx.drawImage(image, 0, 0, image.width, image.height, 0, 0, width, height);
  },

  landscape(ctx, map) {
    if (map.isNavalMap || !this.images[map.id.toLowerCase()]) return false;
    ctx.save();
    this.background(ctx, map.id, 1000, 600);
    const points = map.pathPoints.map(p => ({ x: (p.x + 0.5) * 40, y: (p.y + 0.5) * 40 }));
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.beginPath();
    points.forEach((p, i) => i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y));
    ctx.strokeStyle = map.id === 'LAVA' ? '#100e17' : '#273526';
    ctx.lineWidth = 41;
    ctx.shadowBlur = 9;
    ctx.shadowColor = 'rgba(0,0,0,.6)';
    ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = map.id === 'LAVA' ? '#77605a' : '#a79b78';
    ctx.lineWidth = 34;
    ctx.stroke();
    ctx.strokeStyle = this.images.road ? ctx.createPattern(this.images.road, 'repeat') : '#746d54';
    ctx.lineWidth = 29;
    ctx.stroke();
    if (map.id === 'LAVA') {
      ctx.globalAlpha = 0.16;
      ctx.strokeStyle = '#fb923c';
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
    // Decor positions match the blocked building cells exactly.
    for (const prop of map.decorations || []) {
      const x = (prop.x + 0.5) * 40, y = (prop.y + 0.5) * 40;
      const image = this.images[prop.type === 'tree' ? 'pine' : 'rock'];
      if (image) ctx.drawImage(image, x - 22, y - 23, 44, 44);
      if (prop.type === 'crystal' || prop.type === 'lavaVent') {
        ctx.fillStyle = prop.type === 'crystal' ? '#fdba74' : '#fb5a24';
        ctx.shadowColor = '#f97316'; ctx.shadowBlur = 10;
        ctx.beginPath(); ctx.moveTo(x - 9, y + 7); ctx.lineTo(x - 3, y - 10);
        ctx.lineTo(x + 4, y - 5); ctx.lineTo(x + 10, y + 8); ctx.closePath(); ctx.fill();
        ctx.shadowBlur = 0;
      }
    }
    const end = points[points.length - 1];
    const x = Math.max(22, Math.min(978, end.x)), y = Math.max(22, Math.min(578, end.y));
    ctx.fillStyle = '#172733'; ctx.strokeStyle = '#7dd3fc'; ctx.lineWidth = 2;
    ctx.fillRect(x - 19, y - 19, 38, 38); ctx.strokeRect(x - 19, y - 19, 38, 38);
    ctx.fillStyle = '#7dd3fc'; ctx.font = 'bold 10px sans-serif'; ctx.textAlign = 'center';
    ctx.fillText('БАЗА', x, y + 4);
    ctx.restore();
    return true;
  }
};
