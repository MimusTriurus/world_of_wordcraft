// Генератор словарных данных для word-shooter.html.
//
// Игра берёт слова для блоков из курируемого списка WORDS внутри самой игры.
// Этот скрипт качает частотные корпуса и вшивает в игру, между маркерами
// WORDLIST, по две вещи на каждое такое слово:
//
//   ранг     — место в частотном списке. Ось сложности: чем реже слово
//              встречается в речи, тем позже оно появляется в игре.
//   соседи   — настоящие слова той же длины, отличающиеся не более чем двумя
//              буквами. Из них считается, какие буквы засчитывать в пропуски:
//              Л_С — это и ЛЕС, и ЛИС, а И__А — и ИГРА, и ИГЛА, и ИКРА.
//
// Соседей достаточно двух замен, потому что больше двух пропусков в блоке
// не бывает. Возить в игре весь корпус ради этого не нужно.
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

// Сколько букв игра может выбить из слова. В коротком слове два пропуска
// оставляют одну известную букву — это уже не загадка, а лотерея, поэтому
// глубина растёт вместе с длиной. Отсюда же и глубина поиска соседей.
const maxGaps = len => (len <= 4 ? 1 : 2);

// Сколько соседей держать на слово: список отсортирован по частотности,
// хвост из редкой экзотики только раздувает файл.
const NEIGHBOUR_CAP = 120;

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
    deny: /^(ху[йеяю]|пизд|[е]б[ауеиоНн]|бля|сук[аиуе]$|муд[ао]|г[ао]ндон|залуп|дроч|говн|срак|жоп|дерьм|шлюх|мраз|пид[оа]р|хер[аоуни]|манда$|елда|минет|отсос|трах[ан]|сперм|очко$)/,
  },
  en: {
    url: "https://raw.githubusercontent.com/first20hours/google-10000-english/master/google-10000-english-no-swears.txt",
    file: "en_raw.txt",
    alphabet: "abcdefghijklmnopqrstuvwxyz",
    // одно слово в строке, уже по убыванию частоты
    parse: line => line.trim(),
    valid: /^[a-z]{3,8}$/,
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
function corpus(text, src) {
  const rank = new Map();
  for (const line of text.split(/\r?\n/)) {
    let w = src.parse(line).toLowerCase();
    if (src.normalize) w = src.normalize(w);
    if (!src.valid.test(w)) continue;
    if (src.deny?.test(w)) continue;
    if (!rank.has(w)) rank.set(w, rank.size + 1);
  }
  return rank;
}

function distance(a, b, limit) {
  let d = 0;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i] && ++d > limit) return d;
  return d;
}

// Курируемый список слов лежит в самой игре — читаем его оттуда,
// чтобы данные не разъехались с тем, что реально спавнится.
function spawnWords(html, key) {
  const block = html.match(new RegExp(`\\n    ${key}: \\(([\\s\\S]*?)\\)\\.split`));
  if (!block) throw new Error(`не нашёл WORDS.${key} в word-shooter.html`);
  return (block[1].match(/"([^"]*)"/g) || [])
    .map(s => s.slice(1, -1)).join("").split(" ").filter(Boolean);
}

const START = "  // >>> WORDLIST START <<<";
const END = "  // >>> WORDLIST END <<<";

function renderBlock(data) {
  const lines = [START, "  const META = {"];
  for (const key of ["ru", "en"]) {
    const { entries, url } = data[key];
    lines.push(`    // ${entries.length} слов, ранг и соседи из ${url}`);
    lines.push(`    ${key}:`);
    lines.push(entries.map((e, i) =>
      `      "${e}${i === entries.length - 1 ? "" : ";"}"`).join(" +\n") + ",");
  }
  lines.push("  };", END);
  return lines.join("\n");
}

const html = await readFile(GAME, "utf8");
const data = {};

for (const key of ["ru", "en"]) {
  const src = SOURCES[key];
  const rank = corpus(await fetchList(key), src);
  const spawn = spawnWords(html, key);

  // группируем корпус по длине — сравнивать имеет смысл только равные длины
  const byLen = new Map();
  for (const w of rank.keys()) {
    if (!byLen.has(w.length)) byLen.set(w.length, []);
    byLen.get(w.length).push(w);
  }

  let missing = 0, totalNb = 0;
  const entries = spawn.map(word => {
    const r = rank.get(word);
    if (r === undefined) missing++;
    const limit = maxGaps(word.length);
    const nb = (byLen.get(word.length) || [])
      .filter(w => w !== word && distance(word, w, limit) <= limit)
      .sort((a, b) => rank.get(a) - rank.get(b))
      .slice(0, NEIGHBOUR_CAP);
    totalNb += nb.length;
    // ранга нет — считаем слово редким, пусть достаётся поздним уровням
    return [word, r ?? 99999, ...nb].join(" ");
  });

  data[key] = { entries, url: src.url };
  process.stdout.write(
    `${key}: ${spawn.length} слов в блоках, ${rank.size} слов в корпусе, ` +
    `соседей всего ${totalNb} (в среднем ${(totalNb / spawn.length).toFixed(1)} на слово)` +
    (missing ? `, без ранга: ${missing}` : "") + "\n");
}

const from = html.indexOf(START);
const to = html.indexOf(END);
if (from === -1 || to === -1) throw new Error("маркеры WORDLIST не найдены в word-shooter.html");

const patched = html.slice(0, from) + renderBlock(data) + html.slice(to + END.length);
await writeFile(GAME, patched, "utf8");
process.stdout.write(`word-shooter.html: ${html.length} -> ${patched.length} символов\n`);
