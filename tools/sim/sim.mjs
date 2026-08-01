// Модель забега: волны, лестница сложности, модельный игрок.
// Считает, на какой волне умирает средний игрок и насколько загружено поле.
import { boot, mulberry32 } from "./harness.mjs";

// ------------------------------------------------------------- лестница осей
// gate — волна, раньше которой ось не продаётся. Именно гейты, а не цены,
// держат заявленный порядок рычагов: длина -> редкость -> пропуски -> скорость.
export const LADDER = {
  len:   { steps: [4, 5, 6, 7, 8],                    cost: [6, 7, 8, 9],  gate: 1 },
  rank:  { steps: [1500, 4000, 10000, 30000, 99999],  cost: [5, 6, 7, 8],  gate: 2 },
  gaps:  { steps: [0, .2, .35, .5, .65, .8],          cost: [8, 8, 9, 9, 10], gate: 5 },
  speed: { steps: [20, 23, 26, 29, 32],               cost: [3, 4, 4, 5],  gate: 7 },
  load:  { steps: null, cost: 2, unit: 0.5, base: 4.0, gate: 1 },
};
const CARRY_CAP = 8;   // недотраченное копится, но не копится бесконечно

// Профиль волны — куда она тратит бюджет. Он же её лицо на экране.
export const PROFILES = {
  "Ровная":  { len: 3,   rank: 3,   gaps: 2,   speed: 1,   load: 2.5 },
  "Поток":   { len: 1,   rank: 1,   gaps: 1,   speed: 2,   load: 6   },
  "Глубина": { len: 4,   rank: 6,   gaps: 1,   speed: .5,  load: .5  },
  "Решето":  { len: 2,   rank: 1,   gaps: 6,   speed: .5,  load: 1   },
  "Ливень":  { len: 1,   rank: 1,   gaps: .5,  speed: 5,   load: 3   },
};
const ORDER = ["Ровная", "Ровная", "Ровная", "Поток", "Глубина", "Решето",
               "Поток", "Ливень", "Глубина", "Решето", "Поток", "Глубина",
               "Ливень", "Решето", "Глубина", "Поток"];

export const QUOTA = 10;          // слов на волну
const RAMP = [0.85, 1.15];        // крещендо бюджета внутри волны

export function makeTrack() { return { len: 0, rank: 0, gaps: 0, speed: 0, load: 0 }; }

export function rulesFrom(track, ramp = 1) {
  const hi = LADDER.len.steps[track.len];
  const gaps2 = LADDER.gaps.steps[track.gaps];
  return {
    name: "ВОЛНА",
    len: [Math.max(3, hi - 3), hi],
    rank: LADDER.rank.steps[track.rank],
    gaps2,
    // Движок с тех пор перешёл на точное число пропусков и квоту этапа.
    // Долю блоков с двумя пропусками он больше не понимает, так что здесь она
    // огрубляется до одного или двух, а квота ставится заведомо недостижимой:
    // волна кончается по счёту слов в самом симуляторе, а не в игре.
    gaps: gaps2 >= 0.5 ? 2 : 1,
    quota: Infinity,
    speed: LADDER.speed.steps[track.speed],
    load: (LADDER.load.base + track.load * LADDER.load.unit) * ramp,
  };
}

const stepCost = (axis, track) => {
  const L = LADDER[axis];
  if (axis === "load") return L.cost;
  return track[axis] < L.cost.length ? L.cost[track[axis]] : Infinity;
};

// Тратим бюджет жадно: пока хватает на любой шаг, выбираем ось по весам профиля.
export function spend(track, budget, profile, rnd, wave) {
  const bought = [];
  for (let guard = 0; guard < 40; guard++) {
    const opts = Object.keys(LADDER)
      .map(a => ({ a, c: stepCost(a, track), w: profile[a] || 0 }))
      .filter(o => o.c <= budget && o.w > 0 && wave >= LADDER[o.a].gate)
      // редкость не должна обгонять длину: «редкое слово из четырёх букв» —
      // это экзотика, а не сложность, и порядок осей она нарушает
      .filter(o => o.a !== "rank" || track.rank < track.len + 1);
    if (!opts.length) break;
    const total = opts.reduce((s, o) => s + o.w, 0);
    let r = rnd() * total, pick = opts[0];
    for (const o of opts) { if ((r -= o.w) <= 0) { pick = o; break; } }
    budget -= pick.c;
    track[pick.a]++;
    bought.push(pick.a);
  }
  return { left: budget, bought };
}

// ------------------------------------------------------------ модельный игрок
// Время на слово и вероятность его знать — обе оси упираются в редкость.
const RARE_T = r => r <= 1500 ? .2 : r <= 4000 ? .5 : r <= 10000 ? .9 : r <= 30000 ? 1.3 : 1.6;
const RARE_P = r => r <= 1500 ? .98 : r <= 4000 ? .93 : r <= 10000 ? .85 : r <= 30000 ? .72 : .6;
const SWITCH = 0.25;              // перевод пушки на другой блок

