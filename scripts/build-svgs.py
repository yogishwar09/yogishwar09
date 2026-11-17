#!/usr/bin/env python3
"""
Motoverse dashboard panels for the GitHub README (self-contained animated SVGs).

  assets/animations/track-divider.svg, footer.svg, speedometer.svg
  assets/panels/about.svg, arsenal.svg, focus.svg, game.svg
  assets/projects/ai-interview-trainer.svg, retainai.svg, smart-ambulance.svg
  assets/icons/github.svg, linkedin.svg

Usage: python3 scripts/build-svgs.py
"""
import json, math, os, textwrap
from xml.sax.saxutils import escape

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
A = os.path.join(ROOT, "assets")
BLACK, CHAR, METAL = "#020403", "#080C09", "#121713"
RACE, ELECTRIC, EMERALD, LIME, WHITE, MUTED = "#00E676", "#39FF14", "#00C853", "#A3FF12", "#F2FFF4", "#8FA295"
DISPLAY = "'Sora','Space Grotesk','Inter','Segoe UI',Helvetica,Arial,sans-serif"
BODY = "'Inter','Segoe UI',Helvetica,Arial,sans-serif"
MONO = "'JetBrains Mono','SFMono-Regular',Consolas,'Liberation Mono',Menlo,monospace"
REDUCED = "<style>@media (prefers-reduced-motion: reduce){*{animation:none!important}}</style>"
SNAP = json.load(open(os.path.join(ROOT, "data", "github-snapshot.json")))


def write(rel, svg):
    p = os.path.join(A, rel); os.makedirs(os.path.dirname(p), exist_ok=True)
    svg = "\n".join(l.strip() for l in svg.strip().splitlines() if l.strip()) + "\n"
    open(p, "w", encoding="utf-8").write(svg)
    print(f"  {rel:40s} {len(svg) / 1024:5.1f} KB")


def head(w, h, title, desc=None):
    return (f'<svg xmlns="http://www.w3.org/2000/svg" width="{w}" height="{h}" viewBox="0 0 {w} {h}" role="img" aria-labelledby="t d">'
            f'<title id="t">{escape(title)}</title><desc id="d">{escape(desc or title)}</desc>{REDUCED}')


DEFS = f'''<defs>
<pattern id="carbon" width="6" height="6" patternUnits="userSpaceOnUse"><rect width="6" height="6" fill="{CHAR}"/><rect width="3" height="3" fill="#0C110D"/><rect x="3" y="3" width="3" height="3" fill="#0C110D"/></pattern>
<linearGradient id="panel" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="{METAL}" stop-opacity=".95"/><stop offset="1" stop-color="{BLACK}" stop-opacity=".95"/></linearGradient>
<linearGradient id="edge" x1="0" x2="2" gradientUnits="objectBoundingBox" spreadMethod="repeat"><stop offset="0" stop-color="{RACE}" stop-opacity=".9"/><stop offset=".25" stop-color="{RACE}" stop-opacity=".12"/><stop offset=".5" stop-color="{RACE}" stop-opacity=".9"/><stop offset=".75" stop-color="{RACE}" stop-opacity=".12"/><stop offset="1" stop-color="{RACE}" stop-opacity=".9"/>
<animateTransform attributeName="gradientTransform" type="translate" from="0 0" to="-1 0" dur="7s" repeatCount="indefinite"/></linearGradient>
<linearGradient id="head" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="{WHITE}" stop-opacity=".07"/><stop offset="1" stop-color="{WHITE}" stop-opacity="0"/></linearGradient>
<linearGradient id="chromeT" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff"/><stop offset=".5" stop-color="#C9D3CD"/><stop offset=".54" stop-color="#18201B"/><stop offset=".58" stop-color="{RACE}"/><stop offset="1" stop-color="#E4EDE7"/></linearGradient>
<filter id="glow" x="-20%" y="-50%" width="140%" height="200%"><feGaussianBlur stdDeviation="3" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
</defs>'''


