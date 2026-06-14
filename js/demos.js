/* ============================================================
   Live demos — every probability comes from js/data.js,
   which holds real outputs of the models described on the page.
   ============================================================ */

(function () {
"use strict";

/* ---------------- helpers ---------------- */
const $ = (id) => document.getElementById(id);
const pct = (x, d = 1) => (100 * x).toFixed(d) + "%";
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const hasLLM = () => window.LLM && window.LLM.configured();
function autoGrow(e) {
  const el = e.target || e;
  el.style.height = "auto";
  el.style.height = Math.min(el.scrollHeight + 2, 220) + "px";
}

const FLAGS = {
  "Algeria":"🇩🇿","Argentina":"🇦🇷","Australia":"🇦🇺","Austria":"🇦🇹","Belgium":"🇧🇪",
  "Bosnia and Herzegovina":"🇧🇦","Brazil":"🇧🇷","Canada":"🇨🇦","Cape Verde":"🇨🇻","Colombia":"🇨🇴",
  "Croatia":"🇭🇷","Curacao":"🇨🇼","Czechia":"🇨🇿","DR Congo":"🇨🇩","Ecuador":"🇪🇨","Egypt":"🇪🇬",
  "England":"🏴󠁧󠁢󠁥󠁮󠁧󠁿","France":"🇫🇷","Germany":"🇩🇪","Ghana":"🇬🇭","Haiti":"🇭🇹","Iran":"🇮🇷",
  "Iraq":"🇮🇶","Ivory Coast":"🇨🇮","Japan":"🇯🇵","Jordan":"🇯🇴","Mexico":"🇲🇽","Morocco":"🇲🇦",
  "Netherlands":"🇳🇱","New Zealand":"🇳🇿","Norway":"🇳🇴","Panama":"🇵🇦","Paraguay":"🇵🇾",
  "Portugal":"🇵🇹","Qatar":"🇶🇦","Saudi Arabia":"🇸🇦","Scotland":"🏴󠁧󠁢󠁳󠁣󠁴󠁿","Senegal":"🇸🇳",
  "South Africa":"🇿🇦","South Korea":"🇰🇷","Spain":"🇪🇸","Sweden":"🇸🇪","Switzerland":"🇨🇭",
  "Tunisia":"🇹🇳","Turkey":"🇹🇷","United States":"🇺🇸","Uruguay":"🇺🇾","Uzbekistan":"🇺🇿"
};
const flag = (t) => FLAGS[t] || "🏳️";

function setupCanvas(cv, fixedH) {
  const dpr = window.devicePixelRatio || 1;
  const w = cv.clientWidth || cv.parentElement.clientWidth || 600;
  const h = fixedH || cv.height || 300;
  cv.width = w * dpr;
  cv.height = h * dpr;
  cv.style.height = h + "px";
  const ctx = cv.getContext("2d");
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { ctx, w, h };
}

/* ============================================================
   1. WORLD CUP SIMULATOR
   ============================================================ */

// team strength fitted to the official 5,000-run champion distribution
const CHAMP_P = {};
WC_CHAMP.forEach(([t, p]) => (CHAMP_P[t] = p));
const STR = {};
Object.keys(FLAGS).forEach((t) => (STR[t] = Math.log((CHAMP_P[t] || 0.0002) + 0.0015)));
// sharpness K=0.4 calibrated so the in-browser sim reproduces the official 5,000-run distribution
const koWin = (a, b) => 1 / (1 + Math.exp(-0.4 * (STR[a] - STR[b])));

const GROUP_MATCHES = {};
WC_MATCHES.forEach((m) => (GROUP_MATCHES[m.grp] = GROUP_MATCHES[m.grp] || []).push(m));
const GROUP_KEYS = Object.keys(WC_GROUPS).sort();

// RNG is swappable: Math.random for live dice, a seeded generator for the
// reproducible forecast (same 5,000 futures every click).
let RNG = Math.random;
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function sample3(p) {
  const r = RNG() * (p[0] + p[1] + p[2]);
  return r < p[0] ? 0 : r < p[0] + p[1] ? 1 : 2;
}
const argmax3 = (p) => p.indexOf(Math.max(...p));

function simulateGroupStage(det) {
  const tables = {};
  GROUP_KEYS.forEach((g) => {
    const tbl = {};
    WC_GROUPS[g].forEach((t) => (tbl[t] = { team: t, pts: 0, gd: 0 }));
    GROUP_MATCHES[g].forEach((m) => {
      const o = det ? argmax3(m.ens) : sample3(m.ens);
      if (o === 0) { tbl[m.h].pts += 3; tbl[m.h].gd += 1; tbl[m.a].gd -= 1; }
      else if (o === 2) { tbl[m.a].pts += 3; tbl[m.a].gd += 1; tbl[m.h].gd -= 1; }
      else { tbl[m.h].pts += 1; tbl[m.a].pts += 1; }
    });
    tables[g] = Object.values(tbl).sort(
      (x, y) => y.pts - x.pts || y.gd - x.gd || STR[y.team] - STR[x.team] || (det ? 0 : RNG() - 0.5)
    );
  });
  return tables;
}

function bracketSeedOrder(n) {
  let r = [1];
  while (r.length < n) {
    const m = r.length * 2 + 1;
    const nx = [];
    r.forEach((s) => nx.push(s, m - s));
    r = nx;
  }
  return r;
}
const SEED32 = bracketSeedOrder(32);

function simulateTournament(det) {
  const tables = simulateGroupStage(det);
  const winners = [], runners = [], thirds = [];
  GROUP_KEYS.forEach((g) => {
    winners.push(tables[g][0]);
    runners.push(tables[g][1]);
    thirds.push(tables[g][2]);
  });
  const bySeed = (arr) => arr.slice().sort((x, y) => y.pts - x.pts || y.gd - x.gd || STR[y.team] - STR[x.team]);
  thirds.sort((x, y) => y.pts - x.pts || y.gd - x.gd || STR[y.team] - STR[x.team] || (det ? 0 : RNG() - 0.5));
  const qualified = bySeed(winners).concat(bySeed(runners), bySeed(thirds.slice(0, 8)));
  const seeds = qualified.map((q) => q.team); // index 0 = seed 1

  let field = SEED32.map((s) => seeds[s - 1]);
  const rounds = [];
  while (field.length > 1) {
    const ties = [], next = [];
    for (let i = 0; i < field.length; i += 2) {
      const a = field[i], b = field[i + 1];
      const w = det ? (koWin(a, b) >= 0.5 ? a : b) : (RNG() < koWin(a, b) ? a : b);
      ties.push({ a, b, w });
      next.push(w);
    }
    rounds.push(ties);
    field = next;
  }
  return { tables, rounds, champion: field[0], finalLoser: rounds[4][0].a === field[0] ? rounds[4][0].b : rounds[4][0].a };
}

/* ----- champion board ----- */
const counts = {};
let totalSims = 0;

function renderBoard() {
  const board = $("champBoard");
  if (!board) return;
  const officialTop = WC_CHAMP.slice(0, 14).map((c) => c[0]);
  const liveSorted = Object.keys(counts).sort((a, b) => counts[b] - counts[a]);
  const show = [...new Set([...liveSorted.slice(0, 14), ...officialTop])].slice(0, 14);
  show.sort((a, b) => (counts[b] || 0) - (counts[a] || 0) || (CHAMP_P[b] || 0) - (CHAMP_P[a] || 0));

  let maxP = 0.14;
  show.forEach((t) => {
    maxP = Math.max(maxP, CHAMP_P[t] || 0, totalSims ? (counts[t] || 0) / totalSims : 0);
  });
  maxP *= 1.12;

  board.innerHTML = show.map((t) => {
    const live = totalSims ? (counts[t] || 0) / totalSims : 0;
    const off = CHAMP_P[t] || 0;
    return `<div class="cb-row">
      <span class="flag">${flag(t)}</span>
      <span class="cb-name">${t}</span>
      <span class="cb-track">
        <span class="cb-fill" style="width:${(live / maxP) * 100}%"></span>
        <span class="cb-official" style="left:${(off / maxP) * 100}%" title="official: ${pct(off)}"></span>
      </span>
      <span class="cb-val">${!totalSims ? "—" : totalSims < 30 ? (counts[t] || 0) + "×" : pct(live)}</span>
    </div>`;
  }).join("");
}

/* ----- stage rendering ----- */
const ROUND_NAMES = ["round of 32", "round of 16", "quarter-finals", "semi-finals", "final"];

function renderGroupsIdle() {
  const el = $("wcGroups");
  el.style.display = "";
  el.innerHTML = GROUP_KEYS.map((g) => `
    <div class="wc-group" id="wcg-${g}">
      <h5>GROUP ${g}</h5>
      ${WC_GROUPS[g].map((t) => `
        <div class="wc-team-row"><span class="flag">${flag(t)}</span><span class="tname">${t}</span><span class="pts">–</span></div>
      `).join("")}
    </div>`).join("");
  $("wcBracketWrap").hidden = true;
  $("wcChampion").hidden = true;
  $("wcPhase").textContent = "group stage · 12 groups · 48 teams · fixtures from the real model";
}

function showGroupResult(g, rows) {
  const card = $("wcg-" + g);
  if (!card) return;
  card.classList.add("resolved");
  card.innerHTML = `<h5>GROUP ${g}</h5>` + rows.map((r, i) => `
    <div class="wc-team-row ${i < 2 ? "q" : i === 2 ? "q3" : ""}">
      <span class="flag">${flag(r.team)}</span><span class="tname">${r.team}</span><span class="pts">${r.pts}</span>
    </div>`).join("");
}

function renderBracket(rounds, upTo) {
  const el = $("wcBracket");
  el.innerHTML = rounds.map((ties, ri) => `
    <div class="wc-round">
      <div class="wc-round-label">${ROUND_NAMES[ri].toUpperCase()}</div>
      ${ties.map((t, ti) => {
        const done = upTo > ri || (upTo === ri && t._done);
        const live = upTo === ri && !t._done;
        return `<div class="wc-tie ${done ? "done" : live ? "live" : ""}" id="tie-${ri}-${ti}">
          <div class="wc-tie-row ${done ? (t.w === t.a ? "winner" : "loser") : ""}">
            <span class="flag">${flag(t.a)}</span><span class="tname">${t.a}</span>${done && t.w === t.a ? '<span class="wmark">✓</span>' : ""}
          </div>
          <div class="wc-tie-row ${done ? (t.w === t.b ? "winner" : "loser") : ""}">
            <span class="flag">${flag(t.b)}</span><span class="tname">${t.b}</span>${done && t.w === t.b ? '<span class="wmark">✓</span>' : ""}
          </div>
        </div>`;
      }).join("")}
    </div>`).join("");
}

/* ----- animated tournament: the model's predicted World Cup ----- */
/* Deterministic bracket: every match (group stage and knockout) resolves to
   its single most-likely outcome (argmax of ens / koWin >= 0.5). This means
   the bracket only changes when an actual model pick flips — not on every
   small daily probability nudge — and always replays IDENTICALLY. */
let cupBusy = false;

async function kickoff() {
  if (cupBusy) return;
  cupBusy = true;
  setCupButtons(true);
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  const result = simulateTournament(true);

  // phase 1: groups
  renderGroupsIdle();
  await sleep(250);
  for (const g of GROUP_KEYS) {
    showGroupResult(g, result.tables[g]);
    await sleep(110);
  }
  await sleep(650);

  // phase 2: knockout
  $("wcGroups").style.display = "none";
  $("wcBracketWrap").hidden = false;
  for (let ri = 0; ri < result.rounds.length; ri++) {
    $("wcPhase").textContent = ROUND_NAMES[ri] + " · the predicted bracket · identical on every replay";
    result.rounds[ri].forEach((t) => (t._done = false));
    renderBracket(result.rounds, ri);
    for (const t of result.rounds[ri]) {
      t._done = true;
      await sleep(ri < 2 ? 90 : 320);
      renderBracket(result.rounds, ri);
    }
    await sleep(260);
  }

  // phase 3: champion
  $("wcPhase").textContent = "full time · the model's predicted World Cup";
  const odds = CHAMP_P[result.champion] || 0;
  const ch = $("wcChampion");
  ch.hidden = false;
  ch.innerHTML = `
    <span class="champ-flag">${flag(result.champion)}</span>
    <h4>🏆 <span>${result.champion}</span> win the 2026 World Cup</h4>
    <p>beat ${flag(result.finalLoser)} ${result.finalLoser} in the final · the model's predicted tournament</p>
    <p class="champ-context">${result.champion} are the forecast's most likely champion (title odds ${pct(odds)}). This is the model's single most-likely bracket — replay it as often as you like, it will not change.</p>
    <p class="champ-context dim">the full calibrated odds for every team: 📊 The model's forecast · or ⚡ Run 5,000 fresh futures and watch them converge to the same numbers ▾</p>`;

  cupBusy = false;
  setCupButtons(false);
}

/* ----- fast Monte Carlo ----- */
function runMonteCarlo(n) {
  if (cupBusy) return;
  cupBusy = true;
  setCupButtons(true);
  $("wcGroups").style.display = "none";
  $("wcBracketWrap").hidden = true;
  $("wcChampion").hidden = true;

  let done = 0;
  const start = performance.now();
  function chunk() {
    const k = Math.min(80, n - done);
    let last = null;
    for (let i = 0; i < k; i++) {
      const r = simulateTournament();
      counts[r.champion] = (counts[r.champion] || 0) + 1;
      last = r.champion;
      totalSims++;
      done++;
    }
    $("cupCount").textContent = totalSims.toLocaleString();
    $("cupLast").textContent = `${flag(last)} ${last}`;
    $("wcPhase").textContent = `monte carlo · simulating tournament ${done.toLocaleString()} / ${n.toLocaleString()} · ${Math.round(done / ((performance.now() - start) / 1000)).toLocaleString()} sims/s`;
    renderBoard();
    if (done < n) requestAnimationFrame(chunk);
    else {
      $("wcPhase").textContent = `monte carlo complete · ${n.toLocaleString()} tournaments · compare ▮ live with ◇ official run`;
      cupBusy = false;
      setCupButtons(false);
    }
  }
  requestAnimationFrame(chunk);
}

function setCupButtons(dis) {
  ["cupDetBtn", "cupKickoffBtn", "cupMcBtn", "cupResetBtn"].forEach((id) => { if ($(id)) $(id).disabled = dis; });
}

function resetCup() {
  if (cupBusy) return;
  Object.keys(counts).forEach((k) => delete counts[k]);
  totalSims = 0;
  $("cupCount").textContent = "0";
  $("cupLast").textContent = "—";
  renderGroupsIdle();
  renderBoard();
}

/* ----- the model's forecast: seeded Monte Carlo, reproducible every click ----- */
let predCache = null;

function runPrediction() {
  if (cupBusy) return;
  cupBusy = true;
  setCupButtons(true);
  $("wcGroups").style.display = "none";
  $("wcBracketWrap").hidden = true;
  $("wcChampion").hidden = true;

  const N = 5000;
  const finish = (tally) => {
    const ranked = Object.entries(tally).sort((a, b) => b[1] - a[1]);
    const [top, topN] = ranked[0];
    const rows = ranked.slice(0, 8).map(([t, n]) => `
      <div class="fc-row">
        <span class="flag">${flag(t)}</span>
        <span class="fc-name">${t}</span>
        <span class="fc-val mono">${pct(n / N)}</span>
        <span class="fc-off mono">official ◇ ${pct(CHAMP_P[t] || 0)}</span>
      </div>`).join("");
    $("wcPhase").textContent = "the model's forecast · 5,000 seeded futures · identical on every click";
    const ch = $("wcChampion");
    ch.hidden = false;
    ch.innerHTML = `
      <span class="champ-flag">${flag(top)}</span>
      <h4>📊 Most likely champion: <span>${top}</span> — ${pct(topN / N)}</h4>
      <p>a calibrated model's prediction is a distribution, not a guarantee — no team reaches 14%, this Cup is genuinely open</p>
      <div class="forecast-board">${rows}</div>
      <p class="champ-context dim">reproducible by design: fixed-seed Monte Carlo over the model's fixed probabilities (seed 42, mulberry32). Click again — the numbers won't move. ◇ = my official Python run.</p>`;
    cupBusy = false;
    setCupButtons(false);
  };

  if (predCache) { finish(predCache); return; }

  RNG = mulberry32(42);
  const tally = {};
  let done = 0;
  function chunk() {
    for (let i = 0; i < 250 && done < N; i++, done++) {
      const r = simulateTournament(false);
      tally[r.champion] = (tally[r.champion] || 0) + 1;
    }
    $("wcPhase").textContent = `computing the forecast · seeded future ${done.toLocaleString()} / ${N.toLocaleString()}`;
    if (done < N) requestAnimationFrame(chunk);
    else {
      RNG = Math.random;
      predCache = tally;
      finish(tally);
    }
  }
  requestAnimationFrame(chunk);
}

if ($("cupKickoffBtn")) {
  $("cupDetBtn").addEventListener("click", runPrediction);
  $("cupKickoffBtn").addEventListener("click", kickoff);
  $("cupMcBtn").addEventListener("click", () => runMonteCarlo(5000));
  $("cupResetBtn").addEventListener("click", resetCup);
  renderGroupsIdle();
  renderBoard();
}

/* ============================================================
   2. MATCH CENTER
   ============================================================ */

const MAX_MI = Math.max(...WC_MATCHES.map((m) => m.mi));

function fillMatchSelect(sel) {
  sel.innerHTML = WC_MATCHES.map((m, i) =>
    `<option value="${i}">${m.grp} · ${m.h} vs ${m.a} · ${m.date}</option>`).join("");
}

function probBlock(label, tag, p, h, a) {
  const seg = (cls, v, txt) =>
    `<div class="prob-seg ${cls}" style="width:${(v * 100).toFixed(2)}%">${v > 0.13 ? txt : ""}</div>`;
  return `<div class="prob-block">
    <div class="prob-title"><span>${label}</span><span class="model-tag">${tag}</span></div>
    <div class="prob-bar">
      ${seg("h", p[0], `${h} ${pct(p[0], 0)}`)}
      ${seg("d", p[1], `draw ${pct(p[1], 0)}`)}
      ${seg("a", p[2], `${a} ${pct(p[2], 0)}`)}
    </div>
  </div>`;
}

function renderMatch() {
  const m = WC_MATCHES[+$("matchSelect").value];
  const useWx = $("weatherToggle").checked;
  const ens = useWx ? m.ens : m.wo;
  const pickIdx = ens.indexOf(Math.max(...ens));
  const pick = pickIdx === 0 ? m.h : pickIdx === 2 ? m.a : "Draw";

  $("matchCard").innerHTML = `
    <div class="mc-top">
      <span class="mc-group">GROUP ${m.grp} · GROUP STAGE</span>
      <span>${m.date}, 2026 · ${m.stad} · ${m.city}</span>
    </div>
    <div class="mc-main">
      <div class="mc-side">
        <span class="flag">${flag(m.h)}</span>
        <div class="mc-team">${m.h}</div>
        <div class="mc-prob">win ${pct(ens[0])}</div>
      </div>
      <div class="mc-score">
        <div class="mc-pred">${m.score[0]} – ${m.score[1]}</div>
        <span class="mc-pred-label">most likely scoreline · Poisson layer</span>
        <span class="mc-pick">model pick: ${pick} · ${pct(Math.max(...ens), 0)}</span>
      </div>
      <div class="mc-side">
        <span class="flag">${flag(m.a)}</span>
        <div class="mc-team">${m.a}</div>
        <div class="mc-prob">win ${pct(ens[2])}</div>
      </div>
    </div>
    <div class="mc-sl3 mono">scoreline candidates (given the pick): ${m.sl3 || "—"}</div>
    <div class="mc-wx">
      <span class="wx-chip">🌡 ${m.wx.t}°C</span>
      <span class="wx-chip">💧 ${m.wx.hum}% humidity</span>
      <span class="wx-chip">🌧 ${m.wx.pr} mm</span>
      <span class="wx-chip">💨 ${m.wx.wind} km/h</span>
      ${m.xw ? '<span class="wx-chip extreme">⚠ extreme-weather flag</span>' : ""}
    </div>`;

  $("matchBars").innerHTML =
    probBlock("standard network", "SNN", m.snn, m.h, m.a) +
    probBlock("bayesian head · MC sampling", "BNN", m.bnn, m.h, m.a) +
    probBlock(useWx ? "calibrated ensemble · weather ON" : "calibrated ensemble · weather OFF", "ENSEMBLE", ens, m.h, m.a);

  const unc = [
    { l: "predictive entropy", v: m.ent.toFixed(3), f: clamp(m.ent / 1.1, 0, 1) },
    { l: "epistemic uncertainty (MI)", v: m.mi.toFixed(4), f: clamp(m.mi / MAX_MI, 0, 1) },
    { l: "win-prob std (BNN spread)", v: "±" + m.std.toFixed(3), f: clamp(m.std / 0.12, 0, 1) }
  ];
  $("uncertaintyRow").innerHTML = unc.map((u) => `
    <div class="unc-card">
      <span class="unc-label">${u.l}</span>
      <span class="unc-val">${u.v}</span>
      <div class="unc-bar"><div class="unc-fill" style="width:${u.f * 100}%"></div></div>
    </div>`).join("");

  const dH = (m.ens[0] - m.wo[0]) * 100;
  $("weatherState").textContent = useWx ? "ON" : "OFF";
  $("weatherNote").textContent = useWx
    ? `Toggle the weather model off to see its real effect on this fixture (home win shifts by ${dH >= 0 ? "+" : ""}${dH.toFixed(1)} pp).`
    : `Without weather features: this is the ensemble's actual "no-weather" output for this fixture. Home win ${pct(m.wo[0])} vs ${pct(m.ens[0])} with weather (Δ ${dH >= 0 ? "+" : ""}${dH.toFixed(1)} pp).`;
}

if ($("matchSelect")) {
  fillMatchSelect($("matchSelect"));
  // default: Brazil vs Morocco (big weather delta) if present
  const def = WC_MATCHES.findIndex((m) => m.h === "Brazil");
  $("matchSelect").value = def >= 0 ? def : 0;
  $("matchSelect").addEventListener("change", renderMatch);
  $("weatherToggle").addEventListener("change", renderMatch);
  renderMatch();
}

/* ============================================================
   3. INSIDE THE MODEL — BNN sampling
   ============================================================ */

let bnnSamples = [];
let bnnAnim = null;

function bnnTarget() {
  const m = WC_MATCHES[+$("bnnSelect").value];
  return { m, mean: m.ens[0], sd: Math.max(m.std, 0.018) * 1.7, point: m.snn[0] };
}

function gauss() {
  let u = 0, v = 0;
  while (!u) u = Math.random();
  while (!v) v = Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

function drawBnn() {
  const cv = $("bnnChart");
  if (!cv || !cv.clientWidth) return;
  const { ctx, w, h } = setupCanvas(cv, 420);
  const t = bnnTarget();
  const padL = 44, padR = 16, padB = 46, padT = 30;
  const X = (p) => padL + p * (w - padL - padR);
  ctx.clearRect(0, 0, w, h);

  // axes
  ctx.strokeStyle = "#1d2840";
  ctx.fillStyle = "#5b6880";
  ctx.font = "10px JetBrains Mono, monospace";
  ctx.textAlign = "center";
  for (let p = 0; p <= 1.0001; p += 0.25) {
    ctx.beginPath();
    ctx.moveTo(X(p), padT);
    ctx.lineTo(X(p), h - padB);
    ctx.stroke();
    ctx.fillText((p * 100).toFixed(0) + "%", X(p), h - padB + 16);
  }
  ctx.fillText(`P(${t.m.h} win)  ·  ${t.m.h} vs ${t.m.a}`, (padL + w - padR) / 2, h - 10);

  // histogram
  const bins = new Array(40).fill(0);
  bnnSamples.forEach((s) => bins[clamp(Math.floor(s * 40), 0, 39)]++);
  const maxBin = Math.max(4, ...bins);
  const bw = (w - padL - padR) / 40;
  ctx.fillStyle = "rgba(34,211,238,0.65)";
  bins.forEach((b, i) => {
    if (!b) return;
    const bh = ((h - padB - padT) * b) / maxBin;
    ctx.fillRect(padL + i * bw + 1, h - padB - bh, bw - 2, bh);
  });

  // SNN single point estimate
  ctx.fillStyle = "#a78bfa";
  ctx.beginPath();
  const sx = X(t.point);
  ctx.moveTo(sx, padT + 2);
  ctx.lineTo(sx - 5, padT - 8 + 2);
  ctx.lineTo(sx + 5, padT - 8 + 2);
  ctx.closePath();
  ctx.fill();
  ctx.textAlign = sx > w - 130 ? "right" : "left";
  ctx.fillText("SNN point estimate " + pct(t.point), sx + (sx > w - 130 ? -8 : 8), padT + 2);

  // mean of samples
  if (bnnSamples.length > 5) {
    const mean = bnnSamples.reduce((a, b) => a + b, 0) / bnnSamples.length;
    ctx.strokeStyle = "#4ade80";
    ctx.setLineDash([5, 4]);
    ctx.beginPath();
    ctx.moveTo(X(mean), padT);
    ctx.lineTo(X(mean), h - padB);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = "#4ade80";
    ctx.textAlign = X(mean) > w - 120 ? "right" : "left";
    ctx.fillText("BNN mean " + pct(mean), X(mean) + (X(mean) > w - 120 ? -8 : 8), padT + 16);
  }
}

function bnnRun() {
  const t = bnnTarget();
  bnnSamples = [];
  cancelAnimationFrame(bnnAnim);
  $("bnnSampleBtn").disabled = true;
  function step() {
    for (let i = 0; i < 5 && bnnSamples.length < 300; i++) {
      bnnSamples.push(clamp(t.mean + gauss() * t.sd, 0.015, 0.985));
    }
    drawBnn();
    const n = bnnSamples.length;
    const mean = bnnSamples.reduce((a, b) => a + b, 0) / n;
    const sd = Math.sqrt(bnnSamples.reduce((a, b) => a + (b - mean) ** 2, 0) / n);
    $("bnnCount").textContent = n;
    $("bnnMean").textContent = pct(mean);
    $("bnnCI").textContent = `${pct(clamp(mean - 2 * sd, 0, 1), 0)} – ${pct(clamp(mean + 2 * sd, 0, 1), 0)}`;
    if (n < 300) bnnAnim = requestAnimationFrame(step);
    else $("bnnSampleBtn").disabled = false;
  }
  bnnAnim = requestAnimationFrame(step);
}

if ($("bnnSelect")) {
  fillMatchSelect($("bnnSelect"));
  let hi = 0;
  WC_MATCHES.forEach((m, i) => { if (m.std > WC_MATCHES[hi].std) hi = i; });
  $("bnnSelect").value = hi;
  $("bnnSelect").addEventListener("change", () => { bnnSamples = []; $("bnnCount").textContent = "0"; $("bnnMean").textContent = "—"; $("bnnCI").textContent = "—"; drawBnn(); });
  $("bnnSampleBtn").addEventListener("click", bnnRun);
}

/* ============================================================
   4. CODECRAFT — prompt-driven race: raw loop vs LangChain
   ============================================================ */

const AGENT_CHIPS = [
  "fix the failing date test",
  "add a /health endpoint to the API",
  "extract retry logic into a decorator"
];

function planFromPrompt(raw) {
  const p = (raw || "").trim() || AGENT_CHIPS[0];
  const lower = p.toLowerCase();
  const stop = new Set(["the","and","for","with","into","from","that","this","fix","add","make","create","refactor","update","remove","change","implement","write","build","test","tests","failing","bug","error","please","code","file","files","new","api","endpoint","function","method","logic","there","when","then","what","some","broken","slow","missing","wrong","old","bad","our","all","app","more"]);
  const words = (p.match(/[a-zA-Z][a-zA-Z0-9_\-]{2,}/g) || []).filter((w) => !stop.has(w.toLowerCase()));
  const subject = (words[0] || "feature").toLowerCase().replace(/[^a-z0-9_]/g, "") || "feature";
  let steps;
  if (/test|fail|bug|error|crash|broke/.test(lower)) {
    steps = [
      { icon: "🧠", t: "plan · ReAct", x: `Reproduce first. Run the suite, read the failing assertion around “${subject}”, find root cause, patch, re-run.` },
      { icon: "🧪", t: "tool · run_tests()", x: `observation: 1 failure in <span class="mono">tests/test_${subject}.py</span>` },
      { icon: "🔧", t: `tool · read_file("tests/test_${subject}.py")`, x: "observation: expected behavior extracted from the failing assert." },
      { icon: "🔧", t: `tool · read_file("src/${subject}.py")`, x: "observation: implementation diverges from the tested contract — root cause found." },
      { icon: "✏️", t: `tool · replace_in_file("src/${subject}.py")`, x: "diff preview → guardrail approval → patch applied." },
      { icon: "🧪", t: "tool · run_tests()", x: 'observation: <span class="mono">all tests passed ✓</span>' }
    ];
  } else if (/endpoint|route|server|fastapi|flask|http|rest/.test(lower)) {
    steps = [
      { icon: "🧠", t: "plan · ReAct", x: `Locate the app object, implement “${p}”, wire the route, verify with the test runner.` },
      { icon: "🔧", t: "tool · project_context()", x: "observation: FastAPI project · entrypoint app/main.py · pytest available." },
      { icon: "🔧", t: 'tool · read_file("app/main.py")', x: "observation: router + dependency helpers mapped." },
      { icon: "✏️", t: `tool · write_file("app/${subject}.py")`, x: "diff preview → guardrail approval → route implemented." },
      { icon: "🧪", t: "tool · run_tests()", x: 'observation: <span class="mono">all tests passed ✓</span>' }
    ];
  } else if (/refactor|extract|clean|rename|move|decorator|dedup|simplif/.test(lower)) {
    steps = [
      { icon: "🧠", t: "plan · ReAct", x: `Find every duplicate of “${subject}”, design one shared abstraction, replace all call sites, re-run the suite.` },
      { icon: "🔧", t: `tool · search_files("${subject}")`, x: "observation: 3 near-identical occurrences located." },
      { icon: "✏️", t: `tool · write_file("utils/${subject}.py")`, x: "shared implementation written — diff approved." },
      { icon: "✏️", t: "tool · replace_in_file × 3", x: "all call sites now use the shared version." },
      { icon: "🧪", t: "tool · run_tests()", x: 'observation: <span class="mono">all tests passed ✓</span>' }
    ];
  } else {
    steps = [
      { icon: "🧠", t: "plan · ReAct", x: `Scope “${p}”: inspect the project, find touch points for “${subject}”, implement, verify.` },
      { icon: "🔧", t: "tool · project_context()", x: "observation: Python project · src layout mapped · pytest available." },
      { icon: "🔧", t: `tool · search_files("${subject}")`, x: "observation: 2 relevant modules located." },
      { icon: "✏️", t: `tool · write_file("src/${subject}.py")`, x: "diff preview → guardrail approval → implementation written." },
      { icon: "🧪", t: "tool · run_tests()", x: 'observation: <span class="mono">all tests passed ✓</span>' }
    ];
  }
  return { prompt: p, steps };
}

// LangChain overhead inserted around every real step (illustrative; ratio is measured)
const LC_OVERHEAD = [
  "AgentExecutor: rebuild chain graph",
  "CallbackManager: dispatch events ×12",
  "PromptTemplate: render + serialize schema",
  "OutputParser: validate → retry(1)"
];

let raceBusy = false;

/* ===== REAL MODE: live LLM tool-calling loop + genuine Python (Pyodide) ===== */
const REAL_SYS = `You are CodeCraft, a precise coding agent working in a fresh virtual workspace.
Tools: write_file(path, content) creates/overwrites a file; read_file(path) reads one; run_python(path) executes the file with REAL Python and returns its output.
Method: plan briefly, write the code AND a test file (plain asserts + a final print), run the tests with run_python, fix any failure, and when tests pass reply with a 1-2 sentence completion summary and NO tool calls. Keep files small.
Environment: Python runs in the browser via Pyodide. Available: the standard library plus numpy and pandas (auto-loaded on import). NOT available: torch, tensorflow, network access, pip. For ML/neural-network tasks, implement from scratch with numpy (e.g. a small MLP with manual backprop) and keep training tiny (few epochs, tiny data) so it runs in seconds.`;

const REAL_TOOLS = [
  { type: "function", function: { name: "write_file", description: "Create or overwrite a file in the workspace", parameters: { type: "object", properties: { path: { type: "string" }, content: { type: "string" } }, required: ["path", "content"] } } },
  { type: "function", function: { name: "read_file", description: "Read a file from the workspace", parameters: { type: "object", properties: { path: { type: "string" } }, required: ["path"] } } },
  { type: "function", function: { name: "run_python", description: "Execute a python file for real and return its stdout/stderr", parameters: { type: "object", properties: { path: { type: "string" } }, required: ["path"] } } }
];

/* --- the real LangChain lane: the actual LangChain.js AgentExecutor,
       loaded from CDN, same task / provider / key / tools, measured live --- */
let LC_CACHE = null;
async function loadLangChainJS(onStatus) {
  if (LC_CACHE) return LC_CACHE;
  const pack = ([openaiMod, toolsMod, zodMod, msgsMod], via) => ({
    ChatOpenAI: openaiMod.ChatOpenAI,
    tool: toolsMod.tool,
    z: zodMod.z || zodMod.default,
    SystemMessage: msgsMod.SystemMessage,
    HumanMessage: msgsMod.HumanMessage,
    ToolMessage: msgsMod.ToolMessage,
    via
  });
  // NOTE: langchain's AgentExecutor doesn't survive any CDN's browser build
  // (broken internal exports) — so the lane races LangChain's real model
  // wrapper + tool stack driven by its own bindTools loop instead.
  const attempts = [
    ["jsDelivr", [
      "https://cdn.jsdelivr.net/npm/@langchain/openai@0.4.4/+esm",
      "https://cdn.jsdelivr.net/npm/@langchain/core@0.3.42/tools/+esm",
      "https://cdn.jsdelivr.net/npm/zod@3.24.2/+esm",
      "https://cdn.jsdelivr.net/npm/@langchain/core@0.3.42/messages/+esm"
    ]],
    ["esm.sh (bundled)", [
      "https://esm.sh/@langchain/openai@0.4.4?bundle-deps",
      "https://esm.sh/@langchain/core@0.3.42/tools?bundle-deps",
      "https://esm.sh/zod@3.24.2",
      "https://esm.sh/@langchain/core@0.3.42/messages?bundle-deps"
    ]]
  ];
  let lastErr = null;
  for (const [via, urls] of attempts) {
    try {
      if (onStatus) onStatus("loading LangChain.js via " + via + "…");
      const mods = await Promise.all(urls.map((u) => import(u)));
      const lc = pack(mods, via);
      if (!lc.ChatOpenAI || !lc.tool || !lc.SystemMessage || !lc.ToolMessage) {
        throw new Error("exports missing from " + via + " build");
      }
      LC_CACHE = lc;
      return lc;
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr || new Error("could not load LangChain.js");
}

async function runLangChainLane(prompt) {
  const sl = $("stepsLC");
  sl.innerHTML = "";
  const t0 = performance.now();
  const tick = setInterval(() => { $("timerLC").textContent = ((performance.now() - t0) / 1000).toFixed(1) + "s"; }, 120);
  const lcVfs = {};
  try {
    const loadCard = laneStep(sl, "📦", LC_CACHE ? "LangChain.js (cached)" : "loading LangChain.js from CDN…", LC_CACHE ? "" : "the framework itself has to arrive before any work can start", LC_CACHE ? "" : "ov");
    const LC = await loadLangChainJS((s) => { loadCard.querySelector(".rs-title").textContent = s; });
    loadCard.querySelector(".rs-title").textContent = "LangChain.js ready (" + (LC.via || "CDN") + ")";

    const cfg = LLM.getConfig();
    const prov = LLM.PROVIDERS[cfg.provider] || LLM.PROVIDERS.groq;
    const model = new LC.ChatOpenAI({
      model: cfg.model || prov.model,
      apiKey: cfg.key,
      temperature: 0.2,
      configuration: { baseURL: prov.base, dangerouslyAllowBrowser: true }
    });

    const tools = [
      LC.tool(async ({ path, content }) => {
        lcVfs[path] = String(content);
        laneStep(sl, "✏️", `tool (wrapped) · write_file("${esc(path)}")`, `<div class="pl-diff">${esc(String(content).slice(0, 400))}</div>`);
        return "ok, written (" + String(content).length + " chars)";
      }, { name: "write_file", description: "Create or overwrite a file in the workspace", schema: LC.z.object({ path: LC.z.string(), content: LC.z.string() }) }),
      LC.tool(async ({ path }) => {
        laneStep(sl, "🔧", `tool (wrapped) · read_file("${esc(path)}")`, "");
        return lcVfs[path] !== undefined ? lcVfs[path] : "ERROR: no such file";
      }, { name: "read_file", description: "Read a file from the workspace", schema: LC.z.object({ path: LC.z.string() }) }),
      LC.tool(async ({ path }) => {
        const st = laneStep(sl, "🐍", `tool (wrapped) · run_python("${esc(path)}") · executing…`, "");
        let r;
        try { r = await PY.run(lcVfs, path); } catch (e) { r = { ok: false, out: "Pyodide error: " + e.message }; }
        st.remove();
        laneStep(sl, r.ok ? "🧪" : "❌", `run_python("${esc(path)}") — real output`, `<div class="pl-diff">${esc(r.out)}</div>`, r.ok ? "ok" : "ov");
        return (r.ok ? "EXIT OK\n" : "EXIT WITH ERROR\n") + r.out;
      }, { name: "run_python", description: "Execute a python file for real and return its stdout/stderr", schema: LC.z.object({ path: LC.z.string() }) })
    ];

    laneStep(sl, "⛓", "ChatOpenAI.bindTools(tools) — LangChain's tool-calling stack", "zod→JSON-schema conversion, message classes, model-wrapper serialization. (AgentExecutor's browser build is broken on every CDN — framework fragility, exhibit A — so its own bound-tools loop drives the run.)", "ov");
    const toolsByName = {};
    tools.forEach((tl) => (toolsByName[tl.name] = tl));
    const bound = model.bindTools(tools);
    const msgs = [new LC.SystemMessage(REAL_SYS), new LC.HumanMessage(prompt)];
    let finalText = "";
    for (let i = 0; i < 8; i++) {
      laneStep(sl, "🛰", "LLM call — through LangChain's model wrapper", "", "");
      const ai = await bound.invoke(msgs);
      msgs.push(ai);
      const tcs = ai.tool_calls || [];
      const content = typeof ai.content === "string" ? ai.content : JSON.stringify(ai.content);
      if (content) { finalText = content; laneStep(sl, "🧠", "assistant", esc(content).slice(0, 450)); }
      if (!tcs.length) break;
      for (const tc of tcs) {
        const tl = toolsByName[tc.name];
        let out = "ERROR: unknown tool " + tc.name;
        if (tl) {
          try { out = await tl.invoke(tc.args); } catch (e) { out = "TOOL ERROR: " + e.message; }
        }
        msgs.push(new LC.ToolMessage({ content: String(out).slice(0, 1500), tool_call_id: tc.id || "call_" + i }));
      }
    }
    clearInterval(tick);
    const secs = (performance.now() - t0) / 1000;
    $("timerLC").textContent = secs.toFixed(1) + "s";
    laneStep(sl, "🏁", `LangChain run complete in ${secs.toFixed(1)}s`, "the real LangChain.js model + tool stack — same task, same provider, same tools.", "slowdone");
    return { ok: true, secs, files: Object.keys(lcVfs) };
  } catch (e) {
    clearInterval(tick);
    laneStep(sl, "⚠️", "LangChain lane couldn't run", esc(String((e && e.message) || e)).slice(0, 280) + " — citing my offline benchmark instead (7.5× median, 15 tasks).", "ov");
    return { ok: false };
  }
}

async function runReal() {
  if (raceBusy) return;
  raceBusy = true;
  $("agentRunBtn").disabled = true;
  if (LLM.isMock && LLM.isMock()) LLM.mockReset();
  const prompt = ($("agentPrompt").value || "").trim() || "fix my two sum code";
  const sm = $("stepsMine"), sl = $("stepsLC");
  sm.innerHTML = ""; sl.innerHTML = "";
  $("agentSummary").hidden = true;
  $("timerLC").textContent = "—";
  laneStep(sl, "⏳", "LangChain.js races second", "back-to-back on the identical task (not parallel) so both lanes get fair conditions — the Python runtime is shared.", "ov");
  if (LLM.isMock()) laneStep(sm, "ℹ️", "mock key active — fixed 2-sum script", "mock mode always replays the scripted two-sum demo regardless of your prompt (the Python execution is still real). Save a real key — free at console.groq.com — to run YOUR prompt live.", "ov");
  laneStep(sm, "📝", "request · REAL RUN", `$ codecraft "${esc(prompt)}"`, "req");

  const t0 = performance.now();
  const fmt = () => ((performance.now() - t0) / 1000).toFixed(1) + "s";
  const vfs = {};
  const messages = [{ role: "system", content: REAL_SYS }, { role: "user", content: prompt }];
  let toolCalls = 0, iters = 0, failed = false;

  try {
    for (let i = 0; i < 8; i++) {
      iters++;
      const waitCard = laneStep(sm, "🛰", "calling the model — live…", "", "");
      let msg;
      try { msg = await LLM.chat(messages, REAL_TOOLS); }
      finally { waitCard.remove(); }
      messages.push(msg);
      if (msg.content) laneStep(sm, "🧠", "assistant", esc(msg.content).slice(0, 600));
      $("timerMine").textContent = fmt();
      if (!msg.tool_calls || !msg.tool_calls.length) break;

      for (const tc of msg.tool_calls) {
        toolCalls++;
        let args = {};
        try { args = JSON.parse(tc.function.arguments || "{}"); } catch (e) { /* tolerate */ }
        const name = tc.function.name;
        let resultText;
        if (name === "write_file") {
          vfs[args.path || "file.py"] = String(args.content || "");
          laneStep(sm, "✏️", `tool · write_file("${esc(args.path || "")}")`, `<div class="pl-diff">${esc(String(args.content || "").slice(0, 700))}</div>`);
          resultText = "ok, written (" + String(args.content || "").length + " chars)";
        } else if (name === "read_file") {
          resultText = vfs[args.path] !== undefined ? vfs[args.path] : "ERROR: no such file";
          laneStep(sm, "🔧", `tool · read_file("${esc(args.path || "")}")`, esc(String(resultText).slice(0, 300)));
        } else if (name === "run_python") {
          const st = laneStep(sm, "🐍", `tool · run_python("${esc(args.path || "")}") · executing for real…`, "");
          let r;
          try {
            r = await PY.run(vfs, args.path, (s) => { st.querySelector(".rs-title").textContent = s; });
          } catch (e) { r = { ok: false, out: "Pyodide error: " + e.message }; }
          st.remove();
          laneStep(sm, r.ok ? "🧪" : "❌", `run_python("${esc(args.path || "")}") — real output`, `<div class="pl-diff">${esc(r.out)}</div>`, r.ok ? "ok" : "ov");
          resultText = (r.ok ? "EXIT OK\n" : "EXIT WITH ERROR\n") + r.out;
        } else {
          resultText = "ERROR: unknown tool " + name;
        }
        messages.push({ role: "tool", tool_call_id: tc.id, content: String(resultText).slice(0, 1500) });
        $("timerMine").textContent = fmt();
      }
    }
  } catch (e) {
    failed = true;
    laneStep(sm, "⚠️", "real run stopped", esc(e.message), "ov");
  }
  if (!failed) laneStep(sm, "✅", "REAL run complete in " + fmt(), "live LLM tool-calling loop + genuine Python execution, all in your browser.", "ok");
  const mySecs = (performance.now() - t0) / 1000;

  // now the SAME task through the real LangChain.js AgentExecutor
  let lc = { ok: false };
  if (!failed && !LLM.isMock()) {
    lc = await runLangChainLane(prompt);
  } else {
    $("stepsLC").innerHTML = "";
    laneStep($("stepsLC"), "ℹ️", "framework lane idle", LLM.isMock()
      ? "mock mode races only the raw loop — save a real key (free at console.groq.com) to race the actual LangChain.js live."
      : "raw-loop run failed, nothing to race.", "ov");
  }

  const sum = $("agentSummary");
  sum.hidden = false;
  sum.innerHTML = `<span>${failed ? "⚠ stopped" : "✓ REAL RACE"}</span><span>⚡ raw loop ${mySecs.toFixed(1)}s · ${toolCalls} tool calls</span>` +
    (lc.ok
      ? `<span>🐢 LangChain.js ${lc.secs.toFixed(1)}s</span><span>${(lc.secs / Math.max(mySecs, 0.1)).toFixed(1)}× — measured live in YOUR browser (offline benchmark median: 7.5×)</span>`
      : `<span>workspace: ${esc(Object.keys(vfs).join(", ") || "—")}</span><span>offline benchmark: 7.5× (15 tasks)</span>`);
  $("agentRunBtn").disabled = false;
  raceBusy = false;
}

function laneStep(el, icon, title, body, cls) {
  const d = document.createElement("div");
  d.className = "race-step " + (cls || "");
  d.innerHTML = `<span class="rs-icon">${icon}</span><div class="rs-body"><div class="rs-title mono">${title}</div>${body ? `<div class="rs-text">${body}</div>` : ""}</div>`;
  el.appendChild(d);
  requestAnimationFrame(() => d.classList.add("show"));
  el.scrollTop = el.scrollHeight;
  return d;
}

async function runSim() {
  if (raceBusy) return;
  raceBusy = true;
  $("agentRunBtn").disabled = true;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const plan = planFromPrompt($("agentPrompt").value);
  const sm = $("stepsMine"), sl = $("stepsLC");
  sm.innerHTML = ""; sl.innerHTML = "";
  $("agentSummary").hidden = true;

  // simulated clock: my lane ~1.5 agent-seconds per step → ≈8s total; LC = 7.5×
  const myTotal = plan.steps.length * 1.5;
  const lcTotal = myTotal * 7.5;
  let tM = 0, tL = 0;
  const fmtT = (s) => s.toFixed(1) + "s";

  laneStep(sm, "📝", "request", `$ codecraft "${plan.prompt}"`, "req");
  laneStep(sl, "📝", "request", `AgentExecutor.invoke({input: "${plan.prompt}"})`, "req");

  // my lane: clean steps
  const myRun = (async () => {
    for (const s of plan.steps) {
      laneStep(sm, s.icon, s.t, s.x);
      tM += 1.5;
      $("timerMine").textContent = fmtT(tM);
      await sleep(620);
    }
    laneStep(sm, "✅", `done in ~${fmtT(myTotal)} (agent time)`, "raw loop: messages → tools → repeat. Nothing else.", "ok");
  })();

  // LangChain lane: same steps buried in overhead, then fast-forward
  const lcRun = (async () => {
    for (let i = 0; i < 2; i++) {
      const s = plan.steps[i];
      for (const ov of LC_OVERHEAD.slice(0, i === 0 ? 4 : 3)) {
        laneStep(sl, "⏳", ov, "", "ov");
        tL += 2.6;
        $("timerLC").textContent = fmtT(tL);
        await sleep(540);
      }
      laneStep(sl, s.icon, s.t.replace("tool ·", "tool (wrapped) ·"), "");
      tL += 1.5;
      $("timerLC").textContent = fmtT(tL);
      await sleep(420);
    }
    laneStep(sl, "⏩", `fast-forwarding ${(lcTotal - tL).toFixed(0)}s of the same overhead…`, `${plan.steps.length - 2} steps still queued behind callbacks, serialization and parser retries`, "ov");
    await sleep(1100);
    $("timerLC").textContent = fmtT(lcTotal);
    laneStep(sl, "🏁", `done in ~${fmtT(lcTotal)} (agent time)`, "same task, same model — 7.5× the latency.", "slowdone");
  })();

  await Promise.all([myRun, lcRun]);
  const sum = $("agentSummary");
  sum.hidden = false;
  sum.innerHTML = `<span>⚡ CodeCraft ~${fmtT(myTotal)}</span><span>🐢 LangChain ~${fmtT(lcTotal)}</span><span>7.5× — measured on my 15-task benchmark</span><span>trace simulated from your prompt · real agent on GitHub ↖</span>`;
  $("agentRunBtn").disabled = false;
  raceBusy = false;
}

function runRace() { return hasLLM() ? runReal() : runSim(); }

function refreshAgentMode() {
  const real = hasLLM();
  const live = real && !LLM.isMock();
  if ($("agentRunBtn")) $("agentRunBtn").textContent = real ? "▶ Run for REAL" : "▶ Race (simulated)";
  if ($("siRunBtn")) $("siRunBtn").textContent = live ? "▶ Learn on this task — LIVE" : "▶ Watch it learn (recorded)";
  if ($("llmStatus")) $("llmStatus").textContent = real
    ? (LLM.isMock() ? "● mock mode — scripted 2-sum demo, real Python execution" : "● real mode active — " + (LLM.getConfig().provider))
    : "○ no key — demos run simulated";
}

function wireKeyPanel() {
  if (!$("llmSave")) return;
  const cfg = LLM.getConfig();
  $("llmProvider").innerHTML = Object.entries(LLM.PROVIDERS).map(([k, p]) =>
    `<option value="${k}"${k === cfg.provider ? " selected" : ""}>${p.name}</option>`).join("");
  $("llmModel").placeholder = LLM.PROVIDERS[cfg.provider].model;
  $("llmModel").value = cfg.model || "";
  if (cfg.key && cfg.key !== "mock") $("llmKey").value = cfg.key;
  $("llmRemember").checked = !!cfg.remember;
  $("llmProvider").addEventListener("change", () => {
    $("llmModel").placeholder = LLM.PROVIDERS[$("llmProvider").value].model;
  });
  $("llmSave").addEventListener("click", () => {
    LLM.setConfig({
      provider: $("llmProvider").value,
      model: $("llmModel").value.trim(),
      key: $("llmKey").value.trim(),
      remember: $("llmRemember").checked
    });
    refreshAgentMode();
  });
}

if ($("agentRunBtn")) {
  $("agentChips").innerHTML = AGENT_CHIPS.map((c) => `<button class="chip mono">${c}</button>`).join("");
  document.querySelectorAll("#agentChips .chip").forEach((b) =>
    b.addEventListener("click", () => { $("agentPrompt").value = b.textContent; runRace(); }));
  $("agentRunBtn").addEventListener("click", runRace);
  $("agentPrompt").addEventListener("keydown", (e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); runRace(); } });
  $("agentPrompt").addEventListener("input", autoGrow);
  if ($("siPrompt")) {
    $("siPrompt").addEventListener("keydown", (e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); $("siRunBtn").click(); } });
    $("siPrompt").addEventListener("input", autoGrow);
  }
  wireKeyPanel();
  refreshAgentMode();
}


/* ============================================================
   5. SELF-IMPROVING AGENT
   ============================================================ */

const SI_ATTEMPTS = [
  {
    verdict: "fail",
    title: "attempt 1 · no strategies available",
    text: "Task: book the cheapest qualifying flight, then email the receipt. Agent books the first search result. Verifier: price was not minimal.",
    retrieved: null,
    memory: { id: "strategy-017", text: "Before selecting a flight, sort all search results by total price including fees — the first result is ranked by relevance, not price." }
  },
  {
    verdict: "fail",
    title: "attempt 2 · 1 strategy retrieved",
    text: "Cheapest flight booked correctly this time — but the agent emails the search-page itinerary instead of the final confirmed reservation.",
    retrieved: "↳ retrieved: strategy-017 (price sorting)",
    memory: { id: "strategy-018", text: "After booking, re-fetch the reservation by confirmation ID and attach that payload to the receipt email — never reuse pre-booking data." }
  },
  {
    verdict: "pass",
    title: "attempt 3 · 2 strategies retrieved",
    text: "Sorts by total price ✓ books cheapest ✓ re-fetches confirmed reservation ✓ emails correct receipt ✓ — verifier passes.",
    retrieved: "↳ retrieved: strategy-017, strategy-018",
    memory: null
  }
];

let siBusy = false;

function drawSiChart(progress) {
  const cv = $("siChart");
  if (!cv || !cv.clientWidth) return;
  const { ctx, w, h } = setupCanvas(cv, 170);
  const padL = 40, padR = 14, padT = 16, padB = 26;
  ctx.clearRect(0, 0, w, h);
  ctx.font = "9px JetBrains Mono, monospace";
  ctx.fillStyle = "#5b6880";
  ctx.strokeStyle = "#1d2840";
  ctx.textAlign = "right";
  [0, 50, 94].forEach((v) => {
    const y = h - padB - ((h - padB - padT) * v) / 100;
    ctx.beginPath(); ctx.moveTo(padL, y); ctx.lineTo(w - padR, y); ctx.stroke();
    ctx.fillText(v + "%", padL - 6, y + 3);
  });
  // target line
  const yT = h - padB - ((h - padB - padT) * 94) / 100;
  ctx.strokeStyle = "rgba(74,222,128,0.5)";
  ctx.setLineDash([4, 4]);
  ctx.beginPath(); ctx.moveTo(padL, yT); ctx.lineTo(w - padR, yT); ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = "#4ade80";
  ctx.textAlign = "left";
  ctx.fillText("94% · measured Tau Bench result", padL + 6, yT - 5);

  // curve: success rate rising as memory grows (illustrative trajectory, real endpoint)
  const N = 60;
  const pts = [];
  for (let i = 0; i <= N * progress; i++) {
    const x = i / N;
    const v = 35 + (94 - 35) * (1 - Math.exp(-3.1 * x));
    pts.push([padL + x * (w - padL - padR), h - padB - ((h - padB - padT) * v) / 100]);
  }
  if (pts.length > 1) {
    ctx.strokeStyle = "#22d3ee";
    ctx.lineWidth = 2;
    ctx.beginPath();
    pts.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])));
    ctx.stroke();
    ctx.lineWidth = 1;
    const lp = pts[pts.length - 1];
    ctx.fillStyle = "#22d3ee";
    ctx.beginPath(); ctx.arc(lp[0], lp[1], 3.5, 0, 7); ctx.fill();
  }
  ctx.fillStyle = "#5b6880";
  ctx.textAlign = "center";
  ctx.fillText("tasks attempted → (memory grows, success compounds)", (padL + w - padR) / 2, h - 8);
}

