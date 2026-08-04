// Замер HINT_HELPS: помогает ли толкование узнать слово.
//
// В модели это единственная константа, на которой висит целый вывод, и она была
// назначена, а не измерена. Мерить надо не «угадывается ли слово по толкованию»
// вообще, а условную величину: игрок УЖЕ не извлёк слово из шаблона — выручает
// ли его толкование. Поэтому выборка собирается из настоящих забегов и только
// из тех блоков, на которых бот застрял.
//
// Порядок работы в два шага, чтобы отвечающий не видел ответов:
//
//   node tools/ai/hint-probe.mjs ask [n] [сид]   → вопросы в quiz.json, ответы в key.json
//   node tools/ai/hint-probe.mjs score answers.json
//
// Успехом считается любое слово корпуса, которое игра приняла бы в этот шаблон:
// принимается не только загаданное, см. docs/ai.md.
import { readFileSync, writeFileSync } from "node:fs";
import { boot } from "../sim/harness.mjs";

const DIR = new URL("./", import.meta.url);
const path = f => new URL(f, DIR);

const DT = 1 / 60;

// Собираем блоки, на которых бот не нашёл ни одного знакомого слова по шаблону
// и у которых есть толкование. Прогоняем забеги, пока не наберём n штук.
function collect(n, seed0) {
  const out = [];
  const seen = new Set();
  for (let seed = seed0; out.length < n && seed < seed0 + 400; seed++) {
    const g = boot(seed);
    const bot = g.makeAutopilot({ seed, cls: "средний" });
    g.reset(true);
    // Словарь бота повторяем здесь же: нам нужны именно неизвлечённые слова.
    const par = g.BOT_CLASSES["средний"], K = g.BOT_KNOBS;
    const salt = (seed * 2654435761) >>> 0;
    const hash = (s, x) => {
      let h = (2166136261 ^ x) >>> 0;
      for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
      h ^= h >>> 15; h = Math.imul(h, 2246822507);
      h ^= h >>> 13; h = Math.imul(h, 3266489909);
      return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
    };
    const known = w => hash(w, salt) <
      1 / (1 + Math.pow(g.rankOf(w) / par.vocab, K.SHARP));

    let t = 0;
    while (g.state !== "over" && t < 30 * 60 && out.length < n) {
      bot.tick(DT); g.update(DT); t += DT;
      for (const b of g.blocks) {
        if (!g.alive(b) || b.broken) continue;
        const gloss = g.glossOf(b.word);
        if (!gloss || seen.has(b.word)) continue;
        const shown = b.shown.map(c => c || "_").join("");
        if (!shown.includes("_")) continue;
        // подходящие слова корпуса по шаблону
        const cands = [];
        for (const w of g.BY_LEN[g.lang].get(b.shown.length) || [])
          if (b.shown.every((ch, i) => !ch || w[i] === ch)) cands.push(w);
        if (cands.some(known)) continue;          // это слово бот бы извлёк сам
        seen.add(b.word);
        out.push({ id: out.length + 1, шаблон: shown.toUpperCase(), толкование: gloss,
                   _ответ: b.word, _принимаются: cands });
      }
    }
  }
  return out;
}

const [mode, a, b] = process.argv.slice(2);

if (mode === "ask") {
  const n = +(a || 40), seed0 = +(b || 1000);
  const items = collect(n, seed0);
  const quiz = items.map(i => ({ id: i.id, шаблон: i.шаблон, толкование: i.толкование }));
  const key = items.map(i => ({ id: i.id, ответ: i._ответ, принимаются: i._принимаются }));
  writeFileSync(path("quiz.json"), JSON.stringify(quiz, null, 1));
  writeFileSync(path("key.json"), JSON.stringify(key, null, 1));
  console.log(`собрано ${items.length} слов, на которых бот застрял`);
  console.log("вопросы: tools/ai/quiz.json, ответы: tools/ai/key.json");
  console.log("отвечать в файл вида [{\"id\":1,\"слово\":\"...\"}, ...]");
} else if (mode === "score") {
  const key = JSON.parse(readFileSync(path("key.json"), "utf8"));
  const ans = JSON.parse(readFileSync(a, "utf8"));
  const byId = new Map(key.map(k => [k.id, k]));
  let hit = 0, exact = 0;
  const wrong = [];
  for (const r of ans) {
    const k = byId.get(r.id);
    if (!k) continue;
    const w = (r.слово || "").toLowerCase().trim();
    if (k.принимаются.includes(w)) {
      hit++;
      if (w === k.ответ) exact++;
    } else wrong.push(`${r.id}: ${w || "—"} ≠ ${k.ответ}`);
  }
  const n = ans.length;
  console.log(`отвечено ${n} из ${key.length}`);
  console.log(`принято игрой: ${hit} (${(hit / n * 100).toFixed(1)}%)`);
  console.log(`из них ровно загаданное: ${exact}`);
  console.log(`\nHINT_HELPS = ${(hit / n).toFixed(2)}`);
  if (wrong.length) console.log("\nне принято:\n" + wrong.join("\n"));
} else {
  console.log("режимы: ask [n] [сид] | score <файл с ответами>");
}
