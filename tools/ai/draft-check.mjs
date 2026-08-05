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

// ---- 1. старт забега: экрана нет, обойма ПУСТА и закрыта ---------------------
g.reset(true);
ok(`забег начался сразу (${g.state})`, g.state === "play");
ok(`обойма пуста: ${g.shells} снарядов, ${g.bombs} бомб, ${g.tips} подсказок`,
   g.shells === 0 && g.bombs === 0 && g.tips === 0);
ok(`все три слота закрыты (${g.unlocked.size})`, g.unlocked.size === 0);
ok("и раздаче нечего предлагать", g.openSupplies().length === 0);

// ---- 1а. слот открывается окном, и окна идут по одному -----------------------
// На отдельном забеге: основной нужен чистым, чтобы на его первой границе
// сработала страховка лестницы, см. пункт 2.
{
  const g = boot(11);
  g.reset(true);
  for (const key of ["tips", "shells", "bombs"]) g.unlock(key);
  ok(`окно встало (${g.state})`, g.state === "teach");
  ok(`и показывает первый открытый слот (${g.teach.key})`, g.teach.key === "tips");
  let seen = 0;
  while (g.state === "teach" && seen < 8) { seen++; g.nextTeach(); }
  ok(`окон подряд ровно три, по одному на слот: ${seen}`, seen === 3);
  ok(`забег продолжился (${g.state})`, g.state === "play");
  ok(`порции пришли: ${g.shells}/${g.bombs}/${g.tips}`,
     g.shells === 3 && g.bombs === 1 && g.tips === 2);
  ok("и раздача теперь предлагает все три", g.openSupplies().length === 3);
  // Строки окна обязаны влезать в панель: она уже 470 px, а не карточка.
  const wide = g.TEACH.flatMap(t => [
    { s: t.why, w: g.measure(t.why, "13px 'Courier New', monospace") },
    { s: t.how, w: g.measure(t.how, "bold 13px 'Courier New', monospace") },
  ]).concat({ s: g.TEACH_FOOT,
              w: g.measure(g.TEACH_FOOT, "12px 'Courier New', monospace") })
    .filter(o => o.w > g.W - 60);
  ok(`строки окна влезают в ${g.W - 60} px` +
     (wide.length ? ": вылезают " + wide.map(o => `«${o.s}» (${o.w.toFixed(0)})`).join(", ") : ""),
     wide.length === 0);
  ok("у каждого слота есть иконка",
     g.TEACH.every(t => typeof g.ICONS[t.key] === "function"));
  g.teach.key = "tips"; g.drawTeach(); g.teach.key = null;
  ok("drawTeach не падает", true);
}

// ---- 2. граница этапа: страховка лестницы, а следом окно на чистом поле -------
// Решаем всё, что появилось, — так этап добирается до квоты за разумное число
// кадров. finish() это ярлык стенда: показать слово целиком и зачесть.
// Заодно следим за последним словом этапа: сколько кадров оно догорало на поле
// после того, как его зачли. Раздача не должна отнимать у него анимацию.
//
// Играя так, стенд не промахивается ни разу и ни одного блока до половины поля
// не допускает — то есть НИ ОДИН слот сам не открывается. Ровно этот случай и
// обворовывал умелого игрока: раздачи из открытых слотов при всех закрытых не
// бывает, и пройденная граница не платила ничего. Здесь проверяется, что
// страховка на первой границе открывает всё оставшееся, окна проходят ПЕРЕД
// раздачей, а раздача дожидается своей очереди.
g.autoTeach = false;             // окна нужны стенду видимыми, а не проглоченными
let frames = 0, onField = -1, last = null, finAt = 0, goneAt = 0;
while (g.state === "play" && frames < 60 * 400) {
  const live = g.blocks.filter(b => b.state === "live");
  if (live.length) { last = live[0]; finAt = frames; goneAt = 0; g.finish(last); }
  g.update(DT);
  frames++;
  if (last && !goneAt && !g.blocks.includes(last)) goneAt = frames;
  if (g.state === "teach" && onField === -1) onField = g.blocks.length;
}
// Первой встаёт лестница, и поле под ней уже чистое — то же условие, что у
// раздачи: stageDone требует, чтобы блоков не было вовсе.
ok(`окна лестницы встали за ${frames} кадров (${(frames * DT).toFixed(2)} с)`,
   g.state === "teach");