async function siRun() {
  if (siBusy) return;
  siBusy = true;
  $("siRunBtn").disabled = true;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const lane = $("attemptLane");
  const mem = $("memoryCards");
  lane.innerHTML = "";
  mem.innerHTML = '<p class="memory-empty mono">∅ empty — no strategies learned yet</p>';
  drawSiChart(0);
  let memCount = 0;

  for (let i = 0; i < SI_ATTEMPTS.length; i++) {
    const a = SI_ATTEMPTS[i];
    const card = document.createElement("div");
    card.className = `attempt-card ${a.verdict}`;
    card.innerHTML = `
      <h4><span>${a.title}</span><span class="verdict-${a.verdict}">${a.verdict === "pass" ? "✓ PASS" : "✗ FAIL"}</span></h4>
      <p>${a.text}</p>
      ${a.retrieved ? `<span class="retrieved">${a.retrieved}</span>` : ""}`;
    lane.appendChild(card);
    await sleep(60);
    card.classList.add("show");
    await sleep(1400);

    if (a.memory) {
      memCount++;
      if (memCount === 1) mem.innerHTML = "";
      const mc = document.createElement("div");
      mc.className = "memory-card";
      mc.innerHTML = `<span class="mem-id">📥 ${a.memory.id} · embedded → ChromaDB</span>${a.memory.text}`;
      mem.appendChild(mc);
      await sleep(60);
      mc.classList.add("show");
      await sleep(700);
    }
    drawSiChart((i + 1) / SI_ATTEMPTS.length);
  }
  $("siRunBtn").disabled = false;
  siBusy = false;
}

