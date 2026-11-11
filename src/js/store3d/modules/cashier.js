// VIDEOTHEK LENZ · M4 Kassierer Richard: stilisierte Low-Poly-Figur hinter dem Tresen (Zone „cashier“), Idle-Animation
// (Atmen, Kopf folgt dem Spieler < 6 m, Tresen wischen, Winken, Mundbewegung beim Sprechen), Sprechblasen (DOM, projiziert)
// mit lockeren Sprüchen, echter Gerätestimme (voice.js, nur wenn der Ton an ist) und „Mit Richard reden“ (Dialog mit
// Antwortknöpfen). Sprüche und Kandidatenwahl: cashier-lines.js. Provider 'cashier' { event(name) }; liest 'couch' { seated() }.
import { Group, Mesh, MeshLambertMaterial, MeshBasicMaterial, Vector3 } from 'three';
import { box, quad, merge } from '../util/geo.js';
import { sph } from './m4-geo.js';
import { makeCanvas, toTexture, FONT } from '../world/textures.js';
import { LINES, pickLine, categoryFor, greetingCategory, dialogPicks } from './cashier-lines.js';
import { timeOfDay, isLate, createLimiter, clamp, prefersReducedMotion } from './m4-util.js';
import { createVoice } from './voice.js';

const SKIN = [0.93, 0.74, 0.6];
const VEST = [0.12, 0.45, 0.52];
const SHIRT = [0.95, 0.95, 0.97];
const NAVY = [0.14, 0.16, 0.3];
const HAIR = [0.24, 0.13, 0.1];
const BUBBLE_MS = 4500;
const VOICE_DIST = 10;
const INTRO_KEY = 'lfx.store.richardIntro';

function nameTag() {
  const c = makeCanvas(128, 56);
  const x = c.getContext('2d');
  x.fillStyle = '#f7f3e4'; x.fillRect(0, 0, 128, 56);
  x.fillStyle = '#b3261e'; x.fillRect(0, 0, 128, 12);
  x.fillStyle = '#222'; x.textAlign = 'center'; x.textBaseline = 'middle';
  let px = 30;
  x.font = `bold ${px}px ${FONT}`;
  if (x.measureText) {
    while (px > 12 && x.measureText('Richard').width > 116) { px -= 2; x.font = `bold ${px}px ${FONT}`; }
  }
  x.fillText('Richard', 64, 36);
  return c;
}

