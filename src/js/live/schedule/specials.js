// LENZ LIVE Zeitplan: Registry für Spezialsender (17 Premiere, 18 Thementag). Leaf-Modul ohne Importe (keine Zyklen).
//
// Eine Implementierung:
//   { prepare?(ctx, Ds: number[]) → Promise|void,   // async Vorarbeit (z. B. Sammlungs-Inhalte per ctx.getBoxSetItems)
//     planDay(ctx, D) → PlanEntry[] }               // lückenlos [dayStart, dayEnd); Bausteine aus fill.js (createDayBuilder …)
// `ctx` kommt aus plan.js (createContext, siehe dortigen Dateikopf). Ohne Registrierung liefert der Sender einen `closedown`-Tag.
const registry = new Map();

export function registerSpecial(no, impl) { registry.set(no, impl); }
export function unregisterSpecial(no) { registry.delete(no); }
export function getSpecial(no) { return registry.get(no) || null; }