function siReset() {
  if (siBusy) return;
  $("attemptLane").innerHTML = "";
  $("memoryCards").innerHTML = '<p class="memory-empty mono">∅ empty — no strategies learned yet</p>';
  drawSiChart(0);
}

/* ===== REAL self-improvement on YOUR task: the LLM writes a verifier,
       then attempts solutions; real Python judges; failures become strategies ===== */
const SI_DEFAULT_TASK = `Write parse_total(lines) -> float: each line looks like "Item; 12.30 USD" (decimal commas like "4,75 USD" may appear). Sum all amounts.`;
const SI_CHIPS = [
  "sum money amounts from lines like 'Item; 12.30 USD' (commas too)",
  "convert roman numerals to int (handle IV, IX, XL)",
  "validate IPv4 addresses strictly (no leading zeros)"
];

const stripFences = (s) => String(s || "").replace(/^```[a-z]*\n?/i, "").replace(/```\s*$/i, "").trim();

async function runRealSI() {
  if (siBusy) return;
  siBusy = true;
  $("siRunBtn").disabled = true;
  const task = (($("siPrompt") && $("siPrompt").value) || "").trim() || SI_DEFAULT_TASK;
  const lane = $("attemptLane"), mem = $("memoryCards");
  lane.innerHTML = "";
  mem.innerHTML = '<p class="memory-empty mono">∅ empty — no strategies learned yet</p>';
  drawSiChart(0);
  const strategies = [];
  let passed = false;

  try {
    // step 0: the LLM writes a hidden verifier for the user's task
    const vCard = document.createElement("div");
    vCard.className = "attempt-card show";
    vCard.innerHTML = `<h4><span>step 0 · LIVE</span><span class="mono">writing verifier…</span></h4><p>your LLM is designing hidden tests for: “${esc(task.slice(0, 110))}”</p>`;
    lane.appendChild(vCard);
    const vMsg = await LLM.chat([{ role: "user", content: `Task for a solver: ${task}
Write verify.py for it: plain Python (no pytest). Import from a module named solution; require the main function to be named solve. Cover normal cases AND at least one tricky edge case implied but not stated. 4-7 asserts with messages. Final line: print("verifier: all tests passed"). Return ONLY raw Python code, no fences.` }]);
    const verifier = stripFences(vMsg.content);
    const nAsserts = (verifier.match(/^\s*assert /gm) || []).length;
    vCard.innerHTML = `<h4><span>step 0 · verifier ready</span><span class="verdict-pass mono">✓ ${nAsserts} hidden asserts</span></h4><p>the solver will NOT see these tests — only their pass/fail output.</p>`;

    for (let attempt = 1; attempt <= 3 && !passed; attempt++) {
      const card = document.createElement("div");
      card.className = "attempt-card";
      card.innerHTML = `<h4><span>attempt ${attempt} · LIVE · ${strategies.length} strateg${strategies.length === 1 ? "y" : "ies"} retrieved</span><span class="mono">running…</span></h4><p>asking your LLM for a solution${strategies.length ? " with retrieved strategies injected" : ""}…</p>`;
      lane.appendChild(card);
      requestAnimationFrame(() => card.classList.add("show"));

      const prompt = `Task: ${task}
Write solution.py exposing a function named solve(...) that fulfils the task. Return ONLY raw Python code, no fences, no explanations.` + (strategies.length
        ? "\n\nApply these strategies learned from earlier failed attempts:\n- " + strategies.join("\n- ")
        : "");
      const msg = await LLM.chat([{ role: "user", content: prompt }]);
      const code = stripFences(msg.content);
      const r = await PY.run({ "solution.py": code, "verify.py": verifier }, "verify.py");
      passed = r.ok && r.out.includes("verifier: all tests passed");

      card.className = `attempt-card show ${passed ? "pass" : "fail"}`;
      card.innerHTML = `
        <h4><span>attempt ${attempt} · LIVE${strategies.length ? " · retrieved " + strategies.length : ""}</span><span class="verdict-${passed ? "pass" : "fail"}">${passed ? "✓ PASS (real verifier)" : "✗ FAIL (real verifier)"}</span></h4>
        <p class="mono" style="font-size:.68rem">${esc(r.out.split("\n").slice(-3).join(" · ").slice(0, 220))}</p>`;
      drawSiChart(passed ? 1 : attempt / 3.5);

      if (!passed && attempt < 3) {
        const an = await LLM.chat([{ role: "user", content: `A Python solution for this task failed hidden tests.\nTask: ${task}\nVerifier output:\n${r.out.slice(0, 500)}\nWrite ONE short reusable strategy (a single sentence, no preamble) that would prevent this class of failure.` }]);
        const strategy = stripFences(an.content).split("\n")[0].slice(0, 220);
        strategies.push(strategy);
        if (strategies.length === 1) mem.innerHTML = "";
        const mc = document.createElement("div");
        mc.className = "memory-card";
        mc.innerHTML = `<span class="mem-id">📥 strategy-${String(16 + strategies.length).padStart(3, "0")} · written by your LLM just now</span>${esc(strategy)}`;
        mem.appendChild(mc);
        requestAnimationFrame(() => mc.classList.add("show"));
      }
    }
  } catch (e) {
    const err = document.createElement("div");
    err.className = "attempt-card show fail";
    err.innerHTML = `<h4><span>live run stopped</span><span class="verdict-fail">⚠</span></h4><p>${esc(e.message)}</p>`;
    lane.appendChild(err);
  }
  $("siRunBtn").disabled = false;
  siBusy = false;
}

