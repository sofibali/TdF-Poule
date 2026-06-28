#!/usr/bin/env tsx
/**
 * Generate a single self-contained HTML page that lets the family tinker with
 * the pool's scoring rules and watch the 2025 leaderboard re-rank live. No
 * server, no Vercel — just open scripts/sim/poule-simulator.html in a browser.
 *
 * The page embeds:
 *   - the 2025 snapshot (teams, picks, stage results, final GC)
 *   - verified final standings for the green / polka / white jerseys
 *   - a JS port of the scoring engine (kept faithful to engine.ts / the SQL views)
 *
 * Run:  npx tsx scripts/sim/build-html.ts
 */
import { join } from "node:path";
import { readFileSync, writeFileSync } from "node:fs";
import type { Snapshot } from "./engine";

const snap: Snapshot = JSON.parse(
  readFileSync(join(__dirname, "data", "2025.json"), "utf8"),
);

// --- Resolve jersey final standings (by name) to rider_ids in the snapshot. ---
// Token-set normalization handles PCS's particle-mangled names defensively.
const tokenSet = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z ]/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .sort()
    .join(" ");

const nameToId = new Map<string, string>();
for (const [id, name] of Object.entries(snap.riderNames)) nameToId.set(tokenSet(name), id);

function resolve(name: string): string | null {
  return nameToId.get(tokenSet(name)) ?? null;
}

// Verified 2025 final standings (see session notes / Wikipedia + Rouleur + franceletour).
const JERSEY_FINAL: Record<string, string[]> = {
  green: ["Jonathan Milan", "Tadej Pogačar", "Biniam Girmay"],
  polka: ["Tadej Pogačar", "Jonas Vingegaard", "Lenny Martinez"],
  white: ["Florian Lipowitz", "Oscar Onley", "Kévin Vauquelin"],
};

const jerseys: Record<string, { position: number; rider_id: string | null }[]> = {};
const unresolved: string[] = [];
for (const [jersey, names] of Object.entries(JERSEY_FINAL)) {
  jerseys[jersey] = names.map((n, i) => {
    const rid = resolve(n);
    if (!rid) unresolved.push(`${jersey} #${i + 1}: ${n}`);
    return { position: i + 1, rider_id: rid };
  });
}
if (unresolved.length) {
  console.warn("WARNING — unresolved jersey riders (won't score):\n  " + unresolved.join("\n  "));
} else {
  console.log("All jersey riders resolved to picked-pool rider ids.");
}

const embedded = { ...snap, jerseysFinal: jerseys };

