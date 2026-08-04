// Прежний модельный игрок — тот, на котором сделаны все замеры в docs/ и в
// комментариях игры. Его код жил в скретчпаде и не сохранился, так что здесь он
// восстановлен по спецификации из CLAUDE.md:
//
//   hit  = min(0.97, навык + 0.09 × (прощаемость − 1))
//   темп = pace × (1 + 0.12 × (длина − 4))   секунд на букву
//
//   класс       навык  темп
//   быстрый     0.85   2.5
//   средний     0.72   3.5
//   медленный   0.60   4.5
//
// Он нужен ровно для одного: дать точку отсчёта новому боту. Пока новые числа
// не поставлены рядом со старыми, они сравнимы только сами с собой.
//
// ЧЕГО ОН НЕ ДЕЛАЕТ, и от этого зависит смысл сравнения: узнаёт слово мгновенно
// (времени на чтение шаблона у него нет вовсе, только на нажатие), не берёт в
// руки ни бомбу, ни подсказку, в раздаче всегда берёт снаряды и тратит их на
// снос испорченных слов. Именно это и делает его слепым к двум вещам, за
// которыми написан новый бот.
//
// Буквы он доставляет через g.land, минуя наводку и полёт: их у него не было, и
// приписывать ему эти расходы значило бы сравнивать не с ним.
import { boot, mulberry32 } from "../sim/harness.mjs";

export const CLASSES = {
  быстрый:   { skill: 0.85, pace: 2.5 },
  средний:   { skill: 0.72, pace: 3.5 },
  медленный: { skill: 0.60, pace: 4.5 },
};

const DT = 1 / 60;
const LIMIT = 30 * 60;

// Прощаемость пропуска — сколько букв в него подходит. Это оракул, и здесь он
// уместен: у модели нет представления о словах, только вероятность попасть.
const fitsAt = (g, b, i) => g.oracle.acceptsAt(b, i).size;

export function runOne({ seed, cls, switchCost = 0 }) {
  const g = boot(seed);
  const rnd = mulberry32((seed * 7919 + 13) >>> 0);
  const { skill, pace } = CLASSES[cls];
  g.reset(true);

  let target = null, gap = -1, work = 0;
  let t = 0, broken = 0, fell = 0;

  while (g.state !== "over" && t < LIMIT) {
    if (g.state === "draft") { g.takePick(0); continue; }   // всегда снаряды

    // Цель — самый нижний живой блок. Испорченный сносится снарядом, если он
    // есть: ровно этим замерялась порция снарядов в SUPPLIES.
    if (!target || !g.alive(target) || target.broken) {
      if (target && target.broken) {
        if (g.shells > 0) { g.cannonX = target.x + target.w / 2; g.shootBlock(); }
        else broken++;
      }
      target = null;
      for (const b of g.blocks) {
        if (!g.alive(b) || b.broken) continue;
        if (!target || b.y > target.y) target = b;
      }
      if (target) {
        gap = target.gaps.find(i => !target.shown[i]);
        work = pace * (1 + 0.12 * (target.shown.length - 4)) + switchCost;
      }
    }

    if (target && gap !== undefined && gap >= 0) {
      work -= DT;
      if (work <= 0) {
        const hit = rnd() < Math.min(0.97, skill + 0.09 * (fitsAt(g, target, gap) - 1));
        if (hit) {
          const letter = [...g.oracle.acceptsAt(target, gap)][0];
          g.land.fill(target, gap, letter);
        } else {
          // любая не подходящая буква: первый промах предупреждает, второй ломает
          const ok = g.oracle.acceptsAt(target, gap);
          const bad = [...g.ALPHABET[g.lang]].find(ch => !ok.has(ch));
          g.land.wrongLetter(target, bad, gap);
        }
        if (g.alive(target) && !target.broken) {
          gap = target.gaps.find(i => !target.shown[i]);
          work = pace * (1 + 0.12 * (target.shown.length - 4));
          if (gap === undefined) target = null;          // слово собрано
        }
      }
    }

    const before = g.lives;
    g.update(DT);
    if (g.lives < before) fell++;
    t += DT;
  }
  return { seed, cls, круг: g.lap, решено: g.solved, очки: g.score,
           "испорченных_упало": broken, "пропущено": fell,
           оборвался: g.state !== "over" };
}

const mean = (rows, k) => rows.reduce((s, r) => s + r[k], 0) / rows.length;

export function table(seeds, classes, opts = {}) {
  return classes.map(cls => {
    const rows = [];
    for (let s = 1; s <= seeds; s++) rows.push(runOne({ seed: s, cls, ...opts }));
    return {
      класс: cls,
      круг: +mean(rows, "круг").toFixed(2),
      решено: +mean(rows, "решено").toFixed(1),
      очки: Math.round(mean(rows, "очки")),
      пропущено: +mean(rows, "пропущено").toFixed(1),
      "оборвалось": rows.filter(r => r.оборвался).length,
    };
  });
}

if (process.argv[1]?.endsWith("legacy.mjs")) {
  const seeds = +(process.argv[2] || 16);
  console.log(`прежняя модель, ${seeds} сидов на класс`);
  console.log("ориентир из комментария к BASE_SPEED: средний 51 слово, медленный 18");
  console.table(table(seeds, Object.keys(CLASSES)));
}
