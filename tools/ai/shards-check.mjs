// Осколки снесённого слова.
//
// Проверяется не картинка, а правила за ней: осколки рождаются только от сноса,
// летят по буквам того, что БЫЛО ВИДНО (иначе бомба выдавала бы загаданное
// слово), разлетаются в разные стороны, бьются о блоки и блокам ничего не делают.
import { boot } from "../sim/harness.mjs";

const DT = 1 / 60;
const fail = [];
const ok = (n, c) => { console.log((c ? "ok   " : "ПЛОХО") + "  " + n); if (!c) fail.push(n); };

function ready(seed, minY = 60, stage = 0) {
  const g = boot(seed);
  g.reset(true); g.takePick(0);
  g.stage = stage;                 // этап задаёт длину слов: 0 — короткие, 2 — длинные
  for (let i = 0; i < 1500; i++) {
    g.update(DT);
    const b = g.blocks.find(x => x.state === "live" && x.y + x.h > minY &&
                                 x.y + x.h < g.CANNON_Y - 60);
    if (b && g.cooldown === 0) { g.cannonX = b.x + b.w / 2; return { g, b }; }
  }
  return { g, b: null };
}

// ---- 1. снос: осколков ровно по буквам, и это видимые буквы ------------------
{
  const { g, b } = ready(3);
  ok("блок найден", !!b);
  const word = b.word, shown = b.shown.slice();
  ok(`в слове ${word.length} букв, из них видно ${shown.filter(Boolean).length}`,
     shown.some(ch => !ch));            // пропуск обязан быть, иначе проверка пустая
  g.shootBlock();
  let f = 0;
  while (!g.shards.length && f < 200) { g.update(DT); f++; }
  ok(`осколки появились на попадании (кадр ${f})`, g.shards.length > 0);
  ok(`осколков ${g.shards.length} — по букве на каждую`,
     g.shards.length === word.length);

  // ЛКМ раскрывает слово — карточка с ответом выезжает тут же, — поэтому и
  // разлетается оно целиком, вместе со скрытыми буквами.
  const flying = g.shards.map(s => s.ch).join("");
  ok(`летит всё слово «${flying}» при загаданном «${word}»`, flying === word);
  ok("прочерков в раскрытом слове нет", !g.shards.some(s => s.ch === "_"));
  ok("и красных букв тоже: неверных в загаданном слове не бывает",
     g.shards.every(s => !s.wrong));
  ok(`скрытые буквы тоже летят (было видно ${shown.filter(Boolean).length} из ${word.length})`,
     g.shards.length > shown.filter(Boolean).length);

  // Разлёт: заняты все четыре стороны, и ни одна не собрала всё.
  const l = g.shards.filter(s => s.vx < 0).length;
  const r = g.shards.filter(s => s.vx > 0).length;
  ok(`влево ${l}, вправо ${r} — разлёт в обе стороны`, l > 0 && r > 0);
  ok(`вверх ${g.shards.filter(s => s.vy < 0).length}, ` +
     `вниз ${g.shards.filter(s => s.vy > 0).length} — и вверх, и вниз`,
     g.shards.some(s => s.vy < 0) && g.shards.some(s => s.vy > 0));

  // Окружность держится скоростью: она у всех одна, иначе круг превратится в
  // кляксу через полсекунды.
  const sp = g.shards.map(s => Math.hypot(s.vx, s.vy));
  ok(`скорость у всех одна: ${sp.map(v => v.toFixed(1)).join(", ")} ` +
     `(заявлено ${g.SHARD_SPEED})`,
     sp.every(v => Math.abs(v - g.SHARD_SPEED) < 0.001));

  // Углы поделены поровну: разница между соседними по кругу — ровно 2π/n.
  const angles = g.shards.map(s => Math.atan2(s.vy, s.vx)).sort((a, b) => a - b);
  const gaps = angles.map((a, i) =>
    i === 0 ? a - angles[angles.length - 1] + Math.PI * 2 : a - angles[i - 1]);
  const want = Math.PI * 2 / g.shards.length;
  ok(`углы поделены поровну: просветы ${gaps.map(x => x.toFixed(3)).join(", ")} ` +
     `при ${want.toFixed(3)}`,
     gaps.every(x => Math.abs(x - want) < 1e-9));

  ok(`медленно, чтобы разглядеть: ${g.SHARD_SPEED} px/s`, g.SHARD_SPEED < 120);

  // Тяжести нет: скорость за полёт не меняется вовсе.
  const one = g.shards[0];
  const v0 = { vx: one.vx, vy: one.vy };
  for (let i = 0; i < 20 && g.shards.includes(one); i++) g.update(DT);
  ok(`скорость за 20 кадров не изменилась (${one.vx.toFixed(1)}, ${one.vy.toFixed(1)})`,
     one.vx === v0.vx && one.vy === v0.vy);

  // Таймера жизни нет: осколок держится, пока во что-нибудь не ударится. Каждый
  // уход из списка обязан случиться либо в блоке, либо на краю поля, — и не
  // раньше, чем буква действительно туда доехала.
  let t = 0, gone = 0, atEdge = 0, inBlock = 0, nowhere = [];
  while (g.shards.length && t < 60 * 30) {
    const air = g.shards.slice();
    g.update(DT); t++;
    for (const s of air) {
      if (g.shards.includes(s)) continue;
      gone++;
      const edge = s.x <= 0 || s.x >= g.W || s.y <= 0 || s.y >= g.H;
      const inside = g.blocks.some(b => g.alive(b) &&
        s.x >= b.x && s.x <= b.x + b.w && s.y >= b.y && s.y <= b.y + b.h);
      if (edge) atEdge++; else if (inside) inBlock++;
      else nowhere.push(`(${s.x.toFixed(0)}, ${s.y.toFixed(0)})`);
    }
  }
  ok(`все ${gone} осколков ушли: о край ${atEdge}, в слово ${inBlock}`,
     gone === word.length && !nowhere.length);
  if (nowhere.length) console.log("       исчезли на пустом месте: " +
                                  nowhere.join(", "));
  ok(`жили ${(t * DT).toFixed(2)} с — дольше прежних 1.8 по таймеру`, t * DT > 1.8);

  // равномерность на длинном слове: каждая четверть круга занята
  {
    const { g: g2, b: b2 } = ready(21, 60, 2);   // третий этап — длинные слова
    if (b2 && b2.word.length >= 6) {
      g2.shootBlock();
      let k = 0;
      while (!g2.shards.length && k < 200) { g2.update(DT); k++; }
      const n = g2.shards.length;
      const q = [0, 0, 0, 0];
      for (const s of g2.shards) {
        const a = Math.atan2(s.vy, s.vx);
        q[Math.min(3, Math.floor((a + Math.PI) / (Math.PI / 2)))]++;
      }
      ok(`слово из ${n} букв, по четвертям круга ${q.join("/")}`,
         q.every(Boolean) && Math.max(...q) <= Math.ceil(n / 4) + 1);
    } else {
      console.log("       длинного слова для проверки секторов не нашлось");
    }
  }
}