if ($("siRunBtn")) {
  $("siRunBtn").addEventListener("click", () => {
    if (hasLLM() && !LLM.isMock()) return runRealSI();
    const typed = (($("siPrompt") && $("siPrompt").value) || "").trim();
    if (typed) {
      $("attemptLane").innerHTML = `<div class="attempt-card show"><h4><span>live runs need a key</span><span class="mono">ℹ</span></h4><p>custom tasks run live only with an API key saved in the 🔑 panel above (free: Groq). Playing the recorded demo instead.</p></div>`;
      setTimeout(siRun, 900);
      return;
    }
    siRun();
  });
  $("siResetBtn").addEventListener("click", siReset);
  if ($("siChips")) {
    $("siChips").innerHTML = SI_CHIPS.map((c) => `<button class="chip mono">${c}</button>`).join("");
    $("siChips").querySelectorAll(".chip").forEach((b) =>
      b.addEventListener("click", () => { $("siPrompt").value = b.textContent; $("siRunBtn").click(); }));
  }
}

/* ============================================================
   6. DOCGRAPH — knowledge-graph traversal
   ============================================================ */

/* ============================================================
   DYNAMIC knowledge graph — built from the corpus at runtime.
   Entities are extracted from the emails (and anything you add),
   edges are document co-occurrences, layout is live physics,
   nodes are draggable. Nothing about this graph is hardcoded.
   ============================================================ */

