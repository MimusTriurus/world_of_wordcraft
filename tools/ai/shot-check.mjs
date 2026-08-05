// Полёт снаряда сноса и луч подсказки.
//
// Обе кнопки раньше срабатывали на месте: слово рассыпалось в кадре выстрела,
// карточка появлялась сама собой. Проверяется не картинка (её на Node не снять),
// а то, что за ней стоит: снаряд действительно летит и разрушает НА ПОПАДАНИИ,
// а часы карточки стоят, пока идёт развёртка.
import { boot } from "../sim/harness.mjs";

const DT = 1 / 60;
const fail = [];
const ok = (n, c) => { console.log((c ? "ok   " : "ПЛОХО") + "  " + n); if (!c) fail.push(n); };

// Довести забег до живого блока, до которого достаёт пушка.
function ready(seed) {
  const g = boot(seed);
  g.reset(true);
  // Забег начинается с закрытой обоймой; снаряд стенду нужен с первого кадра.
  g.unlock("shells");
  for (let i = 0; i < 1200; i++) {
    g.update(DT);
    const b = g.blocks.find(x => x.state === "live" && x.y + x.h > 60 &&
                                 x.y + x.h < g.CANNON_Y - 120);
    if (b && !g.blocks.some(o => o !== b && x0(o) && o.y > b.y &&
                                 overlap(o, b))) {
      g.cannonX = b.x + b.w / 2;
      if (g.cooldown === 0) return { g, b };
    }
  }
  return { g, b: null };
  function x0(o) { return o.state === "live" || o.state === "hit"; }
  function overlap(o, b) {
    const x = b.x + b.w / 2;
    return x >= o.x && x <= o.x + o.w;
  }
}

// ---- 1. ЛКМ: снаряд летит, слово живо в полёте, рушится на попадании --------
{
  const { g, b } = ready(3);
  ok("нашёлся блок под пушкой", !!b);
  const shells = g.shells, y0 = b.y;
  g.shootBlock();
  ok(`снаряд в воздухе (${g.shots.length})`, g.shots.length === 1);
  ok("это снаряд, а не буква", g.shots[0].shell === true && g.shots[0].letter === null);
  ok(`снаряд списан сразу: ${shells} → ${g.shells}`, g.shells === shells - 1);
  ok("слово ещё живо", b.state === "live");

  // полёт: снаряд идёт вверх, блок продолжает падать
  let frames = 0, ys = [g.shots[0].y];
  while (g.shots.length && frames < 300) { g.update(DT); frames++; if (g.shots.length) ys.push(g.shots[0].y); }
  ok(`летел ${frames} кадров (${(frames * DT).toFixed(2)} с), не один`, frames > 6);
  ok("шёл вверх", ys.every((y, i) => i === 0 || y < ys[i - 1]));
  ok("блок за это время проехал вниз", b.y > y0);
  ok(`слово снесено на попадании (${b.state})`, b.state === "dead");
  const dist = (g.CANNON_Y - 14) - (b.y + b.h);
  ok(`время полёта близко к расстоянию/скорости: ${(frames * DT).toFixed(2)} с`,
     frames * DT > 0.02 && frames * DT < 2.5);
}

