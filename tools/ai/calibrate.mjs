// Калибровка нового бота по прежней модели.
//
// Сравнивать в лоб нельзя: новый бот пользуется подсказками и бомбами, которых
// у прежней модели не было, и платит за наводку и полёт буквы, которых она не
// платила. Поэтому калибруется он в СРАВНИМОМ РЕЖИМЕ — с теми же руками, что у
// неё: без подсказок, без бомб, без догадок, в раздаче всегда снаряды. Всё,
// чего у неё не было, включается уже после калибровки, и разница между двумя
// прогонами и есть измеренная цена кошельков.
//
// Две ручки, три класса: READ_MUL — во сколько темпов обходится взгляд на слово,
// VOCAB — множитель словарного запаса. Сетка грубая: точнее, чем шум на
// шестнадцати сидах, всё равно не выйдет.
//
//   node tools/ai/calibrate.mjs [сидов]
import { table as botTable } from "./run.mjs";
import { table as oldTable } from "./legacy.mjs";
import { CLASS_NAMES, boot, classesOf } from "./player.mjs";

const seeds = +(process.argv[2] || 8);
const CLS = CLASS_NAMES;
// Исходные объёмы словаря берём у игры: таблица классов живёт там. Множитель
// сетки идёт через par, а не правкой таблицы, — каждый забег поднимает игру
// заново, и правка не дожила бы до следующего.
const BASE = Object.fromEntries(
  Object.entries(classesOf(boot(1))).map(([c, v]) => [c, v.vocab]));

// Руки прежней модели: ничего, кроме снарядов на снос испорченного.
const COMPARABLE = { hint: false, guess: false, bomb: false, shell: true,
                     draft: "shells" };

// Один класс с заданным словарём. Через par, а не правкой таблицы классов:
// таблица живёт в игре, а игра поднимается заново на каждый забег.
const one = (cls, READ_MUL, vocab, policy = COMPARABLE) =>
  botTable(seeds, [cls], { knobs: { READ_MUL }, policy, par: { vocab } })[0];

console.log(`${seeds} сидов на клетку\n`);
const ref = oldTable(seeds, CLS);
console.log("прежняя модель — точка отсчёта");
console.table(ref);
const want = Object.fromEntries(ref.map(r => [r.класс, r.решено]));

// Расхождение по решённым словам, в долях: одно число на всю сетку классов.
const miss = rows => rows.reduce((s, r) =>
  s + Math.abs(r.решено - want[r.класс]) / want[r.класс], 0) / rows.length;

const grid = [];
for (const READ_MUL of [0.8, 1.2, 1.6, 2.0, 2.4])
  for (const VOCAB of [0.75, 1.0, 1.25]) {
    const rows = CLS.map(c => one(c, READ_MUL, BASE[c] * VOCAB));
    const row = { READ_MUL, VOCAB, расхождение: +miss(rows).toFixed(3) };
    for (const r of rows) row[r.класс] = r.решено;
    grid.push(row);
  }
grid.sort((a, b) => a.расхождение - b.расхождение);
console.log("\nсравнимый режим: ближе к началу — точнее совпало");
console.table(grid);

const best = grid[0];
console.log(`\nлучшее по общему множителю: READ_MUL = ${best.READ_MUL}, ` +
            `VOCAB × ${best.VOCAB}, расхождение ${(best.расхождение * 100).toFixed(1)}%`);

// Общий множитель — только грубая наводка. Дальше словарь каждого класса
// подбирается отдельно: сетка показала, что врёт не уровень, а разброс между
// классами, и одним множителем это не лечится.
const MUL = best.READ_MUL;
console.log(`\nсловарь по классам при READ_MUL = ${MUL}`);
const fitted = {};
for (const c of CLS) {
  const rows = [8000, 11000, 14000, 17000, 20000, 24000, 28000].map(vocab => {
    const r = one(c, MUL, vocab);
    return { vocab, решено: r.решено,
             откл: +((r.решено - want[c]) / want[c] * 100).toFixed(1) };
  });
  rows.sort((a, b) => Math.abs(a.откл) - Math.abs(b.откл));
  fitted[c] = rows[0].vocab;
  console.log(`${c}: цель ${want[c]}, лучший словарь ${rows[0].vocab} ` +
              `(${rows[0].решено}, ${rows[0].откл > 0 ? "+" : ""}${rows[0].откл}%)`);
}
console.log("\nэти значения и должны стоять в BOT_CLASSES в word-shooter.html:",
            JSON.stringify(fitted));

// Что дают кошельки, которых у прежней модели не было.
const bare = CLS.map(c => one(c, MUL, fitted[c]));
const full = CLS.map(c => one(c, MUL, fitted[c], {}));
console.log("\nцена кошельков: те же руки против всех");
console.table(CLS.map((c, i) => ({
  класс: c,
  "прежняя модель": want[c],
  "бот, те же руки": bare[i].решено,
  "бот, всё включено": full[i].решено,
  "прибавка кошельков": +(full[i].решено / bare[i].решено).toFixed(2) + "×",
})));
