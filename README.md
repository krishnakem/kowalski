# Kowalski

An AI-powered desktop app that automatically browses your Instagram stories and feed, then composes a curated daily digest — so you stay in the loop without the endless scroll.

Kowalski runs a real Chromium browser via Playwright, drives it with Claude vision agents that "see" the page through screenshots and act with human-like mouse and scroll, and then synthesises everything it captured into a single readable editorial.

## How It Works

Kowalski is built around a three-agent pipeline. Each agent has a single job and they communicate through the filesystem rather than in-memory state, so a stuck or slow stage never blocks the others.

1. **Navigator (Phase 1 + 2)** — A vision agent operates the browser. It runs in two phases:
   - **Stories phase** ([StoriesAgent](src/main/services/StoriesAgent.ts)) — clicks through your unwatched stories and exits when the advance arrow disappears.
   - **Feed phase** ([FeedAgent](src/main/services/FeedAgent.ts)) — scrolls the feed, opens posts and carousels, dismisses popups, and captures content until the time budget is spent.
   Every meaningful frame is dumped as a JPEG into a `raw/` directory with a sidecar JSON describing what the agent thought it was looking at.

2. **Extractor (Phase 2.5)** — [Extractor.ts](src/main/services/Extractor.ts) watches `raw/` and, for each new screenshot, calls a vision model **once** to pull out structured content (handle, caption, entities, narrative, usefulness score). The result is merged into the same sidecar JSON. Loading screens, ads, and duplicates are tagged `usefulness: "skip"` rather than deleted, so nothing is lost and you can audit what was culled.

3. **Digest writer (Phase 3)** — [DigestGeneration.ts](src/main/services/DigestGeneration.ts) consumes the sidecars as **text only** and composes a single markdown editorial column. Because all visual extraction happened upstream, this stage runs on a cheaper text model (Haiku by default).

The whole run is time-bounded (configurable, default 90 minutes max), and the agents use [GhostMouse](src/main/services/GhostMouse.ts) and [HumanScroll](src/main/services/HumanScroll.ts) plus a stealth-patched Chromium so the activity blends into normal browsing.

## Tech Stack

- **Desktop shell** — Electron 39 with a custom main-process build pipeline ([scripts/build-electron.mjs](scripts/build-electron.mjs))
- **Browser automation** — Playwright + `playwright-extra` + `puppeteer-extra-plugin-stealth`
- **Frontend** — React 18, TypeScript, Vite, Tailwind CSS, shadcn/ui, Radix primitives, Framer Motion
- **AI** — Claude API (Anthropic) — Sonnet 4.6 for navigation and vision, Haiku 4.5 for text-only digest synthesis
- **Storage** — `better-sqlite3` (local archive of digests), `electron-store` (settings), macOS Keychain / OS keyring via [SecureKeyManager](src/main/services/SecureKeyManager.ts) for the API key
- **Live preview** — CDP screencast piped to a [LiveScreencast](src/components/LiveScreencast.tsx) React component so you can watch the agent work

## Getting Started

### Prerequisites

- Node.js v18+
- npm
- An Anthropic API key (set in-app; stored in the OS keychain)
- For the packaged `.app`: macOS on Apple Silicon (arm64)

### Run the packaged app

```sh
open release/mac-arm64/Kowalski.app
```

The bundle is self-contained — its own Chromium ships inside `Contents/Resources/playwright-browsers/`, so there's nothing to install on the target machine. Because the build is unsigned, the first launch may require right-click → **Open** to bypass Gatekeeper.

### Building the .app

```sh
npm install
npm run dist:dir
```

`dist:dir` ([package.json](package.json)) chains: TypeScript + Vite build → Electron main bundle → [stage Playwright Chromium](scripts/stage-playwright-browsers.mjs) → [generate icon](scripts/generate-icns.mjs) → `electron-builder --mac --dir`. Output lands at `release/mac-arm64/Kowalski.app/`.

Unsigned, unnotarized, arm64 only — for local use, not distribution.

## Configuration

Set your Anthropic API key in the app's **Settings** page — it's stored in the OS keychain via [SecureKeyManager](src/main/services/SecureKeyManager.ts), not in plaintext on disk.

Models are centralised in [src/shared/modelConfig.ts](src/shared/modelConfig.ts) and every one is overridable via environment variable:

