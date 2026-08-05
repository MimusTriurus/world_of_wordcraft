// Проверка демо-режима: игра сама после загрузки, мигающее приглашение, выход по
// кнопке, перезапуск после GAME OVER, отсутствие записи в рекорды. Плюс то, что
// демо доигрывает ЗА открытым меню и не закрывает его собой.
//
// Кадр здесь настоящий — frame(now), а не update(dt), как в гонялках: проверяется
// именно склейка кадра, экранов и автопилота.
//
//   node tools/ai/attract-check.mjs
import { readFileSync } from "node:fs";
import { boot } from "../sim/harness.mjs";

const HTML = new URL("../../word-shooter.html", import.meta.url);

// Часы фиксируем ДО загрузки: startAttract берёт сид демо у Date.now, и без этого
// каждый прогон играл бы другой бот, а числа гуляли бы от запуска к запуску. В
// браузере разнообразие как раз нужно, в стенде — мешает.
Date.now = () => 1700000000000;

const g = boot(11);
const fail = [];
const ok = (n, c) => { console.log((c ? "ok   " : "ПЛОХО") + "  " + n); if (!c) fail.push(n); };
let now = 0;
const run = frames => { for (let i = 0; i < frames; i++) { now += 1000 / 60; g.frame(now); } };
const click = () => g.pointer("pointerdown", { button: 0, clientX: 200, clientY: 300 });

// ---- 1. после загрузки игра играет сама, с третьего круга -------------------
g.startAttract();
ok("демо включено сразу", g.attract === true);
ok(`круг демо ${g.lap} (ждём ${g.ATTRACT_LAP})`, g.lap === g.ATTRACT_LAP);
// Демо обучения не проходит: объяснять кнопки некому, а три остановки подряд
// смотрелись бы поломкой. Слоты открыты с первого кадра, обойма полная.
ok(`все три слота открыты сразу (${g.unlocked.size})`, g.unlocked.size === 3);
ok(`обойма полная: ${g.shells}/${g.bombs}/${g.tips}`,
   g.shells === 3 && g.bombs === 1 && g.tips === 2);
run(60 * 40);
ok(`демо играет само: решено ${g.solved}`, g.solved > 3);
// Демо не заводит своего состояния: у него обычные play / draft / over.
ok(`состояние обычное (${g.state})`, ["play", "draft", "over"].includes(g.state));

// ---- 2. приглашение мигает ---------------------------------------------------
// Считаем «включено» по той же формуле, что в drawAttract, на протяжении
// нескольких периодов: должны увидеть и включённое, и выключенное.
let on = 0, off = 0;
for (let i = 0; i < 60 * 5; i++) {
  now += 1000 / 60; g.frame(now);
  ((g.attractT % g.ATTRACT_BLINK) / g.ATTRACT_BLINK < g.ATTRACT_DUTY ? on++ : off++);
}
ok(`мигает: видно ${on} кадров, скрыто ${off}`, on > 30 && off > 30);
const duty = on / (on + off);
ok(`доля видимости ${(duty * 100).toFixed(0)}% ≈ ${(g.ATTRACT_DUTY * 100).toFixed(0)}%`,
   Math.abs(duty - g.ATTRACT_DUTY) < 0.08);
g.drawAttract();
ok("drawAttract не падает", true);

