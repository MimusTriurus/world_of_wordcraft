// ПЕРЕПЛАВКА: буквы снесённого слова летят в чужие пропуски и встают в них.
//
// Это первое улучшение с настоящим эффектом, поэтому проверяется не картинка, а
// правила: адрес берётся по тому же acceptsAt, по которому игру устраивает
// выстрел; две буквы не летят в одну ячейку; чужое слово на пути — стена;
// испорченное не адресуется; после свистка буква не встаёт.
import { boot } from "../sim/harness.mjs";

const DT = 1 / 60;
const fail = [];
const ok = (n, c) => { console.log((c ? "ok   " : "ПЛОХО") + "  " + n); if (!c) fail.push(n); };

// Забег, доведённый до состояния «есть блок под пушкой и есть соседи».
function ready(seed, { smelt = true, stage = 0, others = 1 } = {}) {
  const g = boot(seed);
  g.reset(true);
  // Забег начинается с закрытой обоймой, а стенду нужен снос. Открываем слот
  // тем же путём, что и игра, — окно харнесс закроет сам на первом же update.
  g.unlock("shells");
  if (smelt) g.taken.add("smelt");
  g.stage = stage;
  for (let i = 0; i < 3000; i++) {
    g.update(DT);
    const live = g.blocks.filter(x => x.state === "live");
    const b = live.find(x => x.y + x.h > 80 && x.y + x.h < g.CANNON_Y - 60 &&
                             x.shown.some(Boolean));   // есть что переплавлять
    if (b && live.length >= others + 1 && g.cooldown === 0) {
      g.cannonX = b.x + b.w / 2;
      return { g, b };
    }
  }
  return { g, b: null };
}

const shatterOf = (g, b) => {                    // снести и вернуть осколки
  g.shootBlock();
  let f = 0;
  while (!g.shards.length && f < 200) { g.update(DT); f++; }
  return g.shards.slice();
};

// Ведомые находятся не на каждом сиде: соседу может не подойти ни одна буква из
// снесённого слова, и это законно. Поэтому сцена ищется по сидам, а не берётся
// первая попавшаяся, — иначе проверка зависела бы от везения.
function findLed(from = 1, to = 40, opts = {}) {
  for (let seed = from; seed <= to; seed++) {
    const { g, b } = ready(seed, Object.assign({ smelt: true }, opts));
    if (!b) continue;
    const air = shatterOf(g, b);
    const led = air.filter(s => s.seek);
    if (led.length) return { g, b, air, led, seed };
  }
  return null;
}

// ---- 1. улучшение есть в списке и по умолчанию не взято ----------------------
{
  const g = boot(1);
  const u = g.UPGRADES.find(x => x.id === "smelt");
  ok(`пункт есть: ${u && u.name}`, !!u);
  ok(`подпись: «${u.note}»`, /пропуск/.test(u.note));
  g.reset(true);
  ok("по умолчанию не взято", !g.taken.has("smelt"));

  // У каждого улучшения обязана быть иконка: рисуется она примитивами холста, и
  // её отсутствие валит весь экран раздачи. Ровно это и случилось, когда пункт
  // добавили, а иконку нет, — стенд поймал падение в demo-режиме.
  const noIcon = g.UPGRADES.filter(x => typeof g.ICONS[x.id] !== "function");
  ok(`иконка есть у всех ${g.UPGRADES.length} улучшений` +
     (noIcon.length ? ": нет у " + noIcon.map(x => x.id).join(", ") : ""),
     noIcon.length === 0);

  // И подпись обязана влезать в карточку. Ширина считается тем же measure, что
  // у самой игры, и тем же шрифтом, каким подпись рисуется.
  const NOTE_FONT = "12px 'Courier New', monospace";
  const room = 330 - 62 - 12;                  // DRAFT_W минус отступ под иконку
  const wide = g.UPGRADES
    .map(x => ({ x, w: g.measure(x.note, NOTE_FONT) }))
    .filter(o => o.w > room);
  ok(`подписи влезают в ${room} px` +
     (wide.length ? ": вылезают " + wide.map(o => `${o.x.id} (${o.w.toFixed(0)})`).join(", ")
                  : ` (самая длинная ${Math.max(...g.UPGRADES.map(x => g.measure(x.note, NOTE_FONT))).toFixed(0)})`),
     wide.length === 0);
}

// ---- 2. без улучшения адресов нет вовсе --------------------------------------
{
  const { g, b } = ready(3, { smelt: false });
  ok("блок найден", !!b);
  const air = shatterOf(g, b);
  ok(`осколков ${air.length}, ведомых 0`, air.length > 0 &&
     air.every(s => !s.seek));
}

