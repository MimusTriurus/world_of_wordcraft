// Гонялка ИИ-игрока. Крутит забеги по сидам и классам и печатает таблицу.
//
//   node tools/ai/run.mjs [сидов] [класс|все]
//
// Каждый забег поднимает игру заново со своим сидом: общий генератор на
// несколько прогонов сделал бы результат зависимым от порядка вычисления
// конфигураций. Кости бота — отдельный генератор, см. player.mjs.
import { boot } from "../sim/harness.mjs";
import { CLASS_NAMES } from "./player.mjs";

const DT = 1 / 60;
const LIMIT = 30 * 60;          // 30 игровых минут — тот же предел, что в прежних замерах

export function runOne({ seed, cls, knobs, policy, par, mods }) {
  const g = boot(seed);
  // Модификаторы ставятся до reset(): правило наводки блок запоминает при
  // рождении, а пул слов зависит от частей речи и темы.
  if (mods) Object.assign(g.mods, mods);
  // Бот берётся у самой игры: ядро решений живёт там, см. tools/ai/player.mjs.
  const bot = g.makeAutopilot({ seed, cls, knobs, policy, par });
  g.reset(true);

  let t = 0;
  while (g.state !== "over" && t < LIMIT) {
    bot.tick(DT);
    g.update(DT);
    t += DT;
  }
  return {
    seed, cls, t,
    оборвался: g.state !== "over",
    круг: g.lap, этап: g.stage + 1,
    очки: g.score, решено: g.solved,
    снаряды: bot.stats.shells, бомбы: bot.stats.bombs,
    подсказки: bot.stats.hints, догадки: bot.stats.guesses,
    безнадёжных: bot.stats.hopeless,
  };
}

const mean = (rows, k) => rows.reduce((s, r) => s + r[k], 0) / rows.length;

export function table(seeds, classes, opts = {}) {
  const out = [];
  for (const cls of classes) {
    const rows = [];
    for (let s = 1; s <= seeds; s++) rows.push(runOne({ seed: s, cls, ...opts }));
    out.push({
      класс: cls,
      круг: +mean(rows, "круг").toFixed(2),
      решено: +mean(rows, "решено").toFixed(1),
      очки: Math.round(mean(rows, "очки")),
      снаряды: +mean(rows, "снаряды").toFixed(1),
      бомбы: +mean(rows, "бомбы").toFixed(1),
      подсказки: +mean(rows, "подсказки").toFixed(1),
      догадки: +mean(rows, "догадки").toFixed(1),
      "безнадёжных": +mean(rows, "безнадёжных").toFixed(1),
      "оборвалось": rows.filter(r => r.оборвался).length,
    });
  }
  return out;
}

// Печатаем таблицу только при запуске файлом. При import из другого стенда
// (свипы, сравнение политик) модуль обязан молчать — и не падать на -e, где
// process.argv[1] вообще нет.
if (process.argv[1]?.endsWith("run.mjs")) {
  const seeds = +(process.argv[2] || 16);
  const pick = process.argv[3];
  const classes = pick && pick !== "все" ? [pick] : CLASS_NAMES;
  console.log(`${seeds} сидов на класс, предел ${LIMIT / 60} мин`);
  console.table(table(seeds, classes));
}
