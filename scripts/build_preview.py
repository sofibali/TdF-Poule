#!/usr/bin/env python3
"""
Build a self-contained HTML preview of the future site.

Tabs:
  · All teams · stages   (DEFAULT — landing page)
  · Leaderboard          (sortable, row-clickable, with historical winners)
  · Riders               (sortable; top 15 = "perfect team")
  · Admin · upload       (parser preview)

Synthetic data baked in:
  · stage results 1..15 deterministically generated from the parsed roster
  · final-GC top-10
  · 2-3 dropouts per team at stages 1..6 → reserves get used
  · winners for years 2020/2021/2022/2024 picked deterministically from real
    parsed teams so the historical-winners section has something to render
"""
from __future__ import annotations

import hashlib
import json
import random
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]
VOUT = REPO / "scripts" / "validator-output"
OUT = REPO / "preview.html"

STAGE_PTS = {1: 20, 2: 15, 3: 12, 4: 10, 5: 8, 6: 6, 7: 5, 8: 4, 9: 3, 10: 2}
GC_PTS = {1: 100, 2: 80, 3: 60, 4: 40, 5: 30, 6: 25, 7: 20, 8: 18, 9: 16, 10: 15}
PERFECT_TEAM_SIZE = 15
RESERVE_LOCK_STAGE = 6


def deterministic_rng(seed_text: str) -> random.Random:
    h = int(hashlib.sha256(seed_text.encode()).hexdigest()[:16], 16)
    return random.Random(h)


def name_match(a: str, b: str) -> bool:
    aa = a.lower().replace(".", "").replace(" ", "")
    bb = b.lower().replace(".", "").replace(" ", "")
    return aa in bb or bb in aa


def mock_stage_results(teams) -> dict:
    pool = []
    for t in teams:
        for r in t["riders"] + t["reserves"]:
            pool.append(r)
    pool = list({r: None for r in pool})
    rng = deterministic_rng("tdf-2025")
    stages = {}
    for stage in range(1, 16):
        finishers = rng.sample(pool, k=min(12, len(pool)))
        stages[stage] = [
            {"position": i + 1, "rider": finishers[i]} for i in range(len(finishers))
        ]
    return stages


def mock_gc(teams) -> list:
    pool = []
    for t in teams:
        pool.extend(t["riders"][:6])
    pool = list({r: None for r in pool})
    rng = deterministic_rng("tdf-2025-gc")
    rng.shuffle(pool)
    return [{"position": i + 1, "rider": pool[i]} for i in range(min(10, len(pool)))]


def assign_dropouts_and_subs(team) -> dict:
    """
    Deterministically pick 0-3 main riders to drop out of `team` (at stages
    1..21) and assign reserves (in order) to fill vacancies that fall in
    stages 1..6.
    """
    rng = deterministic_rng(f"drop-{team['player']}")
    main_count = len(team["riders"])
    # 0-3 dropouts per team
    n_drops = rng.choice([0, 1, 1, 2, 2, 3])
    drop_indices = sorted(rng.sample(range(main_count), n_drops)) if n_drops else []

    main_status = []
    drop_stages_for_subs = []  # in fill order
    for idx, rider in enumerate(team["riders"]):
        if idx in drop_indices:
            stage = rng.randint(1, 21)
            main_status.append({
                "name": rider,
                "status": "dropped_out",
                "dropout_after_stage": stage,
                "pick_order": idx + 1,
            })
            if stage < RESERVE_LOCK_STAGE:
                drop_stages_for_subs.append((stage + 1, idx + 1, rider))
        else:
            main_status.append({
                "name": rider,
                "status": "active",
                "dropout_after_stage": None,
                "pick_order": idx + 1,
            })

    # Sort vacancies in fill order: stage asc, pick_order asc
    drop_stages_for_subs.sort()

    reserves_status = []
    for ridx, reserve in enumerate(team["reserves"]):
        if ridx < len(drop_stages_for_subs):
            stage, repl_pick_order, repl_name = drop_stages_for_subs[ridx]
            reserves_status.append({
                "name": reserve,
                "reserve_order": ridx + 1,
                "status": "used",
                "joined_at_stage": stage,
                "replaced_name": repl_name,
            })
        else:
            reserves_status.append({
                "name": reserve,
                "reserve_order": ridx + 1,
                "status": "unused",
                "joined_at_stage": None,
                "replaced_name": None,
            })

    return {"main_status": main_status, "reserves_status": reserves_status}