// ---- 2. решённое слово и упавшее осколков не дают ----------------------------
{
  const { g, b } = ready(5);
  g.finish(b);                                   // слово решено
  for (let i = 0; i < 30; i++) g.update(DT);
  ok(`решённое слово не разлетается (${g.shards.length})`, g.shards.length === 0);

  // падение за линию: гоняем до потери жизни и смотрим, что осколков нет
  const lives = g.lives;
  let f = 0;
  while (g.lives === lives && f < 60 * 120) { g.update(DT); f++; }
  ok(`жизнь потеряна (кадр ${f})`, g.lives < lives);
  ok(`упавшее за линию не разлетается (${g.shards.length})`, g.shards.length === 0);
}

// ---- 3. бомба: осколки от всех, и ни одного загаданного слова ----------------
{
  const { g } = ready(7);
  g.bombs = 3;
  const live = g.blocks.filter(x => x.state === "live");
  const letters = live.reduce((n, b) => n + b.word.length, 0);
  const words = live.map(b => b.word);
  // Бомба слово НЕ раскрывает, поэтому летит ровно видимое — в отличие от ЛКМ.
  // Это и есть то место, где правило легко потерять: снос и бомба ходят через
  // один destroy.
  const want = live.map(b => b.shown.map(ch => ch || "_").join("")).join("");
  g.dropBomb();
  ok(`бомба снесла ${live.length} слов, осколков ${g.shards.length} из ${letters}`,
     g.shards.length > 0 && g.shards.length <= Math.min(letters, g.SHARD_MAX));
  const flying = g.shards.map(s => s.ch).join("");
  ok(`летит только видимое «${flying}» (ждали «${want}»)`, flying === want);
  ok(`ни одно загаданное слово не собирается из осколков (${words.join(", ")})`,
     !words.some(w => w.length > 2 && flying.includes(w)));
  ok("прочерки на месте скрытых букв", g.shards.some(s => s.ch === "_"));
}

