// Проверка склейки кадра и автопилота: переключатель в модификаторах, забег,
// который ведёт сам frame(), плавность пушки, отказ записывать забег бота в
// таблицу рекордов.
//
// Гонялки это не покрывают — они зовут update()/tick() сами, минуя frame().
//
//   node tools/ai/frame-check.mjs
import { boot } from "../sim/harness.mjs";

const g = boot(5);
const fail = [];
const ok = (n, c) => { console.log((c ? "ok   " : "ПЛОХО") + "  " + n); if (!c) fail.push(n); };

// ---- 1. пункт меню на месте и переключает -----------------------------------
const item = g.SCREENS.mods.find(i => i.label === "Автопилот");
ok("пункт «Автопилот» есть в модификаторах", !!item);
ok("по умолчанию выключен", g.mods.autopilot === false && item.value() === "выкл");
item.act();
ok("переключается", g.mods.autopilot === true && item.value() === "вкл");

// ---- 2. кадр создаёт автопилот и ведёт забег без участия человека ------------
g.reset(true);
ok("автопилот сброшен вместе с забегом", g.autopilot === null);
// Пушка должна ехать, а не телепортироваться: следим за самым большим скачком за
// кадр. Предел — скорость руки за 1/60 с плюс запас на округление.
let now = 0, prevX = g.cannonX, maxJump = 0, moved = 0;
for (let f = 0; f < 60 * 240 && g.state !== "over"; f++) {
  now += 1000 / 60;
  g.frame(now);
  const d = Math.abs(g.cannonX - prevX);
  if (d > 0.001) moved++;
  if (d > maxJump) maxJump = d;
  prevX = g.cannonX;
}
const limit = g.BOT_KNOBS.AIM_SPEED / 60 + 0.5;
ok(`пушка едет, а не прыгает: макс. скачок ${maxJump.toFixed(1)} px/кадр ` +
   `(предел ${limit.toFixed(1)})`, maxJump <= limit);
ok(`кадров с движением: ${moved}`, moved > 100);
ok("автопилот создан кадром", g.autopilot !== null);
ok(`забег шёл сам: решены слова (${g.solved})`, g.solved > 5);
console.log(`       круг ${g.lap}, очки ${g.score}, жизней ${g.lives}, ` +
            `состояние ${g.state}`);

// ---- 3. забег бота идёт в общую таблицу, но помечен ботом ---------------------
const before = g.bestOf(g.lang).length;
ok("recordRun вернул место", g.recordRun() >= 0);
ok(`строк прибавилось (${before} → ${g.bestOf(g.lang).length})`,
   g.bestOf(g.lang).length === before + 1);
ok("строка помечена ботом", g.lastBot === true && g.lastRow.bot === true);
ok(`таблица не длиннее ${g.BEST_MAX}`, g.bestOf(g.lang).length <= g.BEST_MAX);
g.mods.autopilot = false;
ok("без автопилота запись идёт игроку", g.recordRun() >= 0 && g.lastBot === false);
ok("и она ботом не помечена", g.lastRow.bot === false);

// ---- 4. отрисовка при включённом автопилоте не падает -----------------------
g.mods.autopilot = true;
g.draw(); g.syncHud();
ok("draw и syncHud живы", true);

console.log(fail.length ? "\nПРОВАЛЕНО: " + fail.join("; ") : "\nвсё сошлось");
process.exit(fail.length ? 1 : 0);