def score_team(team, stages: dict, gc: list, sub_info: dict) -> dict:
    # The "active set" for each stage: main riders not yet dropped + any
    # reserves whose joined_at_stage <= S.
    main_status = sub_info["main_status"]
    reserves_status = sub_info["reserves_status"]

    stage_points = {}
    rider_points = {}
    total = 0
    for stage, results in stages.items():
        active_picks = []
        for m in main_status:
            if m["status"] == "active":
                active_picks.append(m["name"])
            elif m["status"] == "dropped_out" and m["dropout_after_stage"] >= stage:
                active_picks.append(m["name"])
        for r in reserves_status:
            if r["status"] == "used" and r["joined_at_stage"] <= stage:
                active_picks.append(r["name"])

        pts = 0
        for res in results:
            if res["position"] not in STAGE_PTS:
                continue
            for pick in active_picks:
                if name_match(pick, res["rider"]):
                    p = STAGE_PTS[res["position"]]
                    pts += p
                    rider_points[pick] = rider_points.get(pick, 0) + p
                    break
        stage_points[stage] = pts
        total += pts

    gc_pts = 0
    for res in gc:
        if res["position"] not in GC_PTS:
            continue
        for tr in team["riders"] + team["reserves"]:
            if name_match(tr, res["rider"]):
                p = GC_PTS[res["position"]]
                gc_pts += p
                rider_points[tr] = rider_points.get(tr, 0) + p
                break
    total += gc_pts

    return {
        "stage_points": stage_points,
        "rider_points": rider_points,
        "stage_total": total - gc_pts,
        "gc_points": gc_pts,
        "total": total,
    }


PRO_TEAMS = [
    "UAE Team Emirates", "Visma–Lease a Bike", "Soudal Quick-Step",
    "Ineos Grenadiers", "Red Bull–BORA–hansgrohe", "Lidl–Trek",
    "Decathlon AG2R", "EF Education–EasyPost", "Alpecin–Deceuninck",
    "Movistar Team", "Bahrain Victorious", "Groupama–FDJ",
    "Cofidis", "Jayco AlUla", "Israel–Premier Tech",
]


def slugify_rider(name: str) -> str:
    """Crude PCS-style slug. e.g. 'Pogacar' → 'tadej-pogacar' (best guess)."""
    SPECIALS = {
        "pogacar": "tadej-pogacar",
        "vingegaard": "jonas-vingegaard",
        "roglic": "primoz-roglic",
        "evenepoel": "remco-evenepoel",
        "van aert": "wout-van-aert",
        "van der poel": "mathieu-van-der-poel",
        "ca. rodriguez": "carlos-rodriguez-cano",
        "ca rodrigues": "carlos-rodriguez-cano",
        "ca rodriguez": "carlos-rodriguez-cano",
        "almeida": "joao-almeida",
        "lipowitz": "florian-lipowitz",
        "jorgenson": "matteo-jorgenson",
        "merlier": "tim-merlier",
        "milan": "jonathan-milan",
        "groenewegen": "dylan-groenewegen",
        "philipsen": "jasper-philipsen",
        "ganna": "filippo-ganna",
        "skjelmose": "mattias-skjelmose",
        "girmay": "biniam-girmay",
        "gee": "derek-gee",
        "vauquelin": "kevin-vauquelin",
        "onley": "oscar-onley",
        "s yates": "simon-yates",
        "a yates": "adam-yates",
        "mas": "enric-mas",
        "gall": "felix-gall",
        "healy": "ben-healy",
        "o connor": "ben-oconnor",
        "coquard": "bryan-coquard",
        "martinez": "lenny-martinez",
        "l martinez": "lenny-martinez",
        "v eetvelt": "lennert-van-eetvelt",
        "skjlemose": "mattias-skjelmose",
        "rodriguez": "carlos-rodriguez-cano",
        "thomas": "geraint-thomas",
        "buitrago": "santiago-buitrago",
        "hirschi": "marc-hirschi",
        "butrigo": "santiago-buitrago",
        "de lie": "arnaud-de-lie",
        "meeus": "jordi-meeus",
        "nys": "thibau-nys",
    }
    k = name.lower().strip()
    if k in SPECIALS:
        return SPECIALS[k]
    return k.replace(".", "").replace(" ", "-")


def assign_rider_meta(rider_name: str) -> dict:
    """Deterministically assign pro_team + bib# based on hash of name."""
    rng = deterministic_rng(f"meta-{rider_name}")
    return {
        "pro_team": rng.choice(PRO_TEAMS),
        "bib_number": rng.randint(1, 184),
        "pcs_slug": slugify_rider(rider_name),
    }


def riders_table(stages: dict, gc: list) -> list:
    by_rider: dict = {}
    for stage, results in stages.items():
        for res in results:
            if res["position"] not in STAGE_PTS:
                continue
            r = by_rider.setdefault(
                res["rider"], {"rider": res["rider"], "stages": {}, "gc": 0}
            )
            r["stages"][stage] = r["stages"].get(stage, 0) + STAGE_PTS[res["position"]]
    for res in gc:
        if res["position"] not in GC_PTS:
            continue
        r = by_rider.setdefault(
            res["rider"], {"rider": res["rider"], "stages": {}, "gc": 0}
        )
        r["gc"] += GC_PTS[res["position"]]
    rows = []
    for r in by_rider.values():
        total = sum(r["stages"].values()) + r["gc"]
        meta = assign_rider_meta(r["rider"])
        rows.append({**r, **meta, "total": total})
    rows.sort(key=lambda x: x["total"], reverse=True)
    return rows


