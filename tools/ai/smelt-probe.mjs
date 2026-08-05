// Сколько стоит ПЕРЕПЛАВКА — единственное улучшение с настоящим эффектом.
//
// Две половины одного вопроса, и они расходятся:
//   1. ПОТОЛОК. Забег, где улучшение взято с первого кадра, против обычного. Это
//      не типичный случай, а верхняя граница: столько правило даёт, когда оно
//      есть.
//   2. ДОСТАВКА. Как часто оно вообще достаётся боту и сколько букв успевает
//      поставить. Выдаётся оно на границе круга, а до границы доезжают не все.
//
// Замерено, что нагрузка прогрессивная (сильнее всего помогает медленному), а
// доставка регрессивная (до медленного почти не доходит). Разбор — в
// docs/roguelite.md.
//
//   node tools/ai/smelt-probe.mjs [сидов]
import { boot } from "../sim/harness.mjs";

const DT = 1 / 60, LIMIT = 30 * 60;
const SEEDS = +(process.argv[2] || 64);
const CLASSES = ["быстрый", "средний", "медленный"];

// Один забег. smelt — выдать улучшение сразу, не дожидаясь границы круга.
// Считаем заодно буквы, вставшие от осколков: ведомый осколок исчез, а в его
// ячейке появилась его же буква.
function run(seed, cls, smelt) {
  const g = boot(seed);
  const bot = g.makeAutopilot({ seed, cls });
  g.reset(true);
  if (smelt) g.taken.add("smelt");
  let t = 0, placed = 0;
  while (g.state !== "over" && t < LIMIT) {
    const led = g.shards.filter(s => s.seek)
      .map(s => ({ s, b: s.seek.b, i: s.seek.i, ch: s.ch }));
    bot.tick(DT); g.update(DT); t += DT;
    for (const w of led)
      if (!g.shards.includes(w.s) && w.b.shown[w.i] === w.ch) placed++;
  }
  return { solved: g.solved, score: g.score, lap: g.lap, placed,
           got: g.taken.has("smelt") };
}

const mean = a => a.reduce((s, x) => s + x, 0) / a.length;

const ceiling = [], delivery = [];
for (const cls of CLASSES) {
  const plain = [], forced = [];
  for (let s = 1; s <= SEEDS; s++) plain.push(run(s, cls, false));
  for (let s = 1; s <= SEEDS; s++) forced.push(run(s, cls, true));
  for (const [name, r] of [["как получится", plain], ["взята сразу", forced]])
    ceiling.push({ класс: cls, переплавка: name,
                   круг: +mean(r.map(x => x.lap)).toFixed(2),
                   решено: +mean(r.map(x => x.solved)).toFixed(1),
                   очки: Math.round(mean(r.map(x => x.score))) });
  delivery.push({
    класс: cls, забегов: SEEDS,
    "взял сам": plain.filter(x => x.got).length,
    "букв встало": plain.reduce((n, x) => n + x.placed, 0),
    "букв за забег": +(plain.reduce((n, x) => n + x.placed, 0) / SEEDS).toFixed(2),
  });
}

console.log(`\nПОТОЛОК: ${SEEDS} сидов на клетку`);
console.table(ceiling);
console.log("ДОСТАВКА: в обычном забеге, без принуждения");
console.table(delivery);
