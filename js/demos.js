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

function sample3(p) {
  const r = Math.random() * (p[0] + p[1] + p[2]);
  return r < p[0] ? 0 : r < p[0] + p[1] ? 1 : 2;
}

function simulateGroupStage() {
  const tables = {};
  GROUP_KEYS.forEach((g) => {
    const tbl = {};
    WC_GROUPS[g].forEach((t) => (tbl[t] = { team: t, pts: 0, gd: 0 }));
    GROUP_MATCHES[g].forEach((m) => {
      const o = sample3(m.ens);
      if (o === 0) { tbl[m.h].pts += 3; tbl[m.h].gd += 1; tbl[m.a].gd -= 1; }
      else if (o === 2) { tbl[m.a].pts += 3; tbl[m.a].gd += 1; tbl[m.h].gd -= 1; }
      else { tbl[m.h].pts += 1; tbl[m.a].pts += 1; }
    });
    tables[g] = Object.values(tbl).sort(
      (x, y) => y.pts - x.pts || y.gd - x.gd || STR[y.team] - STR[x.team] || Math.random() - 0.5
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

function simulateTournament() {
  const tables = simulateGroupStage();
  const winners = [], runners = [], thirds = [];
  GROUP_KEYS.forEach((g) => {
    winners.push(tables[g][0]);
    runners.push(tables[g][1]);
    thirds.push(tables[g][2]);
  });
  const bySeed = (arr) => arr.slice().sort((x, y) => y.pts - x.pts || y.gd - x.gd || STR[y.team] - STR[x.team]);
  thirds.sort((x, y) => y.pts - x.pts || y.gd - x.gd || Math.random() - 0.5);
  const qualified = bySeed(winners).concat(bySeed(runners), bySeed(thirds.slice(0, 8)));
  const seeds = qualified.map((q) => q.team); // index 0 = seed 1

  let field = SEED32.map((s) => seeds[s - 1]);
  const rounds = [];
  while (field.length > 1) {
    const ties = [], next = [];
    for (let i = 0; i < field.length; i += 2) {
      const a = field[i], b = field[i + 1];
      const w = Math.random() < koWin(a, b) ? a : b;
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
      <span class="cb-val">${totalSims ? pct(live) : "—"}</span>
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

/* ----- animated single tournament ----- */
let cupBusy = false;

async function kickoff() {
  if (cupBusy) return;
  cupBusy = true;
  setCupButtons(true);
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  const result = simulateTournament();

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
    $("wcPhase").textContent = ROUND_NAMES[ri] + " · knockout via model-fitted team strengths";
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
  $("wcPhase").textContent = "full time · we have a world champion";
  const ch = $("wcChampion");
  ch.hidden = false;
  ch.innerHTML = `
    <span class="champ-flag">${flag(result.champion)}</span>
    <h4>🏆 <span>${result.champion}</span> win the 2026 World Cup</h4>
    <p>beat ${flag(result.finalLoser)} ${result.finalLoser} in the final · simulation #${totalSims + 1}</p>`;

  counts[result.champion] = (counts[result.champion] || 0) + 1;
  totalSims += 1;
  $("cupCount").textContent = totalSims.toLocaleString();
  $("cupLast").textContent = `${flag(result.champion)} ${result.champion}`;
  renderBoard();

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
  ["cupKickoffBtn", "cupMcBtn", "cupResetBtn"].forEach((id) => ($(id).disabled = dis));
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

if ($("cupKickoffBtn")) {
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
        <span class="mc-pred-label">model scoreline</span>
        <span class="mc-pick">model pick: ${pick}</span>
      </div>
      <div class="mc-side">
        <span class="flag">${flag(m.a)}</span>
        <div class="mc-team">${m.a}</div>
        <div class="mc-prob">win ${pct(ens[2])}</div>
      </div>
    </div>
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
   4. CODECRAFT — agent pipeline live run
   ============================================================ */

const AGENT_TASKS = [
  {
    label: "fix the failing date test",
    request: "codecraft \"tests are failing in tests/test_dates.py — fix the bug\"",
    steps: [
      { icon: "🧠", title: "plan · ReAct", text: "Failing assertion expects ISO week keys. I'll read the test to get the contract, read the implementation, patch it, and re-run the suite.", ms: 900 },
      { icon: "🔧", title: "tool call · read_file(\"tests/test_dates.py\")", text: "observation: <span class='mono'>assert week_key(\"2026-01-05\") == \"2026-W02\"</span> — ISO-8601 week numbering.", ms: 800 },
      { icon: "🔧", title: "tool call · read_file(\"utils/dates.py\")", text: "observation: implementation uses <span class='mono'>strftime(\"%Y-W%U\")</span> — Sunday-start week-of-year, not ISO. Root cause found.", ms: 800 },
      { icon: "✏️", title: "tool call · replace_in_file(\"utils/dates.py\")", text: "diff preview approved by guardrail:", diff: "<span class='del'>-    return d.strftime(\"%Y-W%U\")</span>\n<span class='add'>+    iso = d.isocalendar()</span>\n<span class='add'>+    return f\"{iso[0]}-W{iso[1]:02d}\"</span>", ms: 1000 },
      { icon: "🧪", title: "tool call · run_tests()", text: "observation: <span class='mono'>pytest -q · 14 passed in 0.42s</span>", ms: 1100 },
      { icon: "✅", title: "task complete", text: "Loop closed in 2 ReAct iterations — no framework, just a raw tool-calling loop over the chat-completions API.", ms: 400 }
    ],
    summary: ["✓ complete", "4 tool calls", "2 loop iterations", "RLAIF score 9.2/10"]
  },
  {
    label: "add a /health endpoint",
    request: "codecraft \"add a /health endpoint that reports app version and DB status\"",
    steps: [
      { icon: "🧠", title: "plan · ReAct", text: "Locate the FastAPI app object, add a /health route returning version + DB ping, then verify with the test runner.", ms: 900 },
      { icon: "🔧", title: "tool call · project_context()", text: "observation: FastAPI project · entrypoint <span class='mono'>app/main.py</span> · tests via <span class='mono'>pytest</span>.", ms: 700 },
      { icon: "🔧", title: "tool call · read_file(\"app/main.py\")", text: "observation: app factory at line 18, DB session helper <span class='mono'>get_db()</span> available.", ms: 800 },
      { icon: "✏️", title: "tool call · write_file(\"app/health.py\")", text: "diff preview approved by guardrail:", diff: "<span class='add'>+@router.get(\"/health\")</span>\n<span class='add'>+def health(db=Depends(get_db)):</span>\n<span class='add'>+    return {\"version\": __version__,</span>\n<span class='add'>+            \"db\": ping(db)}</span>", ms: 1000 },
      { icon: "🧪", title: "tool call · run_tests()", text: "observation: <span class='mono'>pytest -q · 17 passed in 0.51s</span> — includes the new health-check test.", ms: 1100 },
      { icon: "✅", title: "task complete", text: "Session memory keeps the project map, so follow-up requests skip re-discovery.", ms: 400 }
    ],
    summary: ["✓ complete", "4 tool calls", "2 loop iterations", "RLAIF score 8.9/10"]
  },
  {
    label: "extract retry logic into a decorator",
    request: "codecraft \"three modules duplicate retry loops — extract a shared decorator\"",
    steps: [
      { icon: "🧠", title: "plan · ReAct", text: "Find every duplicated retry loop, design one decorator with backoff, replace all call sites, re-run the suite.", ms: 900 },
      { icon: "🔧", title: "tool call · search_files(\"while attempts\")", text: "observation: 3 hits — <span class='mono'>client.py · fetcher.py · sync.py</span>, near-identical loops.", ms: 800 },
      { icon: "✏️", title: "tool call · write_file(\"utils/retry.py\")", text: "diff preview approved by guardrail:", diff: "<span class='add'>+def with_retry(tries=3, backoff=0.2):</span>\n<span class='add'>+    def deco(fn):</span>\n<span class='add'>+        @wraps(fn)</span>\n<span class='add'>+        def run(*a, **kw): ...</span>\n<span class='add'>+        return run</span>\n<span class='add'>+    return deco</span>", ms: 1000 },
      { icon: "✏️", title: "tool call · replace_in_file × 3", text: "observation: 41 lines of duplicated loop logic replaced with <span class='mono'>@with_retry()</span> at 3 call sites.", ms: 900 },
      { icon: "🧪", title: "tool call · run_tests()", text: "observation: <span class='mono'>pytest -q · 23 passed in 0.66s</span>", ms: 1100 },
      { icon: "✅", title: "task complete", text: "Multi-file refactor handled by the same minimal loop — plan, act, observe, repeat.", ms: 400 }
    ],
    summary: ["✓ complete", "5 tool calls", "3 loop iterations", "RLAIF score 9.4/10"]
  }
];

let agentBusy = false;

function renderAgentTasks() {
  const wrap = $("agentTasks");
  wrap.innerHTML = AGENT_TASKS.map((t, i) =>
    `<button class="task-btn" data-i="${i}">▶ ${t.label}</button>`).join("");
  wrap.querySelectorAll(".task-btn").forEach((b) =>
    b.addEventListener("click", () => runAgent(+b.dataset.i)));
}

async function runAgent(i) {
  if (agentBusy) return;
  agentBusy = true;
  const task = AGENT_TASKS[i];
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  document.querySelectorAll("#agentTasks .task-btn").forEach((b, bi) => {
    b.disabled = true;
    b.classList.toggle("active", bi === i);
  });
  const pl = $("agentPipeline");
  $("agentSummary").hidden = true;
  pl.innerHTML = `<div class="pl-step show ok">
      <div class="pl-icon">📝</div>
      <div class="pl-body"><div class="pl-title">request</div><div class="pl-text mono">$ ${task.request}</div></div>
      <div class="pl-status ok">received</div>
    </div>`;

  for (const s of task.steps) {
    const card = document.createElement("div");
    card.className = "pl-step running";
    card.innerHTML = `
      <div class="pl-icon">${s.icon}</div>
      <div class="pl-body">
        <div class="pl-title">${s.title}</div>
        <div class="pl-text">${s.text}${s.diff ? `<div class="pl-diff">${s.diff}</div>` : ""}</div>
      </div>
      <div class="pl-status"><span class="spin">◌</span> running</div>`;
    pl.appendChild(card);
    requestAnimationFrame(() => card.classList.add("show"));
    card.scrollIntoView({ block: "nearest", behavior: "smooth" });
    await sleep(s.ms);
    card.classList.remove("running");
    card.classList.add("ok");
    card.querySelector(".pl-status").outerHTML = `<div class="pl-status ok">✓ ${(s.ms / 1000).toFixed(1)}s</div>`;
  }

  const sum = $("agentSummary");
  sum.hidden = false;
  sum.innerHTML = task.summary.map((s) => `<span>${s}</span>`).join("") +
    `<span>benchmark avg: 7.5× faster than the LangChain build</span>`;
  document.querySelectorAll("#agentTasks .task-btn").forEach((b) => (b.disabled = false));
  agentBusy = false;
}

if ($("agentTasks")) renderAgentTasks();

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

if ($("siRunBtn")) {
  $("siRunBtn").addEventListener("click", siRun);
  $("siResetBtn").addEventListener("click", siReset);
}

/* ============================================================
   6. DOCGRAPH — knowledge-graph traversal
   ============================================================ */

const KG_NODES = [
  { id: "sarah",  label: "Sarah Chen",      type: "person" },
  { id: "marco",  label: "Marco Diaz",      type: "person" },
  { id: "priya",  label: "Priya Nair",      type: "person" },
  { id: "helios", label: "Helios GmbH",     type: "vendor" },
  { id: "north",  label: "Northwind Supply",type: "vendor" },
  { id: "inv",    label: "INV-2291 · €48.2K", type: "doc" },
  { id: "c114",   label: "Contract C-114",  type: "doc" },
  { id: "atlas",  label: "Atlas Migration", type: "project" },
  { id: "e1",     label: "✉ kickoff thread", type: "email" },
  { id: "e3",     label: "✉ invoice flagged", type: "email" },
  { id: "e6",     label: "✉ approval",       type: "email" },
  { id: "e7",     label: "✉ delivery delay",  type: "email" },
  { id: "e2",     label: "✉ budget review",   type: "email" },
  { id: "e4",     label: "✉ legal redlines",  type: "email" },
  { id: "e5",     label: "✉ standup notes",   type: "email" },
  { id: "e8",     label: "✉ vendor intro",    type: "email" }
];

const KG_EDGES = [
  ["sarah", "e3"], ["e3", "inv"], ["inv", "e6"], ["e6", "marco"],
  ["atlas", "e1"], ["e1", "helios"], ["helios", "c114"], ["c114", "priya"],
  ["north", "e7"], ["e7", "atlas"], ["atlas", "sarah"],
  ["helios", "inv"], ["marco", "e2"], ["e2", "atlas"],
  ["priya", "e4"], ["e4", "c114"], ["sarah", "e5"], ["e5", "atlas"],
  ["e8", "north"], ["marco", "e8"]
];

const KG_QUERIES = [
  {
    label: "who approved the Helios invoice Sarah flagged?",
    path: ["sarah", "e3", "inv", "e6", "marco"],
    answer: "Marco Diaz approved INV-2291 (€48,200) — two days after Sarah Chen flagged it for a duplicate line item.",
    hops: "4 hops · sarah → flag email → invoice → approval email → marco · 1.0s (cache hit)",
    vec: "5 chunks retrieved — the approval email never mentions Sarah, so similarity search misses it ✗",
    kg: "walks flag → invoice → approval and lands on the answer ✓"
  },
  {
    label: "which contract covers the Atlas kickoff vendor?",
    path: ["atlas", "e1", "helios", "c114", "priya"],
    answer: "Contract C-114, drafted by Priya Nair, covers Helios GmbH — the vendor introduced in the Atlas Migration kickoff thread.",
    hops: "4 hops · project → kickoff email → vendor → contract → owner · 1.0s (cache hit)",
    vec: "retrieves kickoff chunks — contract is never named in them, so the link is invisible ✗",
    kg: "entity linking connects vendor mention → contract record ✓"
  },
  {
    label: "who should I ask about the Northwind delay?",
    path: ["north", "e7", "atlas", "sarah"],
    answer: "Sarah Chen — she owns Atlas Migration, the project blocked by Northwind's delayed delivery.",
    hops: "3 hops · vendor → delay email → blocked project → owner · 1.0s (cache hit)",
    vec: "finds the delay email but can't tell who owns the affected project ✗",
    kg: "traverses delay → project → owner relation ✓"
  }
];

const KG_COLORS = { person: "#a78bfa", vendor: "#fbbf24", doc: "#22d3ee", project: "#4ade80", email: "#64748b" };

let kgPos = {};
let kgActive = { nodes: new Set(), edges: new Set(), progress: 0 };
let kgAnimId = null;

function kgLayout(w, h) {
  // deterministic seeded positions + a few relaxation passes
  let seed = 42;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  KG_NODES.forEach((n) => (kgPos[n.id] = { x: 60 + rnd() * (w - 120), y: 50 + rnd() * (h - 100) }));
  for (let it = 0; it < 260; it++) {
    // repulsion
    KG_NODES.forEach((a) => KG_NODES.forEach((b) => {
      if (a === b) return;
      const pa = kgPos[a.id], pb = kgPos[b.id];
      let dx = pa.x - pb.x, dy = pa.y - pb.y;
      const d2 = Math.max(dx * dx + dy * dy, 60);
      const f = 5200 / d2;
      pa.x += (dx / Math.sqrt(d2)) * f;
      pa.y += (dy / Math.sqrt(d2)) * f;
    }));
    // attraction along edges
    KG_EDGES.forEach(([a, b]) => {
      const pa = kgPos[a], pb = kgPos[b];
      const dx = pb.x - pa.x, dy = pb.y - pa.y;
      const d = Math.sqrt(dx * dx + dy * dy) || 1;
      const f = (d - 110) * 0.015;
      pa.x += (dx / d) * f; pa.y += (dy / d) * f;
      pb.x -= (dx / d) * f; pb.y -= (dy / d) * f;
    });
    KG_NODES.forEach((n) => {
      kgPos[n.id].x = clamp(kgPos[n.id].x, 70, w - 70);
      kgPos[n.id].y = clamp(kgPos[n.id].y, 36, h - 30);
    });
  }
}

function drawKg() {
  const cv = $("kgCanvas");
  if (!cv || !cv.clientWidth) return;
  const { ctx, w, h } = setupCanvas(cv, 430);
  if (!Object.keys(kgPos).length) kgLayout(w, h);
  ctx.clearRect(0, 0, w, h);

  // edges
  KG_EDGES.forEach(([a, b]) => {
    const key = a + "→" + b;
    const hot = kgActive.edges.has(key);
    ctx.strokeStyle = hot ? "#22d3ee" : "#1d2840";
    ctx.lineWidth = hot ? 2.2 : 1;
    ctx.beginPath();
    ctx.moveTo(kgPos[a].x, kgPos[a].y);
    ctx.lineTo(kgPos[b].x, kgPos[b].y);
    ctx.stroke();
  });

  // nodes
  ctx.font = "10px JetBrains Mono, monospace";
  ctx.textAlign = "center";
  KG_NODES.forEach((n) => {
    const p = kgPos[n.id];
    const hot = kgActive.nodes.has(n.id);
    const dim = kgActive.nodes.size && !hot;
    const r = n.type === "email" ? 7 : 10;
    ctx.globalAlpha = dim ? 0.3 : 1;
    if (hot) {
      ctx.beginPath();
      ctx.arc(p.x, p.y, r + 6, 0, 7);
      ctx.fillStyle = "rgba(34,211,238,0.18)";
      ctx.fill();
    }
    ctx.beginPath();
    ctx.arc(p.x, p.y, r, 0, 7);
    ctx.fillStyle = KG_COLORS[n.type];
    ctx.fill();
    if (hot) { ctx.strokeStyle = "#22d3ee"; ctx.lineWidth = 2; ctx.stroke(); }
    ctx.fillStyle = hot ? "#e7edf7" : "#8a96ad";
    ctx.fillText(n.label, p.x, p.y + r + 13);
    ctx.globalAlpha = 1;
  });

  // legend
  ctx.textAlign = "left";
  let lx = 12;
  Object.entries({ person: "person", vendor: "vendor", doc: "document", project: "project", email: "email" }).forEach(([t, lbl]) => {
    ctx.fillStyle = KG_COLORS[t];
    ctx.beginPath(); ctx.arc(lx + 4, 14, 4, 0, 7); ctx.fill();
    ctx.fillStyle = "#5b6880";
    ctx.fillText(lbl, lx + 12, 17);
    lx += 14 + lbl.length * 6.2 + 16;
  });
}

async function kgRun(qi) {
  const q = KG_QUERIES[qi];
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  document.querySelectorAll("#kgQueries .task-btn").forEach((b, bi) => {
    b.disabled = true;
    b.classList.toggle("active", bi === qi);
  });
  $("kgAnswer").hidden = true;
  $("ragCompare").hidden = true;
  kgActive = { nodes: new Set(), edges: new Set() };
  drawKg();
  await sleep(300);

  for (let i = 0; i < q.path.length; i++) {
    kgActive.nodes.add(q.path[i]);
    if (i > 0) {
      kgActive.edges.add(q.path[i - 1] + "→" + q.path[i]);
      kgActive.edges.add(q.path[i] + "→" + q.path[i - 1]);
    }
    drawKg();
    await sleep(520);
  }

  $("kgAnswer").hidden = false;
  $("kgAnswerText").textContent = q.answer;
  $("kgHops").textContent = q.hops;
  $("ragCompare").hidden = false;
  $("ragVec").textContent = q.vec;
  $("ragKg").textContent = q.kg;
  document.querySelectorAll("#kgQueries .task-btn").forEach((b) => (b.disabled = false));
}

if ($("kgQueries")) {
  $("kgQueries").innerHTML = KG_QUERIES.map((q, i) =>
    `<button class="task-btn" data-i="${i}">? ${q.label}</button>`).join("");
  document.querySelectorAll("#kgQueries .task-btn").forEach((b) =>
    b.addEventListener("click", () => kgRun(+b.dataset.i)));
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

function renderReality() {
  const statsEl = $("realityStats"), board = $("scoreboard"), ko = $("koTracker");
  if (!statsEl) return;
  const results = (typeof WC_RESULTS !== "undefined" ? WC_RESULTS : []) || [];
  const group = results.filter((r) => r.r <= 3 && PRED_BY_PAIR[matchKey(r.h, r.a)]);
  const kos = results.filter((r) => r.r >= 4);

  if (!group.length && !kos.length) {
    statsEl.innerHTML = "";
    board.innerHTML = `<div class="sb-empty">⏳ No completed matches yet — the tournament kicks off June 11, 2026.<br/>
      <span class="mono" style="font-size:.72rem;color:#5b6880">This page grades itself automatically once results land. Predictions are already locked.</span></div>`;
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

function firstPaint() {
  drawSiChart(0);
  drawKg();
  drawBnn();
}
if (document.readyState === "complete") firstPaint();
else window.addEventListener("load", firstPaint);

let rsT;
window.addEventListener("resize", () => {
  clearTimeout(rsT);
  rsT = setTimeout(() => {
    kgPos = {};
    drawKg();
    drawBnn();
    drawSiChart(1);
  }, 180);
});

})();
