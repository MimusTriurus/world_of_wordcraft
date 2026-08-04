// Забег до конца: без получасового предела, до настоящей потери всех жизней.
//
// Обычная гонялка обрывает забег на 30 игровых минутах — это предел из прежних
// замеров, и он там нужен, чтобы одна зависшая конфигурация не съела прогон.
// Здесь предел снят: интересно, до какого круга бот доезжает, когда его никто не
// останавливает. Страховка всё же есть, иначе бессмертный бот крутился бы вечно.
//
//   node tools/ai/marathon.mjs [сидов] [класс|все]
import { boot } from "../sim/harness.mjs";
import { CLASS_NAMES } from "./player.mjs";

const DT = 1 / 60;
const SAFETY = 12 * 3600;        // игровых секунд — 12 часов, заведомо недостижимо

function one(seed, cls) {
  const g = boot(seed);
  const bot = g.makeAutopilot({ seed, cls });
  g.reset(true);
  let t = 0;
  while (g.state !== "over" && t < SAFETY) { bot.tick(DT); g.update(DT); t += DT; }
  return { seed, cls, круг: g.lap, этап: g.stage + 1, решено: g.solved,
           очки: g.score, минут: +(t / 60).toFixed(1),
           улучшений: bot.stats.upgrades.length,
           upgrades: bot.stats.upgrades,
           снаряды: bot.stats.shells, подсказки: bot.stats.hints,
           "упёрся_в_страховку": t >= SAFETY };
}

const seeds = +(process.argv[2] || 12);
const pick = process.argv[3];
const classes = pick && pick !== "все" ? [pick] : CLASS_NAMES;

const mean = (rows, k) => rows.reduce((s, r) => s + r[k], 0) / rows.length;
const max = (rows, k) => rows.reduce((m, r) => Math.max(m, r[k]), 0);

console.log(`забег до конца, ${seeds} сидов на класс, страховка ${SAFETY / 3600} ч\n`);
const summary = [];
const allUpgrades = new Map();
for (const cls of classes) {
  const rows = [];
  for (let s = 1; s <= seeds; s++) rows.push(one(s, cls));
  for (const r of rows) for (const u of r.upgrades)
    allUpgrades.set(u, (allUpgrades.get(u) || 0) + 1);
  summary.push({
    класс: cls,
    "круг сред.": +mean(rows, "круг").toFixed(2),
    "круг макс.": max(rows, "круг"),
    решено: +mean(rows, "решено").toFixed(1),
    очки: Math.round(mean(rows, "очки")),
    "минут сред.": +mean(rows, "минут").toFixed(1),
    "минут макс.": max(rows, "минут"),
    "улучшений за забег": +mean(rows, "улучшений").toFixed(1),
    "упёрлось в страховку": rows.filter(r => r.упёрся_в_страховку).length,
  });
}
console.table(summary);

console.log(`\nулучшения, взятые за все забеги (пул из 13):`);
const taken = [...allUpgrades].sort((a, b) => b[1] - a[1]);
for (const [name, n] of taken) console.log(`  ${String(n).padStart(3)} × ${name}`);
console.log(`разных правил: ${taken.length} из 13`);
