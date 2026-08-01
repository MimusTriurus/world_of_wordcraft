// Генератор словаря для word-shooter.html.
//
// Качает частотные списки слов и вшивает отфильтрованную выборку прямо в игру,
// между маркерами BULK-WORDLIST. Словарь нужен только для проверки ответа:
// блок принимает любую букву, дающую настоящее слово, поэтому Л_С — это и ЛЕС,
// и ЛИС. Слова из этого списка в блоках не появляются, их поставляет
// курируемый WORDS внутри игры.
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
  en: {
    url: "https://raw.githubusercontent.com/first20hours/google-10000-english/master/google-10000-english-no-swears.txt",
    file: "en_raw.txt",
    limit: 8000,
    // список — одно слово в строке, уже по убыванию частоты
    parse: line => line.trim(),
    valid: /^[a-z]{3,8}$/,
  },
  ru: {
    url: "https://raw.githubusercontent.com/hermitdave/FrequencyWords/master/content/2018/ru/ru_50k.txt",
    file: "ru_raw.txt",
    // Берём список целиком: корпус частотный по субтитрам, и бытовые
    // существительные в нём стоят низко — «игла» на 25563 месте, «икра» на
    // 33100. Срез по частоте резал ровно те слова, ради которых всё затевалось.
    limit: Infinity,
    // формат «слово частота»
    parse: line => line.trim().split(/\s+/)[0] ?? "",
    // ё приводим к е: в игре в алфавите ввода только е
    normalize: w => w.replace(/ё/g, "е"),
    valid: /^[а-я]{3,8}$/,
    // Корпус собран по субтитрам и полон мата. Слово из словаря может стать
    // ответом, а игра показывает достроенное слово на экране — поэтому чистим.
    // Английский список берётся в варианте no-swears, там это уже сделано.
    deny: /^(ху[йеяю]|пизд|[е]б[ауеиоНн]|бля|сук[аиуе]$|муд[ао]|г[ао]ндон|залуп|дроч|говн|срак|жоп|дерьм|шлюх|мраз|пид[оа]р|хер[аоуни]|манда$|елда|минет|отсос|трах[ан]|сперм|очко$)/,
  },
};

const useCache = process.argv.includes("--cache");

async function fetchList(key) {
  const src = SOURCES[key];
  const cached = path.join(CACHE, src.file);
  if (useCache || existsSync(cached)) {
    if (existsSync(cached)) return readFile(cached, "utf8");
    throw new Error(`нет кэша ${cached}, запусти без --cache`);
  }
  process.stdout.write(`качаю ${key}: ${src.url}\n`);
  const res = await fetch(src.url);
  if (!res.ok) throw new Error(`${src.url} -> HTTP ${res.status}`);
  const text = await res.text();
  await mkdir(CACHE, { recursive: true });
  await writeFile(cached, text, "utf8");
  return text;
}

function distill(text, src, needed) {
  const seen = new Set();
  for (const line of text.split(/\r?\n/)) {
    let w = src.parse(line).toLowerCase();
    if (src.normalize) w = src.normalize(w);
    if (!src.valid.test(w)) continue;
    if (src.deny?.test(w)) continue;
    if (!needed.has(w)) continue;
    seen.add(w);
    if (seen.size >= src.limit) break;
  }
  return [...seen].sort();
}

// Игра спрашивает словарь ровно об одном: «слово из блока, где одна буква
// заменена на другую». Значит, полезны только соседи спавнящихся слов на
// расстоянии в одну замену — всё прочее в файл можно не тащить.
function neighbours(words, alphabet) {
  const out = new Set();
  for (const w of words)
    for (let i = 0; i < w.length; i++)
      for (const ch of alphabet)
        if (ch !== w[i]) out.add(w.slice(0, i) + ch + w.slice(i + 1));
  return out;
}

// Курируемый список слов лежит в самой игре — читаем его оттуда,
// чтобы список соседей не разъехался с тем, что реально спавнится.
function spawnWords(html, key) {
  const block = html.match(new RegExp(`\\n    ${key}: \\(([\\s\\S]*?)\\)\\.split`));
  if (!block) throw new Error(`не нашёл WORDS.${key} в word-shooter.html`);
  return (block[1].match(/"([^"]*)"/g) || [])
    .map(s => s.slice(1, -1)).join("").split(" ").filter(Boolean);
}

const START = "  // >>> BULK-WORDLIST START <<<";
const END = "  // >>> BULK-WORDLIST END <<<";

// Слова кладём в одну строку через пробел и режем split(" ") при загрузке:
// это заметно компактнее, чем JSON-массив с кавычками и запятыми у каждого.
function renderBlock(lists) {
  const chunk = words => {
    const lines = [];
    let line = "";
    for (const w of words) {
      if (line.length + w.length + 1 > 96) { lines.push(line); line = ""; }
      line += (line ? " " : "") + w;
    }
    if (line) lines.push(line);
    return lines.map((l, i) => `    "${l}${i === lines.length - 1 ? "" : " "}"`).join(" +\n");
  };
  return [
    START,
    "  const BULK = {",
    `    // ${lists.ru.length} слов, ${SOURCES.ru.url}`,
    "    ru:",
    chunk(lists.ru) + ",",
    `    // ${lists.en.length} слов, ${SOURCES.en.url}`,
    "    en:",
    chunk(lists.en) + ",",
    "  };",
    END,
  ].join("\n");
}

const ALPHABET = {
  ru: "абвгдежзийклмнопрстуфхцчшщъыьэюя",
  en: "abcdefghijklmnopqrstuvwxyz",
};

const html = await readFile(GAME, "utf8");

const lists = {};
for (const key of ["ru", "en"]) {
  const src = SOURCES[key];
  const spawn = spawnWords(html, key);
  const needed = neighbours(spawn, ALPHABET[key]);
  lists[key] = distill(await fetchList(key), src, needed);
  process.stdout.write(
    `${key}: ${spawn.length} слов в блоках, ${needed.size} возможных замен, ` +
    `${lists[key].length} из них настоящие слова\n`);
}

const from = html.indexOf(START);
const to = html.indexOf(END);
if (from === -1 || to === -1) throw new Error("маркеры BULK-WORDLIST не найдены в word-shooter.html");

const patched = html.slice(0, from) + renderBlock(lists) + html.slice(to + END.length);
await writeFile(GAME, patched, "utf8");
process.stdout.write(`word-shooter.html: ${html.length} -> ${patched.length} байт\n`);