| Variable | Stage | Default |
|---|---|---|
| `KOWALSKI_STORIES_MODEL` | Stories navigation | `claude-sonnet-4-6` |
| `KOWALSKI_NAV_MODEL` | Feed navigation | `claude-sonnet-4-6` |
| `KOWALSKI_SPECIALIST_MODEL` | Carousels / stuck recovery | `claude-sonnet-4-6` |
| `KOWALSKI_VISION_MODEL` | In-loop vision calls | `claude-sonnet-4-6` |
| `KOWALSKI_TAGGING_MODEL` | Per-image tagging | `claude-sonnet-4-6` |
| `KOWALSKI_EXTRACTION_MODEL` | Extractor (per-image structured extraction) | `claude-sonnet-4-6` |
| `KOWALSKI_DIGEST_MODEL` | Text-only digest synthesis | `claude-haiku-4-5` |
| `KOWALSKI_ANALYSIS_MODEL` | Insights / analysis generation | `claude-sonnet-4-6` |

## Project Structure

```
src/
├── main/                         # Electron main process
│   ├── main.ts                   # Entry point, window + IPC handlers
│   ├── prompts/                  # Markdown prompts shipped to the agents
│   │   ├── navigator-agent.md
│   │   ├── stories-instructions.md
│   │   ├── feed-instructions.md
│   │   ├── capabilities.md
│   │   └── examples/
│   └── services/
│       ├── Kowalski.ts           # Phase orchestrator (stories → feed)
│       ├── RunManager.ts         # Run lifecycle: start, stop, status
│       ├── BrowserManager.ts     # Playwright lifecycle + CDP screencast
│       ├── BaseVisionAgent.ts    # Abstract screenshot → Claude → act loop
│       ├── StoriesAgent.ts       # Phase 1 — stories
│       ├── FeedAgent.ts          # Phase 2 — feed
│       ├── Extractor.ts          # Phase 2.5 — async per-image extraction
│       ├── DigestGeneration.ts   # Phase 3 — text-only editorial synthesis
│       ├── AnalysisGenerator.ts  # Insights pass over the digest
│       ├── ContentVision.ts      # Shared Claude vision call helpers
│       ├── ImageTagger.ts        # Per-image tagging utilities
│       ├── ScreenshotCollector.ts# raw/ + sidecar writer, session log
│       ├── SessionMemory.ts      # Cross-session memory digest
│       ├── GhostMouse.ts         # Human-like mouse paths (Bezier + jitter)
│       ├── HumanScroll.ts        # Human-like scroll dynamics
│       ├── Scroller.ts           # Lower-level scroll primitives
│       ├── InputForwarder.ts     # Renderer → page keystroke/paste bridge
│       ├── SecureKeyManager.ts   # OS keychain wrapper for API keys
│       ├── UsageService.ts       # Token + cost accounting
│       └── ChromiumVersionHelper.ts
├── components/
│   ├── screens/                  # ZeroState, AgentActive, AnalysisReady, Gazette, Login
│   ├── gazette/                  # Digest rendering (DigestView, SectionCard, ContentItem)
│   ├── LiveScreencast.tsx        # Live CDP screencast viewer
│   ├── modals/, layouts/, ui/, icons/
│   └── ErrorBoundary.tsx
├── pages/                        # Top-level routes (Index, Settings, AnalysisArchive)
├── shared/
│   └── modelConfig.ts            # Centralised LLM model config
└── types/                        # TypeScript type definitions
scripts/                          # Browser setup, icon generation, test:* runners
```

## Stopping a Run

Use **Cmd/Ctrl + Shift + K** (or the Stop button in the active-run screen). Stop is cooperative: the screencast tears down immediately, the active agent sees the stop flag between LLM calls, and the browser closes cleanly without spinning on errors.

## Where Things Live on Disk

- **Captured screenshots + sidecars** — `~/Downloads/kowalski-debug/<run>/raw/{stories,feed}/`
- **Generated digests** — local SQLite database managed by `better-sqlite3`, surfaced through the **Archive** page
- **Settings** — `electron-store` JSON
- **API key** — OS keychain (macOS Keychain / Windows Credential Vault / libsecret)
- **Browser profile** — dedicated Chromium profile created by `npm run setup:browser`
