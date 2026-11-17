// VIDEOTHEK LENZ · M4 Kassierer Richard: stilisierte Low-Poly-Figur hinter dem Tresen (Zone „cashier“), Idle-Animation
// (Atmen, Kopf folgt dem Spieler < 6 m, Tresen wischen, Winken, Mundbewegung beim Sprechen), Sprechblasen (DOM, projiziert)
// mit lockeren Sprüchen, echter Gerätestimme (voice.js, nur wenn der Ton an ist) und „Mit Richard reden“ (Dialog mit
// Antwortknöpfen). Sprüche und Kandidatenwahl: cashier-lines.js. Provider 'cashier' { event(name) }; liest 'couch' { seated() }.
import { Group, Mesh, MeshLambertMaterial, MeshBasicMaterial, Vector3 } from 'three';
import { box, quad, merge } from '../util/geo.js';
import { sph } from './m4-geo.js';
import { makeCanvas, toTexture, FONT } from '../world/textures.js';
import { LINES, pickLine, categoryFor, greetingCategory, dialogPicks, dialogStart, dialogAnswer } from './cashier-lines.js';
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
  const leg = (sx) => {
    const m = new Mesh(merge([
      box({ w: 0.14, h: 0.8, d: 0.17, x: 0, y: -0.4, z: 0, color: NAVY }),
      box({ w: 0.15, h: 0.07, d: 0.26, x: 0, y: -0.765, z: -0.04, color: [0.1, 0.1, 0.12] }),
    ]), lam());
    const g = new Group();
    g.position.set(sx * 0.1, 0.8, 0); // Hüfte
    g.add(m);
    return g;
  };
  const legL = leg(-1);
  const legR = leg(1);
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
  root.add(bodyMesh, headMesh, armL, armR, tag, legL, legR);
  ctx.track(root);
  return { root, head: headMesh, mouth, armL, armR, legL, legR };
}

