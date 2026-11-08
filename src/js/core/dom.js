// LenzFlix: kleine DOM-Helfer. Eigene Knoten liegen immer außerhalb von React-Knoten.

const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

export function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ESC[c]);
}

/**
 * h('a', {class:'x', href:'#', onclick: fn, style:{color:'red'}, dataset:{id:1}}, ['Text', child])
 * Attribute mit null/undefined/false werden übersprungen.
 */
export function h(tag, attrs, children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === undefined || v === null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (k === 'dataset') Object.assign(el.dataset, v);
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
    else el.setAttribute(k, v === true ? '' : String(v));
  }
  for (const c of [].concat(children ?? [])) {
    if (c === null || c === undefined || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return el;
}

const mounts = new Set();

/**
 * Legt (idempotent) einen eigenen Container an, standardmäßig als Kind von document.body.
 * opts: {parent, before (Node), className, tag}
 */
export function mountPoint(id, { parent = document.body, before = null, className = '', tag = 'div' } = {}) {
  let el = document.getElementById(id);
  if (!el) {
    el = document.createElement(tag);
    el.id = id;
    if (className) el.className = className;
    if (before && before.parentNode === parent) parent.insertBefore(el, before);
    else parent.append(el);
  }
  mounts.add(el);
  return el;
}

export function unmountPoint(elOrId) {
  const el = typeof elOrId === 'string' ? document.getElementById(elOrId) : elOrId;
  if (el) {
    el.remove();
    mounts.delete(el);
  }
}

/** Entfernt alle über mountPoint angelegten Container. */
export function removeAllMounts() {
  for (const el of mounts) el.remove();
  mounts.clear();
}
