// VIDEOTHEK LENZ · Qualitätsstufen und Automatik (rein, ohne three).
const LEVELS = ['low', 'mid', 'high'];

// Dichten der Außenwelt (additiv, Handy und XR nehmen die Handy-Werte): Passanten, Autos, Requisiten, Vögel, Regenlinien, Nebel.
const CITY = {
  low: { npcMax: [8, 5], carsMax: [2, 2], propsMax: [16, 10], birds: [0, 0], rainLines: [0, 0], fogNear: 34, fogFar: 56 },
  mid: { npcMax: [16, 10], carsMax: [4, 3], propsMax: [28, 16], birds: [4, 4], rainLines: [380, 200], fogNear: 36, fogFar: 58 },
  high: { npcMax: [24, 14], carsMax: [6, 4], propsMax: [40, 24], birds: [8, 8], rainLines: [520, 260], fogNear: 38, fogFar: 58 },
};
function city(lv, phone) {
  const c = CITY[lv];
  const k = phone ? 1 : 0;
  return { npcMax: c.npcMax[k], carsMax: c.carsMax[k], propsMax: c.propsMax[k], birds: c.birds[k], rainLines: c.rainLines[k], fogNear: c.fogNear, fogFar: c.fogFar };
}

/** Einstellungen je Stufe. Atlas-Auflösung = Kantenlänge der Cover-Atlanten; maxAtlases = Texturbudget (LRU). */
export function presetFor(level, phone = false) {
  const lv = LEVELS.includes(level) ? level : 'mid';
  if (lv === 'low') {
    return { level: lv, pixelRatio: phone ? 1 : 0.9, shadows: false, anisotropy: 1, atlas: 512, maxAtlases: phone ? 24 : 32, loadRadius: phone ? 9 : 11, signMips: false, ...city(lv, phone) };
  }
  if (lv === 'mid') {
    return { level: lv, pixelRatio: 1.25, shadows: false, anisotropy: 4, atlas: 1024, maxAtlases: phone ? 14 : 40, loadRadius: phone ? 13 : 17, signMips: true, ...city(lv, phone) };
  }
  return { level: lv, pixelRatio: 1.75, shadows: !phone, anisotropy: 8, atlas: 1024, maxAtlases: phone ? 16 : 56, loadRadius: phone ? 20 : 28, signMips: true, ...city(lv, phone) };
}

/**
 * Qualitätsautomatik: FPS-Fenster über 2 s. < 50 fps → eine Stufe runter; >= 56 fps in 5 Fenstern
 * hintereinander (10 s) → eine Stufe hoch. Hysterese: nach einem Absenken 10 s Sperre fürs Hochschalten;
 * fällt es kurz nach einem Hochschalten wieder, wird die höhere Stufe gesperrt (ceiling).
 * `sample(dtSekunden, jetztMs)` gibt bei Wechsel die neue Stufe zurück, sonst null.
 */
export class AutoQuality {
  constructor(level = 'mid') {
    this.level = LEVELS.includes(level) ? level : 'mid';
    this.ceiling = LEVELS.length - 1;
    this.frames = 0;
    this.elapsed = 0;
    this.stable = 0;
    this.lastDown = -Infinity;
    this.lastUp = -Infinity;
  }

  setLevel(level) {
    if (!LEVELS.includes(level)) return;
    this.level = level;
    this.reset();
  }

  reset() {
    this.frames = 0;
    this.elapsed = 0;
    this.stable = 0;
    this.settle = 3; // Einschwingen: die nächsten Frames (Shader-Kompilierung, Textur-Neuladen) nicht werten
  }

  sample(dt, now) {
    // Hänger (> 0,25 s) zählen als sehr langsamer Frame, damit Dauerruckeln die Stufe senkt; Hintergrund-Tabs
    // erreichen sample() nicht (Schleife hält an, `last` wird beim Fortsetzen neu gesetzt).
    if (this.settle > 0) { this.settle--; return null; }
    this.frames++;
    this.elapsed += dt;
    if (this.elapsed < 2) return null;
    const fps = this.frames / this.elapsed;
    this.frames = 0;
    this.elapsed = 0;
    const idx = LEVELS.indexOf(this.level);
    // Kurz nach einem Hochschalten spürbar langsamer (< 55 fps bzw. > 8 % unter vorher): zurück und Stufe sperren,
    // damit ein Gerät, das „mid“ mit 60 fps schafft, nicht dauerhaft bei 50–57 fps auf „high“ hängen bleibt.
    if (idx > 0 && now - this.lastUp < 20000 && this.fpsAtUp && fps < Math.min(55, this.fpsAtUp * 0.92)) {
      this.stable = 0;
      this.ceiling = Math.min(this.ceiling, idx - 1);
      this.level = LEVELS[idx - 1];
      this.lastDown = now;
      this.fpsAtUp = 0;
      return this.level;
    }
    if (fps < 50) {
      this.stable = 0;
      if (idx > 0) {
        if (now - this.lastUp < 20000) this.ceiling = Math.min(this.ceiling, idx - 1);
        this.level = LEVELS[idx - 1];
        this.lastDown = now;
        return this.level;
      }
      return null;
    }
    if (fps >= 58) {
      this.stable++;
      if (this.stable >= 5 && idx < this.ceiling && now - this.lastDown >= 10000) {
        this.stable = 0;
        this.level = LEVELS[idx + 1];
        this.lastUp = now;
        this.fpsAtUp = fps;
        return this.level;
      }
    } else {
      this.stable = 0;
    }
    return null;
  }
}
