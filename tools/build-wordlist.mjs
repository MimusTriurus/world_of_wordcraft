// Генератор словарных данных для word-shooter.html.
//
// Качает частотные корпуса и вшивает в игру, между маркерами WORDLIST, список
// слов в порядке частотности. Игра берёт из него сразу два:
//
//   слова для блоков — место в списке задаёт ось сложности «насколько слово
//                      ходовое», а сам список настолько велик, что слова
//                      почти не повторяются;
//   проверку ответа  — соседей (слова той же длины, отличающиеся на одну-две
//                      буквы) игра считает на лету по этому же списку.
//                      Л_С — это и ЛЕС, и ЛИС, а И__А — и ИГРА, и ИГЛА.
//
// Раньше соседи считались здесь и вшивались на каждое слово отдельно. Пока
// слов для блоков было около сотни, так выходило дешевле; со списком на
// тридцать тысяч общий корпус занимает меньше, чем его же соседи россыпью.
//
//   node tools/build-wordlist.mjs            скачать и пересобрать
//   node tools/build-wordlist.mjs --cache    взять уже скачанное из tools/.cache
//
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const GAME = path.join(ROOT, "word-shooter.html");
const CACHE = path.join(ROOT, "tools", ".cache");

const SOURCES = {
  ru: {
    url: "https://raw.githubusercontent.com/hermitdave/FrequencyWords/master/content/2018/ru/ru_50k.txt",
    file: "ru_raw.txt",
    alphabet: "абвгдежзийклмнопрстуфхцчшщъыьэюя",
    // формат «слово частота»
    parse: line => line.trim().split(/\s+/)[0] ?? "",
    // ё приводим к е: в алфавите ввода игры только е
    normalize: w => w.replace(/ё/g, "е"),
    valid: /^[а-я]{3,8}$/,
    // Корпус собран по субтитрам и полон мата. Слово из словаря может стать
    // ответом, а игра показывает достроенное слово на экране — поэтому чистим.
    // Английский список берётся в варианте no-swears, там это уже сделано.
    // Корень ищем где угодно в слове: «нахер» и «похрен» мимо привязки к началу.
    deny: /(ху[йеяю]|пизд|бляд|ебан|ебат|ебал|сука|суки|мудак|муди|г[ао]ндон|залуп|дроч|говн|срак|жопа|дерьм|шлюх|пид[оа]р|хер|хрен|манда|елда|минет|отсос|трах|сперм|нафиг)/,
    // Субтитры — это диалоги, и верхушку списка держат имена. Как загадка
    // «ДЖ_Н» бессмысленна: угадывать нечего, поэтому имена не загадываются.
    // Но из проверки ответов их убирать нельзя: вместе с «тиной» и «норой»
    // пропадали бы обычные существительные, и игра отвергала бы верную букву.
    // Список неполный по определению, редкие имена всё равно просочатся.
    noSpawn: ("джон джек джим майк мэри сара сэм том тим бен билл боб дэн дэйв дэвид крис " +
      "пол питер пит рик рон стив тед фрэнк чарли эдди энди эрик джейн джули кейт лиза линда " +
      "мэг нэнси рэйчел салли сьюзан хелен эмма джордж генри гарри ларри марк мартин митч ник " +
      "норман оскар патрик рэй роберт роджер скотт тайлер уолтер фил хэнк хосе хуан элли эмили " +
      "эрни джейк джейсон джефф джерри джина джоан джоди джоуи диана дон дуглас ева иден " +
      "картер кевин келли ким клара клод коул колин конор лана лео лестер луис макс мия " +
      "молли моника нейт оливия пенни перри рита рут райан саймон стэн тара тесс " +
      "тодд тони трейси уилл уэйд шон элис элла эндрю эшли иван петр саша маша ольга сергей " +
      "андрей алексей дима вася коля миша наташа таня лена катя оля юля игорь борис павел " +
      "денис артем виктор антон юра валера гена").split(" "),
  },
  en: {
    url: "https://raw.githubusercontent.com/first20hours/google-10000-english/master/google-10000-english-no-swears.txt",
    file: "en_raw.txt",
    alphabet: "abcdefghijklmnopqrstuvwxyz",
    // одно слово в строке, уже по убыванию частоты
    parse: line => line.trim(),
    valid: /^[a-z]{3,8}$/,
    noSpawn: ("john jack jim mike mary sarah sam tom tim ben bill bob dan dave david chris " +
      "paul peter pete rick ron steve ted frank charlie eddie andy eric jane julie kate lisa " +
      "linda nancy sally susan helen emma george henry harry larry mark martin mitch nick " +
      "oscar patrick ray robert roger scott tyler walter phil hank jose juan emily jake jason " +
      "jeff jerry gina joan joey diana kevin kelly kim clara cole colin lana leo lester luis " +
      "luke max mia molly monica nate nora olivia penny perry rita ruth ryan simon stan tara " +
      "tess tina todd tony tracy sean alice ella andrew ashley").split(" "),
  },
};

