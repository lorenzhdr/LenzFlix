import { configDefaults, defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Der Worker in charts-worker/ hat eigene Tests/Dependencies (dort `npx vitest run`).
    // .tmp/ enthält u. a. den Vergleichs-Worktree (.tmp/base) und darf nicht mitlaufen.
    exclude: [...configDefaults.exclude, 'charts-worker/**', '.tmp/**', 'reference/**'],
  },
});