def historical_winners() -> list:
    """Pick a deterministic 'winner' per year from the parsed validator outputs."""
    out = []
    for year in (2020, 2021, 2022, 2024):
        path = VOUT / (
            "Tour.2020 (1).json" if year == 2020
            else f"Tour.{year}.json"
        )
        if not path.exists():
            continue
        parsed = json.loads(path.read_text())
        # Pick a winner deterministically — RNG seeded on year.
        rng = deterministic_rng(f"winner-{year}")
        candidates = [t for t in parsed["teams"] if not t.get("needs_attention")]
        if not candidates:
            continue
        w = rng.choice(candidates)
        out.append({
            "year": year,
            "team_name": f"{w['player']}'s {w['team_name']}",
            "player_name": w["player"],
            "total_points": rng.randint(820, 1280),
        })
    out.sort(key=lambda r: r["year"], reverse=True)
    return out


def build():
    parsed = json.loads((VOUT / "Tour.2025.json").read_text())
    teams = parsed["teams"]
    stages = mock_stage_results(teams)
    gc = mock_gc(teams)

    leaderboard = []
    breakdowns = {}
    matrix = []
    for t in teams:
        if t["needs_attention"]:
            continue
        sub_info = assign_dropouts_and_subs(t)
        s = score_team(t, stages, gc, sub_info)
        breakdowns[t["player"]] = {
            "team_name": t["team_name"],
            "main_status": sub_info["main_status"],
            "reserves_status": sub_info["reserves_status"],
            "stage_points": s["stage_points"],
            "rider_points": s["rider_points"],
            "stage_total": s["stage_total"],
            "gc_points": s["gc_points"],
            "total": s["total"],
        }
        leaderboard.append({
            "player": t["player"],
            "name": f"{t['player']}'s {t['team_name']}",
            "stage_points": s["stage_total"],
            "gc_points": s["gc_points"],
            "total": s["total"],
        })
        matrix.append({
            "player": t["player"],
            "name": f"{t['player']}'s {t['team_name']}",
            "stages": s["stage_points"],
            "gc": s["gc_points"],
            "total": s["total"],
        })

    leaderboard.sort(key=lambda r: r["total"], reverse=True)
    for i, row in enumerate(leaderboard, 1):
        row["rank"] = i

    # Build a unified rider→meta map covering EVERY rider mentioned by any team
    # (whether or not they scored), so the team modal can also link to PCS.
    rider_meta_map: dict = {}
    for t in teams:
        for r in t["riders"] + t["reserves"]:
            if r not in rider_meta_map:
                rider_meta_map[r] = assign_rider_meta(r)

    payload = {
        "year": parsed["year"],
        "team_count": len(leaderboard),
        "leaderboard": leaderboard,
        "breakdowns": breakdowns,
        "all_teams_parsed": teams,
        "stages_completed": len(stages),
        "stage_numbers": sorted(stages.keys()),
        "matrix": matrix,
        "riders": riders_table(stages, gc),
        "rider_meta": rider_meta_map,
        "perfect_team_size": PERFECT_TEAM_SIZE,
        "historical_winners": historical_winners(),
    }

    html = HTML_TEMPLATE.replace("__PAYLOAD__", json.dumps(payload, ensure_ascii=False))
    OUT.write_text(html, encoding="utf-8")
    print(f"Wrote {OUT}  ({OUT.stat().st_size:,} bytes)")


