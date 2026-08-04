// Проверка поля «осталось слов» в панели.
//
// Читается ровно та строка, что видит игрок (круг·этап·осталось), а не пересчёт
// по состоянию: иначе проверялась бы копия формулы, а не экран.
//
// Что должно быть верно:
//   1. число никогда не отрицательное;
//   2. этап заканчивается тогда и только тогда, когда оно дошло до нуля
//      (исключение — иссякший пул: узкая тема может закрыть этап раньше квоты);
//   3. оно не растёт само по себе — вверх его двигает только снос, который
//      возвращает квоту, и это по правилам игры;
//   4. круг и этап в строке совпадают с настоящими.
//
//   node tools/ai/hud-check.mjs [класс] [сидов]
import { boot } from "../sim/harness.mjs";

const DT = 1 / 60;
const cls = process.argv[2] || "средний";
const SEEDS = +(process.argv[3] || 6);

const bad = [];
let checked = 0, zeroAtEnd = 0, endsSeen = 0, grewWithoutDemolish = 0;
let maxLeft = 0;

for (let seed = 1; seed <= SEEDS; seed++) {
  const g = boot(seed);
  const bot = g.makeAutopilot({ seed, cls });
  g.reset(true);

  const parse = () => {
    const m = /^(\d+)·(\d+)\/(\d+)·(\d+)$/.exec(g.hudLevel);
    if (!m) { bad.push(`сид ${seed}: строку «${g.hudLevel}» не разобрать`); return null; }
    return { lap: +m[1], stage: +m[2], of: +m[3], left: +m[4] };
  };

  let prev = parse(), prevKey = `${g.lap}/${g.stage}`, prevDead = 0;
  let deadCount = 0;
  const known = new Map();
  let t = 0;

  while (g.state !== "over" && t < 40 * 60) {
    bot.tick(DT); g.update(DT); t += DT;

    for (const b of g.blocks) {
      if (b.state !== known.get(b)) {
        if (b.state === "dead") deadCount++;
        known.set(b, b.state);
      }
    }

    const now = parse();
    if (!now) break;
    checked++;
    maxLeft = Math.max(maxLeft, now.left);

    if (now.left < 0) bad.push(`сид ${seed}: осталось ${now.left} — отрицательное`);
    if (now.lap !== g.lap || now.stage !== g.stage + 1 || now.of !== g.STAGES.length)
      bad.push(`сид ${seed}: строка «${g.hudLevel}» расходится с ` +
               `кругом ${g.lap}, этапом ${g.stage + 1}/${g.STAGES.length}`);

    // выросло ли число без сноса
    if (prev && now.left > prev.left && deadCount === prevDead &&
        `${g.lap}/${g.stage}` === prevKey) grewWithoutDemolish++;

    const key = `${g.lap}/${g.stage}`;
    if (key !== prevKey) {                   // этап только что сменился
      endsSeen++;
      if (prev.left === 0) zeroAtEnd++;
      else if (!g.poolDry)
        bad.push(`сид ${seed}: этап ${prevKey} закрылся при «осталось ${prev.left}»`);
      prevKey = key;
    }
    prev = now; prevDead = deadCount;
  }
}

console.log(`класс ${cls}, ${SEEDS} сидов, кадров проверено ${checked}`);
console.log(`границ этапа: ${endsSeen}, из них при «осталось 0»: ${zeroAtEnd}`);
console.log(`наибольшее показанное «осталось»: ${maxLeft}`);
console.log(`выросло без сноса: ${grewWithoutDemolish} раз`);
console.log(bad.length ? "\nНАРУШЕНИЯ:\n" + bad.slice(0, 20).join("\n")
                       : "\nнарушений нет");
process.exit(bad.length ? 1 : 0);
