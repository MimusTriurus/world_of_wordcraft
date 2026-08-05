// Таблица рекордов: одна на игрока и на бота, своя на каждый язык.
//
// Что здесь легко сломать, и всё это уже ломалось или могло:
//
//   1. МЕСТО СЧИТАЕТСЯ ДО ОБРЕЗКИ. Хранится десять строк, показывается пять, и
//      место забега берётся по всей таблице: одиннадцатый называется одиннадцатым,
//      а не «никаким». На этом стоит строка «твой забег» под пятёркой — без неё
//      бот, занявший всю пятёрку, вытеснял бы игрока с экрана.
//   2. ЯЗЫКИ НЕ СМЕШИВАЮТСЯ. Ни в показе, ни в обрезке: десятка русских забегов
//      не должна выталкивать английские.
//   3. СВОЯ СТРОКА НЕ ДУБЛИРУЕТСЯ. Попал в пятёрку — она там и обведена; не попал
//      — стоит отдельной строкой под отбивкой. Никогда и там, и там.
//   4. СТРОКИ БОТА БЛЕДНЕЕ, и бледность не протекает на то, что рисуется после.
//
// Картинку в Node снять нельзя, но журнал отрисовки харнесса пишет прозрачность и
// текст в том порядке, в каком их выдал холст, — этого хватает.
//
//   node tools/ai/records-check.mjs
import { boot } from "../sim/harness.mjs";

const DT = 1 / 60;
const fail = [];
const ok = (n, c) => { console.log((c ? "ok   " : "ПЛОХО") + "  " + n); if (!c) fail.push(n); };

const g = boot(7);

// Забег до конца: жизни отбираем сами, играть незачем — считаем таблицу.
function finishRun(score, bot = false) {
  g.mods.autopilot = bot;
  g.reset(true);
  for (let i = 0; i < 60; i++) g.update(DT);
  g.score = score;
  g.lives = 1;
  g.loseLife(g.blocks.find(b => b.state === "live") || g.blocks[0]);
  g.mods.autopilot = false;
}
// Что нарисовано на экране рекордов.
function paint(fn = () => g.drawRecords(0)) {
  g.record(true); fn(); g.record(false);
  return { text: g.draws.filter(d => d.op === "text"),
           rect: g.draws.filter(d => d.op === "rect" && d.w === g.BEST_W + 10) };
}

// ---- 1. одна таблица: и игрок, и бот ----------------------------------------
finishRun(5000);
ok(`забег кончился (${g.state})`, g.state === "over");
finishRun(400000, true);
ok(`в таблице обе строки: ${g.bestOf("ru").length}`, g.bestOf("ru").length === 2);
ok("бот впереди игрока", g.bestOf("ru")[0].score === 400000);
ok("кто играл, записано", g.bestOf("ru")[0].bot === true &&
                          g.bestOf("ru")[1].bot === false);

// ---- 2. место считается по всей таблице, а не по видимой пятёрке -------------
// Заполняем десятку забегами бота, потом играем слабый забег: в пятёрку он не
// попадёт, но номер получить обязан.
for (const s of [390000, 380000, 370000, 360000, 350000, 340000, 330000, 320000])
  finishRun(s, true);
ok(`в таблице ${g.bestOf("ru").length} строк при пределе ${g.BEST_MAX}`,
   g.bestOf("ru").length === g.BEST_MAX);
finishRun(100);
ok(`слабый забег получил место ${g.lastPlace + 1}, а не −1`,
   g.lastPlace >= g.BEST_SHOW);
ok("и он не в хранимой десятке — вытеснен обрезкой",
   !g.bestOf("ru").includes(g.lastRow));
ok("значит строка «твой забег» нужна", g.ownBelow() === true);

