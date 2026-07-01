# Kowalski

**I have an Instagram addiction, so I built a desktop app that scrolls it for me.** Kowalski browses your stories and feed with Claude vision agents and composes a curated daily digest — you stay in the loop without the endless scroll.

It runs a real Chromium browser via Playwright, drives it with vision agents that "see" the page through screenshots and act with human-like mouse and scroll, then synthesizes everything it captured into a single readable editorial.

## Demo

https://github.com/user-attachments/assets/cd2cd415-29f4-499d-b649-8f1cbbd39fa8

## How it works

A three-agent pipeline. Each agent has one job and they communicate through the filesystem, not in-memory state, so a stuck or slow stage never blocks the others.

1. **Navigator (Phase 1 + 2)** — a vision agent operates the browser in two phases: **Stories** ([StoriesAgent](src/main/services/StoriesAgent.ts)) clicks through unwatched stories and exits when the advance arrow disappears; **Feed** ([FeedAgent](src/main/services/FeedAgent.ts)) scrolls, opens posts and carousels, dismisses popups, and captures until the time budget is spent. Every meaningful frame is dumped as a JPEG into `raw/` with a sidecar JSON of what the agent thought it saw.
2. **Extractor (Phase 2.5)** — [Extractor.ts](src/main/services/Extractor.ts) watches `raw/` and calls a vision model **once per screenshot** to pull structured content (handle, caption, entities, narrative, usefulness score), merged back into the sidecar. Loading screens, ads, and dupes are tagged `usefulness: "skip"` rather than deleted, so nothing is lost and culling is auditable.
3. **Digest writer (Phase 3)** — [DigestGeneration.ts](src/main/services/DigestGeneration.ts) consumes the sidecars as **text only** and composes one markdown editorial. Because all visual work happened upstream, this stage runs on a cheaper text model (Haiku by default).

The whole run is time-bounded (default 90 min max), and [GhostMouse](src/main/services/GhostMouse.ts) + [HumanScroll](src/main/services/HumanScroll.ts) plus a stealth-patched Chromium keep the activity looking like normal browsing.

## Gets better the more you run it

Kowalski keeps a lightweight memory of past sessions via [SessionMemory](src/main/services/SessionMemory.ts). Each completed run adds a compact summary — which accounts produced the most useful captures, which phases paid off, where the agent stalled or recovered — and recent summaries fold into the navigator's context next run. The effect: sharper capture decisions, fewer dead ends, and a navigator tuned to *your* feed. Memory is capped at 20 sessions, costs nothing to maintain (pure file I/O, no LLM calls), and resets with Cmd+Shift+R.

## Tech stack

- **Desktop shell** — Electron 39 with a custom main-process build pipeline
- **Browser automation** — Playwright + `playwright-extra` + `puppeteer-extra-plugin-stealth`
- **Frontend** — React 18, TypeScript, Vite, Tailwind, shadcn/ui, Radix, Framer Motion
- **AI** — Claude API: Sonnet 4.6 for navigation/vision, Haiku 4.5 for text-only digest synthesis
- **Storage** — JSON digest archive on disk, `electron-store` for settings, `safeStorage`-encrypted API key via [SecureKeyManager](src/main/services/SecureKeyManager.ts) (key held in the macOS Keychain)
- **Live preview** — CDP screencast piped to a [LiveScreencast](src/components/LiveScreencast.tsx) React component so you can watch the agent work

## Note

This is the original standalone build. Kowalski was later refactored into a native OpenClaw plugin — [krishnakem/kowalski-openclaw](https://github.com/krishnakem/kowalski-openclaw) — as part of standardizing my agents on one harness.

## Disclaimer

For personal use against your own account. Respect Instagram's terms and rate limits.