HTML_TEMPLATE = r"""<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>TDF Pool · preview</title>
<script src="https://cdn.tailwindcss.com"></script>
<style>
  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif; }
  .tab-active { color: #0f172a; border-color: #0f172a; }
  .tabular { font-variant-numeric: tabular-nums; }
  th.sortable { cursor: pointer; user-select: none; }
  th.sortable:hover { color: #0f172a; }
  th.sortable .arrow { display: inline-block; width: 0.7em; opacity: 0.35; }
  th.sortable.sort-asc  .arrow::after { content: "▲"; opacity: 1; }
  th.sortable.sort-desc .arrow::after { content: "▼"; opacity: 1; }
  .heat-0 { background: transparent; }
  .heat-1 { background: rgba(34,197,94,0.08); }
  .heat-2 { background: rgba(34,197,94,0.18); }
  .heat-3 { background: rgba(34,197,94,0.32); }
  .heat-4 { background: rgba(34,197,94,0.50); color: #064e3b; font-weight: 600; }
  .row-click { cursor: pointer; }
  .row-click:hover { background: rgba(59,130,246,0.06); }
</style>
</head>
<body class="bg-slate-50 text-slate-900">

<header class="border-b bg-white">
  <nav class="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
    <div class="font-bold tracking-tight">🚴 TDF Pool</div>
    <div class="text-xs text-slate-400">PREVIEW · synthetic scores from your real 2025 teams</div>
  </nav>
</header>

<main class="mx-auto max-w-6xl px-4 py-8">
  <div class="flex gap-6 border-b border-slate-200 overflow-x-auto">
    <button data-tab="matrix" class="tab tab-active border-b-2 border-transparent px-1 py-3 text-sm font-semibold whitespace-nowrap">
      All teams · stages
    </button>
    <button data-tab="leaderboard" class="tab border-b-2 border-transparent px-1 py-3 text-sm font-semibold text-slate-400 hover:text-slate-600 whitespace-nowrap">
      Leaderboard
    </button>
    <button data-tab="riders" class="tab border-b-2 border-transparent px-1 py-3 text-sm font-semibold text-slate-400 hover:text-slate-600 whitespace-nowrap">
      Riders
    </button>
    <button data-tab="upload" class="tab border-b-2 border-transparent px-1 py-3 text-sm font-semibold text-slate-400 hover:text-slate-600 whitespace-nowrap">
      Admin · upload
    </button>
  </div>

  <!-- ALL TEAMS · STAGES (default) -->
  <section id="view-matrix" class="mt-8">
    <div class="flex items-baseline justify-between gap-4">
      <div>
        <h1 class="text-3xl font-bold tracking-tight">All teams · stages</h1>
        <p class="mt-1 text-sm text-slate-500">
          Every team's points across every stage of <span id="m-year"></span>.
          Top scorer per stage shaded green. Click a team for details.
        </p>
      </div>
      <select class="rounded border border-slate-300 bg-white px-3 py-1.5 text-sm">
        <option>2025</option>
        <option disabled>2026 (not yet)</option>
      </select>
    </div>
    <div class="mt-6 overflow-x-auto rounded-lg border border-slate-200 bg-white shadow-sm">
      <table class="text-sm" id="matrix-table">
        <thead class="bg-slate-50 text-xs uppercase tracking-wider text-slate-500">
          <tr id="matrix-head"></tr>
        </thead>
        <tbody id="matrix-body" class="divide-y divide-slate-100"></tbody>
      </table>
    </div>
  </section>

  <!-- LEADERBOARD -->
  <section id="view-leaderboard" class="mt-8 hidden space-y-12">
    <div>
      <div class="flex items-baseline justify-between">
        <div>
          <h1 class="text-3xl font-bold tracking-tight">Leaderboard</h1>
          <p id="lb-sub" class="mt-1 text-sm text-slate-500"></p>
        </div>
        <select class="rounded border border-slate-300 bg-white px-3 py-1.5 text-sm">
          <option>2025</option>
        </select>
      </div>
      <div class="mt-6 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
        <table class="w-full text-sm" id="lb-table">
          <thead class="bg-slate-50 text-left text-xs uppercase tracking-wider text-slate-500">
            <tr>
              <th class="sortable px-4 py-3 w-16" data-key="rank">#<span class="arrow"></span></th>
              <th class="sortable px-4 py-3" data-key="name">Team<span class="arrow"></span></th>
              <th class="sortable px-4 py-3 hidden sm:table-cell" data-key="player">Player<span class="arrow"></span></th>
              <th class="sortable px-4 py-3 text-right" data-key="stage_points">Stages<span class="arrow"></span></th>
              <th class="sortable px-4 py-3 text-right" data-key="gc_points">GC<span class="arrow"></span></th>
              <th class="sortable px-4 py-3 text-right font-bold" data-key="total">Total<span class="arrow"></span></th>
            </tr>
          </thead>
          <tbody id="lb-body" class="divide-y divide-slate-100"></tbody>
        </table>
        <p class="border-t border-slate-100 px-4 py-2 text-xs text-slate-400">
          Click a row to open team details · click a column header to sort.
        </p>
      </div>
    </div>

    <div>
      <h2 class="text-2xl font-bold tracking-tight">Historical winners</h2>
      <p class="mt-1 text-sm text-slate-500">
        Past pool champions across the family's tradition.
      </p>
      <div class="mt-6 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
        <table class="w-full text-sm">
          <thead class="bg-slate-50 text-left text-xs uppercase tracking-wider text-slate-500">
            <tr>
              <th class="px-4 py-3 w-20">Year</th>
              <th class="px-4 py-3">Winning team</th>
              <th class="px-4 py-3 hidden sm:table-cell">Player</th>
              <th class="px-4 py-3 text-right">Points</th>
            </tr>
          </thead>
          <tbody id="hw-body" class="divide-y divide-slate-100"></tbody>
        </table>
      </div>
    </div>
  </section>

  <!-- RIDERS -->
  <section id="view-riders" class="mt-8 hidden">
    <h1 class="text-3xl font-bold tracking-tight">Riders</h1>
    <p class="mt-1 text-sm text-slate-500">
      Every rider that's scored points across the field, with stage-by-stage breakdown.
      Top <span id="rider-perfect-n" class="font-semibold"></span> rows = the
      <strong>perfect team you could have picked.</strong>
    </p>
    <div class="mt-6 overflow-x-auto rounded-lg border border-slate-200 bg-white shadow-sm">
      <table class="text-sm" id="riders-table">
        <thead class="bg-slate-50 text-xs uppercase tracking-wider text-slate-500">
          <tr id="riders-head"></tr>
        </thead>
        <tbody id="riders-body" class="divide-y divide-slate-100"></tbody>
      </table>
    </div>
    <p class="mt-3 text-xs text-slate-400">Click any column header to sort. Rows in green = perfect team.</p>
  </section>

  <!-- UPLOAD -->
  <section id="view-upload" class="mt-8 hidden">
    <h1 class="text-3xl font-bold tracking-tight">Upload teams</h1>
    <p class="mt-1 text-sm text-slate-500">
      What you'll see after dropping the in-laws' Word doc — parsed teams with
      anything ambiguous flagged for you to fix.
    </p>
    <div class="mt-6 flex items-center gap-3 rounded-lg border border-dashed border-slate-300 bg-white p-4">
      <span class="rounded border border-slate-300 px-3 py-1.5 text-xs text-slate-500">Tour.2025.docx (mocked)</span>
      <span class="rounded bg-slate-900 px-4 py-2 text-xs font-medium text-white">Parse</span>
    </div>
    <div id="upload-summary" class="mt-6"></div>
    <div id="upload-grid" class="mt-4 grid gap-3 md:grid-cols-2"></div>
  </section>
</main>

<!-- TEAM MODAL -->
<div id="modal" class="fixed inset-0 z-50 hidden items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4">
  <div class="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-xl bg-white shadow-2xl">
    <div class="flex items-start justify-between border-b border-slate-200 px-6 py-4">
      <div>
        <div id="m-name" class="text-xl font-bold"></div>
        <div id="m-player" class="text-sm text-slate-500"></div>
      </div>
      <button id="m-close" class="text-slate-400 hover:text-slate-700 text-2xl leading-none">×</button>
    </div>
    <div id="m-body" class="space-y-6 px-6 py-4"></div>
  </div>
</div>

<script>
const DATA = __PAYLOAD__;

document.getElementById("m-year").textContent = DATA.year;
document.getElementById("rider-perfect-n").textContent = DATA.perfect_team_size;

// ---------- Sortable table helper ----------
function makeSortable(tableId, headerSelector, getRows, renderRow, defaultKey, defaultDir) {
  let key = defaultKey;
  let dir = defaultDir;
  const table = document.getElementById(tableId);
  function applySort() {
    const rows = getRows().slice();
    rows.sort((a, b) => {
      const av = a[key], bv = b[key];
      if (typeof av === "number" && typeof bv === "number") return dir === "asc" ? av - bv : bv - av;
      const as = String(av ?? "").toLowerCase(), bs = String(bv ?? "").toLowerCase();
      if (as < bs) return dir === "asc" ? -1 : 1;
      if (as > bs) return dir === "asc" ?  1 : -1;
      return 0;
    });
    const body = table.querySelector("tbody");
    body.innerHTML = "";
    rows.forEach((r, i) => body.appendChild(renderRow(r, i)));
    table.querySelectorAll(headerSelector).forEach((th) => {
      th.classList.remove("sort-asc", "sort-desc");
      if (th.dataset.key === key) th.classList.add(dir === "asc" ? "sort-asc" : "sort-desc");
    });
  }
  table.querySelectorAll(headerSelector).forEach((th) => {
    th.addEventListener("click", () => {
      if (th.dataset.key === key) dir = dir === "asc" ? "desc" : "asc";
      else { key = th.dataset.key; dir = ["rank","name","player","rider"].includes(key) ? "asc" : "desc"; }
      applySort();
    });
  });
  applySort();
}

// ---------- Leaderboard ----------
document.getElementById("lb-sub").textContent =
  `Tour de France ${DATA.year} · ${DATA.team_count} teams · stage ${DATA.stages_completed} just finished`;
makeSortable(
  "lb-table",
  "th.sortable",
  () => DATA.leaderboard,
  (r) => {
    const tr = document.createElement("tr");
    tr.className = "row-click " + (
      r.rank === 1 ? "bg-yellow-50/50" : r.rank <= 3 ? "bg-slate-50/50" : ""
    );
    const medal = r.rank === 1 ? "🥇" : r.rank === 2 ? "🥈" : r.rank === 3 ? "🥉" : null;
    tr.innerHTML = `
      <td class="px-4 py-3 text-slate-500 font-mono">${medal ?? r.rank}</td>
      <td class="px-4 py-3 font-medium">${r.name}</td>
      <td class="px-4 py-3 hidden sm:table-cell text-slate-600">${r.player}</td>
      <td class="px-4 py-3 text-right tabular text-slate-600">${r.stage_points}</td>
      <td class="px-4 py-3 text-right tabular text-slate-600">${r.gc_points}</td>
      <td class="px-4 py-3 text-right tabular font-bold">${r.total}</td>`;
    tr.addEventListener("click", () => openTeam(r.player));
    return tr;
  },
  "rank",
  "asc"
);

// ---------- Historical winners ----------
(function renderHistorical() {
  const body = document.getElementById("hw-body");
  body.innerHTML = "";
  for (const w of DATA.historical_winners) {
    const tr = document.createElement("tr");
    tr.className = "hover:bg-slate-50/60";
    tr.innerHTML = `
      <td class="px-4 py-3 font-mono text-slate-500">${w.year}</td>
      <td class="px-4 py-3 font-medium">🏆 ${w.team_name}</td>
      <td class="px-4 py-3 hidden sm:table-cell text-slate-600">${w.player_name}</td>
      <td class="px-4 py-3 text-right tabular font-semibold">${w.total_points}</td>`;
    body.appendChild(tr);
  }
})();

// ---------- Stages matrix ----------
(function renderMatrix() {
  const head = document.getElementById("matrix-head");
  const body = document.getElementById("matrix-body");
  const stageCols = DATA.stage_numbers;
  const stageMax = {};
  for (const s of stageCols) {
    stageMax[s] = 0;
    for (const t of DATA.matrix) stageMax[s] = Math.max(stageMax[s], t.stages[s] || 0);
  }
  function heatClass(pts, max) {
    if (!pts || max === 0) return "heat-0";
    const pct = pts / max;
    if (pct >= 1) return "heat-4";
    if (pct >= 0.66) return "heat-3";
    if (pct >= 0.33) return "heat-2";
    return "heat-1";
  }
  head.innerHTML =
    `<th class="px-4 py-3 sticky left-0 bg-slate-50 text-left">Team</th>` +
    stageCols.map((s) => `<th class="px-2 py-3 text-center font-mono">${s}</th>`).join("") +
    `<th class="px-3 py-3 text-right">GC</th><th class="px-3 py-3 text-right font-bold">Total</th>`;

  const rows = DATA.matrix.slice().sort((a, b) => b.total - a.total);
  body.innerHTML = "";
  rows.forEach((r) => {
    const tr = document.createElement("tr");
    tr.className = "row-click";
    tr.innerHTML =
      `<td class="px-4 py-2 sticky left-0 bg-white">
         <div class="font-medium">${r.name}</div>
         <div class="text-xs text-slate-400">${r.player}</div>
       </td>` +
      stageCols.map((s) => {
        const v = r.stages[s] || 0;
        return `<td class="px-2 py-2 text-center tabular ${heatClass(v, stageMax[s])}">${v || ""}</td>`;
      }).join("") +
      `<td class="px-3 py-2 text-right tabular text-slate-600">${r.gc || ""}</td>` +
      `<td class="px-3 py-2 text-right tabular font-bold">${r.total}</td>`;
    tr.addEventListener("click", () => openTeam(r.player));
    body.appendChild(tr);
  });
})();

// ---------- Riders ----------
(function renderRiders() {
  const head = document.getElementById("riders-head");
  const stageCols = DATA.stage_numbers;
  head.innerHTML =
    `<th class="sortable px-4 py-3 sticky left-0 bg-slate-50 text-left" data-key="rider">Rider<span class="arrow"></span></th>` +
    `<th class="sortable px-3 py-3 text-left" data-key="pro_team">Team<span class="arrow"></span></th>` +
    stageCols.map((s) => `<th class="px-2 py-3 text-center font-mono">${s}</th>`).join("") +
    `<th class="sortable px-3 py-3 text-right" data-key="gc">GC<span class="arrow"></span></th>` +
    `<th class="sortable px-3 py-3 text-right font-bold" data-key="total">Total<span class="arrow"></span></th>`;
  const flatRows = DATA.riders.map((r, i) => ({
    rider: r.rider,
    pcs_slug: r.pcs_slug,
    pro_team: r.pro_team,
    bib_number: r.bib_number,
    stages: r.stages,
    gc: r.gc,
    total: r.total,
    perfect: i < DATA.perfect_team_size,
    rank: i + 1,
  }));
  makeSortable(
    "riders-table",
    "th.sortable",
    () => flatRows,
    (r) => {
      const tr = document.createElement("tr");
      tr.className = r.perfect ? "bg-emerald-50/60" : "";
      const link = r.pcs_slug
        ? `<a href="https://www.procyclingstats.com/rider/${r.pcs_slug}" target="_blank" rel="noreferrer noopener" class="font-medium hover:text-blue-600 hover:underline">${r.rider}</a>`
        : `<span class="font-medium">${r.rider}</span>`;
      const bib = r.bib_number != null
        ? `<span class="ml-2 rounded border border-slate-200 px-1.5 py-0.5 text-[10px] tabular text-slate-500">#${r.bib_number}</span>`
        : "";
      tr.innerHTML =
        `<td class="px-4 py-2 sticky left-0 ${r.perfect ? "bg-emerald-50/60" : "bg-white"}">
           <span class="text-slate-400 mr-2 tabular text-xs">${r.rank}</span>
           ${link}${bib}
           ${r.perfect ? '<span class="ml-2 text-xs text-emerald-700">★</span>' : ""}
         </td>` +
        `<td class="px-3 py-2 text-slate-600 whitespace-nowrap">${r.pro_team || '<span class="text-slate-300">—</span>'}</td>` +
        stageCols.map((s) => {
          const v = r.stages[s] || 0;
          return `<td class="px-2 py-2 text-center tabular ${v ? "text-slate-800 font-medium" : "text-slate-300"}">${v || "·"}</td>`;
        }).join("") +
        `<td class="px-3 py-2 text-right tabular text-slate-600">${r.gc || ""}</td>` +
        `<td class="px-3 py-2 text-right tabular font-bold">${r.total}</td>`;
      return tr;
    },
    "total",
    "desc"
  );
})();

// ---------- Modal ----------
function openTeam(player) {
  const t = DATA.breakdowns[player];
  if (!t) return;
  document.getElementById("m-name").textContent = `${player}'s ${t.team_name}`;
  document.getElementById("m-player").textContent =
    `${t.total} pts total · ${t.stage_total} stage · ${t.gc_points} GC`;
  const body = document.getElementById("m-body");
  body.innerHTML = "";

  // Helper: build a "name + #bib + pro_team" cluster, name linking to PCS.
  function riderTag(name, includePrefix = "") {
    const meta = DATA.rider_meta[name] || {};
    const link = meta.pcs_slug
      ? `<a href="https://www.procyclingstats.com/rider/${meta.pcs_slug}" target="_blank" rel="noreferrer noopener" class="hover:text-blue-600 hover:underline">${name}</a>`
      : name;
    const bib = meta.bib_number != null
      ? `<span class="ml-2 rounded border border-slate-200 px-1.5 py-0.5 text-[10px] tabular text-slate-500">#${meta.bib_number}</span>`
      : "";
    const team = meta.pro_team
      ? `<div class="text-xs text-slate-400">${meta.pro_team}</div>` : "";
    return `<div class="font-medium text-slate-800">${includePrefix}${link}${bib}</div>${team}`;
  }

  // ---- Roster (with status) ----
  const roster = document.createElement("div");
  const rosterRows = t.main_status.map((m) => {
    const pts = t.rider_points[m.name] ?? 0;
    let badge = "", style = "border-slate-200 bg-white";
    if (m.status === "active") {
      badge = `<span class="text-emerald-700">● Active</span>`;
    } else if (m.status === "dropped_out") {
      badge = `<span class="text-rose-700">✗ Dropped after stage ${m.dropout_after_stage}</span>`;
      style = "border-rose-200 bg-rose-50/50";
    } else {
      badge = `<span class="text-slate-500">— Didn't start</span>`;
      style = "border-slate-200 bg-slate-50";
    }
    return `<li class="flex items-start justify-between rounded border ${style} px-3 py-2 text-sm">
      <div>
        ${riderTag(m.name)}
        <div class="mt-0.5 text-xs">${badge}</div>
      </div>
      <span class="tabular text-slate-500">${pts || "—"}</span>
    </li>`;
  }).join("");
  roster.innerHTML = `
    <h3 class="text-xs font-semibold uppercase tracking-wide text-slate-500">Roster</h3>
    <ul class="mt-2 grid gap-2 sm:grid-cols-2">${rosterRows}</ul>`;
  body.appendChild(roster);

  // ---- Reserves (with substitution info) ----
  if (t.reserves_status.length > 0) {
    const reserves = document.createElement("div");
    const rrows = t.reserves_status.map((r) => {
      const pts = t.rider_points[r.name] ?? 0;
      let badge = "", style = "border-slate-200 bg-white";
      if (r.status === "used") {
        badge = `<span class="text-blue-700">→ Joined at stage ${r.joined_at_stage} · replacing ${r.replaced_name}</span>`;
        style = "border-blue-200 bg-blue-50/60";
      } else {
        badge = `<span class="text-slate-500">Unused</span>`;
        style = "border-slate-200 bg-slate-50";
      }
      return `<li class="flex items-start justify-between rounded border ${style} px-3 py-2 text-sm">
        <div>
          ${riderTag(r.name, '<span class="text-slate-400 mr-1">' + r.reserve_order + '.</span>')}
          <div class="mt-0.5 text-xs">${badge}</div>
        </div>
        <span class="tabular text-slate-500">${pts || ""}</span>
      </li>`;
    }).join("");
    reserves.innerHTML = `
      <h3 class="text-xs font-semibold uppercase tracking-wide text-slate-500">Reserves</h3>
      <ul class="mt-2 grid gap-2 sm:grid-cols-2">${rrows}</ul>`;
    body.appendChild(reserves);
  }

  // ---- Stage breakdown ----
  const stageEntries = Object.entries(t.stage_points).sort((a,b) => +a[0]-+b[0]);
  const stages = document.createElement("div");
  stages.innerHTML = `
    <h3 class="text-xs font-semibold uppercase tracking-wide text-slate-500">Points by stage</h3>
    <div class="mt-2 overflow-x-auto rounded border border-slate-200">
      <table class="w-full text-sm">
        <thead class="bg-slate-50 text-xs text-slate-500">
          <tr>${stageEntries.map(([s]) => `<th class="px-2 py-1 font-mono">${s}</th>`).join("")}</tr>
        </thead>
        <tbody><tr>
          ${stageEntries.map(([_,p]) =>
            `<td class="px-2 py-1 text-center tabular ${p>0?'font-semibold':'text-slate-400'}">${p||"—"}</td>`
          ).join("")}
        </tr></tbody>
      </table>
    </div>`;
  body.appendChild(stages);

  document.getElementById("modal").classList.remove("hidden");
  document.getElementById("modal").classList.add("flex");
}
document.getElementById("m-close").addEventListener("click", closeModal);
document.getElementById("modal").addEventListener("click", (e) => {
  if (e.target.id === "modal") closeModal();
});
function closeModal() {
  document.getElementById("modal").classList.add("hidden");
  document.getElementById("modal").classList.remove("flex");
}

// ---------- Upload ----------
(function renderUpload() {
  const teams = DATA.all_teams_parsed;
  const unresolvedCount = teams.filter((t) => t.needs_attention).length;
  document.getElementById("upload-summary").innerHTML = `
    <div class="flex items-baseline justify-between">
      <h2 class="text-lg font-semibold">Preview</h2>
      <div class="text-sm text-slate-500">
        year=${DATA.year} · ${teams.length} teams
        ${unresolvedCount > 0 ? `<span class="ml-2 text-amber-600">· ${unresolvedCount} need a name</span>` : ""}
      </div>
    </div>`;
  const grid = document.getElementById("upload-grid");
  grid.innerHTML = "";
  for (const t of teams) {
    const card = document.createElement("article");
    card.className = "rounded-lg border p-4 " + (
      t.needs_attention ? "border-amber-300 bg-amber-50" : "border-slate-200 bg-white"
    );
    card.innerHTML = `
      <header class="flex items-baseline justify-between">
        <div>
          <div class="font-semibold">
            ${t.player}
            ${t.needs_attention ? '<span class="ml-2 text-xs text-amber-700">⚠ rename me</span>' : ""}
          </div>
          <div class="text-xs text-slate-500">${t.team_name}</div>
        </div>
        <div class="text-xs text-slate-400">${t.riders.length}+${t.reserves.length}</div>
      </header>
      <ul class="mt-3 grid grid-cols-2 gap-x-3 gap-y-1 text-sm">
        ${t.riders.map((r) => `<li class="text-slate-700">${r}</li>`).join("")}
      </ul>
      ${t.reserves.length > 0 ? `
        <div class="mt-3 border-t border-slate-200 pt-3 text-xs text-slate-500">
          Reserves: ${t.reserves.join(" · ")}
        </div>` : ""}`;
    grid.appendChild(card);
  }
})();

// ---------- Tabs ----------
document.querySelectorAll(".tab").forEach((tab) => {
  tab.addEventListener("click", () => {
    document.querySelectorAll(".tab").forEach((t) => {
      t.classList.remove("tab-active");
      t.classList.add("text-slate-400");
    });
    tab.classList.add("tab-active");
    tab.classList.remove("text-slate-400");
    const which = tab.dataset.tab;
    ["matrix","leaderboard","riders","upload"].forEach((name) => {
      document.getElementById(`view-${name}`).classList.toggle("hidden", which !== name);
    });
  });
});
</script>
</body>
</html>
"""

if __name__ == "__main__":
    build()
