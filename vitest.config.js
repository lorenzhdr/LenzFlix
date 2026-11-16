import { configDefaults, defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    setupFiles: ['./tests/setup-jsdom.js'],
    // Moderat angehoben: Unter Last (parallele Browser, volle Suite) laufen einzelne Tests mit teurem Erst-Import
    // sonst ins 5-s-Standard-Timeout, obwohl sie einzeln grün sind.
    testTimeout: 10000,
    // Der Worker in charts-worker/ hat eigene Tests/Dependencies (dort `npx vitest run`).
    // .tmp/ enthält u. a. den Vergleichs-Worktree (.tmp/base) und darf nicht mitlaufen.
    exclude: [...configDefaults.exclude, 'charts-worker/**', '.tmp/**', 'reference/**'],
  },
});