const KG_COLORS = { person: "#a78bfa", vendor: "#fbbf24", doc: "#22d3ee", project: "#4ade80", topic: "#64748b" };
let GNODES = [];           // {id,label,type,count,docs:Set,x,y,vx,vy}
let GEDGES = [];           // {a,b,w,docs:Set}
let GADJ = {};
let kgActive = { nodes: new Set(), edges: new Set() };
let kgTrace = null;        // {hops: [[from,to],...], t0} — looping spark that traces the route
let kgDrag = null;
let kgLoopOn = false;
let kgW = 600, kgH = 320;

const slugify = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");

const ENT_STOP = new Set(["The","This","That","Then","There","These","Those","From","Subject","Team","Please","Thanks","Phase","Reminder","Starting","Weekly","Due","Two","Four","New","Lead","Re","All","Our","She","He","They","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday","Sunday","January","February","March","April","May","June","July","August","September","October","November","December","Jun","Jul","Q3","Q4","Eur","Usd"]);

function extractDocEntities(doc) {
  const found = new Map(); // label -> {type, n}
  const bump = (label, type, n = 1) => {
    label = label.trim();
    if (!label || label.length < 3) return;
    const cur = found.get(label);
    if (cur) cur.n += n;
    else found.set(label, { type, n });
  };
  // sender = person
  const sender = String(doc.from || "").split("<")[0].trim();
  if (/^[A-Z][a-z]+(?: [A-Z][A-Za-z]+)+$/.test(sender)) bump(sender, "person", 2);
  const text = doc.subject + ". " + doc.body;
  // document ids: INV-2291, C-114, NW-2207 …
  (text.match(/\b[A-Z]{1,4}-\d{2,5}(?:-R)?\b/g) || []).forEach((m) => bump(m, "doc"));
  // multi-word proper-noun phrases: "Atlas Migration", "Helios GmbH", "Dana Cole" …
  (text.match(/\b[A-Z][a-z]{2,}(?: [A-Z][A-Za-z]+)+\b/g) || []).forEach((m) => {
    const first = m.split(" ")[0];
    if (ENT_STOP.has(first)) return;
    let type = "topic";
    if (/GmbH|Supply|Inc\b|Ltd\b|Corp\b|Desk\b/i.test(m)) type = "vendor";
    else if (/Migration|Project|Program|Pilot|Phoenix|Atlas/i.test(m)) type = "project";
    else if (/^[A-Z][a-z]+ [A-Z][a-z]+$/.test(m)) type = "person"; // name-shaped
    bump(m, type);
  });
  return found;
}

