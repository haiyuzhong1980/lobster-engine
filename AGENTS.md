# Agents Guide — Lobster Engine

## For AI Coding Assistants

### Build & Test

```bash
pnpm install && pnpm build && pnpm test
```

### Adding a New Package

1. Create `packages/{name}/` with `package.json`, `tsconfig.json`, `src/index.ts`
2. Add `@lobster-engine/core` as dependency if needed (`workspace:*`)
3. Add project reference in tsconfig.json
4. Run `pnpm install` to link

### Adding a New Scene Plugin

1. Create `packages/scene-{name}/`
2. Implement `ScenePlugin` interface from `@lobster-engine/core`
3. Export: `parseAction`, `buildPrompt`, `validateAction`, `getDefaultAction`, `formatEvent`

### Adding a New AI Adapter

1. Create `packages/adapter-{name}/`
2. Implement `AdapterProvider` interface from `@lobster-engine/core`
3. Export: `send`, `name`, `platform`

### Adding a New Storage Provider

1. Create `packages/storage-{name}/`
2. Implement `StorageProvider` interface from `@lobster-engine/core`
3. Export: `connect`, `disconnect`, `get`, `set`, `delete`, `health`

### Code Style

- TypeScript strict mode
- No `any`, use `unknown`
- Immutable patterns (spread, not mutation)
- 80%+ test coverage
- Vitest for tests
- ESLint + Prettier
