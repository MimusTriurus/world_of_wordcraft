// Свип READ_MUL: за сколько темпов игрок успевает прочесть слово.
// Цель — поставить три класса туда, где их застали прежние замеры, чтобы новые
// числа можно было положить рядом со старыми. Ориентиры из комментария к
// BASE_SPEED в игре: при скорости 14 средний решает 51 слово, медленный — 18.
//
//   node tools/ai/sweep.mjs [сидов] [READ_MUL через запятую]
import { table } from "./run.mjs";
import { CLASS_NAMES } from "./player.mjs";

const seeds = +(process.argv[2] || 8);
const muls = (process.argv[3] || "0.6,0.8,1.0,1.3,1.6").split(",").map(Number);

console.log(`${seeds} сидов на клетку. Ориентир: средний 51 слово, медленный 18.`);
for (const READ_MUL of muls) {
  const rows = table(seeds, CLASS_NAMES, { knobs: { READ_MUL } });
  console.log(`\nREAD_MUL = ${READ_MUL}`);
  console.table(rows);
}
