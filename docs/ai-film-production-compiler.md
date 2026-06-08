# AI Film Production Compiler

MovScript core should be treated as an AI film production compiler.

The main job is not to help a frontend save JSON files. The job is to turn editable creative source into stable, inspectable, generatable, and publishable production state.

## Compiler Model

```text
Creative source
  -> Parse
  -> Schema validation
  -> Semantic validation
  -> Domain IR
  -> Production graph
  -> Dependency graph
  -> Impact analysis
  -> Prompt and generation planning
  -> Runtime execution, when requested
  -> Stable published view
```

MovScript is not a purely deterministic compiler. AI film production includes model variance, async jobs, candidates, locks, retries, and human approval. The compiler should produce traceable production state and explicit runtime plans.

## Core Invariant

```text
Editing can be inconsistent.
Display must be stable.
Generation must be traceable.
Publishing must be explicit.
```

This implies three major storage states:

```text
source
  Current editable creative source.

.build/attempts
  Build or generation attempts with diagnostics, diffs, impact reports,
  generation plans, partial artifacts, and failures.

.build/current
  Last successful stable production state. Display views read from here.
```

A failed build must never overwrite `.build/current`.

## Production Flow

```text
Project
  -> Project standards
  -> Script
  -> Script versions and blocks
  -> Production
  -> Segment
  -> Scene moment
  -> Storyboard
  -> Writing expression
  -> Content unit
  -> Keyframe
  -> Asset
  -> Prompt bundle
  -> Generation job
  -> Generated candidate
  -> User selection or lock
  -> Published production view
```

The hierarchy can evolve, but core should preserve the distinction between creative intent, production plan, generated candidates, and published result.

## Runtime Boundary

The runtime must not mutate source files or compiled artifacts.

This is the same boundary a programming language runtime normally preserves: a running program may create files, logs, cache entries, network jobs, or external outputs, but it should not rewrite the source program or silently change the compiled binary it is interpreting.

MovScript should follow the same rule:

```text
source + decisions
  -> compiler
  -> immutable build artifact and generation plan
  -> runtime interpreter
  -> attempts, jobs, external outputs, and candidates
  -> human decision
  -> next compiler input
```

The runtime interprets generation plans. AI providers are external execution devices. A provider may produce non-deterministic visual, audio, or video output, but that output is not part of the language semantics until it is recorded as a candidate and explicitly selected.

## Prompt Construction

Prompt construction is compiler work, not runtime work.

The compiler should deterministically compile source plus decisions into prompt bundles and generation plans. A runtime may read a compiled prompt bundle, submit it to a provider, and record the result, but it should not rebuild prompts from source on its own.

```text
creative source
  + selected assets
  + selected keyframes
  + project standards
  + content unit intent
  -> compiled prompt bundle
  -> generation plan node
```

This keeps prompt behavior inspectable and reproducible. If a prompt changes, the change should be traceable to source, decisions, compiler version, model configuration, or provider parameters.

## Decision Layer

Human selection is a first-class input.

Candidates are runtime outputs. Selections and locks are production decisions. A selected asset candidate, keyframe candidate, or content-unit candidate can affect downstream prompt bundles and generation plans, so selection must not be an implicit runtime side effect.

Selection semantics should live in `@movscript/decision`.

The decision package defines candidate selection records, lock semantics, and pure helpers for applying, clearing, and resolving explicit selections. It should not know about the file system, provider jobs, frontend state, or service transports. Workspace adapters persist decisions; the compiler consumes them; the runtime does not own them.

The decision layer may be stored as centralized manifests:

```text
decisions/
  asset_locks.json
  keyframe_locks.json
  content_unit_locks.json
```

Or as local selection files beside entities:

```text
settings/.../assets/x/selection.json
content_units/.../keyframes/x/selection.json
content_units/.../selection.json
```

The exact layout can evolve, but the semantic rule should stay stable:

```text
candidate
  Runtime output from a generation attempt.

selection / lock
  Versioned decision input consumed by the next compile.
```

The compiler reads decisions and computes impact:

```text
asset selection changed
  -> affected keyframes
  -> affected content units
  -> affected generation plans
  -> stale downstream candidates
```

