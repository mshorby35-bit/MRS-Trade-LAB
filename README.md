# NFL Trade Lab V9

A dependency-free Node.js fantasy football trade calculator.

## What works

- Live player catalog from Sleeper's NFL player endpoint
- Current FantasyCalc market values for Redraft/Dynasty, 1QB/Superflex, 10/12/14 teams, and PPR/Half/Standard
- Current-season player stats from Sleeper's stats feed when available
- Searchable QB/RB/WR/TE player pool
- 1-for-1 through 6-for-6 trades
- Position-specific player stat cards
- ESPN headshots with Sleeper image fallback
- NFL player profile links
- League setting dropdown
- Trade-balance field, plain X marker, raw/adjusted/difference tooltips
- Consolidation adjustment for multi-player packages
- Source/freshness indicators
- Offline fallback snapshot if live sources are unavailable

## Run locally

1. Install Node.js 18 or newer.
2. Open Terminal in this folder.
3. Run:

   node server.js

4. Open:

   http://localhost:3000

No `npm install` is required.

## Data methodology

The displayed model score blends:
- 75% current FantasyCalc market value
- 20% current-season production within the player's position
- 5% 30-day FantasyCalc trend

The market portion is normalized relative to the highest market value in the selected league format.

For packages with multiple assets, the current consolidation weights are:
- best asset: 100%
- second asset: 94%
- third asset: 88%
- fourth and later: 82%

This is intentionally transparent and easy to tune in `server.js`.

## Data-source notes

- Sleeper's documented player directory is used for the active player pool.
- The Sleeper season-stats feed is used for stat cards when it responds; it is not part of Sleeper's currently documented public API, so the app has a fallback.
- FantasyCalc's current-value endpoint powers market value and trend.
- ESPN player IDs are used for headshot URLs where available, with Sleeper CDN fallback.
- NFL profile links are generated from player names.

Before launching this as a commercial public service, review the source providers' current terms/licensing, especially Sleeper's commercial-use language and FantasyCalc's terms.

## Production deployment

The app is deliberately dependency-free and can be deployed on a basic Node host (Render, Railway, Fly.io, a VPS, etc.).
For a production launch, add:
- persistent Redis/database caching
- rate limiting
- error monitoring
- a scheduled player-map refresh
- an API-provider/license review
- tests for upstream response-shape changes


## Render deployment

This package includes `render.yaml`. See `DEPLOY_TO_RENDER.md` for the exact public-hosting steps.
