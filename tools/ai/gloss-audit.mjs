// Сколько толкований не толкуют ничего.
//
// Однокоренные слова в толкованиях затёрты многоточием, чтобы подсказка не
// выдавала ответ. У части статей после затирания не остаётся содержания вовсе:
// «действие по значению гл. …, …» подходит к тысяче слов. Игра при этом берёт
// за такую подсказку полноценную плату из своего кошелька и отказывается только
// от слов, у которых толкования нет совсем.
//
// Замер вырос из проверки HINT_HELPS: собранная выборка из сорока слов, на
// которых бот застрял, решилась целиком, но два пункта решились по шаблону, а
// не по толкованию — оба были такими пустышками.
//
//   node tools/ai/gloss-audit.mjs [ru|en] [сколько примеров]
import { boot } from "../sim/harness.mjs";

const g = boot(1);
const lang = process.argv[2] || "ru";
const show = +(process.argv[3] || 12);

// Что осталось от толкования, если убрать затёртое и служебные обороты.
const FRAMES = [
  /^действие по значению гл\.?/i,
  /^страд\. прич\..*$/i,
  /^то же, что/i,
  /^уменьш\.-ласк\. к/i,
  /^,?\s*состояние по значению/i,
  /^свойство по значению/i,
  /^результат действия по значению/i,
];

function content(text) {
  let s = text;
  for (const f of FRAMES) s = s.replace(f, " ");
  s = s.replace(/…/g, " ")                    // затёртое
       .replace(/\bгл\.|\bсущ\.|\bприл\.|\bнесов\.|\bсов\./g, " ")
       .replace(/[^а-яёa-z\s-]/gi, " ");
  // слова длиннее трёх букв — то, за что можно зацепиться
  return s.split(/\s+/).filter(w => w.length > 3);
}

const gloss = g.oracle ? null : null;         // читаем через glossOf по корпусу
const words = [];
for (const list of g.BY_LEN[lang].values()) for (const w of list) words.push(w);

let total = 0, empty = 0, thin = 0;
const examples = { empty: [], thin: [] };
// glossOf смотрит на текущий язык игры, поэтому для en его надо переключить
if (lang !== g.lang) { console.log("для en нужен запуск игры на en; пока только ru"); process.exit(0); }

for (const w of words) {
  const text = g.glossOf(w);
  if (!text) continue;
  total++;
  const c = content(text);
  if (c.length === 0) { empty++; if (examples.empty.length < show) examples.empty.push([w, text]); }
  else if (c.length <= 2) { thin++; if (examples.thin.length < show) examples.thin.push([w, text]); }
}

const pct = n => (n / total * 100).toFixed(1) + "%";
console.log(`толкований в словаре ${lang}: ${total}`);
console.log(`пустых — содержания не осталось вовсе: ${empty} — ${pct(empty)}`);
console.log(`коротких — одно-два слова: ${thin} — ${pct(thin)}`);

console.log("\nпустые (это и есть находка: за такую подсказку игра берёт плату):");
for (const [w, t] of examples.empty) console.log(`  ${w} — ${t}`);

// Короткие в счёт не идут. Эвристика их не отличает от годных, а «век —
// столетие» и «вид — внешний облик» толкуют слово прекрасно. Считать их
// бесполезными значило бы завысить находку вчетверо.
console.log("\nкороткие — среди них много годных, поэтому в счёт не идут:");
for (const [w, t] of examples.thin) console.log(`  ${w} — ${t}`);