def frame(w, h, num, title, caption):
    """Superbike-dash panel: carbon base, dark glass, live green edge, numbered title bar."""
    return f'''{DEFS}
<rect width="{w}" height="{h}" rx="12" fill="url(#carbon)"/><rect width="{w}" height="{h}" rx="12" fill="url(#panel)"/>
<rect x="1" y="1" width="{w - 2}" height="{h * .4:.0f}" rx="11" fill="url(#head)"/>
<rect x=".75" y=".75" width="{w - 1.5}" height="{h - 1.5}" rx="12" fill="none" stroke="url(#edge)" stroke-width="1.5"/>
<path d="M0 12 V0 H60" transform="translate(10 10)" fill="none" stroke="{RACE}" stroke-width="2"/>
<path d="M0 -12 V0 H-60" transform="translate({w - 10} {h - 10})" fill="none" stroke="{RACE}" stroke-width="2"/>
<rect x="30" y="30" width="38" height="20" fill="none" stroke="{RACE}"/><text x="49" y="44.5" text-anchor="middle" font-family="{MONO}" font-size="11" fill="{RACE}">{num}</text>
<text x="82" y="47" font-family="{DISPLAY}" font-weight="800" font-size="22" letter-spacing="5" fill="{WHITE}">{escape(title)}</text>
<text x="{w - 30}" y="45" text-anchor="end" font-family="{MONO}" font-size="11" letter-spacing="2" fill="{MUTED}">{escape(caption)}</text>
<circle cx="{w - 30 - len(caption) * 8.7 - 14}" cy="41" r="3.5" fill="{ELECTRIC}"><animate attributeName="opacity" values="1;.2;1" dur="1.6s" repeatCount="indefinite"/></circle>'''


def chips(x, y, labels, maxw, on=None, size=13, h=30):
    out, cx, cy = [], x, y
    for lab in labels:
        w = int(len(lab) * size * .62 + 34)
        if cx + w > x + maxw: cx, cy = x, cy + h + 9
        lit = on is None or lab in on
        out.append(f'<path d="M{cx + 8} {cy} H{cx + w} L{cx + w - 8} {cy + h} H{cx} Z" fill="{RACE}" fill-opacity="{.1 if lit else .02}" stroke="{RACE if lit else MUTED}" stroke-opacity="{.75 if lit else .35}"/>'
                   + (f'<rect x="{cx + 14}" y="{cy + h / 2 - 3}" width="6" height="6" fill="{ELECTRIC}"/>' if lit else f'<rect x="{cx + 14.5}" y="{cy + h / 2 - 2.5}" width="5" height="5" fill="none" stroke="{MUTED}"/>')
                   + f'<text x="{cx + 27}" y="{cy + h / 2 + size * .36}" font-family="{MONO}" font-size="{size}" fill="{WHITE if lit else MUTED}">{escape(lab)}</text>')
        cx += w + 8
    return "".join(out), cy + h


def lines(x, y, text, size, lh, width, fill="#CFDCD3", factor=.52, family=BODY, weight=400):
    ws = textwrap.wrap(text, int(width / (size * factor)))
    return "".join(f'<text x="{x}" y="{y + i * lh}" font-family="{family}" font-weight="{weight}" font-size="{size}" fill="{fill}">{escape(l)}</text>' for i, l in enumerate(ws)), len(ws)


# ── motion pieces ──────────────────────────────────────────────────────────
def divider():
    W, H = 1200, 44
    tr = "".join(f'<rect y="{y}" width="{w}" height="{t}" rx="{t / 2}" fill="url(#trail)" opacity="{o}"><animate attributeName="x" from="-{w}" to="{W}" dur="{d}s" begin="{b}s" repeatCount="indefinite"/></rect>'
                 for y, w, t, o, d, b in ((19, 300, 3, 1, 2.2, 0), (14, 170, 1.5, .55, 3, -1.1), (27, 230, 1.5, .5, 2.6, -.5)))
    write("animations/track-divider.svg", f'''{head(W, H, "Racing-line divider")}
<defs><linearGradient id="trail" x1="0" x2="1"><stop offset="0" stop-color="{RACE}" stop-opacity="0"/><stop offset=".85" stop-color="{ELECTRIC}"/><stop offset="1" stop-color="#fff"/></linearGradient>
<linearGradient id="rail" x1="0" x2="1"><stop offset="0" stop-color="{RACE}" stop-opacity="0"/><stop offset=".5" stop-color="{RACE}" stop-opacity=".5"/><stop offset="1" stop-color="{RACE}" stop-opacity="0"/></linearGradient>
<filter id="g" x="-5%" y="-200%" width="110%" height="500%"><feGaussianBlur stdDeviation="3"/></filter></defs>
<rect width="{W}" height="{H}" rx="8" fill="{BLACK}"/><rect y="21" width="{W}" height="1" fill="url(#rail)"/>
{"".join(f'<rect x="{x}" y="33" width="16" height="2" fill="{RACE}" opacity=".3"/>' for x in range(24, W, 56))}
<g filter="url(#g)">{tr}</g>{tr}</svg>''')


