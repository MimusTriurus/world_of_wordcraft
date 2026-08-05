// Проверка разреза «правила / вид».
//
// Логика не пишет в DOM и не мерит текст холстом: панель собирается в hudView()
// простым объектом строк, в разметку пишет только paintHud(), а единственная
// мера, которая правилам нужна, идёт через measure(). Проверяется и то, что
// view-модель доезжает до элементов, и то, что техническая сводка — список
// строк, а не готовая разметка.
//
//   node tools/ai/view-check.mjs
import { boot } from "../sim/harness.mjs";

const DT = 1 / 60;
const fail = [];
const ok = (n, c) => { console.log((c ? "ok   " : "ПЛОХО") + "  " + n); if (!c) fail.push(n); };

const g = boot(7);

// ---- 1. hudView() это простые строки, без разметки и без DOM -----------------
g.reset(true); g.takePick(0);
for (let i = 0; i < 240; i++) g.update(DT);
const v = g.hudView();
const keys = ["score", "lap", "stage", "words", "combo", "lives", "bombs", "shells"];
ok(`ключи на месте: ${keys.join(", ")}`,
   keys.every(k => typeof v[k] === "string"));
ok(`панель: круг ${v.lap}, этап ${v.stage}, слова ${v.words}`,
   /^\d+$/.test(v.lap) && /^\d+\/\d+$/.test(v.stage) && /^\d+\/\d+$/.test(v.words));
ok("разметки в значениях нет", keys.every(k => !/[<>]/.test(v[k])));
ok("скрытая сводка не собрана", v.rules === null && g.rulesShown === false);
ok("и в разметке скрыта", g.rulesDisplay === "none");
ok("пока скрыта — в разметку ничего не пишется", g.rulesText === "");

// ---- 2. панель, доехавшая до DOM, совпадает с view-моделью -------------------
ok(`hudLevel «${g.hudLevel}» собран из тех же полей`,
   g.hudLevel === `${v.lap}·${v.stage}·${v.words}`);

// ---- 3. сводка: список строк, склейка — дело вида ----------------------------
// Показ поднимается клавишей, а не прямой правкой showRules: проверять надо ту
// дверь, которой пользуется игрок.
g.key("0");
ok("клавиша 0 подняла сводку", g.rulesShown === true);
const list = g.hudView().rules;
ok(`сводка это список из ${list.length} строк`, Array.isArray(list) && list.length >= 7);
ok("в строках нет разметки", list.every(s => !/[<>]/.test(s)));
ok(`первая строка «${list[0]}»`, typeof list[0] === "string" && list[0].length > 0);
ok("в разметке склеено через <br>", g.rulesText === list.join("<br>"));
ok(`показана: display=${g.rulesDisplay}`, g.rulesDisplay === "block");
ok(`есть «выпущено»: ${list.find(s => s.startsWith("выпущено"))}`,
   list.some(s => /^выпущено \d+\/\d+$/.test(s)));
ok("есть скорость и плотность",
   list.some(s => s.startsWith("скорость")) && list.some(s => s.startsWith("плотность")));
g.key("0");
ok("0 снова скрыла", g.rulesShown === false && g.rulesDisplay === "none");

// ---- 4. мера текста подменяется, холст для этого не нужен --------------------
const real = g.measure;
ok("measure отдаётся наружу", typeof real === "function");
const w13 = real("привет", "13px 'Courier New', monospace");
const w26 = real("привет", "26px 'Courier New', monospace");
ok(`мера зависит от кегля: ${w13} против ${w26}`, w26 > w13 * 1.9);

let asked = 0;
g.measure = (text, font) => { asked++; return real(text, font); };

// Подсказка — единственный потребитель меры. Кошелёк здесь не при чём, поэтому
// подсказки бесплатные: проверяется разбивка, а не оплата. Пушку наводим на
// живой блок сами — hint() берёт слово из своей колонки.
g.reset(true); g.takePick(0);
g.mods.freeTips = true;
for (let i = 0; i < 900 && !asked; i++) {
  g.update(DT);
  const b = g.blocks.find(x => x.state === "live" && !x.broken);
  if (!b) continue;
  g.cannonX = b.x + b.w / 2;
  g.hint();
}
g.mods.freeTips = false;
ok(`разбивка спросила меру ${asked} раз`, asked > 0);
g.measure = real;

// ---- 5. в DOM пишет ровно одно место ----------------------------------------
// Статическая проверка, но по делу: `el` — единственная дверь в разметку, и
// встречаться он должен только в paintHud. Строчные комментарии выкидываем,
// иначе проверка ловит собственные пояснения.
{
  const { readFileSync } = await import("node:fs");
  const html = readFileSync(new URL("../../word-shooter.html", import.meta.url), "utf8")
    .replace(/^[ \t]*\/\/.*$/gm, "");
  const uses = [...html.matchAll(/\bel\.\w+/g)].length;
  const inPaint = /function paintHud\(v\) \{[\s\S]*?\n  \}/.exec(html);
  const inside = inPaint ? [...inPaint[0].matchAll(/\bel\.\w+/g)].length : 0;
  ok(`обращений к el всего ${uses}, из них в paintHud ${inside}`,
     inPaint && uses === inside);
  // Разбивка подсказки — то самое место, где правила однажды лезли в холст.
  // Отрисовке мерить текст можно и нужно (тем же measure пользуется рамка
  // приглашения), поэтому проверяется именно wrapText, а не весь файл.
  const wrap = /function wrapText\([\s\S]*?\n  \}/.exec(html);
  ok("wrapText не знает про холст", wrap && !/\bctx\./.test(wrap[0]));
  ok("и мерит через measure()", wrap && /measure\(/.test(wrap[0]));
}

console.log(fail.length ? "\nПРОВАЛЕНО: " + fail.join("; ") : "\nвсё сошлось");
process.exit(fail.length ? 1 : 0);
