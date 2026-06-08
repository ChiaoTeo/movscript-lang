# MovScript Lang

MovScript Lang defines the AI film production language, compiler, and controlled runtime.

The project is intentionally separate from the MovScript application shell. Its job is to stabilize the core production semantics first:

- editable source files
- domain IR
- diagnostics
- dependency and impact analysis
- generation planning
- runtime execution boundaries
- stable artifacts and publishing

The repository uses the `@movscript/*` npm scope.

## Packages

- `@movscript/language`: source schemas, domain IR, schema registry, and diagnostics.
- `@movscript/decision`: candidate selection and lock semantics consumed by the compiler.
- `@movscript/workspace`: workspace facade for layout, repositories, source/build stores, decision persistence, node adapters, and workspace services.
- `@movscript/compiler`: compiler-facing facade for review, compile, artifact emission, and build semantics.
- `@movscript/runtime`: runtime-facing facade for generation provider contracts, jobs, attempts, and candidate outputs.
- `@movscript/engine`: embeddable facade that composes workspace, compiler, runtime, stores, and provider hooks.
- `@movscript/service`: optional service-facing host facade for engine workflows.
- `@movscript/cli`: CLI entrypoint for inspecting and running engine workflows.

The language package does not provide plugins, does not expose MCP, and does not depend on a backend. AI generation is represented through provider contracts so concrete services can implement execution without leaking integration assumptions into the language layer.

## Commands

```sh
pnpm install
pnpm build
pnpm typecheck
pnpm test
```

## Local install

Install the CLI on this machine:

```sh
pnpm run install:local
movscript-lang --help
```

The installer builds the workspace and links the `movscript-lang` command into `~/.local/bin` by default. Set `MOVSCRIPT_INSTALL_DIR` or pass `--bin-dir <path>` to use another directory:

```sh
node scripts/install-local.mjs --bin-dir /usr/local/bin
```

Remove the local command with:

```sh
pnpm run uninstall:local
```

## CLI workflows

Create planning structure:

```sh
movscript-lang production add --id p8f3 --title "Demo Production"
movscript-lang segment add --production p8f3 --id a19d --title "Opening pressure" --order 1
movscript-lang scene-moment add --production p8f3 --segment a19d --id r72k \
  --title "Hero hears the unknown call" \
  --storyboard main \
  --order 1
movscript-lang storyboard add --production p8f3 --segment a19d --scene-moment r72k \
  --id wide \
  --title "Wide angle plan" \
  --order 2
```

Scene moments keep storyboards as an ordered `storyboard_timing.items` list. There is no active storyboard; every storyboard in the list is available for generation.

Create a content unit from a scene moment and storyboard:

```sh
movscript-lang content-unit add \
  --id opening \
  --title "Opening shot" \
  --scene-moment productions/p8f3/segments/a19d/scene_moments/r72k \
  --storyboard productions/p8f3/segments/a19d/scene_moments/r72k/storyboards/main \
  --prompt "Cold phone light on frightened face."
```

You can also pass ids with `--production`, `--segment`, `--scene-moment`, and `--storyboard` instead of full paths.

Add an existing runtime resource to a target's candidate list without running a provider:

```sh
movscript-lang candidate add settings/hero/assets/portrait/asset.json \
  --resource-id resource_manual_1 \
  --source upload \
  --notes "Uploaded portrait"
```

Use `--kind asset|keyframe|content_unit` when the target kind cannot be inferred from the path. Metadata can be attached with repeated `--metadata key=value` options.

## Compiler CLI

The CLI should stay a forwarding layer. Compiler behavior lives in `@movscript/compiler`, `@movscript/engine` wires it to the node workspace, and `@movscript/cli` forwards commands to the engine facade.

```sh
movscript-lang compiler review
movscript-lang compiler compile
movscript-lang compiler prompt <contentUnitId>
movscript-lang compiler artifacts --build-id local_preview
```

`movscript-lang review` and `movscript-lang compile` remain top-level shortcuts for `movscript-lang compiler review` and `movscript-lang compiler compile`. Compile writes stable build artifacts under `.build/current` only when review passes; failed builds do not overwrite the last successful build.