def footer():
    W, H, vx, vy = 1600, 420, 800, 175
    lanes = "".join(f'<line x1="{vx}" y1="{vy}" x2="{vx + dx}" y2="{H}" stroke="{c}" stroke-width="{sw}" stroke-opacity="{o}"/>' for dx, c, sw, o in
                    ((-1100, RACE, 3, .95), (1100, RACE, 3, .95), (-420, WHITE, 1, .1), (420, WHITE, 1, .1)))
    streaks = "".join(f'<path d="M{vx} {vy} L{vx + dx} {H}" stroke="url(#st)" stroke-width="{w}" stroke-linecap="round" stroke-dasharray="40 900" opacity="{o}"><animate attributeName="stroke-dashoffset" from="40" to="-900" dur="{d}s" begin="{b}s" repeatCount="indefinite"/></path>'
                      for dx, w, o, d, b in ((-1250, 4, .9, 1.6, 0), (1250, 4, .9, 1.6, -.8), (-700, 2, .6, 2.1, -.4), (700, 2, .6, 2.1, -1.3), (-1500, 6, .5, 1.3, -.2), (1500, 6, .5, 1.3, -.9)))
    city = "".join(f'<rect x="{x}" y="{vy - h}" width="{w}" height="{h}" fill="#060A07"/>' for x, w, h in
                   ((360, 46, 64), (410, 30, 96), (446, 60, 50), (514, 26, 124), (548, 54, 72), (618, 40, 42), (930, 44, 60), (980, 28, 108), (1014, 62, 70), (1082, 30, 136), (1118, 56, 54), (1180, 38, 86)))
    win = "".join(f'<rect x="{x}" y="{y}" width="3" height="2" fill="{RACE}" opacity=".55"/>' for x, y in ((420, 100), (526, 70), (534, 92), (990, 90), (1092, 60), (1100, 84), (1190, 112), (566, 124)))
    write("animations/footer.svg", f'''{head(W, H, "YOGISHWAR — Code. Ride. Create.", "Night circuit vanishing into a dark city with green LED track edges and moving light trails. Engineering the future.")}
<defs><radialGradient id="hz" cx=".5" cy=".42" r=".5"><stop offset="0" stop-color="#06301A" stop-opacity=".95"/><stop offset="1" stop-color="{BLACK}" stop-opacity="0"/></radialGradient>
<linearGradient id="rd" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#0D130F"/><stop offset="1" stop-color="{CHAR}"/></linearGradient>
<linearGradient id="st" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff"/><stop offset="1" stop-color="{ELECTRIC}"/></linearGradient>
<linearGradient id="ch" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff"/><stop offset=".5" stop-color="#B9C4BE"/><stop offset=".54" stop-color="#18201B"/><stop offset=".58" stop-color="{RACE}"/><stop offset="1" stop-color="#DDE6E0"/></linearGradient>
<linearGradient id="fd" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="{BLACK}" stop-opacity="0"/><stop offset="1" stop-color="{BLACK}" stop-opacity=".85"/></linearGradient>
<filter id="gl" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="6"/></filter></defs>
<rect width="{W}" height="{H}" fill="{BLACK}"/><rect width="{W}" height="{H}" fill="url(#hz)"/>{city}{win}
<polygon points="{vx},{vy} {vx + 1100},{H} {vx - 1100},{H}" fill="url(#rd)"/>
<g filter="url(#gl)">{lanes}</g>{lanes}
<line x1="{vx}" y1="{vy}" x2="{vx}" y2="{H}" stroke="{WHITE}" stroke-opacity=".3" stroke-width="3" stroke-dasharray="6 26"><animate attributeName="stroke-dashoffset" from="0" to="-32" dur=".5s" repeatCount="indefinite"/></line>
<g filter="url(#gl)">{streaks}</g>{streaks}
<rect y="{vy}" width="{W}" height="{H - vy}" fill="url(#fd)"/>
<text x="800" y="98" text-anchor="middle" font-family="{DISPLAY}" font-weight="800" font-size="72" letter-spacing="14" fill="url(#ch)">YOGISHWAR</text>
<text x="800" y="300" text-anchor="middle" font-family="{DISPLAY}" font-weight="700" font-size="34" letter-spacing="10" fill="{WHITE}">CODE. RIDE. <tspan fill="{ELECTRIC}">CREATE.</tspan></text>
<text x="800" y="350" text-anchor="middle" font-family="{MONO}" font-size="15" letter-spacing="6" fill="{MUTED}">ENGINEERING THE FUTURE</text></svg>''')


