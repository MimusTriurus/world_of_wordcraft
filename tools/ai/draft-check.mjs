// Экран раздачи: когда поднимается и что на нём написано.
//
// Два правила, и оба легко нарушить незаметно:
//
//   1. Окно встаёт на ЧИСТОМ поле. Решённое слово догорает 0.45 с, но его часы
//      идут только в состоянии play, так что поднятая раньше раздача замораживает
//      последнее слово этапа на полувспышке и держит его за панелью до выбора.
//      Условие «нет живых» это допускало, условие «нет блоков вовсе» — нет.
//   2. Крупная строка — взятый рубеж, а не назначение экрана. Больше этап нигде
//      не объявляется: панель считает слова, а не этапы.
//
// Заодно проверяется, что на старте забега экрана нет вовсе — обойма выдаётся
// целиком, см. tools/ai/start-probe.mjs.
//
//   node tools/ai/draft-check.mjs
import { boot } from "../sim/harness.mjs";

const DT = 1 / 60;
const fail = [];
const ok = (n, c) => { console.log((c ? "ok   " : "ПЛОХО") + "  " + n); if (!c) fail.push(n); };

const g = boot(11);

// ---- 1. старт забега: экрана нет, обойма полная ------------------------------
g.reset(true);
ok(`забег начался сразу (${g.state})`, g.state === "play");
ok(`обойма полная: ${g.shells} снарядов, ${g.bombs} бомба, ${g.tips} подсказки`,
   g.shells === 3 && g.bombs === 1 && g.tips === 2);

// ---- 2. граница этапа: окно на чистом поле -----------------------------------
// Решаем всё, что появилось, — так этап добирается до квоты за разумное число
// кадров. finish() это ярлык стенда: показать слово целиком и зачесть.
// Заодно следим за последним словом этапа: сколько кадров оно догорало на поле
// после того, как его зачли. Раздача не должна отнимать у него анимацию.
let frames = 0, onField = -1, last = null, finAt = 0, goneAt = 0;
while (g.state === "play" && frames < 60 * 400) {
  const live = g.blocks.filter(b => b.state === "live");
  if (live.length) { last = live[0]; finAt = frames; goneAt = 0; g.finish(last); }
  g.update(DT);
  frames++;
  if (last && !goneAt && !g.blocks.includes(last)) goneAt = frames;
  if (g.state === "draft") onField = g.blocks.length;
}
ok(`раздача поднялась за ${frames} кадров (${(frames * DT).toFixed(2)} с)`,
   g.state === "draft");
ok(`это обойма, а не улучшение (${g.draft.kind})`, g.draft.kind === "supply");
ok(`в момент подъёма на поле блоков: ${onField}`, onField === 0);
{
  const burn = goneAt - finAt;
  ok(`последнее слово догорело целиком: ${burn} кадров ` +
     `(${(burn * DT).toFixed(2)} с при заявленных 0.45)`, burn >= 27);
  ok(`и окно встало сразу после него, а не спустя паузу: ${frames - goneAt} кадр`,
     frames - goneAt <= 2);
}

// ---- 3. крупно — рубеж, мелко — что делать -----------------------------------
ok(`заголовок «${g.draft.title}»`, /^ЭТАП \d+ ПРОЙДЕН!$/.test(g.draft.title));
{
  const big = "bold 26px 'Courier New', monospace";
  const w = g.measure(g.draft.title, big);
  ok(`заголовок ${w.toFixed(0)} px из ${g.W}`, w <= g.W - 24);
  // самый длинный возможный рубеж: двузначный круг
  const worst = g.measure("КРУГ 10 ПРОЙДЕН!", big);
  ok(`худший случай («КРУГ 10 ПРОЙДЕН!») ${worst.toFixed(0)} px`, worst <= g.W - 24);
  const sub = g.measure("выбери, чем пополнить обойму",
                        "13px 'Courier New', monospace");
  ok(`подпись ${sub.toFixed(0)} px`, sub <= g.W - 24);
}
g.drawDraft();
ok("drawDraft не падает", true);

// ---- 4. выбор даёт ровно свою порцию -----------------------------------------
{
  const was = { shells: g.shells, bombs: g.bombs, tips: g.tips };
  const s = g.SUPPLIES[0];
  g.takePick(0);
  ok(`взяли «${s.label}»: ${was[s.key]} → ${g.shells}`, g.shells === was.shells + s.n);
  ok("остальные кошельки не тронуты",
     g.bombs === was.bombs && g.tips === was.tips);
  ok(`забег продолжился (${g.state})`, g.state === "play");
}

console.log(fail.length ? "\nПРОВАЛЕНО: " + fail.join("; ") : "\nвсё сошлось");
process.exit(fail.length ? 1 : 0);
