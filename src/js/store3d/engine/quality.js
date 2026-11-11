// VIDEOTHEK LENZ · Qualitätsstufen und Automatik (rein, ohne three).
export const LEVELS = ['low', 'mid', 'high'];

/** Einstellungen je Stufe. Atlas-Auflösung = Kantenlänge der Cover-Atlanten; maxAtlases = Texturbudget (LRU). */
export function presetFor(level, phone = false) {
  const lv = LEVELS.includes(level) ? level : 'mid';
  if (lv === 'low') {
    return { level: lv, pixelRatio: phone ? 1 : 0.9, shadows: false, anisotropy: 1, atlas: 512, maxAtlases: phone ? 24 : 32, loadRadius: phone ? 9 : 11, signMips: false };
  }
  if (lv === 'mid') {
    return { level: lv, pixelRatio: 1.25, shadows: false, anisotropy: 4, atlas: 1024, maxAtlases: phone ? 14 : 40, loadRadius: phone ? 13 : 17, signMips: true };
  }
  return { level: lv, pixelRatio: 1.75, shadows: !phone, anisotropy: 8, atlas: 1024, maxAtlases: phone ? 16 : 56, loadRadius: phone ? 20 : 28, signMips: true };
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
  }

  sample(dt, now) {
    if (dt > 0.25) { this.reset(); return null; } // Tab im Hintergrund / Hänger: nicht werten
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