export default {
  name: 'cashier',
  init(ctx) {
    const z = ctx.layout.zones.cashier;
    const L = ctx.layout;
    if (!z) return {};
    const home = { x: L.w - 2.9, z: L.d - 2.35 };
    const pos = { x: home.x, y: 0, z: home.z, yaw: 0 }; // Richards Ort (Welle 2: brawl.js verschiebt ihn über richard.place)
    const fig = buildFigure(ctx);
    fig.root.position.set(pos.x, 0, pos.z); // blickt nach Norden (−z) zu den Kunden
    ctx.scene.add(fig.root);
    const collider = ctx.addCollider({ x0: pos.x - 0.3, z0: pos.z - 0.3, x1: pos.x + 0.3, z1: pos.z + 0.3 });
    const ctl = { on: false, busy: false }; // on: brawl.js steuert die Glieder; busy: nur Schlagabtausch-Sprüche
    const storeRect = (L.zones && L.zones.store && L.zones.store.rect) || { x0: 0, z0: 0, x1: L.w, z1: L.d };
    const inStore = () => {
      const p = ctx.player.getPose();
      const y = Number.isFinite(p.y) ? p.y : 0;
      return p.x >= storeRect.x0 && p.x <= storeRect.x1 && p.z >= storeRect.z0 && p.z <= storeRect.z1 && (storeRect.y1 === undefined || y <= storeRect.y1);
    };

    const reduced = prefersReducedMotion();
    const host = ctx.renderer.domElement.parentNode;
    const user = (ctx.deps.user && ctx.deps.user.name) || '';
    const rand = Math.random;
    const limiter = createLimiter(20);
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
    // VR: 3D-Blase statt DOM-Blase (lazy einmal erzeugt)
    const xrOn = () => !!(ctx.xr && ctx.xr.presenting());
    let bubble3d = null;
    let bubbleText = '';
    function showBubble3d() {
      if (!bubble3d) bubble3d = ctx.xr.bubble();
      bubble3d.show(bubbleText, { x: pos.x, y: pos.y + 1.95 + 0.35, z: pos.z });
    }
    function hideBubble() {
      bubble.hidden = true;
      if (bubble3d) bubble3d.hide();
    }

    let now = 0;
    const weather = () => ctx.use('weather');
    const hourNow = () => { const w = weather(); return w && Number.isFinite(w.hour) ? w.hour : undefined; };
    const distToPlayer = () => { const p = ctx.player.getPose(); return Math.hypot(p.x - pos.x, p.z - pos.z); };
    const seated = () => { const c = ctx.use('couch'); return !!(c && c.seated && c.seated()); };

    /** Blase + (bei Ton an, nah genug) Stimme. opts.also: zweite Kategorie, an den Text angehängt. */
    function speak(cat, vars, { force = false, maxDist = 16, voice: withVoice = true, also = null, overOverlay = false, outside = false, brawl = false } = {}) {
      if (ctx.overlay.isOpen() && !force) return false;
      if (!force && seated()) return false;
      if (ctl.busy && !brawl) return false; // im Schlagabtausch kein Plauderton
      if (!outside && !inStore()) return false; // draußen nur Rufe (Diebstahl, Hausverbot)
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
      bubbleText = text;
      if (xrOn()) showBubble3d(); else bubble.hidden = false;
      bubbleSticky = overOverlay;
      bubbleLeft = (ctx.isTouch ? BUBBLE_MS + 500 : BUBBLE_MS) / 1000;
      limiter.mark(now);
      placeBubble();
      if (withVoice && cat !== 'play') voiceSay(text, dist);
      return true;
    }
    let bubbleSticky = false; // Blase bleibt trotz offenem Overlay (Couch-Sprüche)
    function placeBubble() {
      if (bubble.hidden || !host || xrOn()) return;
      v.set(pos.x, pos.y + 1.95, pos.z).project(ctx.camera);
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
    // Wechsel 2D <-> VR: laufende Blase auf der jeweils anderen Seite zeigen
    offs.push(ctx.on('xr', (on) => {
      if (on) {
        bubble.hidden = true;
        if (bubbleLeft > 0 && bubbleText) showBubble3d();
      } else {
        if (bubble3d) bubble3d.hide();
        if (bubbleLeft > 0) { bubble.hidden = false; placeBubble(); }
      }
    }));
    // Begrüßung nur im Laden: beim Start draußen (?spawn=street) erst beim Betreten ('return'), nie aus der Ferne
    let greetOwed = false;
    let lastGreet = -Infinity;
    offs.push(ctx.on('enter', () => { if (inStore()) { pendingGreet = 1.1; wave(); } else greetOwed = true; }));
    offs.push(ctx.on('return', () => {
      if (!greetOwed && now - lastGreet < 90) return;
      greetOwed = false;
      pendingGreet = 1.1;
      wave();
    }));
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
      const bw = ctx.use('brawl');
      const grudge = !!(bw && bw.state() === 'grudge');
      if (grudge) cat = 'grudgeGreet';
      lastGreet = now;
      let first;
      try { first = !sessionStorage.getItem(INTRO_KEY); if (first) sessionStorage.setItem(INTRO_KEY, '1'); } catch { first = false; }
      speak(cat, {}, { force: true, also: first && !grudge ? 'intro' : null });
    }

    // --- „Mit Richard reden“: Dialog (Modell in cashier-lines.js; Ansicht DOM oder VR-Panel) ---
    let lastTipId = null;
    function dialogFlow(view) {
      const picks = dialogPicks(ctx.catalog, deptOf);
      const line = (cat, vars) => { const r = pickLine(LINES[cat], rand, { name: user, ...vars }, lastIdx[cat]); if (r) lastIdx[cat] = r.index; return r ? r.text : ''; };
      let cur = null;
      const showModel = (m, first) => { cur = m; view.show(m, first); voiceSay(m.text, 0); };
      const start = (first) => showModel(dialogStart(picks, line), first);
      const act = (id) => {
        if (id === 'bye') { view.close(); speak('dialogBye', {}, { force: true }); return; }
        if (id === 'more') { start(false); return; }
        if (id === 'show') {
          const it = cur && cur.item;
          view.close();
          if (it) ctx.items.take(it.Id, { from: 'counter' });
          return;
        }
        if (id.startsWith('a:')) {
          const m = dialogAnswer(picks, id.slice(2), { rand, lastId: lastTipId, line, deptOf });
          if (!m) return;
          lastTipId = m.item.Id;
          showModel(m, false);
        }
      };
      return { start, act };
    }

    function openDialogDom() {
      const el = document.createElement('div');
      el.className = 'lfx-store-tip lfx-store-dialog' + (ctx.isTouch ? ' is-touch' : '');
      el.setAttribute('role', 'dialog');
      el.setAttribute('aria-modal', 'true');
      el.setAttribute('aria-label', 'Richard – Kasse');
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
      let flow = null;
      const view = {
        show(m, first) {
          p.textContent = m.text;
          row.textContent = '';
          row.classList.toggle('is-choices', !!m.choices);
          for (const bt of m.buttons) {
            const b = document.createElement('button');
            b.type = 'button';
            b.className = 'lfx-store-tip-btn' + (bt.primary ? ' is-primary' : '');
            b.textContent = bt.label;
            b.addEventListener('click', () => flow.act(bt.id));
            row.appendChild(b);
          }
          if ((first && m.choices) || (!first && !ctx.isTouch)) { const f = row.querySelector('.is-primary') || row.querySelector('button'); if (f && !ctx.isTouch) f.focus({ preventScroll: true }); }
        },
        close: () => ctx.overlay.close(),
      };
      flow = dialogFlow(view);
      el.addEventListener('pointerdown', (e) => { if (e.target === el) ctx.overlay.close(); });
      ctx.overlay.open(el, { onClose: () => { stopVoice(); } });
      bubble.hidden = true;
      flow.start(true);
    }

    function openDialogXr() {
      let handle = null;
      let flow = null;
      const toSpec = (m) => ({
        title: 'Richard',
        text: m.text,
        buttons: m.buttons.map((bt) => ({ label: bt.label, primary: !!bt.primary, onSelect: () => flow.act(bt.id) })),
      });
      const view = {
        show(m) {
          if (handle && handle.open) handle.update(toSpec(m));
          else handle = ctx.xr.panel.open({ ...toSpec(m), onClose: () => { stopVoice(); } });
        },
        close: () => { if (handle) handle.close(); },
      };
      flow = dialogFlow(view);
      hideBubble();
      flow.start(true);
    }

    function openDialog() { if (xrOn()) openDialogXr(); else openDialogDom(); }

    const atHome = () => Math.hypot(pos.x - home.x, pos.z - home.z) < 0.4 && pos.y < 0.1;
    const talkOk = () => {
      if (!atHome()) return false;
      const b = ctx.use('brawl');
      return !b || b.canTalk();
    };
    const iaBox = { min: { x: home.x - 0.5, y: 0.2, z: home.z - 0.6 }, max: { x: home.x + 0.5, y: 2.0, z: home.z + 0.4 } };
    const rentedCarried = () => { const c = ctx.items.carried(); const r = ctx.use('rent'); return !!(c && r && r.isRented(c.id)); };
    const offIa = ctx.addInteractable({
      box: iaBox,
      label: 'Richard', hint: 'E / Klick: Mit Richard reden', onUse: openDialog,
      enabled: () => talkOk() && (!ctx.items.carried() || rentedCarried()),
    });
    // Mit getragener Hülle: Ausleihen (rent.js); ohne rent-Provider wie gewohnt reden
    const offIa2 = ctx.addInteractable({
      box: iaBox,
      label: 'Richard', hint: 'E / Klick: Hülle ausleihen',
      onUse: () => { const r = ctx.use('rent'); if (r) r.tryRent(); },
      enabled: () => talkOk() && !!ctx.items.carried() && !!ctx.use('rent') && !rentedCarried(),
    });
    const offIa3 = ctx.addInteractable({
      box: iaBox,
      label: 'Richard', hint: 'E / Klick: Mit Richard reden', onUse: openDialog,
      enabled: () => talkOk() && !!ctx.items.carried() && !ctx.use('rent'),
    });

    const richard = {
      root: fig.root, head: fig.head, mouth: fig.mouth, armL: fig.armL, armR: fig.armR, legL: fig.legL, legR: fig.legR,
      home, pos, collider, inStore,
      /** Figur setzen (x, z, y = Höhe über Boden, yaw) und Kollider/Blase mitführen. */
      place(x, z, y = 0, yaw = pos.yaw) {
        pos.x = x; pos.z = z; pos.y = y; pos.yaw = yaw;
        fig.root.position.set(x, y, z);
        fig.root.rotation.y = yaw;
        ctx.moveCollider(collider, x - 0.3, z - 0.3, x + 0.3, z + 0.3);
      },
      /** brawl.js übernimmt (true) bzw. gibt die Leerlauf-Animation zurück (false). */
      control(on) {
        ctl.on = !!on;
        if (!on) {
          fig.armL.rotation.set(0, 0, 0); fig.armR.rotation.set(0, 0, 0); fig.legL.rotation.set(0, 0, 0); fig.legR.rotation.set(0, 0, 0);
          fig.root.rotation.x = 0; fig.root.rotation.z = 0; fig.root.scale.y = 1; fig.head.rotation.x = 0;
          waveT = -1; wipeT = -1;
        }
      },
      /** Schlagabtausch-Zustand: unterdrückt normale Sprüche. */
      setBusy(on) { ctl.busy = !!on; },
      /** Spruch aus einer Kategorie (auch draußen, ohne Limiter-Pause); false bei offenem Overlay. */
      say(cat, vars, o) { return speak(cat, vars || {}, { force: true, outside: true, brawl: true, maxDist: 40, ...o }); },
    };
    const offProvide = ctx.provide('cashier', {
      richard: () => richard,
      event(name) {
        if (name === 'couchSit' || name === 'couchStand') speak(name, {}, { force: true, maxDist: Infinity, overOverlay: true });
      },
      /** Diagnose der Stimme fürs Pause-Menü: { diag, voiceName, lang, onlineDe } (kein Text, keine Titel). */
      voiceInfo() {
        return { diag: voice.diag, voiceName: voice.voiceName, lang: voice.lang, onlineDe: voice.onlineDe, online: voice.online };
      },
      /** Stimme sofort freischalten; synchron aus dem Klick „In VR betreten“ aufrufen (Brillen-Browser ohne Sprachausgabe: No-op). */
      unlockVoice() { try { voice.unlockNow(); } catch { /* egal */ } },
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
        const dx = p.x - pos.x;
        const dz = p.z - pos.z;
        const dist = Math.hypot(dx, dz);
        if (!ctl.on) {
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
        }
        // Mund: flattert beim Sprechen
        if (voice.speaking) {
          const open = Math.abs(Math.sin(t * 15) * (0.65 + 0.35 * Math.sin(t * 6.1 + 1.3))) + Math.abs(Math.sin(t * 23.7)) * 0.25;
          fig.mouth.scale.y = 1 + Math.min(1, open) * (reduced ? 0.6 : 2.2);
        } else if (fig.mouth.scale.y !== 1) fig.mouth.scale.y = 1;
        // Arme
        if (ctl.on) { waveT = -1; wipeT = -1; } else if (waveT >= 0) {
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
          if (bubbleLeft <= 0 || (ctx.overlay.isOpen() && !bubbleSticky)) { hideBubble(); bubbleLeft = 0; } else placeBubble();
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
      onSuspend() { hideBubble(); bubbleLeft = 0; stopVoice(); },
      dispose() {
        offs.forEach((o) => o());
        if (bubble3d) { bubble3d.dispose(); bubble3d = null; }
        offIa();
        offIa2();
        offIa3();
        offProvide();
        stopVoice();
        voice.dispose();
        bubble.remove();
        if (window.__lfxM4) { delete window.__lfxM4.say; delete window.__lfxM4.tip; delete window.__lfxM4.voice; }
      },
    };
  },
};
