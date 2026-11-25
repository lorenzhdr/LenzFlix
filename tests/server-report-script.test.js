// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { readFileSync, mkdtempSync, writeFileSync, mkdirSync, chmodSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import process from 'node:process';
import { tmpdir } from 'node:os';
import { join, delimiter } from 'node:path';

const dir = 'tools/server-report';
const files = ['lenzflix-report.sh', 'lenzflix-report.service', 'lenzflix-report.timer', 'lenzflix-report.env.example', 'README.md'];
const read = (f) => readFileSync(`${dir}/${f}`, 'utf8');
const sh = read('lenzflix-report.sh');

const probe = spawnSync('sh', ['-c', 'echo ok; command -v awk sed df >/dev/null'], { encoding: 'utf8' });
const hasSh = !probe.error && probe.status === 0 && probe.stdout.startsWith('ok');

describe('server-report: statisch', () => {
  it('kein CR in allen Dateien', () => {
    for (const f of files) expect(read(f), f).not.toContain('\r');
    expect(readFileSync('.gitattributes', 'utf8')).not.toContain('\r');
  });
  it('.gitattributes erzwingt LF', () => {
    expect(readFileSync('.gitattributes', 'utf8')).toMatch(/^tools\/server-report\/\* text eol=lf$/m);
  });
  it('POSIX-sh ohne Bashismen und jq', () => {
    expect(sh.startsWith('#!/bin/sh\n')).toBe(true);
    expect(sh).not.toContain('[[');
    expect(sh).not.toMatch(/\bfunction /);
    expect(sh).not.toMatch(/\bjq\b/);
    expect(sh).not.toMatch(/\blocal /);
    expect(sh).toMatch(/^set -u$/m);
    expect(sh).not.toMatch(/^set -e/m);
  });
  it('Secret nur ueber --config -, nicht in der curl-Argumentzeile', () => {
    expect(sh).toContain('--config -');
    const curl = sh.split('\n').filter((l) => /curl /.test(l) && !l.trim().startsWith('#'));
    for (const l of curl) expect(l.slice(l.indexOf('curl '))).not.toContain('$secret');
    expect(sh).not.toMatch(/-H\s+["'][^"']*Bearer/);
  });
  it('Service und Timer', () => {
    const s = read('lenzflix-report.service');
    for (const k of ['Type=oneshot', 'EnvironmentFile=/etc/lenzflix/report.env', 'DynamicUser=yes', 'ProtectSystem=strict',
      'PrivateTmp=yes', 'NoNewPrivileges=yes', 'After=network-online.target vnstat.service', 'Wants=network-online.target',
      'ExecStart=/usr/local/bin/lenzflix-report.sh']) expect(s).toContain(k);
    const t = read('lenzflix-report.timer');
    for (const k of ['OnCalendar=*:00,30', 'AccuracySec=1s', 'Persistent=true', 'WantedBy=timers.target']) expect(t).toContain(k);
  });
  it('env.example mit Platzhaltern', () => {
    const e = read('lenzflix-report.env.example');
    expect(e).toContain('https://example.invalid');
    expect(e).toContain('CHANGE_ME');
  });
});

// Ausfuehrung: braucht ein sh mit awk/sed/df; /proc und /sys werden per LFX_PROC/LFX_SYS auf Fake-Verzeichnisse gelegt.
describe.skipIf(!hasSh)('server-report: Ausfuehrung (DRY)', () => {
  const root = mkdtempSync(join(tmpdir(), 'lfxrep-'));
  const proc = join(root, 'proc');
  const sys = join(root, 'sys/class/thermal/thermal_zone0');
  const bin = join(root, 'bin');
  mkdirSync(proc, { recursive: true });
  mkdirSync(sys, { recursive: true });
  mkdirSync(bin, { recursive: true });
  writeFileSync(join(proc, 'stat'), 'cpu  100 0 50 800 50 0 0 0 0 0\n');
  writeFileSync(join(proc, 'loadavg'), '0.40 0.30 0.20 1/100 123\n');
  writeFileSync(join(proc, 'meminfo'), 'MemTotal:        8000 kB\nMemAvailable:    5000 kB\n');
  writeFileSync(join(proc, 'uptime'), '123456.78 4000.00\n');
  writeFileSync(join(proc, 'cpuinfo'), 'processor\t: 0\nprocessor\t: 1\n');
  writeFileSync(join(sys, 'temp'), '51200\n');

  const run = (extra, vnstat) => {
    if (vnstat !== undefined) {
      const f = join(bin, 'vnstat');
      writeFileSync(f, vnstat);
      chmodSync(f, 0o755);
    }
    const env = { ...process.env, LFX_DRY: '1', LFX_PROC: proc, LFX_SYS: join(root, 'sys'), PATH: bin + delimiter + process.env.PATH, ...extra };
    delete env.LFX_SECRET;
    return spawnSync('sh', [`${dir}/lenzflix-report.sh`], { encoding: 'utf8', env, timeout: 20000 });
  };

  it('vnstat scheitert, df-Pfad fehlt: gueltiges JSON mit host', () => {
    const r = run({ LFX_DISKS: '/gibt-es-nicht-xyz=Medien' }, '#!/bin/sh\nexit 1\n');
    expect(r.status).toBe(0);
    const j = JSON.parse(r.stdout);
    expect(j.v).toBe(1);
    expect(j.host.memTotal).toBe(8000 * 1024);
    expect(j.host.memAvail).toBe(5000 * 1024);
    expect(j.host.uptimeS).toBe(123456);
    expect(j.host.load).toEqual([0.4, 0.3, 0.2]);
    expect(j.host.tempC).toBe(51.2);
    expect(j).not.toHaveProperty('vnstat');
    expect(j).not.toHaveProperty('disks');
  }, 30000);

  it('vnstat liefert JSON: vnstat.m und vnstat.d vorhanden, ungueltiges Label verworfen', () => {
    const r = run({ LFX_DISKS: '/=Sys"tem;/=Ok Name', LFX_IFACE: 'eth0' },
      '#!/bin/sh\necho \'{"jsonversion":"2","interfaces":[]}\'\n');
    expect(r.status).toBe(0);
    const j = JSON.parse(r.stdout);
    expect(j.vnstat.m.jsonversion).toBe('2');
    expect(j.vnstat.d.jsonversion).toBe('2');
    if (j.disks) expect(j.disks.map((d) => d.l)).toEqual(['Ok Name']);
  }, 30000);

  it('ohne LFX_URL/LFX_SECRET (kein DRY): Fehlzeile, Exit 0', () => {
    const r = spawnSync('sh', [`${dir}/lenzflix-report.sh`], { encoding: 'utf8', env: { ...process.env, LFX_DRY: '', LFX_URL: '', LFX_SECRET: '' } });
    expect(r.status).toBe(0);
    expect(r.stderr).toContain('lenzflix-report:');
  });

  it('Aufraeumen', () => { rmSync(root, { recursive: true, force: true }); });
});