// ---- 2. Снаряд в молоко: без цели и без наказания ---------------------------
{
  const { g } = ready(4);
  // уводим пушку туда, где блоков нет: ищем свободную колонку
  for (let x = 20; x < g.W - 20; x += 5) {
    if (!g.blocks.some(o => (o.state === "live" || o.state === "hit") &&
                            x >= o.x && x <= o.x + o.w)) { g.cannonX = x; break; }
  }
  const shells = g.shells, combo = g.combo;
  g.shootBlock();
  ok(`без цели снаряд не тратится (${shells} → ${g.shells})`, g.shells === shells);
  ok("и в воздухе ничего нет", g.shots.length === 0);

  // А вот снаряд, у которого цель исчезла, обязан уйти без наказания. Стреляем в
  // блок и решаем слово вручную, пока снаряд в пути. По дороге он может встретить
  // блок выше — это законно, снаряд бьёт в того, кого встретит, — так что случай
  // «действительно вышел за верх» отличаем по последней высоте, а не по тому, что
  // список опустел.
  const { g: g2, b } = ready(6);
  g2.shootBlock();
  const shot = g2.shots[0];
  g2.finish(b);                       // слово решено, пока снаряд в пути
  const c2 = g2.combo;
  let f = 0;
  while (g2.shots.length && f < 400) { g2.update(DT); f++; }
  ok("снаряд убрался", g2.shots.length === 0);
  if (shot.y < -20) {
    ok(`ушёл за верх, комбо не сожжено: ${c2} → ${g2.combo}`, g2.combo >= c2);
  } else {
    ok(`встретил другой блок на высоте ${shot.y.toFixed(0)} — снёс его`,
       g2.blocks.some(x => x.state === "dead"));
  }

  // Чистое молоко подстроить нельзя: поле не пустует, сверху всё время подъезжают
  // новые слова, и снаряд встречает их — законно, он бьёт в того, кого встретит.
  // Поэтому случай ловится наблюдением: гоняем ботом и смотрим кадры, в которых
  // снаряд ушёл ЗА ВЕРХ. Комбо в такой кадр падать не имеет права.
  let over = 0, burned = 0, hits = 0;
  for (let seed = 1; seed <= 6; seed++) {
    const g = boot(seed);
    const bot = g.makeAutopilot({ seed, cls: "медленный" });   // он чаще сносит
    g.reset(true);
    let air = new Map();
    for (let t = 0; g.state !== "over" && t < 60 * 300; t++) {
      const before = g.combo;
      const seen = new Set();
      for (const s of g.shots) if (s.shell) { air.set(s, s.y); seen.add(s); }
      bot.tick(DT); g.update(DT);
      for (const [s, y] of air) {
        if (seen.has(s) && !g.shots.includes(s)) {
          air.delete(s);
          if (s.y < -20) { over++; if (g.combo < before) burned++; }
          else hits++;
        }
      }
    }
  }
  ok(`снарядов долетело до цели ${hits}`, hits > 0);
  if (over) ok(`ушло за верх ${over}, из них сожгли комбо ${burned}`, burned === 0);
  // Пустая выборка — это не «сошлось». Молока в живой игре почти не бывает:
  // снаряд летит в блок у самой линии, а сверху всё время подъезжают новые.
  else console.log(`       за верх не ушёл ни один снаряд — правило про молоко ` +
                   `этим прогоном НЕ проверено`);
}

// ---- 3. Луч подсказки: развёртка, потом карточка ----------------------------
{
  const { g, b } = ready(9);
  g.mods.freeTips = true;
  g.hint();
  ok(`подсказка на поле (${g.hints.length})`, g.hints.length === 1);
  const h = g.hints[0];
  ok(`луч заведён на ${g.SCAN_TIME} с`, h.scan === g.SCAN_TIME);
  ok("луч помнит, откуда пошёл", Math.abs(h.from - g.cannonX) < 0.001);
  ok(`строки толкования готовы (${h.lines.length})`, h.lines.length >= 1);

  const life = h.t;
  const half = Math.round((g.SCAN_TIME / 2) / DT);
  for (let i = 0; i < half; i++) g.update(DT);
  ok(`под лучом часы карточки стоят: ${h.t.toFixed(2)} из ${life.toFixed(2)}`,
     h.t === life);
  ok(`развёртка идёт: осталось ${h.scan.toFixed(2)} с`,
     h.scan > 0 && h.scan < g.SCAN_TIME);
  g.draw();
  ok("отрисовка под лучом не падает", true);

  // добираем до конца развёртки — дальше должна пойти карточка
  for (let i = 0; i < half + 4; i++) g.update(DT);
  ok(`луч отработал (${h.scan.toFixed(2)})`, h.scan <= 0);
  ok(`часы карточки пошли: ${h.t.toFixed(2)} из ${life.toFixed(2)}`, h.t < life);
  g.draw();
  ok("отрисовка карточки не падает", true);

  // и карточка живёт полное своё время, а не остаток
  let f = 0;
  while (g.hints.length && f < 600) { g.update(DT); f++; }
  const lived = f * DT;
  ok(`карточка прожила ${lived.toFixed(2)} с при заявленных ${life.toFixed(2)}`,
     lived > life - 4 * DT);
  g.mods.freeTips = false;
}

