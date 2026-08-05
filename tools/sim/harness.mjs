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
  // заглушке-пустышке падает. Courier моноширинный — знак занимает 0.6 кегля,
  // так что ширина считается точно, с точностью до слова.
  //
  // Кегль берётся из ctx.font, а не зашит: раньше стояло 7.8 px на символ, ровно
  // 0.6 × 13 под шрифт подсказки, и для всего остального заглушка врала. Пока
  // мерили только подсказку, это не проявлялось.
  const base = {
    measureText(s) {
      const m = /(\d+(?:\.\d+)?)px/.exec(this.font || "13px");
      return { width: s.length * 0.6 * (m ? +m[1] : 13) };
    },
  };
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
    // draw нужен стендам, которые проверяют, что новая отрисовка хотя бы не
    // падает: холст здесь — Proxy, глотающий вызовы, картинки из этого не выйдет.
    draw,
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
    // Экран раздачи и порции. Нужны, чтобы поднять обратно прежнюю схему старта
    // — пустая обойма и выбор одной строки — и сравнить её с нынешней. См.
    // tools/ai/start-probe.mjs.
    openDraft, SUPPLIES,
    // Геометрия панели раздачи. Шапка растёт, когда за круг пришла обойма, и
    // стенду нужны настоящие числа игры, а не их копия: разъехавшаяся шапка
    // сдвигает и попадание мышью, потому что draftAt считает по draftRect.
    draftTop, draftHead, draftRect, DRAFT_W,
    // Подсказки на поле: карточка теперь не мгновенна, сперва по слову проходит
    // луч. Снаряды в воздухе уже отдаются ниже, вместе с остальным стволом, — и
    // снос сноса теперь тоже летит, а не срабатывает на месте.
    get hints() { return hints; },
    // Осколки снесённого слова: буквы разлетаются и бьются о другие блоки.
    get shards() { return shards; },
    get sparks() { return sparks; },
    SCAN_TIME, SHARD_MAX, SHARD_SPEED,
    // Взятые за забег улучшения. Тринадцать из четырнадцати — заглушки, но
    // ПЕРЕПЛАВКА работает, и стендам нужно её включать.
    taken, UPGRADES, cellCenter,
    // Иконки улучшений. Стенду нужны, чтобы ловить пункт без иконки: рисуются
    // они примитивами холста, и отсутствие валит весь экран раздачи.
    ICONS,
    W, H, CANNON_SPEED, SHOT_COOLDOWN, MAX_SHOTS, STRIKES_TO_BREAK,
    // Показ выстрела у дула. Отдельный список и отдельные часы: буква улетает
    // сразу, показ живёт параллельно и игрового времени не занимает.
    MUZZLE_SHOW, MUZZLE_KEEP, SHOT_FAST, SHOT_BIG, SHOT_SMALL, SHOT_Y0,
    SHELL_SPEED,
    get muzzles() { return muzzles; },
    speedNow, loadMul, loadNow, mods, draft, glossOf,
    get cannonX() { return cannonX; }, set cannonX(v) { cannonX = v; },
    get cooldown() { return cooldown; },
    get shots() { return shots; },
    // Кошельки пишутся только затем, чтобы отменить стартовую выдачу и померить
    // прежнюю схему. В самой игре прибавка живёт в одном месте, stock().
    get shells() { return shells; },  set shells(v) { shells = v; },
    get tips() { return tips; },      set tips(v) { tips = v; },
    get lap() { return lap; },
    get stageSpawned() { return stageSpawned; },
    get poolDry() { return poolDry; },
    // Панель: сначала view-модель, и только потом разметка. hudView() — то, что
    // игра решила показать; el.* — то, что доехало до DOM. Стендам почти всегда
    // нужна первая: пересчитывать состояние самим значило бы проверять копию
    // формулы, а не то, что на экране.
    hudView,
    // Техническая сводка: показана ли, что с ней в разметке и что в ней написано.
    get rulesShown() { return showRules; },
    get rulesDisplay() { return el.rules.style.display; },
    get rulesText() { return el.rules.innerHTML; },
    // Круг, этап и слова этапа одной строкой — склеено через «·» просто чтобы
    // было чем разбирать. Читается из элементов, а не из hudView(): так проверка
    // заодно доказывает, что view-модель доезжает до разметки. Склейка
    // конкатенацией, а не шаблоном: весь этот блок сам лежит внутри шаблонной
    // строки харнесса, и вложенные бэктики её рвут.
    get hudLevel() {
      return el.lap.textContent + "\\u00b7" + el.stage.textContent +
             "\\u00b7" + el.words.textContent;
    },

    // Мера текста. Разбивка подсказки на строки — единственное место, где
    // правилам нужен шрифт; подменяется целиком, холст для этого не нужен.
    get measure() { return measure; }, set measure(v) { measure = v; },

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

    // ---- экраны и кадр -----------------------------------------------------
    // Всё, что нужно стендам про интерфейс: сам кадр (гонялки его обходят и
    // зовут update напрямую), экраны меню, демо и отрисовку. Рисовать в Node
    // нельзя — холст глотает вызовы, — но упасть отрисовка может, и падала:
    // улучшение без иконки валило весь экран раздачи.
    frame, draw, drawMenu, drawDraft, drawGameOver, drawAttract,
    startAttract, pauseGame, resume, recordRun, loseLife,
    SCREENS, MENU_TITLES, menu, el, syncHud, hudView, rulesView, ICONS, UPGRADES,
    ATTRACT_LAP, ATTRACT_CLASS, ATTRACT_RESTART, ATTRACT_BLINK, ATTRACT_DUTY,
    ATTRACT_SIZE,
    get attract() { return attract; },
    get inMenu() { return inMenu; },
    get attractT() { return attractT; },
    get records() { return records; },
    get lastPlace() { return lastPlace; },
    get autopilot() { return autopilot; },
    get lives() { return lives; },  set lives(v) { lives = v; },
    set score(v) { score = v; },
    get bestCombo() { return bestCombo; },
  };`;
  const tail = "  requestAnimationFrame(frame);\n})();";
  if (!src.includes(tail)) throw new Error("не нашёл хвост цикла");
  src = src.replace(tail, exportCode + "\n})();");

  const store = new Map();
  // Обработчики событий запоминаем, а не глотаем: стенды экранов дёргают их как
  // браузер. Один объект на клавиши и на мышь — имена типов не пересекаются.
  const events = {};
  const listen = (t, h) => { events[t] = h; };
  const canvas = {
    width: 0, height: 0, style: {},
    getContext: () => fakeCtx(),
    addEventListener: listen,
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 470, height: 660 }),
  };
  const document = {
    getElementById: id =>
      id === "game" ? canvas : { textContent: "", innerHTML: "", style: {} },
    querySelectorAll: () => [],
    addEventListener: listen,
  };
  const window = { devicePixelRatio: 1, addEventListener: listen };
  const localStorage = {
    getItem: k => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, v),
  };
  const performance = { now: () => 0 };

  Math.random = mulberry32(seed);
  new Function("document", "window", "localStorage", "performance",
               "requestAnimationFrame", src)
    (document, window, localStorage, performance, () => 0);

  // Настоящие события. Дописываются здесь, а не в экспорте внутри игры: там нет
  // доступа к замыканию харнесса, где лежат сами обработчики.
  //
  // Стенды дёргают их так же, как браузер, и это принципиально: проверять
  // клавишу «0» прямым вызовом syncHud() значило бы проверять свою же догадку о
  // том, что эта клавиша делает.
  const api = globalThis.__t;
  const noEvent = { preventDefault: noop, key: "", code: "", button: 0 };
  api.key = e => events.keydown &&
    events.keydown(Object.assign({}, noEvent, typeof e === "string" ? { key: e } : e));
  api.keyUp = e => events.keyup &&
    events.keyup(Object.assign({}, noEvent, typeof e === "string" ? { key: e } : e));
  api.pointer = (type, e) => events[type] &&
    events[type](Object.assign({}, noEvent, e));
  return api;
}
