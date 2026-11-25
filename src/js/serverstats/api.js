// Server-Statistik: Abruf über deps.get, nie werfend, ein Abruf gleichzeitig, abbrechbar.

const FAIL = { ok: false, status: 0 };

export function createFetcher(get) {
  let ctrl = null;
  function abort() {
    if (ctrl) {
      try {
        ctrl.abort();
      } catch {
        // bewusst still
      }
      ctrl = null;
    }
  }
  function run(path, cb) {
    abort();
    const c = new AbortController();
    ctrl = c;
    let p;
    try {
      p = Promise.resolve(get(path, { signal: c.signal }));
    } catch {
      p = Promise.resolve(FAIL);
    }
    p.then(
      (r) => (r && typeof r === 'object' ? r : FAIL),
      () => FAIL,
    ).then((r) => {
      if (c.signal.aborted) return;
      if (ctrl === c) ctrl = null;
      try {
        cb(r);
      } catch {
        // bewusst still
      }
    });
  }
  return { run, abort };
}
