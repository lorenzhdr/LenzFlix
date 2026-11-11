// VIDEOTHEK LENZ · M3: Debug-Hook (nur mit opts.debug): window.__lfxStore.m3.<modul> = { … } für die Dev-Harness (Screenshots/Tests).
export function debugHook(ctx, name, api) {
  if (!ctx.opts || !ctx.opts.debug) return () => {};
  return ctx.on('enter', () => {
    if (typeof window === 'undefined' || !window.__lfxStore) return;
    const m3 = window.__lfxStore.m3 || (window.__lfxStore.m3 = {});
    m3[name] = api;
  });
}