// ---- 4. осколок бьётся о блок, а блоку ничего не делает ----------------------
{
  let broke = 0, seenHits = 0, damaged = 0, runs = 0;
  for (let seed = 1; seed <= 8; seed++) {
    const g = boot(seed);
    const bot = g.makeAutopilot({ seed, cls: "медленный" });
    g.reset(true);
    runs++;
    for (let t = 0; g.state !== "over" && t < 60 * 240; t++) {
      // состояние блоков до кадра: осколок не имеет права их менять
      const before = g.blocks.filter(g.alive)
        .map(b => ({ b, strikes: b.strikes, broken: b.broken,
                     shown: b.shown.join("") }));
      const air = g.shards.slice();
      bot.tick(DT); g.update(DT);
      // Таймера у осколка нет, поэтому любой уход из списка — это удар: о слово
      // или о край поля.
      for (const s of air) if (!g.shards.includes(s)) seenHits++;
      for (const o of before) {
        if (!g.alive(o.b)) continue;
        if (o.b.strikes !== o.strikes || o.b.broken !== o.broken ||
            o.b.shown.join("") !== o.shown) damaged++;
      }
      broke += 0;
    }
  }
  ok(`столкновений и уходов за край: ${seenHits} за ${runs} забегов`, seenHits > 0);
  // Блоки за кадр меняются и законно — от букв игрока. Поэтому здесь важен не
  // ноль, а то, что стенд вообще видел столкновения: ущерб от осколков отдельно
  // проверен ниже, на неподвижной сцене.
  console.log(`       (изменений блоков за те же кадры: ${damaged} — это буквы бота)`);
}

// ---- 5. ущерб от осколков: чистая сцена -------------------------------------
{
  const { g, b } = ready(9, 200);
  // цель для осколков: любой другой живой блок
  const others = g.blocks.filter(x => x.state === "live" && x !== b);
  const snap = others.map(o => ({ o, strikes: o.strikes, broken: o.broken,
                                  shown: o.shown.join(""), state: o.state }));
  ok(`на поле есть ещё ${others.length} слов, по которым могут ударить осколки`,
     others.length > 0);
  g.shootBlock();
  let f = 0, hits = 0;
  while (f < 60 * 30) {
    const air = g.shards.slice();
    g.update(DT); f++;
    for (const s of air) if (!g.shards.includes(s)) hits++;
    if (!g.shards.length && f > 60) break;
  }
  ok(`осколков разбилось о блоки или ушло за край: ${hits}`, hits > 0);
  const hurt = snap.filter(s => s.o.strikes !== s.strikes || s.o.broken !== s.broken ||
                                s.o.shown.join !== undefined &&
                                s.o.shown.join("") !== s.shown);
  ok(`ни одно чужое слово не пострадало (пострадало ${hurt.length})`,
     hurt.length === 0);
}

console.log(fail.length ? "\nПРОВАЛЕНО: " + fail.join("; ") : "\nвсё сошлось");
process.exit(fail.length ? 1 : 0);