// Рамка приглашения: целиком в поле и по центру. Считается той же арифметикой,
// что в drawAttract, и той же мерой текста, что у самой игры. Место уже один раз
// оказывалось не там, где думали, — из-за базовой линии, доставшейся от
// предыдущего рисующего.
{
  const big = "НАЖМИ ЛЮБУЮ КНОПКУ";
  const font = `bold ${g.ATTRACT_SIZE}px 'Courier New', monospace`;
  const bw = Math.min(g.W - 20, g.measure(big, font) + 44);
  const bh = g.ATTRACT_SIZE * 2;
  const bx = (g.W - bw) / 2, by = (g.H - bh) / 2;
  ok(`рамка ${bw.toFixed(0)}×${bh} в поле ${g.W}×${g.H}`,
     bx >= 0 && bx + bw <= g.W && by >= 0 && by + bh <= g.H);
  ok(`середина рамки на ${(by + bh / 2).toFixed(0)} при центре поля ${g.H / 2}`,
     Math.abs(by + bh / 2 - g.H / 2) < 1);
  ok(`не задевает линию смерти (${(by + bh).toFixed(0)} против ${g.DANGER_Y})`,
     by + bh < g.DANGER_Y);

  // Место у приглашения одно на все состояния, и оно рисуется поверх любого
  // окна. Проверяется журналом холста: рамка приглашения должна лечь ПОСЛЕ
  // панели раздачи и на той же высоте, что и в обычной игре. Прыгающая надпись
  // читается как сбой, а молчащая — как «демо кончилось».
  const wasKind = g.draft.kind, wasStocked = g.draft.stocked, wasState = g.state;
  for (const kind of ["supply", "upgrade"]) {
    g.draft.kind = kind;
    g.draft.stocked = kind === "upgrade";
    g.draft.cards = g.UPGRADES.slice(0, 3);
    g.state = "draft";
    // Мигание фиксируем на видимой фазе: иначе кадр может попасть в паузу.
    while ((g.attractT % g.ATTRACT_BLINK) / g.ATTRACT_BLINK >= g.ATTRACT_DUTY) {
      now += 1000 / 60; g.frame(now);
    }
    g.record(true);
    g.draw();
    g.record(false);
    const rects = g.draws.filter(d => d.op === "rect");
    const invite = rects.filter(d => Math.abs(d.w - (bw - 2)) < 2);
    ok(`${kind}: рамка приглашения нарисована (${invite.length})`, invite.length === 1);
    if (invite.length === 1) {
      ok(`${kind}: на той же высоте, что и в игре (${invite[0].y.toFixed(0)} ≈ ${by + 1})`,
         Math.abs(invite[0].y - (by + 1)) < 1);
      const panel = rects.filter(d => Math.abs(d.w - g.W) < 1);
      ok(`${kind}: панель раздачи нарисована раньше приглашения`,
         panel.length > 0 && rects.indexOf(panel[0]) < rects.indexOf(invite[0]));
    }
  }
  g.draft.kind = wasKind; g.draft.stocked = wasStocked; g.state = wasState;
}

// ---- 3. экран раздачи видно глазами ------------------------------------------
// Бот выбирал в тот же кадр, в котором экран открылся, поэтому раздачи никто не
// видел. Теперь он смотрит на список, наводит курсор и подтверждает.
let draftFrames = 0, drafts = 0, wasDraft = false;
const cursor = new Set();
for (let i = 0; i < 60 * 600; i++) {
  now += 1000 / 60; g.frame(now);
  const d = g.state === "draft";
  if (d) { draftFrames++; cursor.add(g.draft.index); }
  if (d && !wasDraft) drafts++;
  wasDraft = d;
}
const perDraft = drafts ? draftFrames / drafts / 60 : 0;
// Порог 2 с, а не «хоть сколько»: при 1.3 с экран было видно, а сам выбор — нет,
// зритель не успевал связать курсор с тем, что прибавилось.
ok(`раздач ${drafts}, экран стоит ~${perDraft.toFixed(2)} с — это видно`,
   drafts > 0 && perDraft > 2);
ok(`курсор побывал на строках ${[...cursor].sort().join(", ")}`, cursor.size >= 2);

