#!/usr/bin/env python3
"""
Real GitHub data -> every data-driven Motoverse asset.

  game/assets/contributions.js               data the 3D game is built from
  assets/contributions/green-contribution.svg 3D voxel racing terrain + flat calendar
  assets/telemetry/telemetry.svg             gauge cluster: repos, stars, followers, contributions, commits, streaks
  assets/telemetry/languages.svg             language distribution bar

Data source: GITHUB_TOKEN set -> live GraphQL (the GitHub Action); otherwise
data/github-snapshot.json (verified snapshot). Nothing is estimated; a metric the
source can't provide is drawn as "—".

Usage: python3 scripts/generate-contributions.py [--user yogishwar09] [--offline]
"""
import argparse, datetime as dt, json, math, os, urllib.request
from xml.sax.saxutils import escape

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SNAP = os.path.join(ROOT, "data", "github-snapshot.json")
BLACK, CHAR, METAL = "#020403", "#080C09", "#121713"
RACE, ELECTRIC, EMERALD, LIME, WHITE, MUTED = "#00E676", "#39FF14", "#00C853", "#A3FF12", "#F2FFF4", "#8FA295"
LV = ["#141A16", "#0B5D2D", "#00A046", "#00E676", "#A3FF12"]
DISPLAY = "'Sora','Space Grotesk','Inter','Segoe UI',Helvetica,Arial,sans-serif"
MONO = "'JetBrains Mono','SFMono-Regular',Consolas,'Liberation Mono',Menlo,monospace"
REDUCED = "<style>@media (prefers-reduced-motion: reduce){*{animation:none!important}}</style>"

QUERY = """query($login:String!){ user(login:$login){ followers{totalCount} following{totalCount}
  repositories(first:100, ownerAffiliations:OWNER, privacy:PUBLIC, orderBy:{field:CREATED_AT,direction:ASC}){ totalCount
    nodes{ name description isFork stargazerCount createdAt pushedAt primaryLanguage{name} languages(first:10){edges{size node{name}}} } }
  contributionsCollection{ totalCommitContributions contributionCalendar{ totalContributions weeks{ contributionDays{ date contributionCount } } } } } }"""


def fetch_live(login, token):
    req = urllib.request.Request("https://api.github.com/graphql", data=json.dumps({"query": QUERY, "variables": {"login": login}}).encode(),
                                 headers={"Authorization": f"bearer {token}", "Content-Type": "application/json"})
    data = json.load(urllib.request.urlopen(req, timeout=30))
    if "errors" in data:
        raise RuntimeError(data["errors"])
    u = data["data"]["user"]
    repos, lb = [], {}
    for r in u["repositories"]["nodes"]:
        repos.append({"name": r["name"], "language": (r["primaryLanguage"] or {}).get("name"), "stars": r["stargazerCount"], "fork": r["isFork"],
                      "created_at": r["createdAt"][:10], "pushed_at": r["pushedAt"][:10], "description": r["description"]})
        if not r["isFork"]:
            for e in r["languages"]["edges"]:
                lb[e["node"]["name"]] = lb.get(e["node"]["name"], 0) + e["size"]
    cal = u["contributionsCollection"]["contributionCalendar"]
    days = [d for w in cal["weeks"] for d in w["contributionDays"]]
    return {"_note": "Generated from the GitHub GraphQL API.", "captured_at": dt.date.today().isoformat(),
            "user": {"login": login, "public_repos": u["repositories"]["totalCount"], "followers": u["followers"]["totalCount"],
                     "following": u["following"]["totalCount"], "stars_received": sum(r["stars"] for r in repos if not r["fork"]),
                     "contributions_last_year": cal["totalContributions"],
                     "total_commits_last_year": u["contributionsCollection"]["totalCommitContributions"]},
            "repos": repos, "language_bytes": lb, "calendar_start": days[0]["date"], "calendar_end": days[-1]["date"],
            "contributions": {d["date"]: d["contributionCount"] for d in days if d["contributionCount"]}}


