// Проверка поля «осталось слов» в панели.
//
// Читается ровно та строка, что видит игрок (круг·этап·осталось), а не пересчёт
// по состоянию: иначе проверялась бы копия формулы, а не экран.
//
// Что должно быть верно:
//   1. числитель не больше знаменателя и не отрицательный;
//   2. внутри этапа числитель только растёт или стоит — назад он не ходит;
//   3. этап заканчивается ровно тогда, когда дробь сошлась (N/N);
//   4. вперёд его двигает только слово, ушедшее с поля, а не снос: снос
//      возвращает квоту, и этап должен слово заново;
//   5. круг и этап в панели совпадают с настоящими.
//
//   node tools/ai/hud-check.mjs [класс] [сидов]
import { boot } from "../sim/harness.mjs";

const DT = 1 / 60;
const cls = process.argv[2] || "средний";
const SEEDS = +(process.argv[3] || 6);

const bad = [];
let checked = 0, fullAtEnd = 0, endsSeen = 0, wentBack = 0, movedOnDemolish = 0;

for (let seed = 1; seed <= SEEDS; seed++) {
  const g = boot(seed);
  const bot = g.makeAutopilot({ seed, cls });
  g.reset(true);

  const parse = () => {
    const m = /^(\d+)·(\d+)\/(\d+)·(\d+)\/(\d+)$/.exec(g.hudLevel);
    if (!m) { bad.push(`сид ${seed}: панель «${g.hudLevel}» не разобрать`); return null; }
    return { lap: +m[1], stage: +m[2], of: +m[3], done: +m[4], total: +m[5] };
  };

  let prev = parse(), prevKey = `${g.lap}/${g.stage}`;
  // Снос узнаётся по возврату квоты: destroy уменьшает stageSpawned, а падение
  // за линию — нет. Считать по состоянию блока «dead» нельзя, его получают и
  // снесённые, и упавшие, а упавшее слово счётчик двигать обязано. На этом
  // первая версия проверки и споткнулась — 18 «сносов, продвинувших счётчик»
  // оказались падениями.
  let prevSpawned = g.stageSpawned, prevLives = g.lives;
  let t = 0;

  while (g.state !== "over" && t < 40 * 60) {
    bot.tick(DT); g.update(DT); t += DT;

    const now = parse();
    if (!now) break;
    checked++;

    if (now.done < 0 || now.done > now.total)
      bad.push(`сид ${seed}: дробь ${now.done}/${now.total} вне границ`);
    if (now.lap !== g.lap || now.stage !== g.stage + 1 || now.of !== g.STAGES.length)
      bad.push(`сид ${seed}: панель «${g.hudLevel}» расходится с ` +
               `кругом ${g.lap}, этапом ${g.stage + 1}/${g.STAGES.length}`);

    const key = `${g.lap}/${g.stage}`;
    const sameStage = key === prevKey;

    // Внутри этапа числитель не имеет права идти назад.
    if (prev && sameStage && now.done < prev.done) {
      wentBack++;
      bad.push(`сид ${seed}: этап ${key}, дробь откатилась ` +
               `${prev.done} → ${now.done}`);
    }
    // Снос не должен продвигать счётчик. Кадры, где заодно кто-то упал, не
    // считаем: падение двигать обязано, и вклады не разделить.
    if (prev && sameStage && g.stageSpawned < prevSpawned &&
        g.lives === prevLives && now.done > prev.done) {
      movedOnDemolish++;
      bad.push(`сид ${seed}: этап ${key}, снос продвинул счётчик ` +
               `${prev.done} → ${now.done}`);
    }

    if (!sameStage) {                        // этап только что сменился
      endsSeen++;
      if (prev.done === prev.total) fullAtEnd++;
      else if (!g.poolDry)
        bad.push(`сид ${seed}: этап ${prevKey} закрылся при ` +
                 `${prev.done}/${prev.total}`);
      prevKey = key;
    }
    prev = now; prevSpawned = g.stageSpawned; prevLives = g.lives;
  }
}

console.log(`класс ${cls}, ${SEEDS} сидов, кадров проверено ${checked}`);
console.log(`границ этапа: ${endsSeen}, из них при сошедшейся дроби N/N: ${fullAtEnd}`);
console.log(`откатов дроби назад: ${wentBack}`);
console.log(`случаев, когда снос продвинул счётчик: ${movedOnDemolish}`);
console.log(bad.length ? "\nНАРУШЕНИЯ:\n" + bad.slice(0, 20).join("\n")
                       : "\nнарушений нет");
process.exit(bad.length ? 1 : 0);
