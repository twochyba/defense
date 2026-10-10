// Generated sprites are loaded once; the harbor itself is rendered into the game's background cache.
const NavalArt = {
  images: {},
  ready: null,
  reducedMotion: window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  shipTypes: { LANDING: 'landing', SUBMARINE: 'submarine', DESTROYER: 'destroyer', ADMIRAL: 'carrier' },

  load() {
    if (this.ready) return this.ready;
    const names = ['landing', 'destroyer', 'submarine', 'carrier', 'container', 'warehouse', 'tank', 'radar', 'lighthouse', 'crane', 'water', 'concrete'];
    this.ready = Promise.all(names.map(name => new Promise(resolve => {
      const image = new Image();
      image.onload = () => { this.images[name] = image; resolve(true); };
      image.onerror = () => resolve(false);
      image.src = `assets/images/naval/${name}.webp`;
    })));
    return this.ready;
  },

  sprite(ctx, name, x, y, width, maxHeight = width) {
    const image = this.images[name];
    if (!image) return false;
    const scale = Math.min(width / image.width, maxHeight / image.height);
    const w = image.width * scale, h = image.height * scale;
    ctx.drawImage(image, x - w / 2, y - h / 2, w, h);
    return true;
  },

  ship(ctx, name, x, y, radius, angle, time, submerged, moving) {
    if (!this.images[name]) return false;
    const length = radius * 3;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);
    const motion = this.reducedMotion ? 0 : Math.sin(time * 3);
    if (moving) {
      ctx.strokeStyle = submerged ? 'rgba(56,189,248,0.16)' : 'rgba(186,230,253,0.45)';
      ctx.lineWidth = 1.2;
      for (let side of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(-length * 0.35, side * radius * 0.22);
        ctx.quadraticCurveTo(-length * 0.65, side * (radius * 0.45 + motion), -length * 0.9, side * radius * 0.65);
        ctx.stroke();
      }
    }
    ctx.globalAlpha = submerged ? 0.48 : 1;
    this.sprite(ctx, name, 0, motion * 0.5, length, radius * 1.5);
    ctx.restore();
    return true;
  },

  isWater(map, col, row) {
    if (col < 4 || col >= map.cols || row < 0 || row >= map.rows) return true;
    return map.pathPoints.some((p, index) => {
      const q = map.pathPoints[index + 1];
      return q && col >= Math.floor(Math.min(p.x, q.x)) && col <= Math.ceil(Math.max(p.x, q.x))
        && row >= Math.floor(Math.min(p.y, q.y)) && row <= Math.ceil(Math.max(p.y, q.y));
    });
  },

  background(ctx, map) {
    const tile = 40;
    ctx.save();
    const water = this.images.water ? ctx.createPattern(this.images.water, 'repeat') : '#0c3448';
    const concrete = this.images.concrete ? ctx.createPattern(this.images.concrete, 'repeat') : '#475569';
    ctx.fillStyle = water;
    ctx.fillRect(0, 0, map.cols * tile, map.rows * tile);
    ctx.fillStyle = 'rgba(3,15,28,0.28)';
    ctx.fillRect(0, 0, map.cols * tile, map.rows * tile);

    for (let row = 0; row < map.rows; row++) {
      for (let col = 4; col < map.cols; col++) {
        if (this.isWater(map, col, row)) continue;
        const x = col * tile, y = row * tile;
        ctx.fillStyle = concrete;
        ctx.fillRect(x, y, tile, tile);
        ctx.strokeStyle = 'rgba(15,23,42,0.22)';
        ctx.lineWidth = 0.6;
        ctx.strokeRect(x, y, tile, tile);
        const edges = [
          [col - 1, row, x, y, x, y + tile], [col + 1, row, x + tile, y, x + tile, y + tile],
          [col, row - 1, x, y, x + tile, y], [col, row + 1, x, y + tile, x + tile, y + tile]
        ];
        for (const [c, r, x1, y1, x2, y2] of edges) {
          if (!this.isWater(map, c, r)) continue;
          ctx.strokeStyle = '#162330';
          ctx.lineWidth = 5;
          ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
          ctx.strokeStyle = '#c7a64c';
          ctx.lineWidth = 2;
          ctx.setLineDash([5, 5]);
          ctx.stroke();
          ctx.setLineDash([]);
        }
      }
    }

    // The navigation line remains visible below moving units.
    ctx.strokeStyle = 'rgba(125,211,252,0.25)';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([4, 16]);
    ctx.beginPath();
    map.pathPoints.forEach((p, i) => {
      const x = (p.x + 0.5) * tile, y = (p.y + 0.5) * tile;
      if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y);
    });
    ctx.stroke(); ctx.setLineDash([]);

    for (const d of map.decorations) {
      const x = (d.x + 0.5) * tile, y = (d.y + 0.5) * tile;
      if (d.type === 'warship') {
        this.ship(ctx, 'destroyer', x, y, 29, 0, 0, false, false);
      } else if (d.type === 'portTree') {
        ctx.fillStyle = '#185c4e';
        ctx.beginPath(); ctx.arc(x, y, 12, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#287e62';
        ctx.beginPath(); ctx.arc(x - 3, y - 3, 7, 0, Math.PI * 2); ctx.fill();
      } else if (d.type === 'buoy') {
        ctx.fillStyle = '#dc483d';
        ctx.beginPath(); ctx.arc(x, y, 5, 0, Math.PI * 2); ctx.fill();
      } else {
        ctx.fillStyle = 'rgba(3,7,18,0.35)';
        ctx.fillRect(x - 17, y - 14, 36, 32);
        if (!this.sprite(ctx, d.type, x, y, 36, 36)) {
          ctx.fillStyle = d.type === 'container' ? '#a95b37' : '#718096';
          ctx.fillRect(x - 14, y - 12, 28, 24);
        }
      }
    }
    ctx.restore();
  },

  harborLights(ctx, map, time) {
    const pulse = this.reducedMotion ? 0.65 : 0.55 + Math.sin(time * 2.5) * 0.3;
    ctx.save();
    for (const d of map.decorations) {
      const x = (d.x + 0.5) * 40, y = (d.y + 0.5) * 40;
      if (d.type === 'buoy' || d.type === 'lighthouse') {
        ctx.fillStyle = `rgba(251,191,36,${pulse * 0.2})`;
        ctx.beginPath(); ctx.arc(x, y, 10, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = `rgba(254,240,138,${pulse})`;
        ctx.beginPath(); ctx.arc(x, y, 2, 0, Math.PI * 2); ctx.fill();
      } else if (d.type === 'radar') {
        const angle = this.reducedMotion ? -0.5 : time * 0.8;
        ctx.strokeStyle = 'rgba(103,232,249,0.55)';
        ctx.lineWidth = 1.3;
        ctx.beginPath(); ctx.moveTo(x, y);
        ctx.lineTo(x + Math.cos(angle) * 11, y + Math.sin(angle) * 11); ctx.stroke();
      }
    }
    ctx.restore();
  }
};
