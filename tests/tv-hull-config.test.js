// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import { parseChannelConfig, getChannelConfig } from '../src/js/features/tvdata/config.js';

afterEach(() => {
  delete window.LenzFlixConfig;
  document.documentElement.style.removeProperty('--lfx-tv-channels');
  document.documentElement.style.removeProperty('--lfx-live-channels');
  document.querySelectorAll('style.t-live').forEach((s) => s.remove());
});

describe('parseChannelConfig', () => {
  it('String: Plätze 5–16, Quotes entfernt, Leerraum getrimmt', () => {
    expect(parseChannelConfig('"5=Action;6=Komödie"')).toEqual({ 5: 'Action', 6: 'Komödie' });
    expect(parseChannelConfig(" '5 = Action ; 16=Science-Fiction' ")).toEqual({ 5: 'Action', 16: 'Science-Fiction' });
  });
  it('Objekt: Schlüssel als Zahl oder Text', () => {
    expect(parseChannelConfig({ 5: 'Action', '7': ' Drama ', 8: 12, 9: '' })).toEqual({ 5: 'Action', 7: 'Drama' });
  });
  it('ungültige Einträge werden ignoriert (Platz außerhalb 5–16, kein =, keine Zahl, leer)', () => {
    expect(parseChannelConfig('4=A;17=B;x=C;7;8=;9=Krimi;5.5=D;=E')).toEqual({ 9: 'Krimi' });
    expect(parseChannelConfig('')).toEqual({});
    expect(parseChannelConfig(null)).toEqual({});
    expect(parseChannelConfig(42)).toEqual({});
  });
});

describe('getChannelConfig', () => {
  it('LenzFlixConfig.tvChannels (String und Objekt) hat Vorrang vor der CSS-Variable', () => {
    document.documentElement.style.setProperty('--lfx-tv-channels', '"6=Krimi"');
    window.LenzFlixConfig = { tvChannels: '5=Action' };
    expect(getChannelConfig()).toEqual({ 5: 'Action' });
    window.LenzFlixConfig = { tvChannels: { 7: 'Drama' } };
    expect(getChannelConfig()).toEqual({ 7: 'Drama' });
  });
  it('CSS-Variable --lfx-tv-channels als Quelle (mit Quotes)', () => {
    document.documentElement.style.setProperty('--lfx-tv-channels', '"5=Action;6=Komödie"');
    expect(getChannelConfig()).toEqual({ 5: 'Action', 6: 'Komödie' });
  });
  it('Rückfall: alter Name LenzFlixConfig.liveChannels (String und Objekt)', () => {
    window.LenzFlixConfig = { liveChannels: '5=Action' };
    expect(getChannelConfig()).toEqual({ 5: 'Action' });
    window.LenzFlixConfig = { liveChannels: { 7: 'Drama' } };
    expect(getChannelConfig()).toEqual({ 7: 'Drama' });
  });
  it('Rückfall: alte CSS-Variable --lfx-live-channels', () => {
    document.documentElement.style.setProperty('--lfx-live-channels', '"5=Action;6=Komödie"');
    expect(getChannelConfig()).toEqual({ 5: 'Action', 6: 'Komödie' });
  });
  it('neuer Name hat Vorrang vor dem alten (Config wie CSS-Variable)', () => {
    window.LenzFlixConfig = { liveChannels: '5=Alt', tvChannels: '5=Neu' };
    expect(getChannelConfig()).toEqual({ 5: 'Neu' });
    delete window.LenzFlixConfig;
    document.documentElement.style.setProperty('--lfx-live-channels', '"5=Alt"');
    document.documentElement.style.setProperty('--lfx-tv-channels', '"5=Neu"');
    expect(getChannelConfig()).toEqual({ 5: 'Neu' });
  });
  it('ohne Quelle leer', () => {
    expect(getChannelConfig()).toEqual({});
  });
});
