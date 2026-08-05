// Проверка экрана паузы и экрана конца забега.
//
// Пауза — это меню поверх незакрытого забега, а «Назад» из модификаторов должно
// возвращать туда, откуда пришли, — в паузу, а не в корень. Раньше возвращало
// всегда в корень, и забег терялся.
//
// Заодно здесь живут проверки ширины: корпус игры один раз растянуло строкой
// подсказки, а ряд «круг · этап · слова» упирался в рамку панели.
//
//   node tools/ai/screens-check.mjs
import { readFileSync } from "node:fs";
import { boot } from "../sim/harness.mjs";

const HTML = new URL("../../word-shooter.html", import.meta.url);

Date.now = () => 1700000000000;         // демо сеется от часов, см. attract-check

const g = boot(21);
const fail = [];
const ok = (n, c) => { console.log((c ? "ok   " : "ПЛОХО") + "  " + n); if (!c) fail.push(n); };
let now = 0;
const run = n => { for (let i = 0; i < n; i++) { now += 1000 / 60; g.frame(now); } };
const item = (screen, label) => g.SCREENS[screen].findIndex(i => i.label === label);
const pick = label => {                 // навести курсор и нажать ENTER
  g.menu.index = item(g.menu.screen, label);
  g.key("Enter");
};

// ---- 1. Escape в игре поднимает меню паузы ----------------------------------
g.reset(true);
run(120);
ok(`забег идёт (${g.state})`, g.state === "play");
g.key("Escape");
ok("пауза: мир стоит, меню поднято",
   g.state === "pause" && g.inMenu === true && g.menu.screen === "pause");
ok("заголовок экрана есть", g.MENU_TITLES.pause === "ПАУЗА");
const need = ["Продолжить", "Модификаторы", "Рекорды", "Начать заново", "Выйти"];
ok(`пункты: ${g.SCREENS.pause.map(i => i.label).join(", ")}`,
   need.every(l => item("pause", l) >= 0));

// мир действительно заморожен
const blocksAt = g.blocks.length, ys = g.blocks.map(b => b.y).join(",");
run(120);
ok("на паузе поле не двигается",
   g.blocks.length === blocksAt && g.blocks.map(b => b.y).join(",") === ys);

// ---- 2. «Назад» возвращает в паузу, а не в корень ----------------------------
pick("Модификаторы");
ok(`ушли в модификаторы (${g.menu.screen})`, g.menu.screen === "mods");
g.key("Escape");
ok("Escape вернул в паузу, забег жив",
   g.menu.screen === "pause" && g.state === "pause");
ok("курсор встал на «Модификаторы»",
   g.SCREENS.pause[g.menu.index].label === "Модификаторы");
pick("Рекорды");
ok(`ушли в рекорды (${g.menu.screen})`, g.menu.screen === "best");
pick("Назад");
ok("«Назад» из рекордов вернуло в паузу", g.menu.screen === "pause");

// ---- 3. Escape и «Продолжить» снимают паузу ----------------------------------
g.key("Escape");
ok("Escape с экрана паузы продолжает забег",
   g.state === "play" && g.inMenu === false);
g.key("Escape"); pick("Продолжить");
ok("«Продолжить» тоже", g.state === "play" && g.inMenu === false);

// ---- 4. «Начать заново» и «Выйти» -------------------------------------------
g.key("Escape"); pick("Начать заново");
// Экрана раздачи на старте нет: обойма выдаётся целиком, забег начинается сразу.
ok("«Начать заново» начало забег", g.inMenu === false && g.attract === false &&
   g.lives === 3 && g.state === "play");
ok("обойма на старте полная",
   g.shells === 3 && g.bombs === 1 && g.tips === 2);
run(60);
g.key("Escape"); pick("Выйти");
ok("«Выйти» включило демо без меню",
   g.attract === true && g.inMenu === false && g.lap === g.ATTRACT_LAP);
run(60);
ok("демо играет", g.state === "play" || g.state === "draft");

// ---- 5. из корня «Назад» по-прежнему ведёт в корень --------------------------
g.reset();                              // в меню
ok(`в корне (${g.menu.screen})`, g.menu.screen === "root" && g.inMenu === true);
pick("Модификаторы");
g.key("Escape");
ok("из корня Escape вернул в корень", g.menu.screen === "root");

