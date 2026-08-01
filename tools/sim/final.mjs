import { runOnce } from "./sim.mjs";

const SEEDS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
const RUN = 12;                       // волн в забеге
const avg = a => a.length ? a.reduce((x, y) => x + y, 0) / a.length : NaN;

function trial(A, B, opt = {}) {
  const deaths = [];
  let won = 0, boom = 0, secs = 0;
  for (const s of SEEDS) {
    const r = runOnce(s, w => A + B * (w - 1), { ...opt, maxWave: RUN });
    if (r.lostAtWave) deaths.push(r.lostAtWave); else won++;
    boom += r.log.reduce((n, e) => n + e.boom, 0);
    secs += r.log.length;
  }
  return { deaths: deaths.sort((a, b) => a - b), win: won / SEEDS.length,
           boom: boom / SEEDS.length };
}

console.log(`забег ${RUN} волн, ${SEEDS.length} сидов, базовый игрок\n`);
console.log(" A    B   дошли до конца   умирает на волне");
for (const A of [5, 6, 7]) for (const B of [1.4, 1.8, 2.2, 2.6]) {
  const t = trial(A, B);
  console.log(`${String(A).padStart(2)} ${B.toFixed(1).padStart(4)}   ` +
              `${(t.win * 100).toFixed(0).padStart(9)}%      ${t.deaths.join(" ")}`);
}

const [A, B] = [Number(process.argv[2] ?? 6), Number(process.argv[3] ?? 2.2)];
console.log(`\nвыбранная кривая ${A} + ${B}·(w-1) по классам игроков\n`);
console.log("кто играет                        дошли  умирает на волне       зачисток");
const CASES = [
  ["новичок   (медленнее на 25%)", { skill: 1.25, know: -0.05 }],
  ["база      (без карт)",         {}],
  ["+3 карты  (быстрее на 15%)",   { skill: 0.85, know: 0.04 }],
  ["+6 карт   (быстрее на 30%)",   { skill: 0.70, know: 0.10 }],
];
for (const [name, opt] of CASES) {
  const t = trial(A, B, opt);
  console.log(`${name.padEnd(32)} ${(t.win * 100).toFixed(0).padStart(4)}%  ` +
              `${t.deaths.join(" ").padEnd(22)} ${t.boom.toFixed(1)}`);
}
