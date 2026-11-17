# YOGISHWAR · MOTOVERSE — review guide

Built locally only. Nothing has been pushed, published or deployed.

## 1. Look at it

| What | How |
|---|---|
| GitHub profile (README) | open `preview.html` (dark theme) or `preview-light.html` |
| Playable game + full profile site | open `game/index.html` in Chrome, Edge or Firefox on a desktop. It runs offline with no libraries and no install. |

The game uses its own small WebGL2 engine (`game/game.js`) instead of Three.js, so it has no dependencies and works from a plain file.

**Controls:** W/↑ throttle · S/↓ brake · A D/← → steer · R restart · Esc exit. On a phone, touch the left or right side of the screen to steer; touching anywhere also accelerates.

**How the game works:** the track *is* the contribution calendar. It's 53 weeks long, with one lane per weekday. Days with contributions light up green, raise the terrain and carry a "commit beam". Riding over a beam collects its real contribution count. Each month boundary has a checkpoint gate. The barrels are game obstacles only and never sit on a day with contributions. The minimap at the bottom is the actual GitHub calendar, with your position marked on it.

## 2. The motorcycle image — please read

No motorcycle photo reached me (I received two messages; neither had an image attached). I also can't produce a photorealistic bike and rider from scratch here. So every bike image in this build is a **render of the game's own 3D model**. It's moody and on-brand, but it's stylised CG, not a photograph.

To switch every hero asset to your real photo:

```bash
python3 scripts/compose-hero.py path/to/your-photo.jpg     # optional: --vanish 0.62,0.55
```

That command rebuilds `hero-banner.png`, `hero-mobile.png`, `rider-background.png` and `riding-animation.gif` from the photo. It applies the Motoverse grade and adds animated green light trails. Only use a photo you own or have the right to publish.

## 3. What's real

All data was checked on 2026-11-17 and is saved in `data/github-snapshot.json`: 9 public repos, 1 follower, 3 stars, 70 contributions, 16 active days, 3-day longest streak, project facts from each repo's README.

- **Commits** shows "—" until the GitHub Action runs, because the API needs the Action's token.
- **RetainAI** is the repo `ai-customer-retention-platform-`, which its README calls **RetentionIQ**. The card shows both names.
- **Smart Ambulance** is the repo **golden-hour**.
- **Connect** has GitHub and LinkedIn only, as the brief asked.

## 4. Folder map

```
README.md                           GitHub profile
preview.html / preview-light.html   local README previews
game/                               the playable Motoverse (index.html, style.css, game.js, assets/contributions.js)
assets/motorcycle/                  hero-banner.png, hero-mobile.png, rider-background.png, riding-animation.gif
assets/contributions/               green-contribution.svg (3D voxel terrain + calendar), contribution-terrain.png
assets/game/game-preview.gif        gameplay with HUD
assets/panels/ projects/ telemetry/ icons/ animations/   dashboard panels, gauges, divider, footer, speedometer
data/github-snapshot.json           verified data
scripts/generate-contributions.py   live GraphQL (with GITHUB_TOKEN) or snapshot -> data assets + game data
scripts/build-svgs.py               panels, projects, divider, footer, speedometer
scripts/capture.mjs                 renders stills/GIF frames from the engine (Playwright + Chrome)
scripts/build-assets.py             grades plates, adds typography, builds GIFs and crops
scripts/compose-hero.py             same, from your photo
scripts/optimize-assets.py          minify + validate (refs, alt text, sizes, SVG safety, game offline)
.github/workflows/update-profile.yml  daily data refresh (inactive until pushed)
```

## 5. Publishing (only with your go-ahead)

1. README: push this folder to the public repo **`yogishwar09/yogishwar09`**. Set Actions → General → Workflow permissions to **Read and write**, then run the workflow once.
2. Game: it needs static hosting, such as GitHub Pages serving `game/`. Once it's live, replace the *"live link goes here"* line in README.md with the real URL.

## 6. Rebuilding

```bash
python3 scripts/generate-contributions.py
python3 scripts/build-svgs.py
node scripts/capture.mjs all .frames          # needs: npm i -D playwright
python3 scripts/build-assets.py .frames
python3 scripts/optimize-assets.py && python3 scripts/build-preview.py
```
