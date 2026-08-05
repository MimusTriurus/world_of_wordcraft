// Таблица рекордов: два счёта на одном экране.
//
// Бот играет заметно лучше человека, поэтому в общей десятке он занял бы её
// целиком. Счётов два — своя десятка у игрока, своя тройка у бота, — и они не
// конкурируют за строки. Проверяется, что забег ложится в свою таблицу, что
// строки игрока читаются в полную силу, а строки бота бледнее, и что рамка своего
// забега встаёт в том блоке, куда забег и лёг.
//
// Картинку в Node снять нельзя, но журнал отрисовки харнесса пишет прозрачность
// и текст в том порядке, в каком их выдал холст, — этого хватает.
//
//   node tools/ai/records-check.mjs
import { boot } from "../sim/harness.mjs";

const DT = 1 / 60;
const fail = [];
const ok = (n, c) => { console.log((c ? "ok   " : "ПЛОХО") + "  " + n); if (!c) fail.push(n); };

const g = boot(7);

// Забег до конца: жизни отбираем сами, играть незачем — считаем таблицы.
function finishRun(score) {
  g.reset(true);
  for (let i = 0; i < 60; i++) g.update(DT);
  g.score = score;
  g.lives = 1;
  g.loseLife(g.blocks.find(b => b.state === "live") || g.blocks[0]);
}

// ---- 1. забег игрока — в таблицу игрока --------------------------------------
finishRun(5000);
ok(`забег кончился (${g.state})`, g.state === "over");
ok(`строк у игрока ${g.records.length}, у бота ${g.botRecords.length}`,
   g.records.length === 1 && g.botRecords.length === 0);
ok("место в таблице игрока", g.lastPlace === 0 && g.lastBot === false);

// ---- 2. забег бота — в таблицу бота, и десятку игрока он не занимает ---------
g.mods.autopilot = true;
for (const s of [400000, 300000, 200000, 100000]) finishRun(s);
g.mods.autopilot = false;
ok(`у игрока по-прежнему ${g.records.length} строка`, g.records.length === 1);
ok(`у бота ${g.botRecords.length} при пределе ${g.BOT_MAX}`,
   g.botRecords.length === g.BOT_MAX);
ok("слабейший забег бота вытеснен, а не забег игрока",
   g.botRecords.every(r => r.score >= 200000));
ok("место в таблице бота", g.lastBot === true);
ok("очки игрока в его таблице целы", g.records[0].score === 5000);

// ---- 3. демо тоже пишется боту, и со звёздочкой ------------------------------
// Демо начинает с ATTRACT_LAP, то есть с готовым множителем очков: такой забег
// помечается послаблением так же, как забег игрока с бесконечными подсказками.
{
  const before = g.botRecords.length;
  g.startAttract();
  for (let i = 0; i < 60; i++) g.update(DT);
  g.score = 999999;
  g.lives = 1;
  g.loseLife(g.blocks.find(b => b.state === "live") || g.blocks[0]);
  ok(`демо кончилось и записалось боту (${before} → ${g.botRecords.length})`,
     g.lastBot === true && g.botRecords[0].score === 999999);
  ok("забег демо помечен послаблением", g.botRecords[0].easy === true);
}

// ---- 4. блоки подписаны, строки бота бледнее --------------------------------
g.record(true);
g.drawRecords(0);
g.record(false);
const texts = g.draws.filter(d => d.op === "text");
ok(`нарисовано строк текста: ${texts.length}`, texts.length > 0);
ok("блок игрока подписан", texts.some(d => d.text === "ИГРОК"));
ok("блок бота подписан", texts.some(d => d.text === "БОТ"));
{
  const own = String(g.records[0].score);
  const bot = String(g.botRecords[0].score) + (g.botRecords[0].easy ? "*" : "");
  const mine = texts.find(d => d.text === own);
  const its = texts.find(d => d.text === bot);
  ok(`очки игрока «${own}» на месте, прозрачность ${mine && mine.alpha}`,
     !!mine && mine.alpha === 1);
  ok(`очки бота «${bot}» на месте, прозрачность ${its && its.alpha}`,
     !!its && its.alpha < 1);
}
// Шапка со именами столбцов одна на оба блока.
ok(`«ОЧКИ» нарисовано ${texts.filter(d => d.text === "ОЧКИ").length} раз`,
   texts.filter(d => d.text === "ОЧКИ").length === 1);

// ---- 5. рамка своего забега — в своём блоке ----------------------------------
// Последний забег был демо, то есть ботовский: рамка обязана стоять ниже границы
// блоков. Границу считаем игровым blockH, а не копией формулы.
{
  const edge = g.blockH(g.records.length, true) + g.BEST_GAP;
  const rects = g.draws.filter(d => d.op === "rect");
  const own = rects.filter(d => d.w === g.BEST_W + 10);
  ok(`рамка своей строки одна (${own.length})`, own.length === 1);
  ok(`она в блоке бота: y=${own[0] && own[0].y} при границе ${edge}`,
     !!own[0] && own[0].y >= edge);
}
// А теперь наоборот: последний забег игрока — рамка выше границы.
finishRun(7000);
g.record(true);
g.drawRecords(0);
g.record(false);
{
  const edge = g.blockH(g.records.length, true) + g.BEST_GAP;
  const own = g.draws.filter(d => d.op === "rect" && d.w === g.BEST_W + 10);
  ok(`рамка одна (${own.length}) и в блоке игрока: y=${own[0] && own[0].y} ` +
     `при границе ${edge}`, own.length === 1 && own[0].y < edge);
}

// ---- 6. бледность не протекает за таблицу ------------------------------------
// Блок бота ставит прозрачность 0.55; не вернув её, он выбелил бы весь экран
// после себя. Смотрим на подпись под таблицей — она рисуется последней.
{
  g.record(true);
  g.drawGameOver();
  g.record(false);
  const foot = g.draws.filter(d => d.op === "text")
                      .find(d => d.text === "ENTER — в меню");
  ok(`подпись под таблицей рисуется в полную силу (${foot && foot.alpha})`,
     !!foot && foot.alpha === 1);
}

// ---- 7. отрисовка живёт и на пустых таблицах ---------------------------------
{
  const empty = boot(8);
  empty.drawRecords(0);
  ok("пустые таблицы рисуются", true);
  empty.record(true);
  empty.drawRecords(0);
  empty.record(false);
  const t = empty.draws.filter(d => d.op === "text").map(d => d.text);
  ok(`у игрока приглашение сыграть: ${t.includes("Пока пусто — сыграй забег")}`,
     t.includes("Пока пусто — сыграй забег"));
  ok(`у бота — посмотреть демо: ${t.includes("Пока пусто — посмотри демо")}`,
     t.includes("Пока пусто — посмотри демо"));
}

console.log(fail.length ? "\nПРОВАЛЕНО: " + fail.join("; ") : "\nвсё сошлось");
process.exit(fail.length ? 1 : 0);