def speedometer():
    """Animated tachometer whose redline reading is the real 12-month contribution total."""
    total = SNAP["user"]["contributions_last_year"]
    W, H, cx, cy, r = 420, 344, 210, 182, 140
    a0, a1 = math.radians(150), math.radians(390)
    pt = lambda a, rr: (cx + rr * math.cos(a), cy + rr * math.sin(a))
    ticks = []
    for k in range(41):
        a = a0 + (a1 - a0) * k / 40; big = k % 5 == 0
        (x1, y1), (x2, y2) = pt(a, r - (16 if big else 8)), pt(a, r)
        ticks.append(f'<line x1="{x1:.1f}" y1="{y1:.1f}" x2="{x2:.1f}" y2="{y2:.1f}" stroke="{ELECTRIC if k > 32 else WHITE}" stroke-opacity="{.9 if big else .35}" stroke-width="{2 if big else 1}"/>')
        if big:
            tx, ty = pt(a, r - 32)
            ticks.append(f'<text x="{tx:.0f}" y="{ty + 4:.0f}" text-anchor="middle" font-family="{MONO}" font-size="12" fill="{MUTED}">{k // 5 * 10}</text>')
    ang = lambda v: math.degrees(a0 + (a1 - a0) * min(v, 80) / 80)
    write("animations/speedometer.svg", f'''{head(W, H, f"Contribution tachometer reading {total}", "Animated gauge; the needle settles on the real 12-month contribution total.")}
<defs><linearGradient id="g" x1="0" x2="1"><stop offset="0" stop-color="{EMERALD}"/><stop offset=".7" stop-color="{ELECTRIC}"/><stop offset="1" stop-color="{LIME}"/></linearGradient>
<filter id="gl" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="4" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs>
<rect width="{W}" height="{H}" rx="14" fill="{CHAR}"/><rect x=".75" y=".75" width="{W - 1.5}" height="{H - 1.5}" rx="14" fill="none" stroke="{RACE}" stroke-opacity=".3"/>
<circle cx="{cx}" cy="{cy}" r="{r + 10}" fill="{BLACK}" stroke="#1B231E" stroke-width="2"/>
<path d="M{pt(a0, r + 4)[0]:.1f} {pt(a0, r + 4)[1]:.1f} A{r + 4} {r + 4} 0 1 1 {pt(a1, r + 4)[0]:.1f} {pt(a1, r + 4)[1]:.1f}" fill="none" stroke="url(#g)" stroke-width="4" filter="url(#gl)" opacity=".85"/>
{"".join(ticks)}
<g><line x1="{cx}" y1="{cy}" x2="{cx + r - 24}" y2="{cy}" stroke="{WHITE}" stroke-width="3" stroke-linecap="round"/>
<animateTransform attributeName="transform" type="rotate" values="{ang(0)} {cx} {cy};{ang(80)} {cx} {cy};{ang(total)} {cx} {cy};{ang(total + 3)} {cx} {cy};{ang(total)} {cx} {cy}" keyTimes="0;.35;.6;.8;1" dur="4s" fill="freeze"/></g>
<circle cx="{cx}" cy="{cy}" r="10" fill="{RACE}"/>
<text x="{cx}" y="{cy + 54}" text-anchor="middle" font-family="{DISPLAY}" font-weight="800" font-size="40" fill="{WHITE}">{total}</text>
<text x="{cx}" y="{cy + 76}" text-anchor="middle" font-family="{MONO}" font-size="11" letter-spacing="2" fill="{RACE}">CONTRIBUTIONS · 12 MO</text>
<text x="20" y="28" font-family="{MONO}" font-size="11" letter-spacing="2" fill="{MUTED}">×1 · COMMIT TACH</text></svg>''')