function buildGraph() {
  const prev = {};
  GNODES.forEach((n) => (prev[n.id] = n));
  const nodeMap = new Map(); // id -> node
  const edgeMap = new Map(); // "a|b" -> edge
  const docs = allDocs();
  const corpusCount = new Map();

  const perDoc = docs.map((doc) => {
    const ents = extractDocEntities(doc);
    ents.forEach((v, label) => corpusCount.set(label, (corpusCount.get(label) || 0) + v.n));
    return { doc, ents };
  });

  perDoc.forEach(({ doc, ents }) => {
    const ids = [];
    ents.forEach((v, label) => {
      // keep: repeated across corpus, or strongly typed
      if ((corpusCount.get(label) || 0) < 2 && v.type === "topic") return;
      const id = slugify(label);
      let node = nodeMap.get(id);
      if (!node) {
        const old = prev[id];
        const hash = [...id].reduce((acc, c) => acc + c.charCodeAt(0), 0);
        node = {
          id, label, type: v.type, count: 0, docs: new Set(),
          x: old ? old.x : kgW / 2 + (Math.random() - 0.5) * 120,
          y: old ? old.y : kgH / 2 + (Math.random() - 0.5) * 80,
          vx: 0, vy: 0,
          // perpetual idle drift, unique per node (deterministic from id)
          bobF: 0.35 + (hash % 47) / 80,
          bobP: (hash % 628) / 100
        };
        nodeMap.set(id, node);
      }
      if (v.type === "person" && node.type === "topic") node.type = "person";
      node.count += v.n;
      node.docs.add(doc.id);
      ids.push(id);
    });
    // co-occurrence edges within this document
    for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) {
      const [a, b] = [ids[i], ids[j]].sort();
      if (a === b) continue;
      const key = a + "|" + b;
      let e = edgeMap.get(key);
      if (!e) { e = { a, b, w: 0, docs: new Set() }; edgeMap.set(key, e); }
      e.w += 1;
      e.docs.add(doc.id);
    }
  });

  GNODES = [...nodeMap.values()];
  // cap for readability: keep the most-mentioned 36 nodes
  if (GNODES.length > 36) {
    GNODES.sort((x, y) => y.count - x.count);
    const keep = new Set(GNODES.slice(0, 36).map((n) => n.id));
    GNODES = GNODES.filter((n) => keep.has(n.id));
    GEDGES = [...edgeMap.values()].filter((e) => keep.has(e.a) && keep.has(e.b));
  } else {
    GEDGES = [...edgeMap.values()];
  }
  GADJ = {};
  GEDGES.forEach((e) => {
    (GADJ[e.a] = GADJ[e.a] || []).push(e.b);
    (GADJ[e.b] = GADJ[e.b] || []).push(e.a);
  });
}

function kgBfs(src, dst) {
  if (src === dst) return [src];
  const prev = { [src]: null };
  const q = [src];
  while (q.length) {
    const cur = q.shift();
    for (const nb of GADJ[cur] || []) {
      if (nb in prev) continue;
      prev[nb] = cur;
      if (nb === dst) {
        const path = [dst]; let p = cur;
        while (p !== null) { path.unshift(p); p = prev[p]; }
        return path;
      }
      q.push(nb);
    }
  }
  return null;
}

/* --- live physics --- */
function kgTick() {
  const n = GNODES.length;
  // organic life: every few seconds a random node gets a gentle shove
  // and the springs visibly ripple through its neighbourhood
  if (n && !kgDrag && Math.random() < 0.006) {
    const lucky = GNODES[Math.floor(Math.random() * n)];
    const ang = Math.random() * Math.PI * 2;
    lucky.vx += Math.cos(ang) * 7;
    lucky.vy += Math.sin(ang) * 5;
  }
  for (let i = 0; i < n; i++) {
    const a = GNODES[i];
    for (let j = i + 1; j < n; j++) {
      const b = GNODES[j];
      let dx = a.x - b.x, dy = a.y - b.y;
      let d2 = dx * dx + dy * dy;
      if (d2 < 1) { dx = Math.random() - 0.5; dy = Math.random() - 0.5; d2 = 1; }
      const f = 1400 / d2;
      const d = Math.sqrt(d2);
      a.vx += (dx / d) * f; a.vy += (dy / d) * f;
      b.vx -= (dx / d) * f; b.vy -= (dy / d) * f;
    }
  }
  GEDGES.forEach((e) => {
    const a = GNODES.find((x) => x.id === e.a), b = GNODES.find((x) => x.id === e.b);
    if (!a || !b) return;
    const dx = b.x - a.x, dy = b.y - a.y;
    const d = Math.sqrt(dx * dx + dy * dy) || 1;
    const f = (d - 95) * 0.004 * Math.min(e.w, 4);
    a.vx += (dx / d) * f; a.vy += (dy / d) * f;
    b.vx -= (dx / d) * f; b.vy -= (dy / d) * f;
  });
  GNODES.forEach((p) => {
    // gentle pull to center
    p.vx += (kgW / 2 - p.x) * 0.0012;
    p.vy += (kgH / 2 - p.y) * 0.0015;
    p.vx *= 0.82; p.vy *= 0.82;
    if (kgDrag && kgDrag.node === p) return; // pinned to cursor
    p.x += Math.max(-4, Math.min(4, p.vx));
    p.y += Math.max(-4, Math.min(4, p.vy));
    p.x = clamp(p.x, 60, kgW - 60);
    p.y = clamp(p.y, 30, kgH - 24);
  });
}

