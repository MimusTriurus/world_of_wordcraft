// Поднимает настоящий игровой скрипт в Node: заглушки DOM, детерминированный
// Math.random, экспорт внутренностей наружу. Физика, спавн, бюджет поля и пул
// слов — те же самые, что в браузере, а не их пересказ.
import { readFileSync } from "node:fs";

const HTML = new URL("../../word-shooter.html", import.meta.url);

export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const noop = () => {};
function fakeCtx() {
  return new Proxy({}, {
    get: (o, k) => (k in o ? o[k] : (o[k] = noop)),
    set: (o, k, v) => ((o[k] = v), true),
  });
}

export function boot(seed = 1) {
  const raw = readFileSync(HTML, "utf8");
  const open = raw.indexOf("<script>");
  const close = raw.lastIndexOf("</script>");
  let src = raw.slice(open + 8, close);

  // единственная правка логики: волновой контроллер подменяет правила этапа
  const RULES = "  const rules = () =>";
  if (!src.includes(RULES)) throw new Error("не нашёл rules()");
  src = src.replace(RULES, "  const rules = () => globalThis.__rules ||");

  const exportCode = `
  globalThis.__t = {
    update, reset, spawn, blockCost, fieldLoad, alive, rules, solve, bombAll,
    DANGER_Y, CANNON_Y, STAGES,
    get blocks() { return blocks; },
    get state() { return state; },  set state(v) { state = v; },
    get stage() { return stage; },  set stage(v) { stage = v; },
    get lives() { return lives; },  get solved() { return solved; },
    get bombs() { return bombs; },  set bombs(v) { bombs = v; },
    get score() { return score; },
    get combo() { return combo; },
    // сдача блока: то же, что клик ЛКМ, но без возни с наводкой пушки
    kill(b) { b.state = "dead"; b.timer = 0; combo = 0; },
    finish(b) { b.shown = b.word.split(""); solve(b); },
  };`;
  const tail = "  requestAnimationFrame(frame);\n})();";
  if (!src.includes(tail)) throw new Error("не нашёл хвост цикла");
  src = src.replace(tail, exportCode + "\n})();");

  const store = new Map();
  const canvas = {
    width: 0, height: 0, style: {},
    getContext: () => fakeCtx(),
    addEventListener: noop,
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 470, height: 660 }),
  };
  const document = {
    getElementById: () => ({ textContent: "", innerHTML: "" }),
    querySelectorAll: () => [],
    addEventListener: noop,
  };
  document.getElementById = id =>
    id === "game" ? canvas : { textContent: "", innerHTML: "" };
  const window = { devicePixelRatio: 1, addEventListener: noop };
  const localStorage = {
    getItem: k => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, v),
  };
  const performance = { now: () => 0 };

  Math.random = mulberry32(seed);
  new Function("document", "window", "localStorage", "performance",
               "requestAnimationFrame", src)
    (document, window, localStorage, performance, () => 0);

  return globalThis.__t;
}
