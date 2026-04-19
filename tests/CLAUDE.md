# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this directory.

## Tests

Vitest + Testing Library + happy-dom (not jsdom).

### Running
```bash
npx vitest run                    # All tests (must use npx, not pnpm)
npx vitest run tests/api/         # API tests only
npx vitest run tests/hooks/useAuth.test.ts  # Single file
```

### Test Structure
- `tests/api/identify.test.ts` — unit tests for `matchCandidates()` (imported from `functions/api/identify.ts`). Tests exact match, fuzzy match, attribute-aware scoring, empty results.
- `tests/hooks/` — hook tests. All mock Supabase client via `vi.mock()`. Mock pattern: chainable builder `{ select: () => chain, eq: () => chain, ... }`.
- `tests/lib/image.test.ts` — image compression utility test.

### Mocking Supabase
Hooks tests use a chainable mock pattern:
```typescript
function mockChain() {
  const chain: Record<string, unknown> = {}
  const self = () => chain
  chain.select = self; chain.eq = self; chain.in = self; chain.or = self; chain.order = self
  chain.then = (resolve) => resolve({ data: mockItems, error: null })
  return chain
}
vi.mock('../../src/lib/supabase', () => ({ supabase: { from: () => mockChain() } }))
```

### Known Issues
- `useCollection.test.ts` logs "Maximum update depth exceeded" warnings (test still passes)
- No integration tests for Cloudflare Functions yet