const useCache = process.argv.includes("--cache");

async function fetchList(key) {
  const src = SOURCES[key];
  const cached = path.join(CACHE, src.file);
  if (existsSync(cached)) return readFile(cached, "utf8");
  if (useCache) throw new Error(`нет кэша ${cached}, запусти без --cache`);
  process.stdout.write(`качаю ${key}: ${src.url}\n`);
  const res = await fetch(src.url);
  if (!res.ok) throw new Error(`${src.url} -> HTTP ${res.status}`);
  const text = await res.text();
  await mkdir(CACHE, { recursive: true });
  await writeFile(cached, text, "utf8");
  return text;
}

// слово -> место в частотном списке, плюс сам список чистых слов
// Мат вырезаем совсем: достроенное слово показывается на экране.
// Имена остаются словами корпуса, но помечаются как незагадываемые.
function corpus(text, src) {
  const rank = new Map();
  let dropped = 0;
  for (const line of text.split(/\r?\n/)) {
    let w = src.parse(line).toLowerCase();
    if (src.normalize) w = src.normalize(w);
    if (!src.valid.test(w)) continue;
    if (src.deny?.test(w)) { dropped++; continue; }
    if (!rank.has(w)) rank.set(w, rank.size + 1);
  }
  const noSpawn = (src.noSpawn || []).filter(w => rank.has(w));
  return { rank, dropped, noSpawn };
}

// ---------------------------------------------------------- части речи
// Частотный список — просто слова, без грамматики. По умолчанию в блоках
// нужны существительные в словарной форме, поэтому размечаем корпус по
// внешним словарям: n — существительное, v — глагол (инфинитив),
// a — прилагательное, «-» — всё прочее, включая падежные и личные формы.
// В игру уезжает строка меток по символу на слово.
const POS_SOURCES = {
  ru: [
    { tag: "n", url: "https://raw.githubusercontent.com/Harrix/Russian-Nouns/main/dist/russian_nouns.txt",
      file: "ru_nouns.txt", pick: line => line.trim() },
    { tag: "v", url: "https://raw.githubusercontent.com/Badestrand/russian-dictionary/master/verbs.csv",
      file: "ru_verbs.csv", skipHeader: true, pick: line => line.split("\t")[0] },
    { tag: "a", url: "https://raw.githubusercontent.com/Badestrand/russian-dictionary/master/adjectives.csv",
      file: "ru_adjs.csv", skipHeader: true, pick: line => line.split("\t")[0] },
  ],
  en: [
    // WordNet: индексные файлы, первое поле строки — лемма
    { tag: "n", url: "https://raw.githubusercontent.com/extjwnl/extjwnl-data-wn31/master/src/main/resources/net/sf/extjwnl/data/wordnet/wn31/index.noun",
      file: "en_index_noun.txt", pick: line => line.split(" ")[0] },
    { tag: "v", url: "https://raw.githubusercontent.com/extjwnl/extjwnl-data-wn31/master/src/main/resources/net/sf/extjwnl/data/wordnet/wn31/index.verb",
      file: "en_index_verb.txt", pick: line => line.split(" ")[0] },
    { tag: "a", url: "https://raw.githubusercontent.com/extjwnl/extjwnl-data-wn31/master/src/main/resources/net/sf/extjwnl/data/wordnet/wn31/index.adj",
      file: "en_index_adj.txt", pick: line => line.split(" ")[0] },
  ],
};

// Списки собраны людьми и местами врут: в существительные затесались
// наречия и местоимения. Самые заметные выбрасываем руками.
const NOT_NOUNS = new Set(("ваше вчера другое основное иное такое всякое каждое многое " +
  "нечто ничто нечего некого сколько столько нисколько сам сама само сами самом самое " +
  "твое твоя твои твой свое своя свои мое моя мои наше наша наши ваша ваши его ее их " +
  "тот та то те этот эта это эти спас нету оно они она").split(" "));

