import { runOnce } from "./sim.mjs";

const A = Number(process.argv[2] ?? 6), B = Number(process.argv[3] ?? 1.8);
const seed = Number(process.argv[4] ?? 1);
const skill = Number(process.argv[5] ?? 1);
const r = runOnce(seed, w => A + B * (w - 1), { skill, maxWave: 25 });

console.log(`бюджет ${A} + ${B}·(w-1)   сид ${seed}   темп игрока ×${skill}   ` +
            `смерть на волне: ${r.lostAtWave ?? "не умер за 25"}`);
console.log("вол профиль  реш сдал жизн нагр/бюдж запас,с бомб  правила");
for (const e of r.log) {
  const u = e.rules;
  console.log(
    `${String(e.wave).padStart(3)} ${e.profile.padEnd(8)} ` +
    `${String(e.solved).padStart(3)} ${String(e.gave).padStart(4)} ${String(e.lives).padStart(4)} ` +
    `${e.load.toFixed(1).padStart(5)}/${e.budget.toFixed(1).padEnd(4)} ` +
    `${e.res.toFixed(1).padStart(5)} ${String(e.boom).padStart(4)}  ` +
    `${u.len[0]}-${u.len[1]}б r${String(u.rank).padEnd(5)} g${u.gaps2.toFixed(2)} v${u.speed} L${u.load.toFixed(1)}`);
}