Implicit fallback rules such as "use the first candidate when no lock exists" should not define production semantics. They may be useful as UI preview behavior, but compiled generation plans should depend on explicit decisions or explicit compiler defaults.

## Build Modes

```text
review
  Compute diff, diagnostics, and impact. Do not execute generation.

compile
  Emit artifacts and generation plans. Do not call AI providers.

generate
  Execute selected generation jobs and store candidates.

publish
  Promote selected or locked outputs into the stable display view.
```

The common `build` command can remain, but internally it should be a pipeline with explicit phases.

## Generation Plans

A generation plan is the runtime's bytecode.

The compiler emits plan nodes with stable targets, model requirements, input references, prompt bundle references, dependency metadata, and cache keys. The runtime executes plan nodes and records attempts.

Example shape:

```json
{
  "schema": "movscript.generation_plan.v1",
  "plan_id": "plan_example",
  "nodes": [
    {
      "id": "gen_k41m",
      "target": {
        "kind": "content_unit",
        "id": "k41m"
      },
      "capability": "video_i2v",
      "model": "provider/model",
      "prompt_bundle_ref": ".build/current/content_units/k41m/generation_prompt.json",
      "inputs": [
        {
          "kind": "image",
          "source": "selected_keyframe",
          "id": "c83x"
        }
      ],
      "cache_key": "hash-of-source-decisions-model-and-params"
    }
  ]
}
```

The runtime should write execution state outside source and outside the immutable compiled plan:

```text
.build/attempts/attempt_001/jobs/...
.build/attempts/attempt_001/candidates/...
runtime/cache/...
```

Generation is therefore incremental by default. If a plan node's cache key has not changed and a valid candidate or published resource already exists, the runtime can reuse it instead of regenerating it.

## Incremental Compilation

AI film production should compile incrementally. A change to a scene moment should affect only the relevant subgraph, not the whole project.

Examples:

```text
Change project_standards
  -> Affects all prompts and possibly all generated media.

Change setting_state
  -> Affects assets, storyboards, keyframes, content units, and prompts tied to that state.

Change storyboard
  -> Affects linked content units, prompt bundles, preview timeline, and generation jobs.

Change locked asset candidate
  -> Affects downstream keyframes, content units, and generated media that use it.
```

Incremental compilation requires a dependency graph as a first-class artifact.

Generation cache keys should include:

```text
relevant source slice
relevant decisions
selected upstream resource refs
compiler version
prompt compiler version
model id
provider capability version
generation params
```

This lets the system distinguish "the source changed but this node is still reusable" from "the visual inputs changed and downstream generation is stale."

## Package Boundaries

The first implementation target should be embeddable libraries, not a mandatory service.

MovScript should be usable directly from a frontend, CLI, backend worker, or test runner. A service or server process can exist later, but it should be a host for the same libraries rather than a semantic layer.

```text
@movscript/language
  Language definitions only: source schemas, domain types, IR types,
  diagnostics, and relation types.

@movscript/decision
  Selection and lock semantics for generated candidates. Pure types and
  helpers only; no filesystem, provider, runtime, service, or UI assumptions.

@movscript/workspace
  Workspace layout, source store, build store, attempt store, decision store,
  file repository abstractions, and path policy.
  It may expose browser and node adapters through subpath exports.

@movscript/compiler
  Source snapshot + decision snapshot -> diagnostics -> domain IR ->
  dependency graph -> impact -> artifacts -> generation plan.

@movscript/runtime
  Generation plan interpretation, provider execution, jobs, attempts,
  candidates, cache, stale markers, and publish operations.

@movscript/engine
  Embeddable facade that composes workspace, compiler, runtime, stores,
  and providers for frontend, CLI, backend, or tests.

@movscript/service
  Optional long-running host for engine workflows. This can be deferred or
  renamed to @movscript/server if it becomes a server-only package.

@movscript/cli
  Local command-line access to review, compile, generate, select, publish,
  and inspect.
```

Allowed dependency direction:

```text
language
  <- decision
  <- workspace
  <- compiler
  <- engine
  <- service
  <- cli

workspace <- runtime
```

The language package should not know about a concrete backend, provider plugin, MCP server, file system, or Node runtime. Concrete backend, hosted service, MCP, provider adapters, and agent integrations should live outside the language layer.

## Embeddable Engine