def counts_of(snap):
    a, b = dt.date.fromisoformat(snap["calendar_start"]), dt.date.fromisoformat(snap["calendar_end"])
    return a, [snap["contributions"].get((a + dt.timedelta(i)).isoformat(), 0) for i in range((b - a).days + 1)]


def streaks(c):
    longest = run = 0
    for n in c:
        run = run + 1 if n else 0
        longest = max(longest, run)
    i, cur = len(c) - 1 - (0 if c and c[-1] else 1), 0
    while i >= 0 and c[i]:
        cur, i = cur + 1, i - 1
    return longest, cur


def level(n, mx):
    return 0 if n <= 0 else 1 + min(3, int(4 * math.sqrt(n / mx) - 1e-9))


def shade(h, f):
    r, g, b = (int(h[i:i + 2], 16) for i in (1, 3, 5))
    return "#%02X%02X%02X" % tuple(max(0, min(255, int(v * f))) for v in (r, g, b))


def terrain_svg(snap, start, c):
    W, H = 1200, 624
    wd0 = (start.weekday() + 1) % 7
    weeks = math.ceil((len(c) + wd0) / 7)
    mx = max(c + [1])
    WV, DV = (16.2, -3.6), (9.4, 7.6)   # dimetric: weeks run right/up, weekdays toward the viewer
    ox, oy = 150, 360
    P = lambda w, d, z=0: (ox + w * WV[0] + d * DV[0], oy + w * WV[1] + d * DV[1] - z)
    pts = lambda *q: " ".join(f"{x:.1f},{y:.1f}" for x, y in q)
    cells = []
    for i, n in enumerate(c):
        k = i + wd0
        cells.append((k // 7, k % 7, start + dt.timedelta(i), n))
    cells.sort(key=lambda t: P(t[0] + .5, t[1] + .5)[1])
    g, out = .08, []
    for w, d, day, n in cells:
        lv = level(n, mx)
        h = 3 if n == 0 else 10 + 120 * math.sqrt(n / mx)
        a0, a1, b0, b1 = w + g, w + 1 - g, d + g, d + 1 - g
        top = pts(P(a0, b0, h), P(a1, b0, h), P(a1, b1, h), P(a0, b1, h))
        front = pts(P(a0, b1, h), P(a1, b1, h), P(a1, b1), P(a0, b1))
        left = pts(P(a0, b0, h), P(a0, b1, h), P(a0, b1), P(a0, b0))
        col = LV[lv]
        if n == 0:
            out.append(f'<polygon points="{front}" fill="#0B100D"/><polygon points="{top}" fill="#121915" stroke="#1F2B24" stroke-width=".6"/>')
        else:
            tip = f"{day.isoformat()}: {n} contribution{'s' if n != 1 else ''}"
            out.append(f'<g class="b"><title>{tip}</title><polygon points="{left}" fill="{shade(col, .3)}"/><polygon points="{front}" fill="{shade(col, .55)}"/>'
                       f'<polygon points="{top}" fill="{col}" stroke="{LIME}" stroke-width="1.1" filter="url(#glow)"/></g>')
    # racing line + checker start/finish
    sx0, sy0 = P(0, 3.5); sx1, sy1 = P(weeks, 3.5)
    track = f'<line x1="{sx0:.0f}" y1="{sy0:.0f}" x2="{sx1:.0f}" y2="{sy1:.0f}" stroke="{WHITE}" stroke-opacity=".25" stroke-width="1.2" stroke-dasharray="7 9"><animate attributeName="stroke-dashoffset" from="0" to="-32" dur="1s" repeatCount="indefinite"/></line>'
    edges = "".join(f'<line x1="{P(0, d)[0]:.0f}" y1="{P(0, d)[1]:.0f}" x2="{P(weeks, d)[0]:.0f}" y2="{P(weeks, d)[1]:.0f}" stroke="{RACE}" stroke-width="2" filter="url(#glow)" opacity=".9"/>' for d in (0, 7))
    # month labels on the far edge
    labels, seen = [], set()
    for w, d, day, n in sorted(cells):
        if day.day <= 7 and (day.year, day.month) not in seen:
            seen.add((day.year, day.month)); x, y = P(w, -.5)
            labels.append(f'<text x="{x:.0f}" y="{y:.0f}" font-family="{MONO}" font-size="11" fill="{MUTED}" transform="rotate(-12.5 {x:.0f} {y:.0f})">{day.strftime("%b").upper()}</text>')
    # flat calendar strip (instantly recognisable as a GitHub graph)
    flat, cw = [], 14
    fx0, fy0 = (W - weeks * cw) / 2, 482
    for w, d, day, n in cells:
        flat.append(f'<rect x="{fx0 + w * cw:.1f}" y="{fy0 + d * cw}" width="{cw - 3}" height="{cw - 3}" rx="2.5" fill="{LV[level(n, mx)]}"/>')
    total = snap["user"]["contributions_last_year"]
    busiest = max(range(len(c)), key=lambda i: c[i])
    longest, _ = streaks(c)
    legend = "".join(f'<rect x="{1040 + i * 18}" y="40" width="13" height="13" rx="2.5" fill="{LV[i]}"/>' for i in range(5))
    return f'''<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{H}" viewBox="0 0 {W} {H}" role="img" aria-labelledby="t d">
<title id="t">Green racing terrain built from the real GitHub contribution calendar</title>
<desc id="d">{total} contributions from {snap["calendar_start"]} to {snap["calendar_end"]}; busiest day {start + dt.timedelta(busiest)} with {c[busiest]}; longest streak {longest} days. Captured {snap["captured_at"]}.</desc>
{REDUCED}<style>.b{{animation:pulse 3.2s ease-in-out infinite}} @keyframes pulse{{50%{{opacity:.82}}}}</style>
<defs>
  <filter id="glow" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="2.2" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
  <radialGradient id="bg" cx=".55" cy=".5" r=".7"><stop offset="0" stop-color="#0A1A10"/><stop offset="1" stop-color="{BLACK}"/></radialGradient>
  <linearGradient id="scan" x1="0" x2="1"><stop offset="0" stop-color="{RACE}" stop-opacity="0"/><stop offset=".5" stop-color="{RACE}" stop-opacity=".12"/><stop offset="1" stop-color="{RACE}" stop-opacity="0"/></linearGradient>
</defs>
<rect width="{W}" height="{H}" rx="14" fill="url(#bg)"/>
<rect x=".75" y=".75" width="{W - 1.5}" height="{H - 1.5}" rx="14" fill="none" stroke="{RACE}" stroke-opacity=".3"/>
<text x="36" y="50" font-family="{MONO}" font-size="12" letter-spacing="3" fill="{MUTED}">CONTRIBUTION CIRCUIT · LAST 12 MONTHS · REAL GITHUB DATA</text>
<text x="36" y="96" font-family="{DISPLAY}" font-weight="800" font-size="40" fill="{WHITE}">{total}<tspan font-size="14" font-family="{MONO}" fill="{RACE}" dx="10" letter-spacing="2">CONTRIBUTIONS</tspan></text>
<text x="1012" y="51" font-family="{MONO}" font-size="11" fill="{MUTED}" text-anchor="end">less</text>{legend}<text x="1134" y="51" font-family="{MONO}" font-size="11" fill="{MUTED}">more</text>
{edges}{"".join(out)}{track}{"".join(labels)}
<rect class="sweep" x="-300" y="120" width="300" height="340" fill="url(#scan)"><animate attributeName="x" from="-300" to="{W}" dur="5s" repeatCount="indefinite"/></rect>
{"".join(flat)}
<text x="{fx0:.0f}" y="{fy0 + 7 * cw + 22}" font-family="{MONO}" font-size="11" fill="{MUTED}">github.com/{escape(snap["user"]["login"])} · contribution calendar · updated {snap["captured_at"]}</text>
</svg>'''


def telemetry_svg(snap, c):
    u = snap["user"]
    longest, cur = streaks(c)
    commits = u.get("total_commits_last_year")
    g = [("PUBLIC REPOS", u["public_repos"], 20, "incl. 1 fork" if any(r["fork"] for r in snap["repos"]) else ""),
         ("STARS EARNED", u["stars_received"], 20, "own repos"),
         ("FOLLOWERS", u["followers"], 20, f'following {u["following"]}'),
         ("CONTRIBUTIONS", u["contributions_last_year"], 365, "12 months"),
         ("COMMITS", commits if commits is not None else "—", 365, "12 months" if commits is not None else "after first Action run"),
         ("LONGEST STREAK", f"{longest}d", 30, "consecutive days"),
         ("CURRENT STREAK", f"{cur}d", 30, "consecutive days")]
    W, H, gw = 1200, 250, 1200 / 7
    out = []
    for i, (lab, val, mx, sub) in enumerate(g):
        cx, cy, r = i * gw + gw / 2, 128, 56
        num = val if isinstance(val, (int, float)) else (int(val[:-1]) if str(val)[:-1].isdigit() else 0)
        f = min(1, num / mx) if mx else 0
        a0, a1 = math.radians(150), math.radians(390)
        a = a0 + (a1 - a0) * f
        arc = lambda aa, bb: f"M{cx + r * math.cos(aa):.1f} {cy + r * math.sin(aa):.1f} A{r} {r} 0 {1 if bb - aa > math.pi else 0} 1 {cx + r * math.cos(bb):.1f} {cy + r * math.sin(bb):.1f}"
        ticks = "".join(f'<line x1="{cx + (r + 9) * math.cos(t):.1f}" y1="{cy + (r + 9) * math.sin(t):.1f}" x2="{cx + (r + 14) * math.cos(t):.1f}" y2="{cy + (r + 14) * math.sin(t):.1f}" stroke="{MUTED}" stroke-opacity=".5"/>'
                        for t in [a0 + (a1 - a0) * k / 8 for k in range(9)])
        fill = (f'<path d="{arc(a0, max(a, a0 + .02))}" fill="none" stroke="url(#arc)" stroke-width="9" stroke-linecap="round" filter="url(#glow)" stroke-dasharray="400" stroke-dashoffset="400">'
                f'<animate attributeName="stroke-dashoffset" from="400" to="0" dur="1.6s" begin="{i * .12:.2f}s" fill="freeze"/></path>') if f > 0 else ""
        needle_x, needle_y = cx + (r - 14) * math.cos(a), cy + (r - 14) * math.sin(a)
        out.append(f'''<g><path d="{arc(a0, a1)}" fill="none" stroke="#1B231E" stroke-width="9" stroke-linecap="round"/>{fill}{ticks}
<line x1="{cx}" y1="{cy}" x2="{needle_x:.1f}" y2="{needle_y:.1f}" stroke="{WHITE}" stroke-width="2"/><circle cx="{cx}" cy="{cy}" r="4" fill="{RACE}"/>
<text x="{cx}" y="{cy + 42}" text-anchor="middle" font-family="{DISPLAY}" font-weight="800" font-size="28" fill="{WHITE}">{escape(str(val))}</text>
<text x="{cx}" y="{cy + 64}" text-anchor="middle" font-family="{MONO}" font-size="10.5" letter-spacing="1.5" fill="{RACE}">{lab}</text>
<text x="{cx}" y="{cy + 80}" text-anchor="middle" font-family="{MONO}" font-size="9.5" fill="{MUTED}">{escape(sub)}</text></g>''')
    return f'''<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{H}" viewBox="0 0 {W} {H}" role="img" aria-labelledby="t">
<title id="t">GitHub telemetry as of {snap["captured_at"]}: {", ".join(f"{a.lower()} {b}" for a, b, *_ in g)}</title>{REDUCED}
<defs><linearGradient id="arc" x1="0" x2="1"><stop offset="0" stop-color="{EMERALD}"/><stop offset=".7" stop-color="{ELECTRIC}"/><stop offset="1" stop-color="{LIME}"/></linearGradient>
<filter id="glow" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="3" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs>
<rect width="{W}" height="{H}" rx="14" fill="{CHAR}"/><rect x=".75" y=".75" width="{W - 1.5}" height="{H - 1.5}" rx="14" fill="none" stroke="{RACE}" stroke-opacity=".3"/>
<text x="28" y="34" font-family="{MONO}" font-size="12" letter-spacing="3" fill="{MUTED}">GITHUB TELEMETRY · SOURCE: GITHUB API · {snap["captured_at"]}</text>
{"".join(out)}</svg>'''


def languages_svg(snap):
    if snap.get("language_bytes"):
        data, basis = snap["language_bytes"], "BY BYTES OF CODE"
    else:
        data, basis = {}, "BY PRIMARY LANGUAGE OF ORIGINAL REPOS"
        for r in snap["repos"]:
            if not r["fork"] and r["language"]:
                data[r["language"]] = data.get(r["language"], 0) + 1
    tot = sum(data.values()) or 1
    items = sorted(data.items(), key=lambda kv: -kv[1])[:6]
    cols = [RACE, LIME, EMERALD, ELECTRIC, "#0B8A43", "#5FD08F"]
    W, H, x, bar, leg = 1200, 120, 28.0, [], []
    for i, (k, v) in enumerate(items):
        w = (W - 56) * v / tot
        bar.append(f'<rect x="{x:.1f}" y="46" width="{max(w - 3, 2):.1f}" height="16" rx="3" fill="{cols[i]}"/>'); x += w
        leg.append(f'<rect x="{28 + i * 190}" y="84" width="10" height="10" rx="2" fill="{cols[i]}"/><text x="{44 + i * 190}" y="93" font-family="{MONO}" font-size="13" fill="{WHITE}">{escape(k)} <tspan fill="{MUTED}">{100 * v / tot:.1f}%</tspan></text>')
    return f'''<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{H}" viewBox="0 0 {W} {H}" role="img" aria-labelledby="t">
<title id="t">Languages {basis.lower()}: {", ".join(f"{k} {100 * v / tot:.0f}%" for k, v in items)}</title>
<rect width="{W}" height="{H}" rx="14" fill="{CHAR}"/><rect x=".75" y=".75" width="{W - 1.5}" height="{H - 1.5}" rx="14" fill="none" stroke="{RACE}" stroke-opacity=".3"/>
<text x="28" y="32" font-family="{MONO}" font-size="12" letter-spacing="3" fill="{MUTED}">LANGUAGES · {basis} · {snap["captured_at"]}</text>
<rect x="28" y="46" width="{W - 56}" height="16" rx="3" fill="#141A16"/>{"".join(bar)}{"".join(leg)}</svg>'''


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--user", default="yogishwar09")
    ap.add_argument("--offline", action="store_true")
    a = ap.parse_args()
    token = os.environ.get("GITHUB_TOKEN")
    snap = None
    if token and not a.offline:
        try:
            snap = fetch_live(a.user, token)
            json.dump(snap, open(SNAP, "w"), indent=2)
            print("live data fetched")
        except Exception as e:
            print("live fetch failed, keeping snapshot:", e)
    if snap is None:
        snap = json.load(open(SNAP))
        print("using snapshot", snap["captured_at"])
    start, c = counts_of(snap)
    if sum(c) != snap["user"]["contributions_last_year"]:
        print("warning: calendar total differs from reported total (private contributions are not in the calendar)")
    game = {"calendar_start": snap["calendar_start"], "calendar_end": snap["calendar_end"], "captured_at": snap["captured_at"],
            "counts": c, "user": snap["user"], "repos": snap["repos"], "language_bytes": snap.get("language_bytes")}
    outs = {
        "game/assets/contributions.js": "window.MOTOVERSE_DATA = " + json.dumps(game, separators=(",", ":")) + ";\n",
        "assets/contributions/green-contribution.svg": terrain_svg(snap, start, c),
        "assets/telemetry/telemetry.svg": telemetry_svg(snap, c),
        "assets/telemetry/languages.svg": languages_svg(snap),
    }
    for rel, text in outs.items():
        p = os.path.join(ROOT, rel); os.makedirs(os.path.dirname(p), exist_ok=True)
        open(p, "w", encoding="utf-8").write(text)
        print(f"  {rel}  {len(text) / 1024:.1f} KB")


if __name__ == "__main__":
    main()