# ── panels ─────────────────────────────────────────────────────────────────
def about():
    W, H = 1200, 270
    txt, n = lines(30, 100, "Hey, I'm Yogishwar — a Computer Science and Data Science student passionate about building intelligent systems, exploring AI, and turning ideas into practical technology.", 21, 32, 1120, WHITE)
    c, _ = chips(30, 100 + n * 32 + 18, ["B.Tech CSE · Data Science", "Artificial Intelligence", "Machine Learning", "Software Development", "Cloud Technologies"], 1140)
    write("panels/about.svg", f'''{head(W, H, "About Yogishwar", "Hey, I'm Yogishwar — a Computer Science and Data Science student passionate about building intelligent systems, exploring AI, and turning ideas into practical technology.")}
{frame(W, H, "01", "ABOUT", "RIDER PROFILE")}{txt}{c}</svg>''')


def arsenal():
    W = 1200
    cats = [("PROGRAMMING", ["Python", "Java", "C"], {"Python"}),
            ("DATA", ["SQL", "NoSQL", "Data Science", "Data Analysis"], None),
            ("AI / ML", ["Machine Learning", "Artificial Intelligence", "IBM Granite"], None),
            ("PLATFORMS", ["IBM Cloud", "Git", "GitHub", "Streamlit"], None)]
    bw, out, maxy = (W - 60 - 3 * 14) / 4, [], 0
    for i, (name, items, on) in enumerate(cats):
        x = 30 + i * (bw + 14)
        c, end = chips(x + 16, 128, items, bw - 30, on, size=12, h=28)
        maxy = max(maxy, end)
        out.append(f'<rect x="{x:.0f}" y="76" width="{bw:.0f}" height="{{BH}}" fill="{BLACK}" fill-opacity=".6" stroke="{WHITE}" stroke-opacity=".07"/>'
                   f'<rect x="{x:.0f}" y="76" width="{bw:.0f}" height="2" fill="{RACE}"/>'
                   f'<text x="{x + 16:.0f}" y="108" font-family="{MONO}" font-weight="700" font-size="13" letter-spacing="3" fill="{RACE}">{name}</text>{c}')
    bh = maxy - 76 + 18
    H = 76 + bh + 52
    legend = (f'<rect x="30" y="{H - 34}" width="6" height="6" fill="{ELECTRIC}"/><text x="44" y="{H - 27}" font-family="{MONO}" font-size="11" fill="{MUTED}">used in public repositories</text>'
              f'<rect x="260.5" y="{H - 33.5}" width="5" height="5" fill="none" stroke="{MUTED}"/><text x="274" y="{H - 27}" font-family="{MONO}" font-size="11" fill="{MUTED}">listed skill, not yet in a public repo</text>')
    write("panels/arsenal.svg", f'''{head(W, H, "Technology arsenal: Python, Java, C, SQL, NoSQL, Data Science, Data Analysis, Machine Learning, Artificial Intelligence, IBM Granite, IBM Cloud, Git, GitHub, Streamlit")}
{frame(W, H, "02", "TECHNOLOGY ARSENAL", "LOADOUT")}{"".join(out).replace("{BH}", str(bh))}{legend}</svg>''')


