// Проверка наводки бота в режиме «Прицел по букве».
//
// Там попадания в блок не хватает: игра читает номер ячейки через cellAt, и
// буква встаёт только если это открытый пропуск. Проверяем не рассуждением, а
// по фактическим выстрелам: у каждой буквы в полёте берём блок, в который она
// попадёт, и спрашиваем у самой игры, в какую ячейку она придёт.
//
//   node tools/ai/aim-check.mjs [сидов]
import { boot } from "../sim/harness.mjs";

const DT = 1 / 60;
const seeds = +(process.argv[2] || 6);

function run(seed, aimMode) {
  const g = boot(seed);
  g.mods.aim = aimMode;
  const bot = g.makeAutopilot({ seed, cls: "средний" });
  g.reset(true);

  let blocksSeen = 0, blocksAimed = 0;
  let shots = 0, intoGap = 0, intoFilled = 0, intoNothing = 0;
  const counted = new Set();

  let t = 0;
  while (g.state !== "over" && t < 30 * 60) {
    bot.tick(DT);
    g.update(DT);
    t += DT;

    for (const b of g.blocks) {
      if (!counted.has(b)) { counted.add(b); blocksSeen++; if (b.aim) blocksAimed++; }
    }

    // Каждый выстрел считаем один раз, в кадре его появления.
    for (const s of g.shots) {
      if (s.__seen) continue;
      s.__seen = true;
      shots++;
      // блок, которому достанется выстрел: самый нижний в колонке
      let hit = null;
      for (const b of g.blocks) {
        if (!g.alive(b)) continue;
        if (s.x < b.x || s.x > b.x + b.w) continue;
        if (b.y + b.h > g.CANNON_Y) continue;
        if (!hit || b.y > hit.y) hit = b;
      }
      if (!hit) { intoNothing++; continue; }
      const cell = g.cellAt(hit, s.x);
      if (cell === -1) intoNothing++;
      else if (hit.shown[cell]) intoFilled++;
      else if (hit.gaps.includes(cell)) intoGap++;
      else intoFilled++;                     // открытая, но не пропуск — не бывает
    }
  }
  return { blocksSeen, blocksAimed, shots, intoGap, intoFilled, intoNothing,
           solved: g.solved, score: g.score, lap: g.lap };
}

for (const aimMode of [true, false]) {
  const acc = { blocksSeen: 0, blocksAimed: 0, shots: 0, intoGap: 0,
                intoFilled: 0, intoNothing: 0, solved: 0 };
  for (let s = 1; s <= seeds; s++) {
    const r = run(s, aimMode);
    for (const k of Object.keys(acc)) acc[k] += r[k];
  }
  const pct = n => (n / acc.shots * 100).toFixed(1) + "%";
  console.log(`\nmods.aim = ${aimMode}, ${seeds} сидов`);
  console.log(`  блоков всего ${acc.blocksSeen}, из них с точным прицелом ` +
              `${acc.blocksAimed} (${(acc.blocksAimed / acc.blocksSeen * 100).toFixed(0)}%)`);
  console.log(`  выстрелов буквой ${acc.shots}`);
  console.log(`  в открытый пропуск:      ${acc.intoGap} — ${pct(acc.intoGap)}`);
  console.log(`  в занятую ячейку:        ${acc.intoFilled} — ${pct(acc.intoFilled)}`);
  console.log(`  мимо букв / в пустоту:   ${acc.intoNothing} — ${pct(acc.intoNothing)}`);
  console.log(`  решено слов: ${acc.solved}`);
}