const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>TdF Poule — Rules Simulator (2025)</title>
<style>
  :root { --bg:#0f1115; --panel:#1a1d24; --line:#2a2f3a; --txt:#e6e8ee; --mut:#9aa3b2;
          --up:#3fb950; --down:#f85149; --acc:#d8b400; }
  * { box-sizing:border-box; }
  body { margin:0; font:14px/1.45 -apple-system,Segoe UI,Roboto,sans-serif; background:var(--bg); color:var(--txt); }
  header { padding:14px 20px; border-bottom:1px solid var(--line); }
  header h1 { margin:0; font-size:18px; }
  header p { margin:4px 0 0; color:var(--mut); font-size:12px; }
  .wrap { display:grid; grid-template-columns:340px 1fr; gap:0; align-items:start; }
  .controls { padding:16px 18px; border-right:1px solid var(--line); position:sticky; top:0; max-height:100vh; overflow:auto; }
  .board { padding:16px 18px; }
  .group { background:var(--panel); border:1px solid var(--line); border-radius:8px; padding:12px; margin-bottom:12px; }
  .group h3 { margin:0 0 8px; font-size:13px; text-transform:uppercase; letter-spacing:.04em; color:var(--mut); }
  .note { color:var(--mut); font-size:11px; margin-top:6px; }
  .pts { display:grid; grid-template-columns:repeat(5, 1fr); gap:5px; }
  .pts label { font-size:10px; color:var(--mut); display:flex; flex-direction:column; gap:2px; }
  .pts input { width:100%; }
  input[type=number] { background:#0b0d11; border:1px solid var(--line); color:var(--txt); border-radius:5px; padding:4px 5px; font:inherit; }
  .row { display:flex; align-items:center; justify-content:space-between; gap:8px; margin:6px 0; }
  .row label { font-size:12px; }
  .jersey-grid { display:grid; grid-template-columns:auto repeat(3,1fr); gap:5px; align-items:center; }
  .jersey-grid span { font-size:11px; color:var(--mut); }
  .jersey-grid input { width:100%; }
  button { background:#232833; border:1px solid var(--line); color:var(--txt); border-radius:6px; padding:7px 10px; cursor:pointer; font:inherit; }
  button:hover { border-color:#3a4150; }
  button.primary { background:var(--acc); color:#1a1a1a; border-color:var(--acc); font-weight:600; }
  table { width:100%; border-collapse:collapse; }
  th,td { padding:7px 8px; text-align:right; border-bottom:1px solid var(--line); white-space:nowrap; }
  th:nth-child(2), td:nth-child(2) { text-align:left; }
  th { font-size:11px; color:var(--mut); text-transform:uppercase; position:sticky; top:0; background:var(--bg); }
  td.team { text-align:left; }
  .player { color:var(--mut); font-size:11px; }
  .up { color:var(--up); } .down { color:var(--down); } .same { color:var(--mut); }
  .winner td { background:rgba(216,180,0,.08); }
  .summary { margin:6px 0 14px; padding:10px 12px; background:var(--panel); border:1px solid var(--line); border-radius:8px; font-size:13px; }
  .swatch { display:inline-block; width:10px; height:10px; border-radius:2px; margin-right:5px; vertical-align:middle; }
</style>
</head>
<body>
<header>
  <h1>Tour de France Poule — Rules Simulator</h1>
  <p>Testing rule changes against the real <b>2025</b> teams (16 teams). Baseline = current house rules. Everything runs in your browser; nothing is saved or published.</p>
</header>
<div class="wrap">
  <aside class="controls">
    <div class="group">
      <h3>Stage finish points</h3>
      <div class="pts" id="stagePts"></div>
      <div class="note">Points per finishing position in each of the 21 stages. Leave 0 to not score that place.</div>
    </div>

    <div class="group">
      <h3>Stage win bonus</h3>
      <div class="row"><label>Extra points for a stage win (1st)</label><input type="number" id="stageWinBonus" value="0" style="width:70px"></div>
    </div>

    <div class="group">
      <h3>Final GC points</h3>
      <div class="pts" id="gcPts"></div>
      <div class="row" style="margin-top:8px"><label>GC counts main riders only</label><input type="checkbox" id="gcMainsOnly" checked></div>
    </div>

    <div class="group">
      <h3>End-of-tour jersey points</h3>
      <div class="jersey-grid">
        <span></span><span>1st</span><span>2nd</span><span>3rd</span>
        <span><span class="swatch" style="background:#2e9e3f"></span>Green</span>
          <input type="number" id="green1" value="0"><input type="number" id="green2" value="0"><input type="number" id="green3" value="0">
        <span><span class="swatch" style="background:#d23b3b"></span>Polka</span>
          <input type="number" id="polka1" value="0"><input type="number" id="polka2" value="0"><input type="number" id="polka3" value="0">
        <span><span class="swatch" style="background:#e8e8e8"></span>White</span>
          <input type="number" id="white1" value="0"><input type="number" id="white2" value="0"><input type="number" id="white3" value="0">
      </div>
      <div class="row" style="margin-top:8px"><label>Jerseys count main riders only</label><input type="checkbox" id="jerseyMainsOnly" checked></div>
      <div class="note">2025 winners — Green: Milan / Pogačar / Girmay · Polka: Pogačar / Vingegaard / Martinez · White: Lipowitz / Onley / Vauquelin.</div>
    </div>

    <div class="group">
      <h3>Per-stage jersey points</h3>
      <div class="jersey-grid">
        <span>Per stage worn</span>
        <input type="number" id="perStageGreen" value="0" disabled title="needs daily data">
        <input type="number" id="perStagePolka" value="0" disabled title="needs daily data">
        <input type="number" id="perStageWhite" value="0" disabled title="needs daily data">
      </div>
      <div class="note">⚠ Disabled until we load verified <b>daily jersey-wearer</b> data for 2025 (who wore green/polka/white after each stage). That table isn't in the database and couldn't be auto-scraped reliably — we'll add it from an authoritative source next.</div>
    </div>

    <div class="group">
      <h3>Reserves &amp; roster</h3>
      <div class="row"><label>Reserves may substitute through stage</label><input type="number" id="reserveLockStage" value="6" min="0" max="21" style="width:60px"></div>
      <div class="row"><label>Reserves counted per team</label><input type="number" id="reserveCount" value="3" min="0" max="5" style="width:60px"></div>
      <div class="row"><label>Reserves also score every stage</label><input type="checkbox" id="reservesScoreAllStages"></div>
      <div class="note">2025 rosters only contain <b>3</b> reserves each, so values above 3 behave like 3 — "5 reserves" can only be truly tested once future rosters carry 5 picks.</div>
    </div>

    <button class="primary" id="reset">Reset to current rules</button>
  </aside>

  <main class="board">
    <div class="summary" id="summary"></div>
    <table id="lb">
      <thead><tr>
        <th>#</th><th>Team</th><th>Stage</th><th>GC</th><th>Jersey</th><th>Total</th><th>Δrank</th><th>Δtotal</th>
      </tr></thead>
      <tbody></tbody>
    </table>
  </main>
</div>

<script>
const DATA = ${JSON.stringify(embedded)};
const UNRESOLVED = new Set(["unmatched","ambiguous"]);

// Current house rules — the baseline.
const CURRENT = {
  stagePoints: {1:20,2:15,3:12,4:10,5:8,6:6,7:5,8:4,9:3,10:2},
  gcPoints: {1:100,2:80,3:60,4:40,5:30,6:25,7:20,8:18,9:16,10:15},
  stageWinBonus:0,
  jerseyPoints:{green:{},polka:{},white:{}},
  jerseyMainsOnly:true,
  reserveLockStage:6,
  reserveCount:3,
  gcMainsOnly:true,
  reservesScoreAllStages:false,
};

// Pre-index data once.
const stages = [...new Set(DATA.stageResults.map(r=>r.stage))].sort((a,b)=>a-b);
const posByStageRider = new Map();
for (const r of DATA.stageResults){ if(!r.rider_id) continue; if(!posByStageRider.has(r.stage)) posByStageRider.set(r.stage,new Map()); posByStageRider.get(r.stage).set(r.rider_id,r.position); }
const gcPos = new Map(); for(const r of DATA.finalGc) if(r.rider_id) gcPos.set(r.rider_id,r.position);
const jerseyPosByName = {};
for (const [j,rows] of Object.entries(DATA.jerseysFinal)){ const m=new Map(); for(const r of rows) if(r.rider_id) m.set(r.rider_id,r.position); jerseyPosByName[j]=m; }
const picksByTeam = new Map();
for (const t of DATA.teams) picksByTeam.set(t.id, DATA.teamRiders.filter(tr=>tr.team_id===t.id));
const dropoutByRider = new Map(); for(const d of DATA.dropouts) dropoutByRider.set(d.rider_id,d.dropout_after_stage);

function activeForStage(teamId, stage, rules){
  const picks = picksByTeam.get(teamId);
  const mains = picks.filter(p=>!p.is_reserve);
  const reserves = picks.filter(p=>p.is_reserve).sort((a,b)=>(a.reserve_order??0)-(b.reserve_order??0)).slice(0, rules.reserveCount);
  const isActive = (rid,status)=>{ if(UNRESOLVED.has(status)||!rid) return false; const d=dropoutByRider.get(rid); if(d!==undefined && d<stage) return false; return true; };
  const active=[]; let need=0;
  for(const m of mains){ if(isActive(m.rider_id,m.match_status)) active.push(m.rider_id); else need++; }
  if(stage<=rules.reserveLockStage && need>0){ let filled=0; for(const r of reserves){ if(filled>=need) break; if(isActive(r.rider_id,r.match_status)){ active.push(r.rider_id); filled++; } } }
  return {active, reserves};
}

function score(rules){
  const out=[];
  for(const t of DATA.teams){
    const picks = picksByTeam.get(t.id);
    let stagePts=0;
    for(const stage of stages){
      const positions=posByStageRider.get(stage); if(!positions) continue;
      const {active,reserves}=activeForStage(t.id,stage,rules);
      const set=new Set(active);
      if(rules.reservesScoreAllStages) for(const r of reserves) if(r.rider_id && !UNRESOLVED.has(r.match_status)) set.add(r.rider_id);
      for(const rid of set){ const p=positions.get(rid); if(p===undefined) continue; stagePts += rules.stagePoints[p]||0; if(p===1) stagePts += rules.stageWinBonus||0; }
    }
    let gcPts=0;
    const gcPicks = rules.gcMainsOnly ? picks.filter(p=>!p.is_reserve) : picks;
    for(const p of gcPicks){ if(!p.rider_id) continue; const pos=gcPos.get(p.rider_id); if(pos!==undefined) gcPts += rules.gcPoints[pos]||0; }
    let jerseyPts=0;
    const jPicks = rules.jerseyMainsOnly ? picks.filter(p=>!p.is_reserve) : picks;
    for(const [j,map] of Object.entries(rules.jerseyPoints)){ const standings=jerseyPosByName[j]; if(!standings) continue; for(const p of jPicks){ if(!p.rider_id) continue; const pos=standings.get(p.rider_id); if(pos!==undefined) jerseyPts += map[pos]||0; } }
    const total=stagePts+gcPts+jerseyPts;
    out.push({teamId:t.id, name:t.name, player:t.player_name, stagePts, gcPts, jerseyPts, total});
  }
  out.sort((a,b)=>b.total-a.total);
  for(let i=0;i<out.length;i++) out[i].rank = (i>0 && out[i].total===out[i-1].total)? out[i-1].rank : i+1;
  return out;
}

// --- read controls into a rules object ---
const num = id => Number(document.getElementById(id).value)||0;
const chk = id => document.getElementById(id).checked;
function readRules(){
  const stagePoints={}; for(let i=1;i<=15;i++){ const el=document.getElementById('s'+i); if(el){ const v=Number(el.value)||0; if(v) stagePoints[i]=v; } }
  const gcPoints={}; for(let i=1;i<=10;i++){ const el=document.getElementById('g'+i); if(el){ const v=Number(el.value)||0; if(v) gcPoints[i]=v; } }
  const jp = j => { const o={}; [1,2,3].forEach(k=>{ const v=num(j+k); if(v) o[k]=v; }); return o; };
  return {
    stagePoints, gcPoints,
    stageWinBonus:num('stageWinBonus'),
    jerseyPoints:{green:jp('green'),polka:jp('polka'),white:jp('white')},
    jerseyMainsOnly:chk('jerseyMainsOnly'),
    reserveLockStage:num('reserveLockStage'),
    reserveCount:num('reserveCount'),
    gcMainsOnly:chk('gcMainsOnly'),
    reservesScoreAllStages:chk('reservesScoreAllStages'),
  };
}

// --- build the points input grids ---
function buildGrids(){
  const sp=document.getElementById('stagePts'); sp.innerHTML='';
  for(let i=1;i<=15;i++){ const v=CURRENT.stagePoints[i]||0; sp.insertAdjacentHTML('beforeend',
    \`<label>P\${i}<input type="number" id="s\${i}" value="\${v}"></label>\`); }
  const gp=document.getElementById('gcPts'); gp.innerHTML='';
  for(let i=1;i<=10;i++){ const v=CURRENT.gcPoints[i]||0; gp.insertAdjacentHTML('beforeend',
    \`<label>P\${i}<input type="number" id="g\${i}" value="\${v}"></label>\`); }
}

const baseline = score(CURRENT);
const baseById = new Map(baseline.map(s=>[s.teamId,s]));

function arrow(d){ if(d>0) return '<span class="up">▲'+d+'</span>'; if(d<0) return '<span class="down">▼'+(-d)+'</span>'; return '<span class="same">=</span>'; }

function render(){
  const rules=readRules();
  const rows=score(rules);
  const tb=document.querySelector('#lb tbody'); tb.innerHTML='';
  for(const r of rows){
    const b=baseById.get(r.teamId);
    const dRank=b.rank-r.rank, dTot=r.total-b.total;
    const tr=document.createElement('tr'); if(r.rank===1) tr.className='winner';
    tr.innerHTML=\`<td>\${r.rank}</td>
      <td class="team">\${r.name}<div class="player">\${r.player||''}</div></td>
      <td>\${r.stagePts}</td><td>\${r.gcPts}</td><td>\${r.jerseyPts}</td><td><b>\${r.total}</b></td>
      <td>\${arrow(dRank)}</td>
      <td class="\${dTot>0?'up':dTot<0?'down':'same'}">\${dTot>0?'+':''}\${dTot}</td>\`;
    tb.appendChild(tr);
  }
  const moved=rows.filter(r=>baseById.get(r.teamId).rank!==r.rank).length;
  const bWin=[...baseById.values()].find(b=>b.rank===1), nWin=rows.find(r=>r.rank===1);
  const changed=bWin.teamId!==nWin.teamId;
  document.getElementById('summary').innerHTML =
    \`<b>\${moved}</b>/\${rows.length} teams change rank vs current rules. \` +
    \`Winner: \${changed? '<span class="down">CHANGES — '+bWin.name+' → '+nWin.name+'</span>' : '<span class="same">unchanged ('+nWin.name+')</span>'}\`;
}

function setCurrent(){
  buildGrids();
  document.getElementById('stageWinBonus').value=0;
  ['green','polka','white'].forEach(j=>[1,2,3].forEach(k=>document.getElementById(j+k).value=0));
  document.getElementById('jerseyMainsOnly').checked=true;
  document.getElementById('reserveLockStage').value=6;
  document.getElementById('reserveCount').value=3;
  document.getElementById('gcMainsOnly').checked=true;
  document.getElementById('reservesScoreAllStages').checked=false;
  render();
}

document.addEventListener('input', render);
document.getElementById('reset').addEventListener('click', setCurrent);
setCurrent();
</script>
</body>
</html>`;

const outFile = join(__dirname, "poule-simulator.html");
writeFileSync(outFile, html);
console.log(`Wrote ${outFile}`);