// ---- 6. экран конца забега показывает таблицу --------------------------------
g.reset(true);
run(60);
g.score = 12345;
g.lives = 1;
g.loseLife(g.blocks.find(b => b.state === "live") || g.blocks[0]);
ok(`забег кончился (${g.state})`, g.state === "over");
ok(`строк в таблице: ${g.bestOf(g.lang).length}`, g.bestOf(g.lang).length > 0);
ok(`своё место запомнено: ${g.lastPlace}`, g.lastPlace >= 0);
ok("и это забег игрока, а не бота", g.lastBot === false);
g.drawGameOver();
ok("drawGameOver не падает", true);
g.draw();
ok("draw на конце забега не падает", true);

// Таблица целиком укладывается в холст — и на конце забега, и в меню рекордов, где
// над ней ещё заголовок, а под ней пункты. Высоту берём у игры: в прошлый раз
// здесь стояла копия формулы, и она отставала от кода.
{
  // Худший случай: видна вся пятёрка и своя строка под ней.
  const worst = g.BEST_LABEL + g.BEST_HEAD + g.BEST_SHOW * g.BEST_STEP +
                g.BEST_GAP + g.BEST_STEP;
  ok(`сейчас таблица ${g.recordsH()} px, в худшем случае ${worst}`,
     g.recordsH() <= worst);
  ok(`экран конца забега ${40 + worst + 26} px из ${g.H}`,
     40 + worst + 26 <= g.H - 12);
  const MENU_HEAD = 92, MENU_STEP = 44, MENU_FOOT = 46;
  const best = MENU_HEAD + worst + g.SCREENS.best.length * MENU_STEP + MENU_FOOT;
  ok(`экран рекордов ${best} px из ${g.H}`, best <= g.H - 12);
}

// ---- 7. демо кончается той же таблицей --------------------------------------
g.startAttract();
g.state = "over";
g.draw();
ok("draw на конце демо не падает", true);
g.drawGameOver();
ok("таблица в демо рисуется", true);

// ---- 8. корпус не растягивается подсказкой -----------------------------------
// Ширину корпуса задаёт самый широкий его ребёнок. Строки подсказки ничем не
// ограничены по длине, и одна разросшаяся строка растягивала игру почти вдвое:
// 1036 px против 614 у экрана. Проверяем и предел, и то, что числа CSS не
// разошлись со скриптом.
{
  const html = readFileSync(HTML, "utf8");
  const fw = +/--field-w:\s*(\d+)px/.exec(html)[1];
  const hw = +/--hud-w:\s*(\d+)px/.exec(html)[1];
  ok(`--field-w (${fw}) совпадает с W в скрипте (${g.W})`, fw === g.W);
  ok("у подсказки есть предел ширины", /\.hint\s*\{[^}]*max-width/.test(html));

  const screen = fw + 8 + hw + 16 + 8;   // просвет, отступы и рамка .screen
  const body = /<div class="hint">([\s\S]*?)<\/div>/.exec(html)[1];
  const lines = body.split(/<br>/)
    .map(l => l.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim())
    .filter(Boolean);
  const wide = lines.filter(l => l.length * 0.6 * 11 > screen);
  ok(`строк подсказки ${lines.length}, шире экрана (${screen} px): ${wide.length}`,
     wide.length === 0);

  // ---- ряд «круг · этап · слова» не упирается в рамку ------------------------
  // Он один раз уже упёрся, и не из-за арифметики: у значений стоял класс small,
  // у `.hud .value.small` та же специфичность, что у `.hud .trio .value`, и
  // объявлен он ниже — числа рисовались 20 px вместо 16, ряд занимал 134 px из
  // 112. Поэтому проверяем и то, что класса нет, и саму ширину.
  const trio = /<div class="trio">([\s\S]*?)<\/div>\s*<div class="label">COMBO/
    .exec(html)[1];
  ok("у значений трио нет класса small (его перебивал бы .value.small)",
     !/class="value small"/.test(trio));
  const size = +/\.hud \.trio \.value \{[^}]*font-size:\s*(\d+)px/.exec(html)[1];
  const gap = +/\.hud \.trio \{[^}]*gap:\s*(\d+)px/.exec(html)[1];
  // предельные строки: круг «10», этап «1/3», слова «10/10»
  const row = [2, 3, 5].reduce((s, n) => s + n * 0.6 * size, 0) + 2 * gap;
  ok(`ряд в худшем случае ${row.toFixed(0)} px из ${hw} (кегль ${size}, просвет ${gap})`,
     row <= hw - 4);
}

console.log(fail.length ? "\nПРОВАЛЕНО: " + fail.join("; ") : "\nвсё сошлось");
process.exit(fail.length ? 1 : 0);
