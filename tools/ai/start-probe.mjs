// Стартовая обойма: выбор одной строки против полной порции без экрана.
//
// Экран раздачи на старте забега стоял и убран — выбирать там не на чем, все три
// кошелька по нулю. Этим замером решение и оправдано: выдача полной обоймы
// прогрессивна, +33 % слов медленному против +2 % быстрому.
//
// Чего замер НЕ говорит: бомбами модель не пользуется вовсе, подсказками — по
// политике. Разница здесь почти целиком в двух подсказках, снаряды бот и так брал
// первой строкой. О ценности самого ВЫБОРА между слотами модель молчит.
//
// Разбор — docs/roguelite.md, раздел «Старт выдаётся целиком».
//
//   node tools/ai/start-probe.mjs [сидов]
import { boot } from "../sim/harness.mjs";

const DT = 1 / 60, LIMIT = 40 * 60;
const SEEDS = +(process.argv[2] || 64);
const CLASSES = ["быстрый", "средний", "медленный"];

// full — как сейчас: обойма целиком, экрана нет. Иначе поднимаем экран обратно и
// отдаём выбор боту, как было до правки.
function run(seed, cls, full) {
  const g = boot(seed);
  const bot = g.makeAutopilot({ seed, cls });
  g.reset(true);
  if (!full) { g.shells = 0; g.bombs = 0; g.tips = 0; g.openDraft("НАЧАЛО ЗАБЕГА"); }
  let t = 0;
  while (g.state !== "over" && t < LIMIT) { bot.tick(DT); g.update(DT); t += DT; }
  return { solved: g.solved, score: g.score, lap: g.lap };
}

const mean = a => a.reduce((s, x) => s + x, 0) / a.length;
const rows = [];
for (const cls of CLASSES)
  for (const [name, full] of [["выбор", false], ["всё сразу", true]]) {
    const r = [];
    for (let s = 1; s <= SEEDS; s++) r.push(run(s, cls, full));
    rows.push({ класс: cls, старт: name,
                решено: +mean(r.map(x => x.solved)).toFixed(1),
                очки: Math.round(mean(r.map(x => x.score))),
                круг: +mean(r.map(x => x.lap)).toFixed(2) });
  }
console.log(`\n${SEEDS} сидов на клетку`);
console.table(rows);