def focus():
    W, H = 1200, 200
    recent = [r["name"] for r in sorted((r for r in SNAP["repos"] if not r["fork"]), key=lambda r: r["pushed_at"], reverse=True)[:2]]
    c, _ = chips(30, 82, ["Artificial Intelligence", "Machine Learning", "Data Science", "Software Development"], 1140)
    write("panels/focus.svg", f'''{head(W, H, "Current focus: AI, Machine Learning, Data Science and software development")}
{frame(W, H, "05", "CURRENT FOCUS", "ON TRACK NOW")}{c}
<text x="30" y="160" font-family="{MONO}" font-size="13" fill="{MUTED}">latest pushes · <tspan fill="{WHITE}">{escape(recent[0])}</tspan> · <tspan fill="{WHITE}">{escape(recent[1])}</tspan> · as of {SNAP["captured_at"]}</text></svg>''')


def game_panel():
    W, H = 1200, 150
    write("panels/game.svg", f'''{head(W, H, "Motoverse: a playable motorcycle game that runs on the real contribution calendar")}
{frame(W, H, "▶", "RIDE THE CONTRIBUTIONS", "PLAYABLE · WEBGL")}
<text x="30" y="96" font-family="{BODY}" font-size="16" fill="#CFDCD3">53 weeks long, 7 weekday lanes wide. Green days raise the terrain and carry commit beams to collect;</text>
<text x="30" y="120" font-family="{BODY}" font-size="16" fill="#CFDCD3">month gates are checkpoints. W/↑ throttle · S/↓ brake · A D/← → steer · R restart.</text></svg>''')


PROJECTS = [
    ("ai-interview-trainer", "P1", "AI INTERVIEW TRAINER PRO", "AGENTIC AI CAREER COACH",
     "AI-powered interview preparation platform built on IBM Granite and IBM Cloud: mock interviews, resume analysis, career roadmaps, interview feedback and PDF reports.",
     ["Python", "Streamlit", "IBM Granite", "watsonx.ai Runtime", "IBM Cloud"], "AI-Interview-Trainer-Pro", "mic"),
    ("retainai", "P2", "RETENTIONIQ", "RETAINAI · CUSTOMER RETENTION · TELECOM CHURN",
     "Turns a telecom churn model into a retention decision platform: explainable risk scores, next-best-action playbooks, impact experiments and governed model releases.",
     ["Python", "XGBoost", "Random Forest", "Streamlit", "FastAPI"], "ai-customer-retention-platform-", "bars"),
    ("smart-ambulance", "P3", "GOLDEN HOUR", "SMART AMBULANCE DISPATCH · HYDERABAD",
     "Real-time emergency dispatch: triage first, then the nearest clinically capable ambulance, offered to its crew with a countdown, routed over real roads and tracked live.",
     ["TypeScript", "React", "Express", "Socket.IO", "MongoDB", "Leaflet"], "golden-hour", "route"),
]