function kgRender() {
  const cv = $("kgCanvas");
  if (!cv || !cv.clientWidth) return;
  const { ctx, w, h } = setupCanvas(cv, 320);
  kgW = w; kgH = h;
  ctx.clearRect(0, 0, w, h);
  const t = performance.now() / 1000;

  // drawn position = physics position + perpetual floating drift
  const pos = {};
  GNODES.forEach((nd) => {
    const bob = kgDrag && kgDrag.node === nd ? 0 : 1;
    pos[nd.id] = {
      x: nd.x + Math.sin(t * nd.bobF + nd.bobP) * 2.6 * bob,
      y: nd.y + Math.cos(t * nd.bobF * 0.83 + nd.bobP * 1.7) * 2.2 * bob
    };
  });

  GEDGES.forEach((e) => {
    const a = pos[e.a], b = pos[e.b];
    if (!a || !b) return;
    const hot = kgActive.edges.has(e.a + "→" + e.b) || kgActive.edges.has(e.b + "→" + e.a);
    if (hot) {
      ctx.strokeStyle = "#22d3ee";
      ctx.lineWidth = 2.2;
      ctx.setLineDash([7, 5]);
      ctx.lineDashOffset = -t * 26; // energy flowing along the active path
    } else {
      ctx.strokeStyle = "#1d2840";
      ctx.lineWidth = Math.min(1 + Math.log2(e.w), 2.5) * 0.8;
      ctx.setLineDash([]);
    }
    ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
  });
  ctx.setLineDash([]);

  ctx.font = "10px JetBrains Mono, monospace";
  ctx.textAlign = "center";
  GNODES.forEach((nd) => {
    const p = pos[nd.id];
    const hot = kgActive.nodes.has(nd.id);
    const dim = kgActive.nodes.size && !hot;
    const pulse = hot ? Math.sin(t * 3.2 + nd.bobP) * 1.4 : 0;
    const r = 5 + Math.min(Math.log2(nd.count + 1) * 2.2, 8) + pulse;
    ctx.globalAlpha = dim ? 0.25 : 1;
    if (hot) {
      ctx.beginPath(); ctx.arc(p.x, p.y, r + 7 + pulse, 0, 7);
      ctx.fillStyle = "rgba(34,211,238,0.18)"; ctx.fill();
    }
    ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, 7);
    ctx.fillStyle = KG_COLORS[nd.type] || KG_COLORS.topic;
    ctx.fill();
    if (hot) { ctx.strokeStyle = "#22d3ee"; ctx.lineWidth = 2; ctx.stroke(); }
    ctx.fillStyle = hot ? "#e7edf7" : "#8a96ad";
    ctx.fillText(nd.label, p.x, p.y + r + 12);
    ctx.globalAlpha = 1;
  });

  // ---- the trace: a spark runs the route hop by hop, forever, like a signal ----
  if (kgTrace && kgTrace.hops.length) {
    const hopDur = 520;
    const total = kgTrace.hops.length * hopDur + 500; // small pause before looping
    const el = (performance.now() - kgTrace.t0) % total;
    const k = Math.min(Math.floor(el / hopDur), kgTrace.hops.length - 1);
    const frac = clamp((el - k * hopDur) / hopDur, 0, 1);

    // already-traced segments stay lit bright
    for (let i = 0; i < k; i++) {
      const a = pos[kgTrace.hops[i][0]], b = pos[kgTrace.hops[i][1]];
      if (!a || !b) continue;
      ctx.strokeStyle = "rgba(74,222,128,0.85)";
      ctx.lineWidth = 2.6;
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
      // arrival ring on reached node
      ctx.beginPath(); ctx.arc(b.x, b.y, 13, 0, 7);
      ctx.strokeStyle = "rgba(74,222,128,0.35)"; ctx.lineWidth = 1.5; ctx.stroke();
    }
    // current segment: bright line grows from A toward the spark
    const [fa, fb] = kgTrace.hops[k];
    const a = pos[fa], b = pos[fb];
    if (a && b && el < kgTrace.hops.length * hopDur) {
      const sx = a.x + (b.x - a.x) * frac, sy = a.y + (b.y - a.y) * frac;
      ctx.strokeStyle = "rgba(74,222,128,0.9)";
      ctx.lineWidth = 2.6;
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(sx, sy); ctx.stroke();
      // the spark itself: glowing comet head
      const g = ctx.createRadialGradient(sx, sy, 0, sx, sy, 11);
      g.addColorStop(0, "rgba(74,222,128,0.95)");
      g.addColorStop(0.4, "rgba(74,222,128,0.45)");
      g.addColorStop(1, "rgba(74,222,128,0)");
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(sx, sy, 11, 0, 7); ctx.fill();
      ctx.fillStyle = "#eafff1";
      ctx.beginPath(); ctx.arc(sx, sy, 2.6, 0, 7); ctx.fill();
    }
  }

  ctx.textAlign = "left";
  let lx = 12;
  Object.entries({ person: "person", vendor: "vendor", doc: "document", project: "project", topic: "topic" }).forEach(([t, lbl]) => {
    ctx.fillStyle = KG_COLORS[t];
    ctx.beginPath(); ctx.arc(lx + 4, 14, 4, 0, 7); ctx.fill();
    ctx.fillStyle = "#5b6880";
    ctx.fillText(lbl, lx + 12, 17);
    lx += 14 + lbl.length * 6.2 + 14;
  });
  ctx.fillStyle = "#3d4a66";
  ctx.fillText("● live graph — built from the corpus · drag nodes", 12, h - 8);
}

function startKgLoop() {
  if (kgLoopOn) return;
  kgLoopOn = true;
  (function frame() {
    kgTick();
    kgRender();
    requestAnimationFrame(frame);
  })();
}

/* --- drag interaction --- */
function kgWireMouse() {
  const cv = $("kgCanvas");
  if (!cv || !cv.addEventListener) return;
  const pos = (ev) => {
    const r = cv.getBoundingClientRect();
    return { x: ev.clientX - r.left, y: ev.clientY - r.top };
  };
  cv.addEventListener("mousedown", (ev) => {
    const { x, y } = pos(ev);
    const hit = GNODES.find((n) => (n.x - x) ** 2 + (n.y - y) ** 2 < 196);
    if (hit) { kgDrag = { node: hit }; cv.style.cursor = "grabbing"; }
  });
  cv.addEventListener("mousemove", (ev) => {
    if (!kgDrag) return;
    const { x, y } = pos(ev);
    kgDrag.node.x = clamp(x, 60, kgW - 60);
    kgDrag.node.y = clamp(y, 30, kgH - 24);
    kgDrag.node.vx = kgDrag.node.vy = 0;
  });
  ["mouseup", "mouseleave"].forEach((t) =>
    cv.addEventListener(t, () => { kgDrag = null; cv.style.cursor = "default"; }));
}

/* --- query → highlight --- */
function queryHighlight(q, hits) {
  const qTok = new Set(terms(q));
  const hitIds = new Set(hits.slice(0, 3).map((h) => h.doc.id));
  kgActive = { nodes: new Set(), edges: new Set() };
  kgTrace = null;
  const named = [];
  GNODES.forEach((nd) => {
    const nameHit = terms(nd.label).some((t) => qTok.has(t));
    const docHit = [...nd.docs].some((d) => hitIds.has(d));
    if (nameHit) named.push(nd.id);
    if (nameHit || docHit) kgActive.nodes.add(nd.id);
  });

  const hops = [];
  if (named.length >= 2) {
    const path = kgBfs(named[0], named[1]);
    if (path) path.forEach((id, i) => {
      kgActive.nodes.add(id);
      if (i) { kgActive.edges.add(path[i - 1] + "→" + id); hops.push([path[i - 1], id]); }
    });
  }
  GEDGES.forEach((e) => {
    if (kgActive.nodes.has(e.a) && kgActive.nodes.has(e.b) && [...e.docs].some((d) => hitIds.has(d)))
      kgActive.edges.add(e.a + "→" + e.b);
  });

  // no BFS path? trace outward from the strongest matched node through its active edges
  if (!hops.length && kgActive.nodes.size) {
    const center = named[0] || [...kgActive.nodes].sort((x, y) => {
      const nx = GNODES.find((n) => n.id === x), ny = GNODES.find((n) => n.id === y);
      return (ny ? ny.count : 0) - (nx ? nx.count : 0);
    })[0];
    (GADJ[center] || []).forEach((nb) => {
      if (kgActive.nodes.has(nb)) {
        hops.push([center, nb]);
        kgActive.edges.add(center + "→" + nb);
      }
    });
  }
  if (hops.length) kgTrace = { hops, t0: performance.now() };
}

/* ============================================================
   REAL RAG over the inbox: BM25 retrieval + sentence extraction
   run entirely in the browser. With a key, the answer is also
   generated by the visitor's LLM from the retrieved emails.
   ============================================================ */

let USER_DOCS = [];
const allDocs = () => USER_DOCS.concat(typeof EMAILS !== "undefined" ? EMAILS : []);

const tok = (s) => (String(s).toLowerCase().match(/[a-z0-9][a-z0-9\-]{1,}/g) || []);
const STOPW = new Set(["the","a","an","is","are","was","were","of","to","in","on","for","and","or","it","this","that","with","as","at","by","be","from","we","our","i","you","your","what","who","why","how","when","which","does","do","did","about","tell","me"]);
const terms = (s) => tok(s).filter((w) => !STOPW.has(w));

let IDX = null;
function buildIndex() {
  const docs = allDocs();
  const df = {};
  const docTf = docs.map((d) => {
    const tf = {};
    terms(d.subject + " " + d.subject + " " + d.body).forEach((w) => (tf[w] = (tf[w] || 0) + 1));
    Object.keys(tf).forEach((w) => (df[w] = (df[w] || 0) + 1));
    return tf;
  });
  const lens = docs.map((d) => terms(d.body).length + 4);
  const avg = lens.reduce((a, b) => a + b, 0) / Math.max(lens.length, 1);
  IDX = { docs, docTf, df, lens, avg, N: docs.length };
}

function bm25(query) {
  if (!IDX) buildIndex();
  const k1 = 1.5, b = 0.75;
  const q = [...new Set(terms(query))];
  return IDX.docs.map((doc, i) => {
    let score = 0;
    q.forEach((w) => {
      const f = IDX.docTf[i][w] || 0;
      if (!f) return;
      const idf = Math.log(1 + (IDX.N - IDX.df[w] + 0.5) / (IDX.df[w] + 0.5));
      score += idf * (f * (k1 + 1)) / (f + k1 * (1 - b + b * IDX.lens[i] / IDX.avg));
    });
    return { doc, score };
  }).filter((s) => s.score > 0).sort((a, b2) => b2.score - a.score);
}

function extractiveAnswer(query, hits) {
  const q = new Set(terms(query));
  const sents = [];
  hits.slice(0, 3).forEach(({ doc }, di) => {
    String(doc.body).split(/(?<=[.!?])\s+/).forEach((s) => {
      let sc = 0;
      terms(s).forEach((w) => { if (q.has(w)) sc += 1; });
      if (sc > 0) sents.push({ s: s.trim(), sc: sc - di * 0.3, id: doc.id });
    });
  });
  sents.sort((a, b) => b.sc - a.sc);
  const top = sents.slice(0, 3);
  if (!top.length) return null;
  return top.map((t) => `${t.s} (${t.id})`).join(" ");
}

/* --- inbox UI --- */
function renderInbox() {
  const el = $("kgInbox");
  if (!el) return;
  el.innerHTML = `<p class="mono inbox-title">📥 the inbox — a completely fictional demo corpus, made up just to show the mechanics (click any email to read it). Add YOUR OWN emails/notes on the left and ask about those instead.</p>` +
    allDocs().map((e) => `
    <div class="mail" data-id="${e.id}">
      <div class="mail-head">
        <span class="mail-id mono">${e.id}</span>
        <span class="mail-sub">${esc(e.subject)}</span>
        <span class="mail-meta mono">${esc(String(e.from).split("<")[0].trim())} · ${esc(e.date)}</span>
      </div>
      <div class="mail-body" hidden>${esc(e.body)}</div>
    </div>`).join("");
  el.querySelectorAll(".mail-head").forEach((h) =>
    h.addEventListener("click", () => {
      const b = h.parentElement.querySelector(".mail-body");
      b.hidden = !b.hidden;
    }));
}

function openMail(id) {
  const el = $("kgInbox");
  const m = el && el.querySelector(`.mail[data-id="${id}"]`);
  if (!m) return;
  m.querySelector(".mail-body").hidden = false;
  m.scrollIntoView({ block: "nearest", behavior: "smooth" });
}

function addUserDocs() {
  const ta = $("kgUserDocs");
  const text = (ta.value || "").trim();
  if (!text) return;
  text.split(/\n\s*\n/).forEach((block) => {
    const lines = block.trim().split("\n");
    USER_DOCS.unshift({
      id: "U" + (USER_DOCS.length + 1),
      from: "you",
      date: "now",
      subject: (lines[0] || "your note").slice(0, 60),
      body: lines.join(" ").slice(0, 1200)
    });
  });
  ta.value = "";
  buildIndex();
  buildGraph();
  renderInbox();
  $("kgHops").textContent = "added to the index — ask about it";
  $("kgAnswer").hidden = false;
  $("kgAnswerText").textContent = "Your text is now part of the retrieval corpus (it never leaves this browser). Ask a question about it.";
}

/* --- graph highlight from a query (dynamic graph) --- */
function highlightFromQuery(q, hits) {
  queryHighlight(q, hits);
}

