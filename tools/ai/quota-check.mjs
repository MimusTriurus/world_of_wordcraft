// Проверка квоты этапа по факту, а не по коду.
//
// Вопрос, из которого стенд вырос: счётчик показывает 6/6, а слова продолжают
// падать — это сбой? Нет: счётчик считает ВЫПУЩЕННЫЕ этапом слова, а этап
// заканчивается не на последнем выпущенном, а когда поле опустеет (stageDone).
// Раньше строка называлась «зачтено», и это читалось как «решено» — отсюда и
// вопрос. Инвариант же такой:
//
//   этап не может выпустить больше квоты сверх тех слов, что были снесены —
//   снос возвращает квоту, и этап должен это слово заново.
//
//   node tools/ai/quota-check.mjs [класс|все] [сидов]
import { boot } from "../sim/harness.mjs";
import { CLASS_NAMES } from "./player.mjs";

const DT = 1 / 60;
const pick = process.argv[2] || "все";
const classes = pick === "все" ? CLASS_NAMES : [pick];
const SEEDS = +(process.argv[3] || 8);
const LIMIT = 40 * 60;

const bad = [];

function audit(cls) {
  const totals = new Map();
  for (let seed = 1; seed <= SEEDS; seed++) {
    const g = boot(seed);
    const bot = g.makeAutopilot({ seed, cls });
    g.reset(true);

    // known — на весь забег, а не на этап. Решённый блок висит на поле ещё 0.45 с
    // после разгадывания, и если чистить known на границе этапа, его переход
    // посчитается второй раз — уже в счёт нового этапа. Отсюда бралось «решено 11»
    // при квоте 10, чего быть не может.
    const seen = new Set(), known = new Map();
    let key = `${g.lap}/${g.stage}`;
    let born = 0, solvedN = 0, deadN = 0, peak = 0;

    const flush = () => {
      if (!born) return;
      const q = g.STAGES[Math.min(+key.split("/")[1], g.STAGES.length - 1)].quota;
      const t = totals.get(key) ||
                { born: 0, solved: 0, dead: 0, quota: q, n: 0, peak: 0 };
      t.born += born; t.solved += solvedN; t.dead += deadN; t.n++;
      t.peak = Math.max(t.peak, peak);
      totals.set(key, t);
      if (born - deadN > q)
        bad.push(`${cls}, сид ${seed}, этап ${key}: выпущено ${born}, ` +
                 `снесено ${deadN}, квота ${q} — выпущено больше квоты`);
      if (peak > q)
        bad.push(`${cls}, сид ${seed}, этап ${key}: счётчик доходил до ${peak} ` +
                 `при квоте ${q}`);
      born = solvedN = deadN = 0; peak = 0;
    };

    let t = 0;
    while (g.state !== "over" && t < LIMIT) {
      bot.tick(DT); g.update(DT); t += DT;
      const nowKey = `${g.lap}/${g.stage}`;
      if (nowKey !== key) { flush(); key = nowKey; }
      peak = Math.max(peak, Math.min(g.stageSpawned, g.rules().quota));
      for (const b of g.blocks) {
        if (!seen.has(b)) { seen.add(b); born++; }
        if (b.state !== known.get(b)) {
          if (b.state === "solved") solvedN++;
          else if (b.state === "dead") deadN++;
          known.set(b, b.state);
        }
      }
    }
    flush();
  }
  return totals;
}

for (const cls of classes) {
  const totals = audit(cls);
  console.log(`\n${cls}, ${SEEDS} сидов`);
  console.table([...totals].sort().map(([k, t]) => ({
    "круг/этап": k, квота: t.quota, заходов: t.n,
    "выпущено за заход": +(t.born / t.n).toFixed(2),
    решено: +(t.solved / t.n).toFixed(2),
    "погибло/снесено": +(t.dead / t.n).toFixed(2),
    "счётчик доходил до": t.peak,
  })));
}

console.log(bad.length
  ? "\nНАРУШЕНИЯ:\n" + bad.join("\n")
  : "\nнарушений нет: ни один этап не выпустил больше квоты, счётчик её не превышал");
process.exit(bad.length ? 1 : 0);