def art(kind, x, y, w, h):
    cx, cy = x + w / 2, y + h / 2
    if kind == "mic":
        rings = "".join(f'<circle cx="{cx}" cy="{cy - 14}" r="{r}" fill="none" stroke="{RACE}" stroke-opacity="{o}"><animate attributeName="r" values="{r};{r + 10};{r}" dur="{d}s" repeatCount="indefinite"/></circle>'
                        for r, o, d in ((44, .8, 3), (62, .45, 4), (80, .2, 5)))
        bars = "".join(f'<rect x="{cx - 120 + i * 10}" y="{cy + 70 - hh / 2:.0f}" width="5" height="{hh:.0f}" rx="2.5" fill="{ELECTRIC if i % 4 else LIME}"><animate attributeName="height" values="{hh:.0f};{hh * .3:.0f};{hh:.0f}" dur="{1 + (i % 5) * .2:.1f}s" repeatCount="indefinite"/></rect>'
                       for i, hh in enumerate([8 + 30 * abs(math.sin(i * .7)) * (1 - abs(i - 12) / 14) for i in range(25)]))
        return rings + f'<circle cx="{cx}" cy="{cy - 14}" r="34" fill="{BLACK}" stroke="{RACE}" stroke-width="2"/><rect x="{cx - 8}" y="{cy - 34}" width="16" height="28" rx="8" fill="{RACE}"/><path d="M{cx - 15} {cy - 14} a15 15 0 0 0 30 0 M{cx} {cy + 1} v8" fill="none" stroke="{RACE}" stroke-width="3"/>' + bars
    if kind == "bars":
        vals, out = [.95, .82, .68, .55, .44, .34, .27], []
        for i, v in enumerate(vals):
            bx, bh = x + 40 + i * 34, 30 + v * 120
            out.append(f'<rect x="{bx}" y="{y + h - 30 - bh:.0f}" width="22" height="{bh:.0f}" fill="#0E1611" stroke="{RACE}" stroke-opacity=".5"/><rect x="{bx}" y="{y + h - 30 - bh:.0f}" width="22" height="3" fill="{ELECTRIC}"/>')
        pts = " ".join(f"{x + 51 + i * 34},{y + h - 46 - (30 + v * 120):.0f}" for i, v in enumerate(vals))
        out.append(f'<polyline points="{pts}" fill="none" stroke="{LIME}" stroke-width="2.5" stroke-dasharray="400" stroke-dashoffset="400" filter="url(#glow)"><animate attributeName="stroke-dashoffset" values="400;0;0;400" keyTimes="0;.4;.85;1" dur="6s" repeatCount="indefinite"/></polyline>')
        out.append(f'<text x="{x + 40}" y="{y + 30}" font-family="{MONO}" font-size="11" fill="{MUTED}">churn risk ↓  retention ↑</text>')
        return "".join(out)
    grid = "".join(f'<line x1="{cx + i * 26}" y1="{y + 40}" x2="{cx + i * 70}" y2="{y + h}" stroke="{WHITE}" stroke-opacity=".07"/>' for i in range(-5, 6))
    grid += "".join(f'<line x1="{x}" y1="{yy}" x2="{x + w}" y2="{yy}" stroke="{WHITE}" stroke-opacity=".06"/>' for yy in (y + 60, y + 90, y + 130, y + 180))
    route = f"M{cx - 110} {y + h - 20} L{cx - 60} {y + 130} L{cx + 20} {y + 130} L{cx + 50} {y + 90} L{cx + 95} {y + 62}"
    pulse = "".join(f'<circle cx="{cx + 95}" cy="{y + 62}" r="6" fill="none" stroke="{ELECTRIC}" stroke-width="2"><animate attributeName="r" values="6;40" dur="2.4s" begin="{b}s" repeatCount="indefinite"/><animate attributeName="opacity" values="1;0" dur="2.4s" begin="{b}s" repeatCount="indefinite"/></circle>' for b in (0, .8, 1.6))
    return grid + f'<path d="{route}" fill="none" stroke="{RACE}" stroke-width="10" stroke-opacity=".18"/><path d="{route}" fill="none" stroke="{ELECTRIC}" stroke-width="3" stroke-dasharray="12 8"><animate attributeName="stroke-dashoffset" from="0" to="-40" dur="1s" repeatCount="indefinite"/></path>{pulse}<circle cx="{cx + 95}" cy="{y + 62}" r="7" fill="{ELECTRIC}"/><g><animateMotion dur="5s" repeatCount="indefinite" path="{route}"/><rect x="-12" y="-8" width="24" height="16" rx="4" fill="{WHITE}"/><rect x="-2" y="-6" width="4" height="12" fill="{RACE}"/><rect x="-6" y="-2" width="12" height="4" fill="{RACE}"/></g><text x="{x + 24}" y="{y + 30}" font-family="{MONO}" font-size="11" fill="{MUTED}">HYDERABAD · LIVE DISPATCH</text>'


