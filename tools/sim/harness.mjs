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
  // measureText нужен настоящий: wrapText в подсказке читает .width, и на
  // заглушке-пустышке падает. Courier моноширинный, 13px ≈ 7.8px на символ —
  // разбивка на строки выходит та же, что в браузере, с точностью до слова.
  const base = { measureText: s => ({ width: s.length * 7.8 }) };
  return new Proxy(base, {
    get: (o, k) => (k in o ? o[k] : (o[k] = noop)),
    set: (o, k, v) => ((o[k] = v), true),
  });
}

export function boot(seed = 1) {
  // Переводы строк нормализуем: в рабочей копии на Windows файл лежит с CRLF,
  // и якоря, по которым мы патчим скрипт, перестают совпадать.
  const raw = readFileSync(HTML, "utf8").replace(/\r\n/g, "\n");
  const open = raw.indexOf("<script>");
  const close = raw.lastIndexOf("</script>");
  let src = raw.slice(open + 8, close);

  // единственная правка логики: волновой контроллер подменяет правила этапа
  const RULES = "  const rules = () =>";
  if (!src.includes(RULES)) throw new Error("не нашёл rules()");
  src = src.replace(RULES, "  const rules = () => globalThis.__rules ||");

  const exportCode = `
  globalThis.__t = {
    update, reset, spawn, blockCost, fieldLoad, alive, rules, solve, dropBomb,
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

    // ---- для ИИ-игрока: настоящие кнопки, а не обход правил ----------------
    // Бот обязан ходить через них: они списывают запасы, держат паузу между
    // выстрелами и сжигают комбо ровно так же, как у человека. Всё, что мимо,
    // — это уже не измерение игры, а измерение чего-то другого.
    shootLetter, shootBlock, dropBomb, hint, takePick, draftRows,
    W, H, CANNON_SPEED, SHOT_SPEED, SHOT_COOLDOWN, MAX_SHOTS, STRIKES_TO_BREAK,
    speedNow, loadMul, loadNow, mods, draft, glossOf,
    get cannonX() { return cannonX; }, set cannonX(v) { cannonX = v; },
    get cooldown() { return cooldown; },
    get shots() { return shots; },
    get shells() { return shells; },  get tips() { return tips; },
    get lap() { return lap; },
    get stageSpawned() { return stageSpawned; },
    get poolDry() { return poolDry; },
    // Техническая сводка: показана ли, что с ней в разметке и что в ней написано.
    get rulesShown() { return showRules; },
    get rulesDisplay() { return el.rules.style.display; },
    get rulesText() { return el.rules.innerHTML; },
    // Ровно то, что видит игрок в панели: круг, этап и слова этапа. Стенду нужны
    // они, а не пересчёт по состоянию, — иначе проверялась бы копия формулы, а не
    // то, что на экране. Склеено через «·» просто чтобы было чем разбирать.
    // Склейка конкатенацией, а не шаблоном: весь этот блок сам лежит внутри
    // шаблонной строки харнесса, и вложенные бэктики её рвут.
    get hudLevel() {
      return el.lap.textContent + "\\u00b7" + el.stage.textContent +
             "\\u00b7" + el.words.textContent;
    },

    // Язык бота: тот же корпус, что у игры. Словарный запас бота — его
    // подмножество по рангу, см. tools/ai/player.mjs.
    get lang() { return lang; },
    BY_LEN, rankOf, ALPHABET,

    // ---- автопилот ---------------------------------------------------------
    // Ядро решений ИИ-игрока живёт в самой игре, а не здесь: двух копий быть не
    // должно, иначе Node мерил бы не то, что играет человек. См. docs/ai.md.
    makeAutopilot, BOT_CLASSES, BOT_KNOBS, BOT_POLICY,
    // cellAt — то, чем игра читает попадание в букву. Нужен, чтобы проверять
    // наводку бота её же формулой, а не копией формулы.
    cellAt, needsAim,

    // ---- только для прежней модели игрока (tools/ai/legacy.mjs) ------------
    // Буква, попавшая в блок, без баллистики: прежняя модель считала время на
    // слово и считала букву доставленной. Через них она платит настоящим
    // комбо, настоящими промахами и настоящей порчей слова, но не платит за
    // наводку и полёт, которых у неё не было. Новый бот ими не пользуется —
    // он стреляет из пушки, как человек.
    land: { fill, wrongLetter },

    // ОРАКУЛ. Знает про слово то, чего игрок не видит. Новому боту недоступен:
    // граница восприятия у него своя и живёт в игре — botSee(). Здесь оракул
    // нужен прежней модели, у которой представления о словах нет вовсе, только
    // вероятность попасть, и стендам, которые проверяют самого бота.
    oracle: { acceptsAt, gapChoices, neighboursOf },
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
    getElementById: () => ({ textContent: "", innerHTML: "", style: {} }),
    querySelectorAll: () => [],
    addEventListener: noop,
  };
  document.getElementById = id =>
    id === "game" ? canvas : { textContent: "", innerHTML: "", style: {} };
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