// ---- 4. динамических надписей в панели больше нет ----------------------------
// Блок .msg убран целиком: он пересказывал экран («Есть! Осталось: 2», шаблон
// слова на промахе, «+3 снаряда») и затирался на каждом выстреле.
//
// Строчные комментарии выкидываем: удалённое положено объяснять на месте, и без
// этого проверки ловят собственные пояснения. Первая версия так и провалилась —
// «под пушкой не рисуется буква» упало на слове lastKeyAt в комментарии о том,
// что её больше нет.
const html = readFileSync(HTML, "utf8");
const code = html.replace(/^[ \t]*\/\/.*$/gm, "");
ok("в разметке нет блока сообщений", !/id="msg"/.test(code));
ok("в коде не осталось setMsg-вызовов", !/setMsg\(/.test(code));
ok("под пушкой не рисуется буква выстрела", !/lastKey/.test(code));
ok("приглашение демо без пояснительной строки", !/ИГРАЕТ АВТОПИЛОТ/.test(code));
ok("мёртвого состояния и хелперов не осталось",
   !/lapGrowth|stockLine|\bgot:/.test(code));

// ---- 5. язык только в модификаторах -----------------------------------------
const langItem = g.SCREENS.mods.find(i => i.label === "Язык");
ok("пункт «Язык» есть в модификаторах", !!langItem);
ok(`показывает текущий (${langItem.value()})`, langItem.value() === g.lang.toUpperCase());

// ---- 6. техническая сводка спрятана и открывается нулём ----------------------
g.startAttract();
ok("после загрузки сводка скрыта",
   g.rulesShown === false && g.rulesDisplay === "none");
ok("пока скрыта — не собирается", g.rulesText === "");
g.key("0");
ok("ноль показывает сводку", g.rulesShown === true && g.rulesDisplay === "block");
ok(`в сводке есть содержимое (${g.rulesText.split("<br>")[0]})`,
   g.rulesText.includes("<br>") && g.rulesText.length > 40);
ok("демо от нуля не прервалось", g.attract === true);
g.key("0");
ok("ноль убирает сводку", g.rulesShown === false && g.rulesDisplay === "none");
ok("демо всё ещё идёт", g.attract === true);

// ---- 7. пушкой распоряжается бот, а не мышь ---------------------------------
const before = g.cannonX;
g.pointer("pointermove", { clientX: 5, clientY: 5 });
ok("мышь не таскает пушку в демо", g.cannonX === before);

// ---- 8. Escape уводит в меню, остальное начинает забег -----------------------
g.key("Escape");
ok("Escape → меню, демо не погашено", g.inMenu === true && g.attract === true);

// Самое хрупкое место: идущее демо само меняет state (граница этапа — "draft",
// смерть — "over"), и пока «меню открыто» означало state === "ready", первая же
// граница этапа стирала меню.
//
// Решённые слова считаем приращениями, а не разницей концов: за пять минут демо
// может успеть умереть и перезапуститься, и тогда счётчик обнулится. На этом
// спотыкнулась первая версия проверки — «решено 10 → 9» выглядело провалом, хотя
// это был перезапуск.
const stageAtMenu = g.stage;
let solvedTotal = 0, prev = g.solved, restarts = 0;
let sawStageChange = false, sawDraft = false, menuHeld = true;
for (let i = 0; i < 60 * 300; i++) {
  now += 1000 / 60; g.frame(now);
  if (g.solved >= prev) solvedTotal += g.solved - prev; else restarts++;
  prev = g.solved;
  if (!g.inMenu) menuHeld = false;
  if (g.state === "draft") sawDraft = true;
  if (g.stage !== stageAtMenu) sawStageChange = true;
}
ok(`демо играет за меню: решено ${solvedTotal} слов, перезапусков ${restarts}`,
   solvedTotal > 5);
ok("меню не закрылось само ни разу", menuHeld && g.inMenu === true);
ok(`границу этапа пережило (этап ${stageAtMenu} → ${g.stage})`, sawStageChange);
// Прогон мог кончиться ВНУТРИ раздачи: экран живёт до трёх с лишним секунд, и
// «сейчас draft» это не «бот её не разобрал». Досчитываем до выхода, с пределом.
// Раньше проверка смотрела последний кадр и падала от совпадения.
ok("экран раздачи за меню вообще был", sawDraft);
let extra = 0;
while (g.state === "draft" && extra < 60 * 8) { now += 1000 / 60; g.frame(now); extra++; }
ok(`раздача за меню разобрана ботом (доиграно ${extra} кадров)`,
   g.state !== "draft");
g.drawMenu();
ok("drawMenu поверх идущего демо не падает", true);

// меню при этом рабочее: листаем на модификаторы и обратно
g.key("ArrowDown"); g.key("Enter");
ok(`меню отвечает: экран ${g.menu.screen}`, g.menu.screen === "mods");
g.key("Escape");
ok("Escape из модификаторов — в корень, не к демо",
   g.menu.screen === "root" && g.inMenu === true);
g.key("Escape");
ok("Escape из корня — назад к демо", g.inMenu === false && g.attract === true);

// круг демо не должен подменяться пунктом «Стартовый круг»
g.startAttract();
g.key("Escape");
const lapUnderMenu = g.lap;
g.SCREENS.mods.find(i => i.label === "Стартовый круг").cycle(1);
ok(`круг идущего демо не тронут (${lapUnderMenu})`, g.lap === lapUnderMenu);
// Выходим из меню ровно одним Escape: второй завёл бы обратно, а startAttract
// открытое меню намеренно сохраняет — на этом и спотыкнулась первая версия.
g.key("Escape");
ok("вышли из меню к приглашению", g.inMenu === false && g.attract === true);

g.startAttract();
run(30);
g.key("Shift");
ok("голый Shift демо не прерывает", g.attract === true);
g.key("a");
ok("любая кнопка → забег", g.attract === false && g.state !== "ready");

g.startAttract();
run(30);
click();
ok("клик → забег", g.attract === false && g.state !== "ready");

// ---- 9. демо попадает в рекорды, но помечено ---------------------------------
// Раньше забег демо не записывался вовсе. Теперь он идёт в общую таблицу с
// пометкой «бот» и со звёздочкой послабления: демо начинает с ATTRACT_LAP, то есть
// с готовым множителем очков.
g.startAttract();
const rec = g.bestOf(g.lang).length;
ok("recordRun в демо возвращает место", g.recordRun() >= 0);
ok(`таблица выросла (${rec} → ${g.bestOf(g.lang).length})`,
   g.bestOf(g.lang).length === rec + 1);
ok("строка помечена ботом и послаблением",
   g.lastRow.bot === true && g.lastRow.easy === true);

// ---- 10. кончилось — перезапустилось само -----------------------------------
g.startAttract();
let guard = 0;
while (g.state !== "over" && guard++ < 60 * 60 * 12) { now += 1000 / 60; g.frame(now); }
ok("демо когда-нибудь проигрывает", g.state === "over");
const lapAtDeath = g.lap;
run(Math.ceil(60 * (g.ATTRACT_RESTART + 0.5)));
ok("демо перезапустилось само", g.attract === true &&
   g.state !== "over" && g.lives === 3 && g.lap === g.ATTRACT_LAP);
ok(`цикл кадров не встал после перезапуска (круг был ${lapAtDeath})`, true);
run(60 * 20);
ok(`после перезапуска играет: решено ${g.solved}`, g.solved > 0);

// ---- 11. перезапуск демо не закрывает открытое меню -------------------------
g.startAttract();
g.key("Escape");                     // игрок ушёл в меню и там остался
ok("в меню", g.inMenu === true);
let guard2 = 0, closed = false;
while (guard2++ < 60 * 60 * 20) {    // ждём смерти демо и перезапуска
  now += 1000 / 60; g.frame(now);
  if (!g.inMenu) { closed = true; break; }
  if (g.lives === 3 && g.solved === 0 && guard2 > 60 * 30) break;
}
ok("меню выжило перезапуск демо", !closed && g.inMenu === true);
ok("демо после перезапуска живо", g.attract === true);

// ---- 12. из меню можно начать свой забег ------------------------------------
g.key("Enter");                      // «Начать игру» — первый пункт
ok("свой забег начат, демо погашено",
   g.attract === false && g.inMenu === false && g.state !== "ready");

console.log(fail.length ? "\nПРОВАЛЕНО: " + fail.join("; ") : "\nвсё сошлось");
process.exit(fail.length ? 1 : 0);