// ---- 3. с улучшением: адрес законный, и он один на ячейку --------------------
{
  const found = findLed();
  ok("сцена с ведомыми нашлась", !!found);
  const { g, b, air, led, seed } = found;
  console.log(`       сид ${seed}: осколков ${air.length}, из них ведомых ${led.length}`);
  ok("ведёт только настоящие буквы, не прочерки и не ошибки",
     led.every(s => s.ch !== "_" && !s.wrong));
  ok("каждый адрес — открытый пропуск, принимающий эту букву",
     led.every(s => {
       const { b: t, i } = s.seek;
       return t !== b && !t.shown[i] && t.gaps.includes(i) && !t.broken &&
              g.oracle.acceptsAt(t, i).has(s.ch);
     }));
  const keys = led.map(s => g.blocks.indexOf(s.seek.b) + ":" + s.seek.i);
  ok(`адреса не повторяются: ${keys.join(", ")}`,
     new Set(keys).size === keys.length);
  ok("ведомые не кувыркаются", led.every(s => s.spin === 0));
  ok("скорость у ведомых та же", led.every(s =>
     Math.abs(Math.hypot(s.vx, s.vy) - g.SHARD_SPEED) < 1e-9));
}

// ---- 4. долетела — встала; и никому не навредила -----------------------------
{
  let placed = 0, lost = 0, hurt = 0, checked = 0;
  for (let seed = 1; seed <= 40; seed++) {
    const { g, b } = ready(seed, { smelt: true });
    if (!b) continue;
    const air = shatterOf(g, b);
    const led = air.filter(s => s.seek);
    if (!led.length) continue;
    checked++;
    const want = led.map(s => ({ s, t: s.seek.b, i: s.seek.i, ch: s.ch,
                                 strikes: s.seek.b.strikes,
                                 broken: s.seek.b.broken }));
    // Ждём, пока все ведомые не разрешатся. Мир идёт, блоки едут, ведение
    // пересчитывается — это и есть проверка ведения.
    let f = 0;
    while (g.shards.some(s => led.includes(s)) && f < 60 * 20) { g.update(DT); f++; }
    for (const w of want) {
      if (w.t.shown[w.i] === w.ch) placed++;
      else lost++;
      // Ни удара, ни порчи: буква либо встала, либо разбилась.
      if (w.t.strikes !== w.strikes || (!w.broken && w.t.broken)) hurt++;
    }
  }
  ok(`из ${checked} забегов: букв встало ${placed}, не доехало ${lost}`,
     placed > 0);
  ok(`ни одного удара по слову-адресу (${hurt})`, hurt === 0);
  console.log(`       доезжает ${(100 * placed / (placed + lost)).toFixed(0)}% ` +
              `ведомых букв — остальные встречают чужое слово или теряют адрес`);
}

// ---- 5. чужое слово на пути — стена -----------------------------------------
{
  // Ставим сцену руками: адрес за спиной другого блока. Ищем случай в живой
  // игре, а не подстраиваем поле, — подстроенное поле проверяло бы заглушку.
  let blocked = 0, seen = 0;
  for (let seed = 1; seed <= 40 && blocked < 1; seed++) {
    const { g, b } = ready(seed, { smelt: true, others: 2 });
    if (!b) continue;
    const air = shatterOf(g, b);
    for (const s of air.filter(x => x.seek)) {
      seen++;
      const t = s.seek.b, i = s.seek.i;
      let f = 0;
      while (g.shards.includes(s) && f < 60 * 20) { g.update(DT); f++; }
      if (t.shown[i] !== s.ch && !t.broken && g.alive(t)) blocked++;
    }
  }
  ok(`случаи «не доехала, хотя адрес жив»: ${blocked} из ${seen} — стена работает`,
     blocked > 0);
}

// ---- 6. после свистка буква не встаёт ---------------------------------------
{
  const { g, led } = findLed(7);
  const s = led[0], t = s.seek.b, i = s.seek.i;
  g.state = "over";                        // забег кончился, пока буква в пути
  let f = 0;
  while (g.shards.includes(s) && f < 60 * 20) { g.update(DT); f++; }
  ok(`после конца забега буква не встала (в ячейке «${t.shown[i] || "—"}»)`,
     t.shown[i] !== s.ch);
}

// ---- 7. забег с переплавкой и без: бот берёт её, когда предложат -------------
// Смотрим прямо в раздачу: предлагали ли ПЕРЕПЛАВКУ и взял ли он её. Судить по
// одному забегу нельзя — карточек в списке три из четырнадцати, и её может не
// оказаться вовсе.
{
  let offers = 0, missed = 0, drafts = 0;
  for (let seed = 1; seed <= 12; seed++) {
    const g = boot(seed);
    const bot = g.makeAutopilot({ seed, cls: "быстрый" });
    g.reset(true);
    let offered = false, wasDraft = false;
    for (let t = 0; g.state !== "over" && t < 60 * 900; t++) {
      bot.tick(DT); g.update(DT);
      const up = g.state === "draft" && g.draft.kind === "upgrade";
      if (up) {
        wasDraft = true;
        if (g.draft.cards.some(c => c.id === "smelt")) offered = true;
      } else if (wasDraft) {                     // экран закрылся — считаем итог
        drafts++;
        if (offered) { offers++; if (!g.taken.has("smelt")) missed++; }
        wasDraft = false; offered = false;
      }
    }
  }
  console.log(`       раздач улучшений ${drafts}, из них с ПЕРЕПЛАВКОЙ ${offers}`);
  ok(`предложили ${offers} раз — не взял ${missed}`, offers > 0 && missed === 0);
}

console.log(fail.length ? "\nПРОВАЛЕНО: " + fail.join("; ") : "\nвсё сошлось");
process.exit(fail.length ? 1 : 0);
