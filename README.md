# MovScript Lang

MovScript Lang defines the AI film production language, compiler, and workspace artifacts.

The project is intentionally separate from the MovScript application shell. Its job is to stabilize the core production semantics first:

- editable source files
- domain IR
- diagnostics
- dependency and impact analysis
- generation planning
- external resource candidate boundaries
- stable artifacts and publishing

The repository uses the `@movscript/*` npm scope.

## Packages

- `@movscript/language`: source schemas, domain IR, schema registry, and diagnostics.
- `@movscript/decision`: candidate selection and lock semantics consumed by the compiler.
- `@movscript/workspace`: workspace facade for layout, repositories, source/build stores, decision persistence, node adapters, and workspace services.
- `@movscript/compiler`: compiler-facing facade for overview, inspect, compile, regeneration planning, artifact emission, and build semantics.
- `@movscript/engine`: embeddable facade that composes workspace, compiler, stores, and candidate workflows.

The language package does not provide plugins, does not expose MCP, does not call generation providers, and does not depend on a backend. External services can generate resources separately and write candidates back into the workspace without leaking integration assumptions into the language layer.

## Commands

```sh
pnpm install
pnpm build
pnpm typecheck
pnpm test
```

## Command Adapters

This repository no longer publishes a CLI package. User-facing commands live in `movscript/apps/cli` as `movcli`, while desktop shells and other adapters should call the same engine/workspace/compiler APIs exposed here.

Compiler behavior lives in `@movscript/compiler`; `@movscript/engine` wires it to the node workspace. The compiler workflow follows the user's editing loop:

- `overview`: show the workspace state, last build state, pending edits, stale generated outputs, and next actions.
- `inspect`: show what changed since the last successful build, diagnostics, and predicted impact without writing build artifacts.
- `compile`: accept the current source as the next stable build snapshot and write deterministic artifacts.
- `regen plan`: after compile, show prompt bundles and generated outputs that may need regeneration.