ok(`ни один слот не открылся сам: ${g.unlocked.size} из 3 к границе`,
   g.unlocked.size === 3);      // все три открыты страховкой разом
{
  let seen = 0;
  while (g.state === "teach" && seen < 8) { seen++; g.nextTeach(); }
  ok(`окон на границе три, по одному на слот: ${seen}`, seen === 3);
  ok(`порции пришли: ${g.shells}/${g.bombs}/${g.tips}`,
     g.shells === 3 && g.bombs === 1 && g.tips === 2);
}
g.autoTeach = true;
ok(`и следом раздача, а не игра (${g.state})`, g.state === "draft");
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
ok("на границе этапа обойма сама не приходит", g.draft.stocked === false);
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

// ---- 5. граница круга: обойма пришла сама, и панель об этом говорит -----------
// Доигрываем оставшиеся этапы круга тем же способом. Кошельки снимаем перед
// последней границей: за круг должна прийти полная порция каждого слота.
let was = null;
for (let f = 0; f < 60 * 1200 && g.draft.kind !== "upgrade"; f++) {
  if (g.state === "draft") { g.takePick(0); continue; }
  const live = g.blocks.filter(b => b.state === "live");
  if (live.length) g.finish(live[0]);
  was = { shells: g.shells, bombs: g.bombs, tips: g.tips };
  g.update(DT);
}
ok(`дошли до границы круга (${g.draft.kind})`, g.draft.kind === "upgrade");
ok(`заголовок «${g.draft.title}»`, /^КРУГ \d+ ПРОЙДЕН!$/.test(g.draft.title));
ok("панель знает, что обойма пришла", g.draft.stocked === true);
{
  const grew = g.SUPPLIES.every(s =>
    ({ shells: g.shells, bombs: g.bombs, tips: g.tips })[s.key] === was[s.key] + s.n);
  ok(`порции пришли целиком: ${was.shells}→${g.shells} снарядов, ` +
     `${was.bombs}→${g.bombs} бомб, ${was.tips}→${g.tips} подсказок`, grew);
}
{
  const line = g.SUPPLIES.map(s => `+${s.n} ${s.one}`).join(" · ");
  const w = g.measure(line, "bold 13px 'Courier New', monospace");
  ok(`строка «${line}» — ${w.toFixed(0)} px из ${g.W}`, w <= g.W - 24);
}
// Шапка выросла под третью строку, а не поджала её к первой карточке. Числа
// берём у игры: копия формулы проверяла бы себя.
{
  const top = g.draftTop(), first = g.draftRect(0);
  ok(`шапка ${g.draftHead()} px, указание на ${top + 94}, ряды с ${first.y}`,
     first.y - (top + 94) >= 12);
  ok("панель целиком на холсте", top >= 0 && first.y + first.h < g.H);
}
g.drawDraft();
ok("drawDraft с обоймой не падает", true);
// Мышь попадает туда, куда рисуется: draftAt считает по тем же draftRect, и
// разъехавшаяся шапка увела бы попадание на ряд вверх.
{
  const last = g.draftRect(g.draftRows() - 1);
  g.pointer("pointermove", { clientX: last.x + last.w / 2,
                             clientY: last.y + last.h / 2 });
  ok(`курсор в последнем ряду выбрал его (${g.draft.index})`,
     g.draft.index === g.draftRows() - 1);
}

console.log(fail.length ? "\nПРОВАЛЕНО: " + fail.join("; ") : "\nвсё сошлось");
process.exit(fail.length ? 1 : 0);
