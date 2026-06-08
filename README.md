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
- `@movscript/cli`: CLI entrypoint for inspecting and running engine workflows.

The language package does not provide plugins, does not expose MCP, does not call generation providers, and does not depend on a backend. External services can generate resources separately and write candidates back into the workspace without leaking integration assumptions into the language layer.

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
movscript-lang audio-cue add --production p8f3 --segment a19d --scene-moment r72k \
  --id phone_vibration \
  --title "Phone vibration" \
  --kind sound_effect \
  --storyboard main \
  --prompt "Low sharp phone vibration under rain ambience."
```

Scene moments describe planning context and their own transition boundaries. Storyboards are child entities and keep their own `order`, `timeline`, and transition boundaries. Audio cues are independent child objects under a scene moment and can reference a storyboard.

Create a content unit from a scene moment and storyboard:

```sh
movscript-lang content-unit add \
  --id opening \
  --title "Opening shot" \
  --scene-moment productions/p8f3/segments/a19d/scene_moments/r72k \
  --storyboard productions/p8f3/segments/a19d/scene_moments/r72k/storyboards/main \
  --prompt "Cold phone light on frightened face."
```

Create an audio content unit from an audio cue:

```sh
movscript-lang content-unit add \
  --id opening_sound \
  --kind sound \
  --title "Opening sound cue" \
  --scene-moment productions/p8f3/segments/a19d/scene_moments/r72k \
  --storyboard productions/p8f3/segments/a19d/scene_moments/r72k/storyboards/main \
  --audio-cue productions/p8f3/segments/a19d/scene_moments/r72k/audio_cues/phone_vibration \
  --prompt "Low sharp phone vibration under rain ambience."
```

You can also pass ids with `--production`, `--segment`, `--scene-moment`, `--storyboard`, and `--audio-cue` instead of full paths.

Add an existing external resource to a target's candidate list:

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
movscript-lang overview
movscript-lang inspect
movscript-lang compiler compile
movscript-lang regen plan
movscript-lang compiler prompt <contentUnitId>
movscript-lang compiler artifacts --build-id local_preview
```

The compiler workflow follows the user's editing loop:

- `overview`: show the workspace state, last build state, pending edits, stale generated outputs, and next actions.
- `inspect`: show what changed since the last successful build, diagnostics, and predicted impact without writing build artifacts.
- `compile`: accept the current source as the next stable build snapshot and write deterministic artifacts.
- `regen plan`: after compile, show prompt bundles and generated outputs that may need regeneration.

`movscript-lang review` remains a compatibility alias for `movscript-lang inspect`. `movscript-lang compile` remains a top-level shortcut for `movscript-lang compiler compile`. Compile writes stable build artifacts under `.build/current` only when inspect passes; failed builds do not overwrite the last successful build.