// ---- 3. своя строка не дублируется ------------------------------------------
{
  const shown = paint();
  const own = shown.rect;
  ok(`рамка одна (${own.length})`, own.length === 1);
  const rank = shown.text.filter(d => d.text === String(g.lastPlace + 1));
  ok(`номер своего места «${g.lastPlace + 1}» нарисован ${rank.length} раз`,
     rank.length === 1);
  ok(`видно ${g.BEST_SHOW} лидеров плюс своя строка`,
     shown.text.filter(d => d.text === "ИГРОК" || d.text === "БОТ").length ===
     g.BEST_SHOW + 1);
  // Своя строка стоит НИЖЕ пятёрки и за отбивкой.
  const fifth = g.BEST_LABEL + g.BEST_HEAD + (g.BEST_SHOW - 1) * g.BEST_STEP + 16;
  ok(`своя строка на ${own[0].y + g.BEST_STEP / 2} — ниже пятой (${fifth})`,
     own[0].y + g.BEST_STEP / 2 > fifth);
}
// А теперь сильный забег: он в пятёрке, отдельной строки быть не должно.
finishRun(500000);
ok("сильный забег попал в пятёрку", g.lastPlace < g.BEST_SHOW);
ok("отдельная строка не нужна", g.ownBelow() === false);
{
  const shown = paint();
  ok(`рамка одна (${shown.rect.length})`, shown.rect.length === 1);
  ok(`строк всего ${g.BEST_SHOW}`,
     shown.text.filter(d => d.text === "ИГРОК" || d.text === "БОТ").length ===
     g.BEST_SHOW);
}

// ---- 4. языки отдельно -------------------------------------------------------
{
  const ruBefore = g.bestOf("ru").length;
  g.setLang("en");
  ok(`язык переключён (${g.lang})`, g.lang === "en");
  ok(`английская таблица пуста (${g.bestOf("en").length})`,
     g.bestOf("en").length === 0);
  const shown = paint();
  ok("на пустой таблице приглашение сыграть",
     shown.text.some(d => d.text === "Пока пусто — сыграй забег"));
  ok("подпись называет язык", shown.text.some(d => d.text === "ЛУЧШИЕ · EN"));
  ok("своя строка из русского забега сюда не протекла", g.ownBelow() === false);

  finishRun(1234);
  ok(`английский забег лёг в английскую таблицу (${g.bestOf("en").length})`,
     g.bestOf("en").length === 1 && g.lastPlace === 0);
  ok(`русская таблица цела: ${g.bestOf("ru").length} из ${ruBefore}`,
     g.bestOf("ru").length === ruBefore);
  ok("обрезка по языку: слабый английский забег не выкинут",
     g.bestOf("en")[0].score === 1234);

  g.setLang("ru");
  const back = paint();
  ok("вернулись к русской таблице", back.text.some(d => d.text === "ЛУЧШИЕ · RU"));
  ok("и в ней снова десять строк", g.bestOf("ru").length === g.BEST_MAX);
}

// ---- 5. строки бота бледнее, и бледность не протекает ------------------------
{
  const shown = paint();
  const bot = shown.text.filter(d => d.text === "БОТ");
  const man = shown.text.filter(d => d.text === "ИГРОК");
  ok(`строки бота бледнее: ${bot.map(d => d.alpha).join(", ")}`,
     bot.length > 0 && bot.every(d => d.alpha < 1));
  ok(`строки игрока в полную силу: ${man.map(d => d.alpha).join(", ")}`,
     man.length > 0 && man.every(d => d.alpha === 1));
}
{
  // Подпись под таблицей рисуется последней: не вернув прозрачность, блок бота
  // выбелил бы весь экран после себя.
  const shown = paint(() => g.drawGameOver());
  const foot = shown.text.find(d => d.text === "ENTER — в меню");
  ok(`подпись под таблицей в полную силу (${foot && foot.alpha})`,
     !!foot && foot.alpha === 1);
  // И самое простое: сводки над таблицей больше нет — она дублировала свою строку.
  const dup = shown.text.filter(d => /^круг \d+ · этап/.test(d.text));
  ok(`сводки над таблицей нет (${dup.length} строк)`, dup.length === 0);
  ok("заголовок на месте", shown.text.some(d => d.text === "GAME OVER"));
}

console.log(fail.length ? "\nПРОВАЛЕНО: " + fail.join("; ") : "\nвсё сошлось");
process.exit(fail.length ? 1 : 0);
