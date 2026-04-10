# Kowalski

An AI-powered desktop app that automatically browses your Instagram stories and feed, then generates a curated daily digest — so you stay in the loop without the endless scroll.

## How It Works

Kowalski uses Claude vision agents to operate a real browser, mimicking human behavior as it navigates Instagram:

1. **Stories Phase** — An agent clicks through your unwatched stories, capturing screenshots as it goes
2. **Feed Phase** — A second agent scrolls your feed, opens posts and carousels, and captures content
3. **Digest Phase** — All captured screenshots are synthesized into a readable, categorized digest

The entire run is time-bounded (configurable), and the agents use human-like mouse movements, scrolling, and randomized fingerprints to blend in.

## Tech Stack

- **Desktop**: Electron + Playwright (browser automation)
- **Frontend**: React, TypeScript, Tailwind CSS, shadcn/ui
- **AI**: Claude API (Anthropic) — Sonnet 4.6 for navigation and vision
- **Storage**: better-sqlite3 (local database), Electron Store (settings)
- **Build**: Vite, electron-builder

## Getting Started

### Prerequisites

- Node.js (v16+)
- npm
- An Anthropic API key

### Install & Run

```sh
# Install dependencies
npm install

# One-time browser setup
npm run setup:browser

# Start the dev app (Vite + Electron with hot reload)
npm run electron:dev
```

### Other Commands

```sh
npm run dev              # Vite dev server only (no Electron)
npm run build            # Production build
npm run electron:build   # Package for distribution (.dmg, .exe, .AppImage)
npm run lint             # Run ESLint
```

## Configuration

Set your Anthropic API key in the app's Settings page. You can also override models per-phase via environment variables:

| Variable | Phase | Default |
|---|---|---|
| `KOWALSKI_STORIES_MODEL` | Stories browsing | `claude-sonnet-4-6` |
| `KOWALSKI_NAV_MODEL` | Feed browsing | `claude-sonnet-4-6` |
| `KOWALSKI_SPECIALIST_MODEL` | Carousel/stuck recovery | `claude-sonnet-4-6` |
| `KOWALSKI_VISION_MODEL` | Content extraction | `claude-sonnet-4-6` |
| `KOWALSKI_DIGEST_MODEL` | Digest synthesis | `claude-sonnet-4-6` |
| `KOWALSKI_ANALYSIS_MODEL` | Insights generation | `claude-sonnet-4-6` |

## Project Structure

```
src/
├── main/                   # Electron main process
│   ├── main.ts             # Entry point, IPC handlers
│   ├── services/
│   │   ├── Kowalski.ts     # Master orchestrator (phases 1→2→3)
│   │   ├── BaseVisionAgent.ts  # Abstract agent: screenshot→Claude→act loop
│   │   ├── StoriesAgent.ts     # Phase 1 — stories navigation
│   │   ├── FeedAgent.ts        # Phase 2 — feed navigation
│   │   ├── BrowserManager.ts   # Playwright browser lifecycle
│   │   ├── DigestGeneration.ts # Phase 3 — digest synthesis
│   │   ├── GhostMouse.ts      # Human-like mouse movements
│   │   └── ...
│   └── prompts/            # Agent instruction prompts (markdown)
├── components/             # React UI
│   ├── screens/            # Main app states (zero, active, ready, gazette)
│   └── gazette/            # Digest rendering
├── pages/                  # Routes (home, settings, archive)
├── shared/
│   └── modelConfig.ts      # Centralized LLM model config
└── types/                  # TypeScript type definitions
```

