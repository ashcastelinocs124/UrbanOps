# Learnings

### 2026-03-27 -- Map component named `Map` shadows global `Map` constructor
- **What:** When a React component is named `Map` (exported as `default function Map`), using `new Map()` inside it causes a TypeScript error because the component name shadows the global `Map` constructor. TS interprets `new Map()` as trying to call the component with no arguments.
- **Why it matters:** This is a subtle naming collision that produces a confusing error ("Expected 1 arguments, but got 0").
- **Fix/Pattern:** Use `new globalThis.Map<K, V>()` instead of `new Map<K, V>()` inside any component named `Map`. Alternatively, rename the component to something like `CityMap`.