function buildFigure(ctx) {
  const root = new Group();
  const lam = () => new MeshLambertMaterial({ vertexColors: true });
  const body = [];
  for (const sx of [-1, 1]) {
    body.push(box({ w: 0.14, h: 0.8, d: 0.17, x: sx * 0.1, y: 0.4, z: 0, color: NAVY }));
    body.push(box({ w: 0.15, h: 0.07, d: 0.26, x: sx * 0.1, y: 0.035, z: -0.04, color: [0.1, 0.1, 0.12] }));
  }
  body.push(box({ w: 0.42, h: 0.58, d: 0.23, x: 0, y: 1.09, z: 0, color: SHIRT }));
  body.push(box({ w: 0.44, h: 0.5, d: 0.25, x: 0, y: 1.05, z: 0, color: VEST }));
  body.push(box({ w: 0.45, h: 0.045, d: 0.26, x: 0, y: 0.9, z: 0, color: [1, 0.24, 0.5] }));
  body.push(box({ w: 0.1, h: 0.07, d: 0.1, x: 0, y: 1.42, z: 0, color: SKIN }));
  const bodyMesh = new Mesh(merge(body), lam());
  const head = [
    sph(0.12, 0, 0.14, 0, SKIN, 1, 1.1, 1),
    sph(0.133, 0, 0.165, 0.016, HAIR, 1, 1, 1, 8, 5, 1.95),
    box({ w: 0.028, h: 0.034, d: 0.012, x: -0.045, y: 0.16, z: -0.113, color: [0.08, 0.08, 0.1] }),
    box({ w: 0.028, h: 0.034, d: 0.012, x: 0.045, y: 0.16, z: -0.113, color: [0.08, 0.08, 0.1] }),
    box({ w: 0.02, h: 0.03, d: 0.02, x: 0, y: 0.13, z: -0.122, color: [0.88, 0.68, 0.55] }),
  ];
  const headMesh = new Mesh(merge(head), lam());
  headMesh.position.set(0, 1.44, 0);
  // Mund als eigenes Mesh (skaliert beim Sprechen in y)
  const mouth = new Mesh(merge([box({ w: 0.05, h: 0.012, d: 0.012, x: 0, y: 0, z: 0, color: [0.62, 0.25, 0.25] })]), lam());
  mouth.position.set(0, 0.095, -0.113);
  headMesh.add(mouth);
  const arm = () => {
    const m = new Mesh(merge([
      box({ w: 0.09, h: 0.3, d: 0.09, x: 0, y: -0.15, z: 0, color: SHIRT }),
      box({ w: 0.085, h: 0.26, d: 0.085, x: 0, y: -0.43, z: 0, color: SKIN }),
      sph(0.05, 0, -0.58, 0, SKIN),
    ]), lam());
    const g = new Group();
    g.rotation.order = 'YXZ';
    g.add(m);
    return g;
  };
  const armL = arm();
  const armR = arm();
  armL.position.set(-0.26, 1.36, 0);
  armR.position.set(0.26, 1.36, 0);
  const tag = new Mesh(quad({ w: 0.15, h: 0.065 }), new MeshBasicMaterial({ map: toTexture(nameTag(), { aniso: 2 }) }));
  tag.position.set(0.1, 1.22, -0.132);
  tag.rotation.y = Math.PI;
  root.add(bodyMesh, headMesh, armL, armR, tag);
  ctx.track(root);
  return { root, head: headMesh, mouth, armL, armR };
}

const ANSWERS = [
  { key: 'comedy', label: 'Was Lustiges?', cat: 'tipComedy' },
  { key: 'horror', label: 'Was Gruseliges?', cat: 'tipHorror' },
  { key: 'kids', label: 'Was für Kinder?', cat: 'tipKids' },
  { key: 'new', label: 'Was ist neu?', cat: 'tipNew' },
  { key: 'random', label: 'Überrasch mich!', cat: 'tipRandom' },
  { key: 'resume', label: 'Weiterschauen?', cat: 'tipResume' },
];