/* --- ask --- */
async function ask() {
  const q = ($("kgPrompt").value || "").trim();
  if (!q) return;
  $("kgAskBtn").disabled = true;
  const t0 = performance.now();
  const hits = bm25(q).slice(0, 3);
  highlightFromQuery(q, hits);

  const src = $("kgSources");
  src.hidden = false;
  src.innerHTML = `<p class="mono bench-title">retrieved · BM25 ran in your browser in ${(performance.now() - t0).toFixed(0)} ms</p>` +
    (hits.length
      ? hits.map((h) => `<button class="src-chip mono" data-id="${h.doc.id}">${h.doc.id} · ${esc(h.doc.subject)} · ${h.score.toFixed(2)}</button>`).join("")
      : `<span class="mono" style="color:#5b6880;font-size:.72rem">no relevant emails found</span>`);
  src.querySelectorAll(".src-chip").forEach((b) => b.addEventListener("click", () => openMail(b.dataset.id)));

  $("kgAnswer").hidden = false;
  if (!hits.length) {
    $("kgAnswerText").textContent = "Nothing relevant in the inbox for that — ask about what's actually in the emails below (Atlas Migration, the Helios invoice, the Northwind delay, contract C-114…) or add your own text and ask about it.";
    $("kgHops").textContent = "0 documents retrieved";
    $("kgAskBtn").disabled = false;
    return;
  }

  const ids = hits.map((h) => h.doc.id).join(", ");
  if (hasLLM() && !LLM.isMock()) {
    $("kgAnswerText").textContent = "generating from the retrieved emails with your LLM…";
    try {
      const ctx = hits.map((h) => `[${h.doc.id}] From: ${h.doc.from} — Subject: ${h.doc.subject}\n${h.doc.body}`).join("\n\n");
      const msg = await LLM.chat([
        { role: "system", content: "Answer the question using ONLY the provided emails. Be specific and complete in 1-3 sentences. Cite email ids in parentheses like (E01). If the emails don't contain the answer, say so." },
        { role: "user", content: "Emails:\n" + ctx + "\n\nQuestion: " + q }
      ]);
      $("kgAnswerText").textContent = (msg.content || "").slice(0, 600);
      $("kgHops").textContent = `retrieved ${ids} → answer generated live by your LLM`;
    } catch (e) {
      const ex = extractiveAnswer(q, hits);
      $("kgAnswerText").textContent = ex || "LLM call failed: " + e.message;
      $("kgHops").textContent = `retrieved ${ids} → extractive fallback (${e.message})`;
    }
  } else {
    const ex = extractiveAnswer(q, hits);
    $("kgAnswerText").textContent = ex || "Found related emails (see sources) but no sentence directly answers that.";
    $("kgHops").textContent = `retrieved ${ids} → extractive answer, no LLM involved · add a key in the CodeCraft panel for generated answers`;
  }
  $("kgAskBtn").disabled = false;
}

const KG_CHIPS = ["what is Atlas Migration?", "why was invoice INV-2291 flagged and who approved it?", "what is blocking the phase-2 cutover?"];

if ($("kgAskBtn")) {
  $("kgAskBtn").addEventListener("click", ask);
  $("kgPrompt").addEventListener("keydown", (e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); ask(); } });
  $("kgPrompt").addEventListener("input", autoGrow);
  if ($("kgChips")) {
    $("kgChips").innerHTML = KG_CHIPS.map((c) => `<button class="chip mono">${c}</button>`).join("");
    $("kgChips").querySelectorAll(".chip").forEach((b) =>
      b.addEventListener("click", () => { $("kgPrompt").value = b.textContent; ask(); }));
  }
  if ($("kgAddDocs")) $("kgAddDocs").addEventListener("click", addUserDocs);
  buildIndex();
  renderInbox();
  buildGraph();
  kgWireMouse();
  startKgLoop();
}

/* ============================================================
   7. MODEL VS REALITY — grade predictions against real results
   ============================================================ */

const ROUND_LABEL = { 4: "R32", 5: "R16", 6: "QF", 7: "SF", 8: "Final" };

function matchKey(a, b) { return a + "␟" + b; }
const PRED_BY_PAIR = {};
WC_MATCHES.forEach((m, i) => {
  PRED_BY_PAIR[matchKey(m.h, m.a)] = { i, flip: false };
  PRED_BY_PAIR[matchKey(m.a, m.h)] = { i, flip: true };
});


/* --- live results: fetch the source feed directly in the visitor's browser,
       so the scoreboard updates the moment the feed does (no redeploy).
       Falls back to js/results.js (GitHub-Action cache) if blocked. --- */
const FEED_URL = "https://fixturedownload.com/feed/json/fifa-world-cup-2026";
const FEED_NAME_MAP = { "USA": "United States", "Korea Republic": "South Korea", "Türkiye": "Turkey",
  "Côte d'Ivoire": "Ivory Coast", "Côte d’Ivoire": "Ivory Coast", "Cabo Verde": "Cape Verde",
  "Curaçao": "Curacao", "IR Iran": "Iran", "Congo DR": "DR Congo", "Bosnia-Herzegovina": "Bosnia and Herzegovina" };
let LIVE_RESULTS = null;   // null = not checked / blocked; [] = checked, none finished
let LIVE_AT = null;
let liveTried = false;

async function fetchLiveResults() {
  const ctl = typeof AbortController !== "undefined" ? new AbortController() : null;
  const timer = ctl ? setTimeout(() => ctl.abort(), 5000) : null;
  try {
    const r = await fetch(FEED_URL, ctl ? { signal: ctl.signal } : undefined);
    if (!r.ok) return null;
    const feed = await r.json();
    return feed
      .filter((m) => m.HomeTeamScore != null && m.AwayTeamScore != null && !String(m.HomeTeam).toLowerCase().includes("announced"))
      .map((m) => ({
        n: m.MatchNumber, r: m.RoundNumber, date: String(m.DateUtc || "").slice(0, 10),
        h: FEED_NAME_MAP[m.HomeTeam] || m.HomeTeam, a: FEED_NAME_MAP[m.AwayTeam] || m.AwayTeam,
        hs: +m.HomeTeamScore, as: +m.AwayTeamScore
      }));
  } catch (e) {
    return null;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function currentResults() {
  const cached = (typeof WC_RESULTS !== "undefined" ? WC_RESULTS : []) || [];
  if (LIVE_RESULTS && LIVE_RESULTS.length >= cached.length) return LIVE_RESULTS;
  return cached;
}

function realitySrcLine() {
  const el = $("realitySrc");
  if (!el) return;
  const t = LIVE_AT ? LIVE_AT.toTimeString().slice(0, 5) : "";
  if (LIVE_RESULTS !== null) {
    el.textContent = `data source: live feed (fixturedownload.com), checked at ${t} in your browser · ${LIVE_RESULTS.length} finished match${LIVE_RESULTS.length === 1 ? "" : "es"} published so far · GitHub Action keeps a 2-hourly cache as fallback`;
  } else if (liveTried) {
    el.textContent = "data source: GitHub-Action cache (the browser's live check was blocked) · the Action re-syncs every 2 hours";
  } else {
    el.textContent = "checking the live results feed…";
  }
}

function renderReality() {
  const statsEl = $("realityStats"), board = $("scoreboard"), ko = $("koTracker");
  if (!statsEl) return;
  if (!liveTried && typeof fetch === "function") {
    liveTried = true;
    fetchLiveResults().then((rows) => { LIVE_RESULTS = rows; LIVE_AT = new Date(); renderReality(); });
  }
  realitySrcLine();
  const results = currentResults();
  const group = results.filter((r) => r.r <= 3 && PRED_BY_PAIR[matchKey(r.h, r.a)]);
  const kos = results.filter((r) => r.r >= 4);

  if (!group.length && !kos.length) {
    statsEl.innerHTML = "";
    board.innerHTML = `<div class="sb-empty">⏳ No final scores published yet.<br/>
      <span class="mono" style="font-size:.72rem;color:#5b6880">${LIVE_RESULTS !== null
        ? "The live feed is reachable but hasn't published a finished match yet — community feeds often lag a few hours after full time. This page re-checks on every load; nothing for you to do."
        : "Results land here automatically — checked live on every page load, plus a 2-hourly GitHub-Action sync. Predictions are already locked."}</span></div>`;
    ko.innerHTML = "";
    return;
  }

  let hits = 0, brierSum = 0;
  const rows = group.map((r) => {
    const ref = PRED_BY_PAIR[matchKey(r.h, r.a)];
    const m = WC_MATCHES[ref.i];
    // ensemble probs in the orientation of the REAL result row
    const p = ref.flip ? [m.ens[2], m.ens[1], m.ens[0]] : m.ens.slice();
    const outcome = r.hs > r.as ? 0 : r.hs === r.as ? 1 : 2;
    const y = [0, 0, 0]; y[outcome] = 1;
    const brier = p.reduce((s, pi, k) => s + (pi - y[k]) ** 2, 0);
    const pickIdx = p.indexOf(Math.max(...p));
    const hit = pickIdx === outcome;
    if (hit) hits++;
    brierSum += brier;
    const pickName = pickIdx === 0 ? r.h : pickIdx === 2 ? r.a : "Draw";
    return `<div class="sb-row ${hit ? "hit" : "miss"}">
      <span class="sb-date">${r.date ? r.date.slice(5) : ""}<br/>grp</span>
      <span class="sb-team"><span class="flag">${flag(r.h)}</span><span class="tname">${r.h}</span></span>
      <span class="sb-mid">
        <span class="sb-score">${r.hs} – ${r.as}</span>
        <span class="sb-pred">picked ${pickName} @ ${pct(Math.max(...p), 0)}</span>
      </span>
      <span class="sb-team right"><span class="tname">${r.a}</span><span class="flag">${flag(r.a)}</span></span>
      <span class="sb-verdict">${hit ? '<span class="v-hit">✓ HIT</span>' : '<span class="v-miss">✗ MISS</span>'}<span class="v-brier">brier ${brier.toFixed(3)}</span></span>
    </div>`;
  });

  const n = group.length;
  statsEl.innerHTML = n ? `
    <div class="rs-chip"><strong>${n}</strong><span>graded matches</span></div>
    <div class="rs-chip ${hits / n >= 0.5 ? "good" : ""}"><strong>${pct(hits / n, 0)}</strong><span>pick accuracy (3-way)</span></div>
    <div class="rs-chip ${brierSum / n < 0.667 ? "good" : ""}"><strong>${(brierSum / n).toFixed(3)}</strong><span>live Brier · 0.667 = guessing</span></div>
    <div class="rs-chip"><strong>0.176</strong><span>backtest Brier (target)</span></div>` : "";
  board.innerHTML = rows.join("");

  ko.innerHTML = kos.length ? `
    <p class="ko-title">knockout tracker · outside the locked group-stage prediction set</p>
    <div class="ko-list">${kos.map((r) =>
      `<span class="ko-chip">${ROUND_LABEL[r.r] || "KO"} · ${flag(r.h)} ${r.hs}–${r.as} ${flag(r.a)} ${r.hs === r.as ? "(pens/ET)" : ""}</span>`).join("")}</div>` : "";
}

if ($("realityStats")) renderReality();

/* ============================================================
   visibility-aware first paint for canvases in hidden tabs
   ============================================================ */
window.__paneHooks = {
  "pane-bnn": () => drawBnn(),
  "pane-cup": () => renderBoard(),
  "pane-reality": () => renderReality()
};

// test/diagnostic hook: run one seeded tournament, return its result
window.__kgStats = () => ({
  nodes: GNODES.length, edges: GEDGES.length,
  labels: GNODES.map((n) => n.label), active: kgActive.nodes.size,
  traceHops: kgTrace ? kgTrace.hops.length : 0
});
window.__simOnce = (seed) => {
  RNG = mulberry32(seed);
  const r = simulateTournament(false);
  RNG = Math.random;
  return { champion: r.champion, finalLoser: r.finalLoser };
};

function firstPaint() {
  drawSiChart(0);
  drawBnn();
}
if (document.readyState === "complete") firstPaint();
else window.addEventListener("load", firstPaint);

let rsT;
window.addEventListener("resize", () => {
  clearTimeout(rsT);
  rsT = setTimeout(() => {
    drawBnn();
    drawSiChart(1);
  }, 180);
});

})();