def projects():
    for slug, num, title, kicker, desc, tags, repo, kind in PROJECTS:
        W, H, aw = 1200, 360, 420
        tx = aw + 50
        txt, n = lines(tx, 158, desc, 17, 27, W - tx - 40)
        c, end = chips(tx, 158 + n * 27 + 4, tags, W - tx - 40, size=12, h=28)
        write(f"projects/{slug}.svg", f'''{head(W, H, f"{title.title()} — {desc}", desc + " Technologies: " + ", ".join(tags))}
{frame(W, H, num, "FEATURED PROJECT", kicker)}
<rect x="30" y="76" width="{aw}" height="{H - 106}" fill="{BLACK}" stroke="{RACE}" stroke-opacity=".25"/>
<clipPath id="ac"><rect x="30" y="76" width="{aw}" height="{H - 106}"/></clipPath><g clip-path="url(#ac)">{art(kind, 30, 76, aw, H - 106)}</g>
<text x="{tx}" y="126" font-family="{DISPLAY}" font-weight="800" font-size="36" letter-spacing="2" fill="url(#chromeT)">{escape(title)}</text>
<rect x="{tx}" y="138" width="56" height="3" fill="{ELECTRIC}"/>{txt}{c}
<text x="{tx}" y="{H - 36}" font-family="{MONO}" font-size="12" fill="{RACE}">↗ github.com/yogishwar09/{escape(repo)}</text></svg>''')


def icons():
    gh = "M12 .5C5.65.5.5 5.65.5 12a11.5 11.5 0 0 0 7.86 10.92c.58.1.79-.25.79-.56v-2c-3.2.7-3.87-1.37-3.87-1.37-.53-1.33-1.28-1.69-1.28-1.69-1.05-.71.08-.7.08-.7 1.16.08 1.77 1.19 1.77 1.19 1.03 1.77 2.7 1.26 3.36.96.1-.75.4-1.26.73-1.55-2.55-.29-5.24-1.28-5.24-5.68 0-1.26.45-2.28 1.19-3.09-.12-.29-.52-1.46.11-3.04 0 0 .97-.31 3.17 1.18a11 11 0 0 1 5.77 0c2.2-1.49 3.17-1.18 3.17-1.18.63 1.58.23 2.75.11 3.04.74.81 1.19 1.83 1.19 3.09 0 4.41-2.69 5.38-5.26 5.67.41.36.78 1.06.78 2.14v3.17c0 .31.21.67.8.56A11.5 11.5 0 0 0 23.5 12C23.5 5.65 18.35.5 12 .5Z"
    li = "M20.45 20.45h-3.56v-5.57c0-1.33-.03-3.04-1.85-3.04-1.86 0-2.14 1.45-2.14 2.94v5.67H9.34V9h3.41v1.56h.05c.48-.9 1.64-1.85 3.37-1.85 3.6 0 4.27 2.37 4.27 5.46v6.28ZM5.34 7.43a2.06 2.06 0 1 1 0-4.13 2.06 2.06 0 0 1 0 4.13ZM7.12 20.45H3.56V9h3.56v11.45ZM22.22 0H1.77C.79 0 0 .77 0 1.73v20.54C0 23.23.79 24 1.77 24h20.45c.98 0 1.78-.77 1.78-1.73V1.73C24 .77 23.2 0 22.22 0Z"
    for name, path, sub in (("github", gh, "github.com/yogishwar09"), ("linkedin", li, "linkedin.com/in/yogishwarp")):
        W, H = 580, 96
        write(f"icons/{name}.svg", f'''{head(W, H, name.title() + ": " + sub)}{DEFS}
<rect width="{W}" height="{H}" rx="10" fill="url(#carbon)"/><rect width="{W}" height="{H}" rx="10" fill="url(#panel)"/>
<rect x=".75" y=".75" width="{W - 1.5}" height="{H - 1.5}" rx="10" fill="none" stroke="url(#edge)" stroke-width="1.5"/>
<rect x="24" y="24" width="48" height="48" fill="{RACE}" fill-opacity=".1" stroke="{RACE}"/><g transform="translate(36 36)"><path d="{path}" fill="{WHITE}"/></g>
<text x="96" y="48" font-family="{DISPLAY}" font-weight="800" font-size="22" letter-spacing="6" fill="{WHITE}">{name.upper()}</text>
<text x="96" y="70" font-family="{MONO}" font-size="12" fill="{MUTED}">{sub}</text>
<path d="M{W - 60} 36 l14 12 l-14 12" fill="none" stroke="{ELECTRIC}" stroke-width="3"><animate attributeName="opacity" values="1;.3;1" dur="1.6s" repeatCount="indefinite"/></path></svg>''')


if __name__ == "__main__":
    divider(); footer(); speedometer(); about(); arsenal(); focus(); game_panel(); projects(); icons()
