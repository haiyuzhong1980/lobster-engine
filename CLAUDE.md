# Lobster Engine

## What is this?

Lobster Engine is the OpenClaw Bot Engine — a pluggable AI bot runtime for games, customer service, and automation. It uses NATS message bus + Worker Pool architecture, designed for 1M+ concurrent bots.

## Architecture

- **Monorepo**: pnpm workspace + Turborepo
- **Language**: TypeScript (strict mode)
- **Runtime**: Node.js 20+
- **Test**: Vitest
- **Lint**: ESLint 9 (flat config) + Prettier

## Package Structure

```
packages/
├── core/              # Engine core: types, interfaces, LobsterEngine class
├── cli/               # CLI tool: lobster-engine command
├── gateway/           # API Gateway: REST / WebSocket / SSE / MCP
├── storage-sqlite/    # Default storage (zero-dependency)
├── storage-redis/     # Production hot state
├── storage-postgres/  # Cold data storage
├── adapter-openclaw/  # OpenClaw AI platform adapter
├── adapter-coze/      # Coze AI platform adapter
├── adapter-dify/      # Dify AI platform adapter
├── adapter-direct/    # Direct LLM (OpenAI-compatible)
├── scene-werewolf/    # Werewolf game scene plugin
```

## Key Interfaces

- `StorageProvider` — pluggable storage (get/set/delete/query)
- `AdapterProvider` — AI platform adapter (send messages to LLM)
- `ScenePlugin` — scene plugin (game/service/automation logic)
- `LobsterEngine` — main engine class (start/stop/use)

## Commands

```bash
pnpm install          # Install dependencies
pnpm build            # Build all packages
pnpm test             # Run all tests
pnpm lint             # Lint all packages
pnpm typecheck        # Type check all packages
pnpm format           # Format all source files
```

## Conventions

- Immutable data: never mutate, always return new objects
- Error handling: explicit at every level, no silent swallowing
- File size: <400 lines typical, <800 max
- Test coverage: 80%+ required
- No `any` — use `unknown` and narrow
- No `console.log` — use structured logger (pino)