The frontend should be able to embed MovScript directly.

The engine is a headless library. It should not assume a server process, singleton backend runtime, MCP transport, or concrete provider. It receives stores and providers as injected adapters:

```ts
const engine = createMovScriptEngine({
  workspaceStore,
  artifactStore,
  decisionStore,
  attemptStore,
  providers,
})

await engine.review()
await engine.compile()
await engine.generate({ target })
await engine.selectCandidate(selection)
await engine.publish()
```

Core packages used by the engine should be browser-safe:

```text
@movscript/language
@movscript/decision
@movscript/workspace
@movscript/compiler
@movscript/runtime
@movscript/engine
```

Node and browser implementations should be adapters, not assumptions:

```text
@movscript/workspace/node
@movscript/workspace/browser
@movscript/runtime/node
@movscript/runtime/browser
```

The browser runtime can still execute generation plans by using a provider proxy:

```text
Browser runtime
  -> HTTP provider proxy
  -> MovScript backend or provider gateway
  -> concrete AI provider
```

This keeps API keys, long-running queues, callbacks, billing, and remote asset storage outside the browser while preserving the same runtime contract.

The optional service/server package should mostly do composition:

```text
create stores
create provider registry
create engine
expose API, MCP, queue, auth, and project context
```

It should not own compiler semantics, runtime semantics, prompt construction, or provider execution rules.

## CLI Boundary

The CLI is a thin command-line shell around the engine.

It is not a semantic layer, not a service, and not the runtime itself. It should depend on the engine and expose stable commands for local development, CI, scripts, and agent workflows:

```text
@movscript/cli
  -> @movscript/engine
    -> workspace
    -> compiler
    -> runtime
```

The CLI should support two execution modes:

```text
local mode
  Embed the engine directly. Use local workspace adapters, local stores,
  and local or proxy providers.

remote mode
  Call an optional service/server API. Use the CLI as a client for hosted
  projects, queues, and provider gateways.
```

The default mode should be local embedding. That means a developer can run the CLI in a workspace without starting a server:

```text
movscript review
  -> create node workspace adapter
  -> create node engine
  -> call engine.review()

movscript compile
  -> create node workspace adapter
  -> create node engine
  -> call engine.compile()

movscript generate
  -> create node workspace adapter
  -> create node engine with configured providers
  -> call engine.generate()
```

Remote mode is a deployment choice, not a language requirement. If the project later needs hosted queues, shared provider gateways, auth, billing, callbacks, or remote asset storage, the CLI can call `@movscript/service` or `@movscript/server`. The command semantics should remain the same as local mode.

Primary CLI responsibilities:

```text
local development and debugging
CI validation and artifact checks
workspace initialization and migration
build, graph, impact, and plan inspection
generation execution through the engine
candidate listing and explicit selection
publishing and export workflows
stable script and agent entrypoints
```

The CLI should not define schemas, compile prompt semantics, interpret generation plans directly, own provider rules, store global backend singletons, or become a dependency of the frontend.

Suggested command surface:

```text
movscript init
movscript doctor
movscript setting add
movscript asset add

movscript review
movscript compile
movscript plan inspect
movscript graph inspect
movscript impact inspect

movscript generate content_unit:xxx
movscript jobs list
movscript candidates list --target keyframe:xxx
movscript select content_units/xxx/content_unit.json candidate_xxx --kind content_unit

movscript publish
movscript export
movscript migrate
```

The CLI's core job is to make the engine operable from a terminal without moving language behavior out of the libraries.

Design rules:

```text
Do:
  Treat CLI commands as engine method calls plus argument parsing.
  Keep command output stable enough for agents, scripts, and CI.
  Return non-zero exit codes for diagnostics that block review or compile.
  Support JSON output for every inspection and automation command.
  Let provider configuration come from explicit project, environment, or profile config.

Do not:
  Put schema definitions in the CLI.
  Rebuild prompts inside the CLI.
  Interpret generation plans inside the CLI.
  Store provider-specific execution rules in the CLI.
  Require the frontend to depend on the CLI.
  Require a service process for local review or compile.
```

This makes the CLI a useful product surface while keeping package boundaries clean: language behavior lives in libraries, execution is coordinated by the engine, and the CLI is only one host among several.