export default {
  name: 'cashier',
  init(ctx) {
    const z = ctx.layout.zones.cashier;
    const L = ctx.layout;
    if (!z) return {};
    const cx = L.w - 2.9;
    const cz = L.d - 2.35;
    const fig = buildFigure(ctx);
    fig.root.position.set(cx, 0, cz); // blickt nach Norden (−z) zu den Kunden
    ctx.scene.add(fig.root);
    ctx.addCollider({ x0: cx - 0.3, z0: cz - 0.3, x1: cx + 0.3, z1: cz + 0.3 });

    const reduced = prefersReducedMotion();
    const host = ctx.renderer.domElement.parentNode;
    const user = (ctx.deps.user && ctx.deps.user.name) || '';
    const rand = Math.random;
    const limiter = createLimiter(20000);
    const lastIdx = {};
    const deptOf = new Map();
    for (const d of (ctx.catalog.departments || [])) {
      for (const id of d.itemIds || []) { const cur = deptOf.get(id); if (!cur || cur.kind === 'new') deptOf.set(id, d); }
    }

    // --- Stimme ---
    const voice = createVoice({
      soundOn: () => ctx.soundOn(),
      online: () => !!(ctx.voiceOnline && ctx.voiceOnline()),
      prefer: () => (ctx.voicePrefs ? ctx.voicePrefs() : {}),
    });
    voice.unlock();
    let talkId = 0;
    const duck = (on) => { const s = ctx.use('sound'); if (s && s.duck) s.duck('talk', on); };
    function stopVoice() {
      talkId++;
      voice.cancel(); // verwirft auch eine wartende Zeile
      duck(false);
    }
    /** Liest `text` vor (nur bei Ton an). dist = Abstand zum Spieler in m oder 0 (Dialog: man steht davor). */
    // Vor der Freischaltung (iOS: erst nach echter Geste, z. B. Begrüßung bei „Klicken zum Losgehen“) darf der Browser
    // nicht sprechen: die letzte Zeile wird in voice.js gemerkt und bei der nächsten Geste synchron als Freischalt-Äußerung gesprochen.
    function voiceSay(text, dist) {
      if (!ctx.soundOn() || dist > VOICE_DIST) return;
      const vol = dist < 3 ? 1 : 1 - ((dist - 3) / (VOICE_DIST - 3)) * 0.5;
      const id = ++talkId;
      if (!voice.unlocked) {
        voice.setPending(text, { volume: vol, onBegin: () => duck(true), onEnd: () => { if (id === talkId) duck(false); } });
        return;
      }
      duck(true);
      voice.say(text, { volume: vol }).then(() => { if (id === talkId) duck(false); });
    }

    // --- Blase ---
    const bubble = document.createElement('div');
    bubble.className = 'lfx-store-bubble' + (ctx.isTouch ? ' is-touch' : '');
    bubble.hidden = true;
    bubble.setAttribute('role', 'status');
    const who = document.createElement('span');
    who.className = 'lfx-store-bubble-who';
    who.textContent = 'Richard';
    const txt = document.createElement('span');
    txt.className = 'lfx-store-bubble-text';
    bubble.append(who, txt);
    if (host) host.appendChild(bubble);
    let bubbleLeft = 0;
    const v = new Vector3();

    let now = 0;
    const weather = () => ctx.use('weather');
    const hourNow = () => { const w = weather(); return w && Number.isFinite(w.hour) ? w.hour : undefined; };
    const distToPlayer = () => { const p = ctx.player.getPose(); return Math.hypot(p.x - cx, p.z - cz); };
    const seated = () => { const c = ctx.use('couch'); return !!(c && c.seated && c.seated()); };

    /** Blase + (bei Ton an, nah genug) Stimme. opts.also: zweite Kategorie, an den Text angehängt. */
    function speak(cat, vars, { force = false, maxDist = 16, voice: withVoice = true, also = null, overOverlay = false } = {}) {
      if (ctx.overlay.isOpen() && !force) return false;
      if (!force && seated()) return false;
      const dist = distToPlayer();
      if (!force && dist > maxDist) return false;
      if (!limiter.can(now, { force })) return false;
      const all = { name: user, ...vars };
      const picked = pickLine(LINES[cat], rand, all, lastIdx[cat]);
      if (!picked) return false;
      lastIdx[cat] = picked.index;
      let text = picked.text;
      if (also) { const extra = pickLine(LINES[also], rand, all, lastIdx[also]); if (extra) { lastIdx[also] = extra.index; text += ' ' + extra.text; } }
      txt.textContent = text;
      bubble.hidden = false;
      bubbleSticky = overOverlay;
      bubbleLeft = (ctx.isTouch ? BUBBLE_MS + 500 : BUBBLE_MS) / 1000;
      limiter.mark(now);
      placeBubble();
      if (withVoice && cat !== 'play') voiceSay(text, dist);
      return true;
    }
    let bubbleSticky = false; // Blase bleibt trotz offenem Overlay (Couch-Sprüche)
    function placeBubble() {
      if (bubble.hidden || !host) return;
      v.set(cx, 1.95, cz).project(ctx.camera);
      const on = v.z < 1 && Math.abs(v.x) < 0.9 && v.y > -0.8 && v.y < 0.88;
      bubble.classList.toggle('is-edge', !on);
      if (on) {
        const w = host.clientWidth || window.innerWidth;
        const h = host.clientHeight || window.innerHeight;
        bubble.style.transform = `translate(${((v.x * 0.5 + 0.5) * w).toFixed(1)}px, ${((-v.y * 0.5 + 0.5) * h).toFixed(1)}px) translate(-50%, -100%)`;
      } else {
        bubble.style.transform = '';
      }
    }

    // --- Animation ---
    let wipeT = -1; // 0..WIPE
    let nextWipe = 9 + rand() * 8;
    let waveT = -1;
    const WIPE = 2.8;
    const WAVE = 2.3;
    let headYaw = 0;
    let pendingGreet = -1;
    let lastWave = -Infinity;
    function wave() { if (reduced || now - lastWave < 25) return; lastWave = now; waveT = 0; }

    // --- Ereignisse ---
    const offs = [];
    offs.push(ctx.on('enter', () => { pendingGreet = 1.1; wave(); }));
    offs.push(ctx.on('take', (id) => {
      const it = ctx.catalog.items && ctx.catalog.items.get(id);
      const dept = deptOf.get(id);
      speak(categoryFor(it, dept), { title: it && it.Name, dept: dept && dept.label });
    }));
    offs.push(ctx.on('put', () => { speak('put', {}); }));
    offs.push(ctx.on('play', () => { speak('play', {}, { force: true }); stopVoice(); }));
    let resumeSaid = false;
    offs.push(ctx.on('zone', (id) => {
      if (id !== 'register') return;
      wave();
      const r = ctx.catalog.resume && ctx.catalog.resume[0];
      if (r && !resumeSaid && speak('resume', { title: r.Name })) resumeSaid = true;
    }));

    function greet() {
      const h = hourNow();
      const late = isLate(h);
      const w = weather();
      let cat = greetingCategory(timeOfDay(h), late);
      if (!late && w && w.raining && rand() < 0.4) cat = 'rain';
      let first;
      try { first = !sessionStorage.getItem(INTRO_KEY); if (first) sessionStorage.setItem(INTRO_KEY, '1'); } catch { first = false; }
      speak(cat, {}, { force: true, also: first ? 'intro' : null });
    }

    // --- „Mit Richard reden“: Dialog ---
    let lastTipId = null;
    function openDialog() {
      const picks = dialogPicks(ctx.catalog, deptOf);
      const el = document.createElement('div');
      el.className = 'lfx-store-tip lfx-store-dialog' + (ctx.isTouch ? ' is-touch' : '');
      const card = document.createElement('div');
      card.className = 'lfx-store-tip-card';
      const h = document.createElement('div');
      h.className = 'lfx-store-tip-title';
      h.textContent = 'Richard – Kasse';
      const p = document.createElement('div');
      p.className = 'lfx-store-tip-text';
      const row = document.createElement('div');
      row.className = 'lfx-store-tip-btns lfx-store-dialog-btns';
      card.append(h, p, row);
      el.appendChild(card);

      const line = (cat, vars) => { const r = pickLine(LINES[cat], rand, { name: user, ...vars }, lastIdx[cat]); if (r) lastIdx[cat] = r.index; return r ? r.text : ''; };
      const say = (text) => { p.textContent = text; voiceSay(text, 0); };
      const btn = (label, fn, primary) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'lfx-store-tip-btn' + (primary ? ' is-primary' : '');
        b.textContent = label;
        b.addEventListener('click', fn);
        row.appendChild(b);
        return b;
      };
      const bye = () => {
        ctx.overlay.close();
        speak('dialogBye', {}, { force: true });
      };
      function choices(first) {
        row.textContent = '';
        row.classList.add('is-choices');
        const avail = ANSWERS.filter((a) => picks[a.key].length);
        if (!avail.length) {
          say(line('noTip'));
          btn('Tschüss', bye, true);
          return;
        }
        say(line('dialogHello'));
        for (const a of avail) btn(a.label, () => answer(a), false);
        btn('Tschüss', bye, false);
        if (first) { const f = row.querySelector('button'); if (f && !ctx.isTouch) f.focus({ preventScroll: true }); }
      }
      function answer(a) {
        const list = picks[a.key];
        let pool = list.filter((i) => i.Id !== lastTipId);
        if (!pool.length) pool = list;
        const it = pool[Math.floor(rand() * pool.length)];
        lastTipId = it.Id;
        const dept = deptOf.get(it.Id);
        row.textContent = '';
        row.classList.remove('is-choices');
        say(line(a.cat, { title: it.Name, dept: dept && dept.label }));
        btn('Zeig mal', () => { ctx.overlay.close(); ctx.items.take(it.Id, { from: 'counter' }); }, true);
        btn('Was anderes', () => choices(false), false);
        btn('Tschüss', bye, false);
      }
      el.addEventListener('pointerdown', (e) => { if (e.target === el) ctx.overlay.close(); });
      ctx.overlay.open(el, { onClose: () => { stopVoice(); } });
      bubble.hidden = true;
      choices(true);
    }
    const offIa = ctx.addInteractable({
      box: { min: { x: cx - 0.5, y: 0.2, z: cz - 0.6 }, max: { x: cx + 0.5, y: 2.0, z: cz + 0.4 } },
      label: 'Richard', hint: 'E / Klick: Mit Richard reden', onUse: openDialog,
    });

    const offProvide = ctx.provide('cashier', {
      event(name) {
        if (name === 'couchSit' || name === 'couchStand') speak(name, {}, { force: true, maxDist: Infinity, overOverlay: true });
      },
      /** Diagnose der Stimme fürs Pause-Menü: { diag, voiceName, lang, onlineDe } (kein Text, keine Titel). */
      voiceInfo() {
        return { diag: voice.diag, voiceName: voice.voiceName, lang: voice.lang, onlineDe: voice.onlineDe, online: voice.online };
      },
      /** Deutsche Stimmen für die Auswahl im Pause-Menü: [{ name, lang, online, male }]. */
      voices() { return voice.listVoices(); },
      /** Probezeile sprechen (synchron im Klick-Handler aufrufen; nur bei Ton an). */
      preview(text) {
        if (!ctx.soundOn()) return;
        const id = ++talkId;
        duck(true);
        voice.preview(String(text || 'Hallo, ich bin Richard. So klinge ich.')).then(() => { if (id === talkId) duck(false); });
      },
    });

    if (ctx.opts.debug) {
      window.__lfxM4 = {
        ...window.__lfxM4,
        say: (cat, vars) => speak(cat, vars || {}, { force: true }),
        tip: openDialog,
        voice: () => ({ speaking: voice.speaking, voiceName: voice.voiceName }),
      };
    }

    const inR = (r, p) => r && p.x >= r.x0 && p.x <= r.x1 && p.z >= r.z0 && p.z <= r.z1;
    let poll = 0;
    let lastX = 0;
    let lastZ = 0;
    let still = 0;
    let adultSecs = 0;
    let adultSaid = false;
    let inKids = false;
    let lastKids = -Infinity;
    return {
      update(dt, t) {
        now = t;
        const p = ctx.player.getPose();
        const dx = p.x - cx;
        const dz = p.z - cz;
        const dist = Math.hypot(dx, dz);
        // Kopf: zum Spieler (< 6 m), sonst sanftes Umherschauen
        const idleLook = Math.sin(t * 0.37) * 0.35;
        const target = dist < 6 ? clamp(Math.atan2(-dx, -dz), -1.1, 1.1) : idleLook;
        headYaw += (target - headYaw) * (1 - Math.exp(-5 * dt));
        fig.head.rotation.y = headYaw;
        fig.root.rotation.y = headYaw * 0.3;
        if (!reduced) {
          fig.head.position.y = 1.44 + Math.sin(t * 1.7) * 0.004;
          fig.root.scale.y = 1 + Math.sin(t * 1.7) * 0.005;
        }
        // Mund: flattert beim Sprechen
        if (voice.speaking) {
          const open = Math.abs(Math.sin(t * 15) * (0.65 + 0.35 * Math.sin(t * 6.1 + 1.3))) + Math.abs(Math.sin(t * 23.7)) * 0.25;
          fig.mouth.scale.y = 1 + Math.min(1, open) * (reduced ? 0.6 : 2.2);
        } else if (fig.mouth.scale.y !== 1) fig.mouth.scale.y = 1;
        // Arme
        if (waveT >= 0) {
          waveT += dt;
          const u = waveT / WAVE;
          const env = u >= 1 ? 0 : Math.sin(Math.min(1, u * 1.15) * Math.PI) ** 0.4;
          fig.armR.rotation.z = env * (2.5 + Math.sin(waveT * 9) * 0.28);
          if (u >= 1) { waveT = -1; fig.armR.rotation.z = 0; }
        } else if (wipeT >= 0) {
          wipeT += dt;
          const u = wipeT / WIPE;
          const env = u >= 1 ? 0 : Math.sin(u * Math.PI) ** 0.5;
          fig.armR.rotation.x = env * 1.12;
          fig.armR.rotation.y = env * Math.sin(wipeT * 5.5) * 0.5;
          if (u >= 1) { wipeT = -1; fig.armR.rotation.x = 0; fig.armR.rotation.y = 0; }
        } else if (!reduced && t > nextWipe) { wipeT = 0; nextWipe = t + 14 + rand() * 12; }

        if (pendingGreet >= 0) {
          pendingGreet -= dt;
          if (pendingGreet < 0) greet();
        }
        if (bubbleLeft > 0) {
          bubbleLeft -= dt;
          if (bubbleLeft <= 0 || (ctx.overlay.isOpen() && !bubbleSticky)) { bubble.hidden = true; bubbleLeft = 0; } else placeBubble();
        }
        poll += dt;
        if (poll > 1) {
          const step = poll;
          poll = 0;
          // Lange herumstehen
          if (Math.hypot(p.x - lastX, p.z - lastZ) > 0.3) { still = 0; lastX = p.x; lastZ = p.z; } else still++;
          if (still >= 45) {
            still = 0;
            const r = ctx.catalog.resume && ctx.catalog.resume[0];
            if (r && !resumeSaid) { if (speak('resume', { title: r.Name })) resumeSaid = true; } else speak('idle', {});
          }
          // Ab-18-Raum: einmal pro Aufenthalt nach 30 s
          if (inR(L.adultRoom, p)) {
            adultSecs += step;
            if (adultSecs >= 30 && !adultSaid && speak('adultLong', {}, { maxDist: Infinity })) adultSaid = true;
          } else { adultSecs = 0; adultSaid = false; }
          // Kinder-Ecke betreten: höchstens alle 2 min
          const k = !!inR(L.kidsRoom, p);
          if (k && !inKids && now - lastKids > 120 && speak('kidsEnter', {}, { maxDist: Infinity })) lastKids = now;
          inKids = k;
        }
      },
      onSound(on) { if (!on) stopVoice(); },
      onVoiceOnline() { stopVoice(); voice.reselect(); },
      // Stimme/Tonlage geändert: nur neu wählen (laufende Rede wird von der folgenden Probe abgelöst)
      onVoicePrefs() { voice.reselect(); },
      onSuspend() { bubble.hidden = true; bubbleLeft = 0; stopVoice(); },
      dispose() {
        offs.forEach((o) => o());
        offIa();
        offProvide();
        stopVoice();
        voice.dispose();
        bubble.remove();
        if (window.__lfxM4) { delete window.__lfxM4.say; delete window.__lfxM4.tip; delete window.__lfxM4.voice; }
      },
    };
  },
};