async function posTags(key, words, src) {
  const tag = new Map();
  for (const source of POS_SOURCES[key]) {
    const text = await fetchAny(key, source);
    const lines = text.split(/\r?\n/);
    for (let i = source.skipHeader ? 1 : 0; i < lines.length; i++) {
      let w = (source.pick(lines[i]) || "").toLowerCase();
      if (src.normalize) w = src.normalize(w);
      if (!src.valid.test(w)) continue;
      if (source.tag === "n" && NOT_NOUNS.has(w)) continue;
      if (!tag.has(w)) tag.set(w, source.tag);   // существительное важнее глагола
    }
  }
  return words.map(w => tag.get(w) || "-").join("");
}

async function fetchAny(key, source) {
  const cached = path.join(CACHE, source.file);
  if (existsSync(cached)) return readFile(cached, "utf8");
  if (useCache) throw new Error(`нет кэша ${cached}, запусти без --cache`);
  process.stdout.write(`качаю ${key}/${source.tag}: ${source.url}\n`);
  const res = await fetch(source.url);
  if (!res.ok) throw new Error(`${source.url} -> HTTP ${res.status}`);
  const text = await res.text();
  await mkdir(CACHE, { recursive: true });
  await writeFile(cached, text, "utf8");
  return text;
}

const START = "  // >>> WORDLIST START <<<";
const END = "  // >>> WORDLIST END <<<";

// Порядок слов в строке = порядок частотности, по нему игра и считает ранг.
function wrap(words) {
  const chunks = [];
  let line = "";
  for (const w of words) {
    if (line.length + w.length + 1 > 100) { chunks.push(line); line = ""; }
    line += (line ? " " : "") + w;
  }
  if (line) chunks.push(line);
  return chunks.map((c, i) =>
    `      "${c}${i === chunks.length - 1 ? "" : " "}"`).join(" +\n") + ",";
}

function renderBlock(data) {
  const lines = [START, "  const CORPUS = {"];
  for (const key of ["ru", "en"]) {
    const { words, url } = data[key];
    lines.push(`    // ${words.length} слов по убыванию частотности, ${url}`);
    lines.push(`    ${key}:`, wrap(words));
  }
  lines.push("  };");
  lines.push("  // Имена: остаются верными ответами, но в блоках не загадываются.");
  lines.push("  const NO_SPAWN = {");
  for (const key of ["ru", "en"]) lines.push(`    ${key}:`, wrap(data[key].noSpawn));
  lines.push("  };");
  lines.push("  // Часть речи на каждое слово корпуса, по символу и в том же порядке:");
  lines.push("  // n — существительное, v — глагол, a — прилагательное, «-» — прочее.");
  lines.push("  const POS = {");
  for (const key of ["ru", "en"]) {
    const t = data[key].tags;
    const rows = [];
    for (let i = 0; i < t.length; i += 100) rows.push(t.slice(i, i + 100));
    lines.push(`    ${key}:`);
    lines.push(rows.map(r => `      "${r}"`).join(" +\n") + ",");
  }
  lines.push("  };", END);
  return lines.join("\n");
}

const html = await readFile(GAME, "utf8");
const data = {};

for (const key of ["ru", "en"]) {
  const src = SOURCES[key];
  const { rank, dropped, noSpawn } = corpus(await fetchList(key), src);
  const words = [...rank.keys()];
  const tags = await posTags(key, words, src);
  data[key] = { words, noSpawn, tags, url: src.url };

  const count = t => [...tags].filter(c => c === t).length;
  process.stdout.write(
    `${key}: ${words.length} слов (мат вырезан: ${dropped}, имена не загадываются: ` +
    `${noSpawn.length}) | существительных ${count("n")}, глаголов ${count("v")}, ` +
    `прилагательных ${count("a")}, прочего ${count("-")}\n`);
}

const from = html.indexOf(START);
const to = html.indexOf(END);
if (from === -1 || to === -1) throw new Error("маркеры WORDLIST не найдены в word-shooter.html");

const patched = html.slice(0, from) + renderBlock(data) + html.slice(to + END.length);
await writeFile(GAME, patched, "utf8");
process.stdout.write(`word-shooter.html: ${html.length} -> ${patched.length} символов\n`);