function solveTime(b, skill) {
  const open = b.shown.filter(ch => !ch).length || 1;
  return (1.0 + 0.18 * (b.word.length - 3) + 0.8 * (open - 1) + RARE_T(b.rank)) * skill;
}
const knows = (b, rnd, bonus) =>
  rnd() < Math.min(.99, Math.pow(RARE_P(b.rank), b.gaps.length) + bonus);

export function runOnce(seed, budgetOf, opts = {}) {
  const T = boot(seed);
  const rnd = mulberry32(seed * 7919 + 13);
  const maxWave = opts.maxWave || 16;
  // skill — множитель времени на слово, know — прибавка к вероятности знать.
  // Ими моделируется эффект взятых карт, которых в симуляции нет.
  const skill = opts.skill ?? 1, know = opts.know ?? 0;
  // Зачистка поля за один заряд с регенерацией «+1 за 10 слов» — бесконечная
  // страховка: она обнуляет весь накопленный рост. Растущая цена возвращает
  // бомбе смысл убероружия, которое надо копить.
  const bombCost = opts.bombCost ?? (w => (w <= 5 ? 1 : w <= 10 ? 2 : 3));

  T.reset(true);
  const track = makeTrack();
  globalThis.__rules = rulesFrom(track);

  const log = [];
  let wave = 1, carry = 0, done = 0, target = null, work = 0, giving = false;
  let frames = 0, idle = 0, loadSum = 0, lostAtWave = null;
  let resSum = 0, resMin = Infinity, resN = 0;
  let livesBefore = T.lives, solvedInWave = 0, gaveInWave = 0, boomInWave = 0;
  const DT = 1 / 60;

  while (wave <= maxWave && T.lives > 0) {
    const ramp = RAMP[0] + (RAMP[1] - RAMP[0]) * (done / QUOTA);
    globalThis.__rules = rulesFrom(track, ramp);

    // выбор цели: самый нижний живой блок, он же самый срочный
    if (!target || !T.alive(target)) {
      target = null;
      for (const b of T.blocks) {
        if (!T.alive(b) || b.broken) continue;
        if (!target || b.y > target.y) target = b;
      }
      if (target) {
        giving = !knows(target, rnd, know);
        work = solveTime(target, skill) * (giving ? 1.5 : 1) + SWITCH;
      }
    }

    if (target) {
      work -= DT;
      if (work <= 0) {
        if (giving) { T.kill(target); gaveInWave++; }
        else { T.finish(target); solvedInWave++; }
        target = null;
        done++;
      }
    } else idle++;

    // запас времени: сколько секунд осталось у самого нижнего блока
    let low = null;
    for (const b of T.blocks) if (T.alive(b) && (!low || b.y > low.y)) low = b;
    let sec = Infinity;
    if (low) {
      sec = (T.DANGER_Y - (low.y + low.h)) / low.speed;
      resSum += sec; resN++; resMin = Math.min(resMin, sec);
    }

    // Бомба — аварийный выход: нижний блок вот-вот пересечёт линию, а доделать
    // его игрок уже не успевает. Взорванные слова в квоту волны не идут,
    // так что зачистка ещё и удлиняет волну — за спасение платят временем.
    const cost = bombCost(wave);
    if (T.bombs >= cost && sec < 3.5 && sec < work) {
      T.bombAll();                       // сама игра списывает один заряд
      T.bombs = Math.max(0, T.bombs - (cost - 1));
      target = null; boomInWave++;
    }

    loadSum += T.fieldLoad();
    frames++;
    T.update(DT);

    if (done >= QUOTA) {
      const budget = budgetOf(wave) + carry;
      const profile = PROFILES[ORDER[Math.min(wave, ORDER.length) - 1]];
      const res = spend(track, budget, profile, rnd, wave);
      carry = Math.min(res.left, CARRY_CAP);
      log.push({
        wave, profile: ORDER[Math.min(wave, ORDER.length) - 1],
        solved: solvedInWave, gave: gaveInWave,
        lives: livesBefore - T.lives,
        idle: idle / frames, load: loadSum / frames,
        res: resN ? resSum / resN : 0, resMin: resN ? resMin : 0,
        boom: boomInWave, bombs: T.bombs,
        budget: globalThis.__rules.load / RAMP[1],
        bought: res.bought.join(","),
        rules: rulesFrom(track),
      });
      livesBefore = T.lives; solvedInWave = gaveInWave = boomInWave = 0;
      frames = idle = 0; loadSum = 0;
      resSum = 0; resN = 0; resMin = Infinity;
      done = 0; wave++;
    }
  }
  if (T.lives <= 0) lostAtWave = wave;
  return { log, lostAtWave, score: T.score, track, waves: wave - 1 };
}