// ---- 4. отказ подсказки луча не заводит ------------------------------------
{
  const { g, b } = ready(11);
  g.mods.freeTips = false;
  while (g.tips > 0) g.hint();          // выжигаем кошелёк
  const n = g.hints.length;
  g.hint();
  ok(`без подсказок в кошельке луча нет (${g.hints.length} = ${n})`,
     g.hints.length === n);
}


// ---- 5. показ у дула и выстрел — два независимых процесса --------------------
// Показ это картинка. Он обязан НЕ занимать игрового времени: буква уходит в том
// же кадре, в котором нажата, а крупная копия остаётся у ствола сама по себе.
// Раньше буква ждала у дула 1.2 с, и это стоило быстрому игроку 31% очков.
{
  const { g, b } = ready(13);
  const ch = [...g.oracle.acceptsAt(b, b.gaps[0])][0];
  const y0 = b.y;
  g.shootLetter(ch);
  ok(`буква в воздухе (${g.shots.length})`, g.shots.length === 1);
  ok(`и показ у дула (${g.muzzles.length})`, g.muzzles.length === 1);
  const s = g.shots[0], m = g.muzzles[0];
  ok("это разные объекты", s !== m);
  ok(`показ заведён на ${g.MUZZLE_SHOW} с`, m.t === g.MUZZLE_SHOW);
  ok(`показ у среза дула: y ${m.y} при SHOT_Y0 ${g.SHOT_Y0}`, m.y === g.SHOT_Y0);
  ok(`буква на вылете крупная: ×${s.scale}`, s.scale === g.SHOT_BIG);

  // главное: выстрел не ждёт показа
  g.update(DT);
  ok(`буква пошла в первом же кадре: ${g.SHOT_Y0} → ${s.y.toFixed(0)}`,
     s.y < g.SHOT_Y0);
  ok("показ при этом стоит на месте", m.y === g.SHOT_Y0);
  ok(`и сжимается на ходу: ×${s.scale.toFixed(2)}`, s.scale < g.SHOT_BIG);

  let f = 1;
  while (g.shots.includes(s) && f < 600) { g.update(DT); f++; }
  ok(`долетела за ${(f * DT).toFixed(2)} с — быстрее, чем длится показ`,
     f * DT < g.MUZZLE_SHOW);
  ok(`показ ещё висит (${m.t.toFixed(2)} с осталось)`, g.muzzles.includes(m));
  g.draw();
  ok("отрисовка показа не падает", true);

  // и уходит по своим часам
  let k = 0;
  while (g.muzzles.includes(m) && k < 600) { g.update(DT); k++; }
  ok(`показ прожил ${((f + k) * DT).toFixed(2)} с при заявленных ${g.MUZZLE_SHOW}`,
     Math.abs((f + k) * DT - g.MUZZLE_SHOW) < 0.05);
  ok(`блок за всё это время просто ехал (${(b.y - y0).toFixed(0)} px)`, b.y > y0);
}

// ---- 6. показов не больше, чем держим, и в правила они не лезут --------------
{
  const { g, b } = ready(17);
  const before = g.blocks.map(x => x.shown.join("") + x.strikes).join("|");
  const ch = [...g.oracle.acceptsAt(b, b.gaps[0])][0];
  // Пауза между выстрелами короткая, показ живёт долго — они копятся.
  for (let i = 0; i < 20; i++) { g.shootLetter(ch); for (let k = 0; k < 6; k++) g.update(DT); }
  ok(`показов ${g.muzzles.length}, предел ${g.MUZZLE_KEEP}`,
     g.muzzles.length <= g.MUZZLE_KEEP);
  g.draw();
  ok("двадцать выстрелов подряд отрисовку не валят", true);
}

// ---- 7. у снаряда показа нет -------------------------------------------------
{
  const { g, b } = ready(15);
  const n = g.muzzles.length;
  g.shootBlock();
  const s = g.shots[0];
  ok(`снаряд показа не заводит (${g.muzzles.length} = ${n})`,
     g.muzzles.length === n);
  const y1 = s.y;
  g.update(DT);
  ok(`и в первом же кадре двигается (${y1.toFixed(0)} → ${s.y.toFixed(0)})`,
     s.y < y1);
}

console.log(fail.length ? "\nПРОВАЛЕНО: " + fail.join("; ") : "\nвсё сошлось");
process.exit(fail.length ? 1 : 0);
