// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import { parseChannelConfig, getChannelConfig, channelConfigLine } from '../src/js/features/live/config.js';

afterEach(() => {
  delete window.LenzFlixConfig;
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
  it('LenzFlixConfig.liveChannels (String und Objekt) hat Vorrang vor der CSS-Variable', () => {
    document.documentElement.style.setProperty('--lfx-live-channels', '"6=Krimi"');
    window.LenzFlixConfig = { liveChannels: '5=Action' };
    expect(getChannelConfig()).toEqual({ 5: 'Action' });
    window.LenzFlixConfig = { liveChannels: { 7: 'Drama' } };
    expect(getChannelConfig()).toEqual({ 7: 'Drama' });
  });
  it('CSS-Variable als Quelle (mit Quotes)', () => {
    document.documentElement.style.setProperty('--lfx-live-channels', '"5=Action;6=Komödie"');
    expect(getChannelConfig()).toEqual({ 5: 'Action', 6: 'Komödie' });
  });
  it('ohne Quelle leer', () => {
    expect(getChannelConfig()).toEqual({});
  });
});

describe('channelConfigLine', () => {
  it('liefert die Admin-Zeile, sortiert', () => {
    expect(channelConfigLine({ 6: 'Komödie', 5: 'Action' })).toBe(':root{--lfx-live-channels:"5=Action;6=Komödie"}');
  });
  it('filtert ungültige Plätze, entfernt Trennzeichen im Label, Roundtrip', () => {
    const line = channelConfigLine({ 3: 'X', 8: 'A;B="C"' });
    expect(line).toBe(':root{--lfx-live-channels:"8=ABC"}');
    const val = /--lfx-live-channels:(.*)\}/.exec(line)[1];
    expect(parseChannelConfig(val)).toEqual({ 8: 'ABC' });
  });
  it('leer', () => {
    expect(channelConfigLine({})).toBe(':root{--lfx-live-channels:""}');
  });
});
