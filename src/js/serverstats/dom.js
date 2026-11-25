// Server-Statistik: kleine DOM-Helfer (eigene Kopie, keine Importe).
import { T } from './format.js';

const SVG = 'http://www.w3.org/2000/svg';

function apply(el, attrs) {
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === undefined || v === null || v === false) continue;
    if (k === 'class') el.setAttribute('class', v);
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
    else el.setAttribute(k, v === true ? '' : String(v));
  }
}

function addKids(el, children) {
  for (const c of [].concat(children ?? [])) {
    if (c === null || c === undefined || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
}

export function h(tag, attrs, children) {
  const el = document.createElement(tag);
  apply(el, attrs);
  addKids(el, children);
  return el;
}

export function s(tag, attrs, children) {
  const el = document.createElementNS(SVG, tag);
  apply(el, attrs);
  addKids(el, children);
  return el;
}

export function clear(el) {
  while (el.firstChild) el.removeChild(el.firstChild);
  return el;
}

export function note(text) {
  return h('p', { class: 'lfx-srv-note' }, text);
}

/** Neutraler Fehlerzustand mit „Erneut versuchen“. */
export function errorBox(onRetry) {
  return h('div', { class: 'lfx-srv-error' }, [
    h('p', { class: 'lfx-srv-error__t' }, T.error),
    h('button', { type: 'button', class: 'lfx-srv-btn', onclick: onRetry }, T.retry),
  ]);
}
