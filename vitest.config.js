import { configDefaults, defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Der Worker in charts-worker/ hat eigene Tests/Dependencies (dort `npx vitest run`).
    exclude: [...configDefaults.exclude, 'charts-worker/**'],
  },
});
