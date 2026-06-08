import { realpathSync } from 'node:fs'
import { createInterface } from 'node:readline/promises'
import { fileURLToPath } from 'node:url'
import { stdin as input, stdout as output } from 'node:process'
import { Command } from 'commander'
import {
  createNodeMovScriptEngine,
} from '@movscript/engine/node'
import type {
  MovScriptWorkspaceEntityQuery,
  MovScriptWorkspaceIndexedEntity,
} from '@movscript/workspace'

interface WorkspaceOptions {
  json?: boolean
  cwd?: string
}

interface GetModelOptions extends WorkspaceOptions {
  entityId?: string
}

interface InitOptions extends WorkspaceOptions {
  id?: string
  title?: string
  language?: string
  overwrite?: boolean
  standard?: string[]
}

interface AddSettingOptions extends WorkspaceOptions {
  id?: string
  title?: string
  kind?: string
  description?: string
}

interface ListEntitiesOptions extends WorkspaceOptions {
  kind?: string
  query?: string
  limit?: string
}

interface AddAssetOptions extends WorkspaceOptions {
  id?: string
  title?: string
  setting?: string
  state?: string
  slot?: string
  kind?: string
  prompt?: string
  resourceId?: string
}

interface AddContentUnitOptions extends WorkspaceOptions {
  id?: string
  title?: string
  kind?: string
  production?: string
  segment?: string
  sceneMoment?: string
  storyboard?: string
  prompt?: string
  description?: string
  order?: string
  duration?: string
  shotSize?: string
  cameraAngle?: string
  cameraMotion?: string
}

interface AddProductionOptions extends WorkspaceOptions {
  id?: string
  title?: string
}

interface AddSegmentOptions extends WorkspaceOptions {
  id?: string
  title?: string
  production?: string
  kind?: string
  summary?: string
  order?: string
}

interface AddSceneMomentOptions extends WorkspaceOptions {
  id?: string
  title?: string
  production?: string
  segment?: string
  sceneMoment?: string
  storyboard?: string
  order?: string
  time?: string
  sceneCode?: string
  location?: string
  condition?: string
  action?: string
  mood?: string
  description?: string
}

interface AddStoryboardOptions extends WorkspaceOptions {
  id?: string
  title?: string
  production?: string
  segment?: string
  sceneMoment?: string
  order?: string
}

interface InteractiveOptions extends WorkspaceOptions {
}

interface GenerateOptions extends WorkspaceOptions {
  nodeId?: string[]
  planId?: string
}

interface SelectOptions extends WorkspaceOptions {
  kind?: 'asset' | 'keyframe' | 'content_unit'
  reason?: string
}

interface AddCandidateOptions extends WorkspaceOptions {
  id?: string
  kind?: 'asset' | 'keyframe' | 'content_unit'
  resourceId?: string
  source?: string
  notes?: string
  metadata?: string[]
}

interface PlanningListOptions extends WorkspaceOptions {
  kind?: string
  query?: string
  limit?: string
  production?: string
  segment?: string
  sceneMoment?: string
}

interface PlanningDeleteOptions extends WorkspaceOptions {
  production?: string
  segment?: string
  sceneMoment?: string
}

interface CompilerArtifactsOptions extends WorkspaceOptions {
  buildId?: string
  createdAt?: string
}

const SEMANTIC_ENTITY_KINDS = [
  'project',
  'project_standards',
  'script',
  'script_version',
  'script_block',
  'production',
  'segment',
  'scene_moment',
  'storyboard',
  'writing_expression',
  'content_unit',
  'keyframe',
  'setting',
  'setting_state',
  'asset',
] as const satisfies readonly NonNullable<MovScriptWorkspaceEntityQuery['entityKind']>[]

type CliSemanticEntityKind = NonNullable<MovScriptWorkspaceEntityQuery['entityKind']>

const INTERACTIVE_PROMPT = 'movscript> '

export function createMovScriptLangCommand(): Command {
  const program = new Command()
  program
    .name('movscript-lang')
    .description('MovScript AI film production language compiler and runtime CLI')
    .version('0.1.0')
    .usage('[command] [options]')
    .option('--json', 'Print JSON output')
    .option('--cwd <path>', 'MovScript workspace directory')
    .showHelpAfterError()
    .addHelpText('after', `
Examples:
  $ movscript-lang project init --id demo --title "Demo Film"
  $ movscript-lang setting add hero --title "Hero"
  $ movscript-lang asset add --setting hero --slot portrait --prompt "cinematic portrait"
  $ movscript-lang review
  $ movscript-lang compile
`)

  program
    .command('init')
    .description('Initialize a MovScript project workspace')
    .option('--id <id>', 'Project id written to project_id')
    .option('--title <title>', 'Project title')
    .option('--language <language>', 'Project language')
    .option('--standard <key=value...>', 'Project standard field, repeatable', collectOption, [])
    .option('--overwrite', 'Overwrite existing project files')
    .option('--json', 'Print JSON output')
    .action(async (options: InitOptions, command: Command) => {
      await initProjectFromCliOptions(options, command)
    })

  const project = program
    .command('project')
    .description('Manage the MovScript project workspace')

  project
    .command('init')
    .description('Initialize a MovScript project workspace')
    .option('--id <id>', 'Project id written to project_id')
    .option('--title <title>', 'Project title')
    .option('--language <language>', 'Project language')
    .option('--standard <key=value...>', 'Project standard field, repeatable', collectOption, [])
    .option('--overwrite', 'Overwrite existing project files')
    .option('--json', 'Print JSON output')
    .action(async (options: InitOptions, command: Command) => {
      await initProjectFromCliOptions(options, command)
    })

  program
    .command('get-model <entityType>')
    .description('Return the MovScript source model for one editable entity')
    .option('--entity-id <id>', 'Optional entity id used to expand editable path hints')
    .option('--json', 'Print JSON output')
    .action((entityType: string, options: GetModelOptions, command: Command) => {
      const engine = createCliEngine(mergeGlobalOptions(options, command))
      const result = engine.getModel({
        entityKind: entityType,
        ...(options.entityId !== undefined ? { entityId: options.entityId } : {}),
      })
      printResult(result, mergeGlobalOptions(options, command))
    })

  program
    .command('interactive')
    .alias('i')
    .description('Open the interactive MovScript slash shell')
    .option('--json', 'Print JSON output for write results')
    .action(async (options: InteractiveOptions, command: Command) => {
      await runInteractiveCli(mergeGlobalOptions(options, command))
    })

  const setting = program
    .command('setting')
    .description('Manage settings')

  setting
    .command('list')
    .description('List settings')
    .option('--kind <kind>', 'Filter by setting kind')
    .option('--query <text>', 'Search text')
    .option('--limit <number>', 'Maximum rows to print')
    .option('--json', 'Print JSON output')
    .action(async (options: ListEntitiesOptions, command: Command) => {
      const merged = mergeGlobalOptions(options, command)
      const result = await createCliEngine(merged).querySettings({
        ...(options.kind !== undefined ? { kind: options.kind } : {}),
        ...(options.query !== undefined ? { query: options.query } : {}),
        ...(options.limit !== undefined ? { limit: parsePositiveIntegerOption(options.limit, 'limit') } : {}),
      })
      printSettingsTable(result, merged)
    })

  setting
    .command('add [id]')
    .description('Add or update a setting')
    .option('--id <id>', 'Setting id')
    .option('--title <title>', 'Setting display title')
    .option('--kind <kind>', 'Setting kind, such as character, location, prop, world_rule, style, or other', 'other')
    .option('--description <text>', 'Setting description')
    .option('--json', 'Print JSON output')
    .action(async (id: string | undefined, options: AddSettingOptions, command: Command) => {
      const merged = mergeGlobalOptions(options, command)
      const result = await createCliEngine(merged).upsertSetting({
        payload: pruneUndefined({
          id: options.id ?? id,
          title: options.title,
          setting_kind: options.kind,
          description: options.description,
        }),
      })
      printResult(result, merged)
    })

  const asset = program
    .command('asset')
    .description('Manage assets')

  asset
    .command('list')
    .description('List assets')
    .option('--setting <id>', 'Filter by owning setting id')
    .option('--state <id>', 'Filter by owning setting state id')
    .option('--query <text>', 'Search text')
    .option('--limit <number>', 'Maximum rows to print')
    .option('--json', 'Print JSON output')
    .action(async (options: ListEntitiesOptions & { setting?: string; state?: string }, command: Command) => {
      const merged = mergeGlobalOptions(options, command)
      const result = await createCliEngine(merged).queryAssets({
        ...(options.setting !== undefined ? { settingId: options.setting } : {}),
        ...(options.state !== undefined ? { settingStateId: options.state } : {}),
        ...(options.query !== undefined ? { query: options.query } : {}),
        ...(options.limit !== undefined ? { limit: parsePositiveIntegerOption(options.limit, 'limit') } : {}),
      })
      printAssetsTable(result.assets, merged)
    })

  asset
    .command('add [id]')
    .description('Add or update an asset')
    .option('--id <id>', 'Asset id')
    .option('--title <title>', 'Asset display title')
    .option('--setting <id>', 'Owning setting id')
    .option('--state <id>', 'Owning setting state id')
    .option('--slot <slot>', 'Asset slot key')
    .option('--kind <kind>', 'Asset kind, such as image, video, audio, text, reference, or other', 'image')
    .option('--prompt <text>', 'Asset prompt hint')
    .option('--resource-id <id>', 'Selected resource id')
    .option('--json', 'Print JSON output')
    .action(async (id: string | undefined, options: AddAssetOptions, command: Command) => {
      const merged = mergeGlobalOptions(options, command)
      const result = await createCliEngine(merged).upsertAsset({
        payload: pruneUndefined({
          id: options.id ?? id,
          title: options.title,
          setting_id: options.setting,
          setting_state_id: options.state,
          slot: options.slot,
          asset_kind: options.kind,
          prompt_hint: options.prompt,
          resource_id: options.resourceId,
        }),
      })
      printResult(result, merged)
    })

  const production = program
    .command('production')
    .description('Manage productions')

  production
    .command('list')
    .description('List productions')
    .option('--query <text>', 'Search text')
    .option('--limit <number>', 'Maximum rows to print')
    .option('--json', 'Print JSON output')
    .action((options: PlanningListOptions, command: Command) => {
      return printPlanningEntityList('production', 'Productions', options, command)
    })

  production
    .command('add')
    .alias('create')
    .description('Create or update a production')
    .option('--id <id>', 'Production id', 'main')
    .option('--title <title>', 'Production title')
    .option('--json', 'Print JSON output')
    .action(async (options: AddProductionOptions, command: Command) => {
      const merged = mergeGlobalOptions(options, command)
      const result = await createCliEngine(merged).createProduction({
        id: options.id ?? 'main',
        title: options.title,
      })
      printResult(result, merged)
    })

  production
    .command('modify <id>')
    .description('Modify a production')
    .option('--title <title>', 'Production title')
    .option('--json', 'Print JSON output')
    .action(async (id: string, options: AddProductionOptions, command: Command) => {
      const merged = mergeGlobalOptions(options, command)
      const result = await createCliEngine(merged).updateProduction({ id, title: options.title })
      printResult(result, merged)
    })

  production
    .command('delete <idOrPath>')
    .alias('remove')
    .description('Delete a production')
    .option('--json', 'Print JSON output')
    .action((idOrPath: string, options: PlanningDeleteOptions, command: Command) => {
      return deletePlanningEntity('production', idOrPath, options, command)
    })

  const segment = program
    .command('segment')
    .description('Manage emotional/rhythm segments')

  segment
    .command('list')
    .description('List segments')
    .option('--production <id>', 'Filter by production id')
    .option('--kind <kind>', 'Filter by segment kind')
    .option('--query <text>', 'Search text')
    .option('--limit <number>', 'Maximum rows to print')
    .option('--json', 'Print JSON output')
    .action((options: PlanningListOptions, command: Command) => {
      return printPlanningEntityList('segment', 'Segments', options, command)
    })

  segment
    .command('add')
    .alias('create')
    .description('Create or update an emotional/rhythm segment')
    .option('--id <id>', 'Segment id')
    .option('--title <title>', 'Segment title')
    .option('--production <id>', 'Production id', 'main')
    .option('--kind <kind>', 'Segment kind, such as emotional_function, setup, escalation, release, or transition')
    .option('--summary <text>', 'Segment summary')
    .option('--order <number>', 'Segment order')
    .option('--json', 'Print JSON output')
    .action(async (options: AddSegmentOptions, command: Command) => {
      const merged = mergeGlobalOptions(options, command)
      const result = await createCliEngine(merged).createSegment({
        id: options.id,
        productionId: options.production ?? 'main',
        title: options.title,
        kind: options.kind,
        summary: options.summary,
        order: parseOptionalNumberOption(options.order, 'order'),
      })
      printResult(result, merged)
    })

  segment
    .command('modify <id>')
    .description('Modify an emotional/rhythm segment')
    .option('--production <id>', 'Production id', 'main')
    .option('--title <title>', 'Segment title')
    .option('--kind <kind>', 'Segment kind')
    .option('--summary <text>', 'Segment summary')
    .option('--order <number>', 'Segment order')
    .option('--json', 'Print JSON output')
    .action(async (id: string, options: AddSegmentOptions, command: Command) => {
      const merged = mergeGlobalOptions(options, command)
      const result = await createCliEngine(merged).updateSegment({
        id,
        productionId: options.production ?? 'main',
        title: options.title,
        kind: options.kind,
        summary: options.summary,
        order: parseOptionalNumberOption(options.order, 'order'),
      })
      printResult(result, merged)
    })

  segment
    .command('delete <idOrPath>')
    .alias('remove')
    .description('Delete a segment')
    .option('--production <id>', 'Filter by production id')
    .option('--json', 'Print JSON output')
    .action((idOrPath: string, options: PlanningDeleteOptions, command: Command) => {
      return deletePlanningEntity('segment', idOrPath, options, command)
    })

  const sceneMoment = program
    .command('scene-moment')
    .alias('moment')
    .description('Manage scene moments')

  sceneMoment
    .command('list')
    .description('List scene moments')
    .option('--production <id>', 'Filter by production id')
    .option('--segment <id-or-path>', 'Filter by segment id or path')
    .option('--query <text>', 'Search text')
    .option('--limit <number>', 'Maximum rows to print')
    .option('--json', 'Print JSON output')
    .action((options: PlanningListOptions, command: Command) => {
      return printPlanningEntityList('scene_moment', 'Scene moments', options, command)
    })

  sceneMoment
    .command('add')
    .alias('create')
    .description('Create or update a scene moment under a segment')
    .option('--id <id>', 'Scene moment id')
    .option('--title <title>', 'Scene moment title')
    .option('--production <id>', 'Production id')
    .option('--segment <id-or-path>', 'Segment id or path')
    .option('--storyboard <id>', 'Initial storyboard id', 'main')
    .option('--order <number>', 'Scene moment order')
    .option('--time <text>', 'Time text')
    .option('--scene-code <text>', 'Scene code')
    .option('--location <text>', 'Location text')
    .option('--condition <text>', 'Condition text')
    .option('--action <text>', 'Action text')
    .option('--mood <text>', 'Mood/emotion text')
    .option('--description <text>', 'Scene moment description')
    .option('--json', 'Print JSON output')
    .action(async (options: AddSceneMomentOptions, command: Command) => {
      const merged = mergeGlobalOptions(options, command)
      const source = parsePlanningParentOptions(options)
      const result = await createCliEngine(merged).createSceneMoment({
        id: options.id ?? options.sceneMoment,
        productionId: source.productionId,
        segmentId: source.segmentId,
        title: options.title,
        storyboardId: options.storyboard,
        order: parseOptionalNumberOption(options.order, 'order'),
        timeText: options.time,
        sceneCode: options.sceneCode,
        locationText: options.location,
        conditionText: options.condition,
        actionText: options.action,
        mood: options.mood,
        description: options.description,
      })
      printResult(result, merged)
    })

  sceneMoment
    .command('modify <id>')
    .description('Modify a scene moment')
    .option('--production <id>', 'Production id')
    .option('--segment <id-or-path>', 'Segment id or path')
    .option('--title <title>', 'Scene moment title')
    .option('--storyboard <id>', 'Initial storyboard id')
    .option('--order <number>', 'Scene moment order')
    .option('--time <text>', 'Time text')
    .option('--scene-code <text>', 'Scene code')
    .option('--location <text>', 'Location text')
    .option('--condition <text>', 'Condition text')
    .option('--action <text>', 'Action text')
    .option('--mood <text>', 'Mood/emotion text')
    .option('--description <text>', 'Scene moment description')
    .option('--json', 'Print JSON output')
    .action(async (id: string, options: AddSceneMomentOptions, command: Command) => {
      const merged = mergeGlobalOptions(options, command)
      const source = parsePlanningParentOptions(options)
      const result = await createCliEngine(merged).updateSceneMoment({
        id,
        productionId: source.productionId,
        segmentId: source.segmentId,
        title: options.title,
        storyboardId: options.storyboard,
        order: parseOptionalNumberOption(options.order, 'order'),
        timeText: options.time,
        sceneCode: options.sceneCode,
        locationText: options.location,
        conditionText: options.condition,
        actionText: options.action,
        mood: options.mood,
        description: options.description,
      })
      printResult(result, merged)
    })

  sceneMoment
    .command('delete <idOrPath>')
    .alias('remove')
    .description('Delete a scene moment')
    .option('--production <id>', 'Filter by production id')
    .option('--segment <id-or-path>', 'Filter by segment id or path')
    .option('--json', 'Print JSON output')
    .action((idOrPath: string, options: PlanningDeleteOptions, command: Command) => {
      return deletePlanningEntity('scene_moment', idOrPath, options, command)
    })

  const storyboard = program
    .command('storyboard')
    .description('Manage storyboards')

  storyboard
    .command('list')
    .description('List storyboards')
    .option('--production <id>', 'Filter by production id')
    .option('--segment <id-or-path>', 'Filter by segment id or path')
    .option('--scene-moment <id-or-path>', 'Filter by scene moment id or path')
    .option('--query <text>', 'Search text')
    .option('--limit <number>', 'Maximum rows to print')
    .option('--json', 'Print JSON output')
    .action((options: PlanningListOptions, command: Command) => {
      return printPlanningEntityList('storyboard', 'Storyboards', options, command)
    })

  storyboard
    .command('add')
    .alias('create')
    .description('Create or update a storyboard under a scene moment')
    .option('--id <id>', 'Storyboard id')
    .option('--title <title>', 'Storyboard title')
    .option('--production <id>', 'Production id')
    .option('--segment <id-or-path>', 'Segment id or path')
    .option('--scene-moment <id-or-path>', 'Scene moment id or path')
    .option('--order <number>', 'Storyboard order; new storyboards append when omitted')
    .option('--json', 'Print JSON output')
    .action(async (options: AddStoryboardOptions, command: Command) => {
      const merged = mergeGlobalOptions(options, command)
      const source = parseStoryboardParentOptions(options)
      const result = await createCliEngine(merged).createStoryboard({
        id: options.id ?? 'main',
        productionId: source.productionId,
        segmentId: source.segmentId,
        sceneMomentId: source.sceneMomentId,
        title: options.title,
        order: parseOptionalNumberOption(options.order, 'order'),
      })
      printResult(result, merged)
    })

  storyboard
    .command('modify <id>')
    .description('Modify a storyboard')
    .option('--title <title>', 'Storyboard title')
    .option('--production <id>', 'Production id')
    .option('--segment <id-or-path>', 'Segment id or path')
    .option('--scene-moment <id-or-path>', 'Scene moment id or path')
    .option('--order <number>', 'Storyboard order')
    .option('--json', 'Print JSON output')
    .action(async (id: string, options: AddStoryboardOptions, command: Command) => {
      const merged = mergeGlobalOptions(options, command)
      const source = parseStoryboardParentOptions(options)
      const result = await createCliEngine(merged).updateStoryboard({
        id,
        productionId: source.productionId,
        segmentId: source.segmentId,
        sceneMomentId: source.sceneMomentId,
        title: options.title,
        order: parseOptionalNumberOption(options.order, 'order'),
      })
      printResult(result, merged)
    })

  storyboard
    .command('delete <idOrPath>')
    .alias('remove')
    .description('Delete a storyboard')
    .option('--production <id>', 'Filter by production id')
    .option('--segment <id-or-path>', 'Filter by segment id or path')
    .option('--scene-moment <id-or-path>', 'Filter by scene moment id or path')
    .option('--json', 'Print JSON output')
    .action((idOrPath: string, options: PlanningDeleteOptions, command: Command) => {
      return deletePlanningEntity('storyboard', idOrPath, options, command)
    })

  const contentUnit = program
    .command('content-unit')
    .alias('cu')
    .description('Manage content units')

  contentUnit
    .command('list')
    .description('List content units')
    .option('--production <id>', 'Filter by production id')
    .option('--segment <id-or-path>', 'Filter by segment id or path')
    .option('--scene-moment <id-or-path>', 'Filter by scene moment id or path')
    .option('--query <text>', 'Search text')
    .option('--limit <number>', 'Maximum rows to print')
    .option('--json', 'Print JSON output')
    .action((options: PlanningListOptions, command: Command) => {
      return printPlanningEntityList('content_unit', 'Content units', options, command)
    })

  contentUnit
    .command('add')
    .alias('create')
    .description('Create or update a content unit from a scene moment and storyboard')
    .option('--id <id>', 'Content unit id')
    .option('--title <title>', 'Content unit title')
    .option('--kind <kind>', 'Content unit kind, such as shot, voiceover, sound, subtitle, or transition', 'shot')
    .option('--production <id>', 'Production id')
    .option('--segment <id>', 'Segment id')
    .option('--scene-moment <id-or-path>', 'Scene moment id or path')
    .option('--storyboard <id-or-path>', 'Storyboard id or path', 'main')
    .option('--prompt <text>', 'Editable generation prompt')
    .option('--description <text>', 'Content unit description')
    .option('--order <number>', 'Content unit order')
    .option('--duration <seconds>', 'Expected duration in seconds')
    .option('--shot-size <value>', 'Shot size')
    .option('--camera-angle <value>', 'Camera angle')
    .option('--camera-motion <value>', 'Camera motion')
    .option('--json', 'Print JSON output')
    .action(async (options: AddContentUnitOptions, command: Command) => {
      const merged = mergeGlobalOptions(options, command)
      const source = parseContentUnitSourceOptions(options)
      const result = await createCliEngine(merged).createContentUnit({
        id: options.id,
        title: options.title,
        kind: options.kind,
        productionId: source.productionId,
        segmentId: source.segmentId,
        sceneMomentId: source.sceneMomentId,
        storyboardId: source.storyboardId,
        prompt: options.prompt,
        description: options.description,
        order: parseOptionalNumberOption(options.order, 'order'),
        durationSeconds: parseOptionalNumberOption(options.duration, 'duration'),
        shotSize: options.shotSize,
        cameraAngle: options.cameraAngle,
        cameraMotion: options.cameraMotion,
      })
      printResult(result, merged)
    })

  contentUnit
    .command('modify <id>')
    .description('Modify a content unit')
    .option('--title <title>', 'Content unit title')
    .option('--kind <kind>', 'Content unit kind')
    .option('--production <id>', 'Production id')
    .option('--segment <id>', 'Segment id')
    .option('--scene-moment <id-or-path>', 'Scene moment id or path')
    .option('--storyboard <id-or-path>', 'Storyboard id or path')
    .option('--prompt <text>', 'Editable generation prompt')
    .option('--description <text>', 'Content unit description')
    .option('--order <number>', 'Content unit order')
    .option('--duration <seconds>', 'Expected duration in seconds')
    .option('--shot-size <value>', 'Shot size')
    .option('--camera-angle <value>', 'Camera angle')
    .option('--camera-motion <value>', 'Camera motion')
    .option('--json', 'Print JSON output')
    .action(async (id: string, options: AddContentUnitOptions, command: Command) => {
      const merged = mergeGlobalOptions(options, command)
      const source = parseContentUnitSourceOptions({ ...options, sceneMoment: options.sceneMoment ?? 'local' })
      const result = await createCliEngine(merged).updateContentUnit({
        id,
        title: options.title,
        kind: options.kind,
        productionId: source.productionId,
        segmentId: source.segmentId,
        sceneMomentId: options.sceneMoment === undefined && options.storyboard === undefined ? undefined : source.sceneMomentId,
        storyboardId: options.sceneMoment === undefined && options.storyboard === undefined ? undefined : source.storyboardId,
        prompt: options.prompt,
        description: options.description,
        order: parseOptionalNumberOption(options.order, 'order'),
        durationSeconds: parseOptionalNumberOption(options.duration, 'duration'),
        shotSize: options.shotSize,
        cameraAngle: options.cameraAngle,
        cameraMotion: options.cameraMotion,
      })
      printResult(result, merged)
    })

  contentUnit
    .command('delete <idOrPath>')
    .alias('remove')
    .description('Delete a content unit')
    .option('--production <id>', 'Filter by production id')
    .option('--segment <id-or-path>', 'Filter by segment id or path')
    .option('--scene-moment <id-or-path>', 'Filter by scene moment id or path')
    .option('--json', 'Print JSON output')
    .action((idOrPath: string, options: PlanningDeleteOptions, command: Command) => {
      return deletePlanningEntity('content_unit', idOrPath, options, command)
    })

  const entity = program
    .command('entity')
    .description('Inspect workspace entities')

  entity
    .command('list [entityKind]')
    .description('List indexed entities')
    .option('--kind <kind>', 'Filter by domain-specific kind')
    .option('--query <text>', 'Search text')
    .option('--limit <number>', 'Maximum rows to print')
    .option('--json', 'Print JSON output')
    .action(async (entityKind: string | undefined, options: ListEntitiesOptions, command: Command) => {
      if (entityKind !== undefined && !isSemanticEntityKind(entityKind)) {
        throw new Error(`unknown entity kind: ${entityKind}`)
      }
      const merged = mergeGlobalOptions(options, command)
      const result = await createCliEngine(merged).queryEntities({
        ...(entityKind !== undefined ? { entityKind } : {}),
        ...(options.kind !== undefined ? { kind: options.kind } : {}),
        ...(options.query !== undefined ? { query: options.query } : {}),
        ...(options.limit !== undefined ? { limit: parsePositiveIntegerOption(options.limit, 'limit') } : {}),
      })
      printEntityList(result, merged, {
        title: entityKind ? `${entityKind} entities` : 'Entities',
        columns: [
          { header: 'Kind', value: (item) => item.entityKind },
          { header: 'ID', value: (item) => item.id },
          { header: 'Type', value: (item) => item.record.setting_kind ?? item.record.asset_kind ?? item.record.unit_kind ?? item.record.kind },
          { header: 'Title', value: (item) => item.record.title ?? item.record.label ?? item.id },
          { header: 'Path', value: (item) => item.path, maxWidth: 52 },
        ],
      })
    })

  const compiler = program
    .command('compiler')
    .description('Run compiler workflows')

  compiler
    .command('review')
    .description('Review source changes against the last successful build')
    .option('--json', 'Print JSON output')
    .action((options: WorkspaceOptions, command: Command) => {
      return reviewWorkspaceFromCliOptions(options, command)
    })

  compiler
    .command('compile')
    .alias('build')
    .description('Compile source into stable MovScript build artifacts')
    .option('--json', 'Print JSON output')
    .action((options: WorkspaceOptions, command: Command) => {
      return compileWorkspaceFromCliOptions(options, command)
    })

  compiler
    .command('prompt <contentUnitId>')
    .description('Compile the prompt bundle for one content unit from the current index')
    .option('--json', 'Print JSON output')
    .action(async (contentUnitId: string, options: WorkspaceOptions, command: Command) => {
      const merged = mergeGlobalOptions(options, command)
      const result = await createCliEngine(merged).compileContentGenerationPrompt(contentUnitId)
      printResult(result, merged)
    })

  compiler
    .command('artifacts')
    .description('Build compiler artifacts in memory from the current index')
    .option('--build-id <id>', 'Build id used in derived artifacts')
    .option('--created-at <iso>', 'Creation timestamp used in derived artifacts')
    .option('--json', 'Print JSON output')
    .action(async (options: CompilerArtifactsOptions, command: Command) => {
      const merged = mergeGlobalOptions(options, command)
      const result = await createCliEngine(merged).buildArtifacts({
        ...(options.buildId !== undefined ? { buildId: options.buildId } : {}),
        ...(options.createdAt !== undefined ? { createdAt: options.createdAt } : {}),
      })
      printResult(result, merged)
    })

  program
    .command('review')
    .description('Review source changes against the last successful build')
    .option('--json', 'Print JSON output')
    .action((options: WorkspaceOptions, command: Command) => {
      return reviewWorkspaceFromCliOptions(options, command)
    })

  program
    .command('compile')
    .alias('build')
    .description('Compile source into stable MovScript build artifacts')
    .option('--json', 'Print JSON output')
    .action((options: WorkspaceOptions, command: Command) => {
      return compileWorkspaceFromCliOptions(options, command)
    })

  program
    .command('generate <target>')
    .description('Trigger generation for a target')
    .option('--plan-id <id>', 'Generation plan id')
    .option('--node-id <id>', 'Generation node id, repeatable', collectOption, [])
    .option('--json', 'Print JSON output')
    .action(async (target: string, options: GenerateOptions, command: Command) => {
      const merged = mergeGlobalOptions(options, command)
      const result = await createCliEngine(merged).generate({
        target: parseGenerationTarget(target),
        ...(options.planId !== undefined ? { planId: options.planId } : {}),
        ...(options.nodeId?.length ? { nodeIds: options.nodeId } : {}),
      })
      printResult(result, merged)
    })

  program
    .command('candidate')
    .description('Manage runtime candidates')
    .command('add <target>')
    .description('Manually add a runtime resource as a candidate for a target path')
    .option('--id <id>', 'Candidate id; generated from resource id when omitted')
    .option('--kind <kind>', 'Target kind: asset, keyframe, or content_unit')
    .option('--resource-id <id>', 'Runtime resource id to add as a candidate')
    .option('--source <source>', 'Candidate source label', 'manual')
    .option('--notes <text>', 'Candidate notes')
    .option('--metadata <key=value...>', 'Candidate metadata field, repeatable', collectOption, [])
    .option('--json', 'Print JSON output')
    .action(async (target: string, options: AddCandidateOptions, command: Command) => {
      if (!options.resourceId) throw new Error('--resource-id is required')
      const merged = mergeGlobalOptions(options, command)
      const result = await createCliEngine(merged).appendCandidate({
        targetPath: targetPathFromSelectionTarget(target),
        targetKind: parseTargetKindOption(options.kind, target),
        payload: pruneUndefined({
          id: options.id,
          resource_id: options.resourceId,
          source: options.source,
          notes: options.notes,
          metadata: parseOptionalKeyValueOptions(options.metadata ?? []),
        }),
      })
      printResult(result, merged)
    })

  program
    .command('select <target> <candidateId>')
    .description('Select a generated candidate for a target path')
    .option('--kind <kind>', 'Target kind: asset, keyframe, or content_unit')
    .option('--reason <reason>', 'Selection reason')
    .option('--json', 'Print JSON output')
    .action(async (target: string, candidateId: string, options: SelectOptions, command: Command) => {
      const merged = mergeGlobalOptions(options, command)
      const result = await createCliEngine(merged).selectCandidate({
        targetPath: targetPathFromSelectionTarget(target),
        targetKind: parseTargetKindOption(options.kind, target),
        candidateId,
        ...(options.reason !== undefined ? { reason: options.reason } : {}),
      })
      printResult(result, merged)
    })

  return program
}

export async function runMovScriptLangCli(argv = process.argv): Promise<void> {
  const program = createMovScriptLangCommand()
  if (argv.length <= 2) {
    program.outputHelp()
    return
  }
  await program.parseAsync(argv)
}

function mergeGlobalOptions(options: WorkspaceOptions, command: Command): WorkspaceOptions {
  const root = command.parent ?? command
  const global = root.optsWithGlobals ? root.optsWithGlobals() : root.opts()
  return {
    ...options,
    json: options.json ?? (typeof global.json === 'boolean' ? global.json : undefined),
    cwd: options.cwd ?? (typeof global.cwd === 'string' ? global.cwd : undefined),
  }
}

function createCliEngine(options: WorkspaceOptions) {
  return createNodeMovScriptEngine({
    ...(options.cwd !== undefined ? { workspaceDir: options.cwd } : {}),
  })
}

type CliEngine = ReturnType<typeof createCliEngine>

async function initProjectFromCliOptions(options: InitOptions, command: Command): Promise<void> {
  const merged = mergeGlobalOptions(options, command)
  const engine = createCliEngine(merged)
  const result = await engine.initProject({
    ...(options.id !== undefined ? { projectId: options.id } : {}),
    ...(options.title !== undefined ? { title: options.title } : {}),
    ...(options.language !== undefined ? { language: options.language } : {}),
    standards: parseKeyValueOptions(options.standard ?? []),
    overwrite: Boolean(options.overwrite),
  })
  printResult({ projectDir: engine.projectDir, ...result }, merged)
}

async function reviewWorkspaceFromCliOptions(options: WorkspaceOptions, command: Command): Promise<void> {
  const merged = mergeGlobalOptions(options, command)
  const result = await createCliEngine(merged).review()
  printResult(result, merged)
  if (isRecord(result) && result.readyToBuild === false) process.exitCode = 2
}

async function compileWorkspaceFromCliOptions(options: WorkspaceOptions, command: Command): Promise<void> {
  const merged = mergeGlobalOptions(options, command)
  const result = await createCliEngine(merged).compile()
  printResult(result, merged)
  if (isRecord(result) && result.status === 'failed') process.exitCode = 2
}

async function runInteractiveCli(options: WorkspaceOptions): Promise<void> {
  const rl = createInterface({ input, output })
  try {
    const engine = createCliEngine(options)
    console.log('MovScript interactive')
    console.log(`Workspace: ${engine.projectDir}`)
    console.log('Type /help for commands. Type /exit to quit.')
    if (input.isTTY) {
      while (true) {
        const line = await readInteractiveLine(rl)
        if (line === undefined) return
        const shouldExit = await dispatchInteractiveInputLine(line, options, engine)
        if (shouldExit) return
      }
    } else {
      for await (const line of rl) {
        const shouldExit = await dispatchInteractiveInputLine(line, options, engine)
        if (shouldExit) return
      }
    }
  } finally {
    rl.close()
  }
}

async function readInteractiveLine(rl: ReturnType<typeof createInterface>): Promise<string | undefined> {
  const abortController = new AbortController()
  const onSigint = () => {
    if (rl.line.length > 0) {
      clearReadlineInput(rl)
      return
    }
    abortController.abort()
  }

  rl.on('SIGINT', onSigint)
  try {
    return await rl.question(INTERACTIVE_PROMPT, { signal: abortController.signal })
  } catch (error) {
    if (isAbortError(error)) {
      output.write('\n')
      return undefined
    }
    throw error
  } finally {
    rl.off('SIGINT', onSigint)
  }
}

function clearReadlineInput(rl: ReturnType<typeof createInterface>): void {
  rl.write(null, { ctrl: true, name: 'a' })
  rl.write(null, { ctrl: true, name: 'k' })
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && (error.name === 'AbortError' || 'code' in error && error.code === 'ABORT_ERR')
}

async function dispatchInteractiveInputLine(line: string, options: WorkspaceOptions, engine: CliEngine): Promise<boolean> {
  const trimmed = line.trim()
  if (!trimmed) return false
  try {
    return await dispatchInteractiveSlashCommand(trimmed, options, engine)
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error))
    return false
  }
}

async function dispatchInteractiveSlashCommand(line: string, options: WorkspaceOptions, engine: CliEngine): Promise<boolean> {
  if (!line.startsWith('/')) {
    console.log('Interactive mode currently accepts slash commands. Type /help for commands.')
    return false
  }

  const args = parseCommandLine(line.slice(1))
  const command = args.shift()
  if (!command) return false

  if (command === 'exit' || command === 'quit' || command === 'q') return true
  if (command === 'help' || command === '?') {
    printInteractiveHelp()
    return false
  }

  if (command === 'init') {
    await dispatchInteractiveProjectCommand(['init', ...args], options, engine)
    return false
  }
  if (command === 'project') {
    await dispatchInteractiveProjectCommand(args, options, engine)
    return false
  }
  if (command === 'setting') {
    await dispatchInteractiveSettingCommand(args, options, engine)
    return false
  }
  if (command === 'asset') {
    await dispatchInteractiveAssetCommand(args, options, engine)
    return false
  }
  if (command === 'production') {
    await dispatchInteractiveProductionCommand(args, options, engine)
    return false
  }
  if (command === 'segment') {
    await dispatchInteractiveSegmentCommand(args, options, engine)
    return false
  }
  if (command === 'scene-moment' || command === 'moment') {
    await dispatchInteractiveSceneMomentCommand(args, options, engine)
    return false
  }
  if (command === 'storyboard') {
    await dispatchInteractiveStoryboardCommand(args, options, engine)
    return false
  }
  if (command === 'content-unit' || command === 'cu') {
    await dispatchInteractiveContentUnitCommand(args, options, engine)
    return false
  }
  if (command === 'entity') {
    await dispatchInteractiveEntityCommand(args, options, engine)
    return false
  }
  if (command === 'candidate') {
    await dispatchInteractiveCandidateCommand(args, options, engine)
    return false
  }
  if (command === 'compiler') {
    await dispatchInteractiveCompilerCommand(args, options, engine)
    return false
  }
  if (command === 'review') {
    const result = await engine.review()
    printResult(result, options)
    return false
  }
  if (command === 'compile' || command === 'build') {
    const result = await engine.compile()
    printResult(result, options)
    return false
  }

  throw new Error(`unknown slash command: /${command}`)
}

async function dispatchInteractiveCompilerCommand(args: string[], options: WorkspaceOptions, engine: CliEngine): Promise<void> {
  const action = args.shift()
  const parsed = parseSlashOptions(args)
  if (action === 'review' || action === undefined) {
    const result = await engine.review()
    printResult(result, options)
    return
  }
  if (action === 'compile' || action === 'build') {
    const result = await engine.compile()
    printResult(result, options)
    return
  }
  if (action === 'prompt') {
    const contentUnitId = parsed.options.contentUnit ?? parsed.options['content-unit'] ?? parsed.positionals[0]
    if (!contentUnitId) throw new Error('usage: /compiler prompt <contentUnitId>')
    const result = await engine.compileContentGenerationPrompt(contentUnitId)
    printResult(result, options)
    return
  }
  if (action === 'artifacts') {
    const result = await engine.buildArtifacts({
      ...(parsed.options.buildId !== undefined ? { buildId: parsed.options.buildId } : {}),
      ...(parsed.options['build-id'] !== undefined ? { buildId: parsed.options['build-id'] } : {}),
      ...(parsed.options.createdAt !== undefined ? { createdAt: parsed.options.createdAt } : {}),
      ...(parsed.options['created-at'] !== undefined ? { createdAt: parsed.options['created-at'] } : {}),
    })
    printResult(result, options)
    return
  }
  throw new Error(`unknown /compiler action: ${action}`)
}

async function dispatchInteractiveProjectCommand(args: string[], options: WorkspaceOptions, engine: CliEngine): Promise<void> {
  const action = args.shift()
  const parsed = parseSlashOptions(args)
  if (action === 'init') {
    const standard = parsed.options.standard ?? parsed.options.standards
    const result = await engine.initProject({
      ...(parsed.options.id !== undefined || parsed.options.name !== undefined || parsed.positionals[0] !== undefined
        ? { projectId: parsed.options.id ?? parsed.options.name ?? parsed.positionals[0] }
        : {}),
      ...(parsed.options.title !== undefined ? { title: parsed.options.title } : {}),
      ...(parsed.options.language !== undefined ? { language: parsed.options.language } : {}),
      standards: parseKeyValueOptions(standard === undefined ? [] : [standard]),
      overwrite: parsed.options.overwrite === 'true',
    })
    printResult({ projectDir: engine.projectDir, ...result }, options)
    return
  }
  throw new Error(`unknown /project action: ${action}`)
}

async function dispatchInteractiveSettingCommand(args: string[], options: WorkspaceOptions, engine: CliEngine): Promise<void> {
  const action = args.shift()
  const parsed = parseSlashOptions(args)
  if (action === 'list' || action === undefined) {
    const result = await engine.querySettings({
      ...(parsed.options.kind !== undefined ? { kind: parsed.options.kind } : {}),
      ...(parsed.options.query !== undefined ? { query: parsed.options.query } : {}),
      ...(parsed.options.limit !== undefined ? { limit: parsePositiveIntegerOption(parsed.options.limit, 'limit') } : {}),
    })
    printSettingsTable(result, options)
    return
  }
  if (action === 'add' || action === 'upsert') {
    const id = parsed.options.id ?? parsed.positionals[0]
    const title = parsed.options.title
    if (!id && !title) {
      throw new Error('usage: /setting add <id> [--title <title>] [--kind <kind>] [--description <text>]')
    }
    const result = await engine.upsertSetting({
      payload: pruneUndefined({
        id,
        title,
        setting_kind: parsed.options.kind ?? 'other',
        description: parsed.options.description,
      }),
    })
    printResult(result, options)
    return
  }
  throw new Error(`unknown /setting action: ${action}`)
}

async function dispatchInteractiveAssetCommand(args: string[], options: WorkspaceOptions, engine: CliEngine): Promise<void> {
  const action = args.shift()
  const parsed = parseSlashOptions(args)
  if (action === 'list' || action === undefined) {
    const result = await engine.queryAssets({
      ...(parsed.options.setting !== undefined ? { settingId: parsed.options.setting } : {}),
      ...(parsed.options.state !== undefined ? { settingStateId: parsed.options.state } : {}),
      ...(parsed.options.query !== undefined ? { query: parsed.options.query } : {}),
      ...(parsed.options.limit !== undefined ? { limit: parsePositiveIntegerOption(parsed.options.limit, 'limit') } : {}),
    })
    printAssetsTable(result.assets, options)
    return
  }
  if (action === 'add' || action === 'upsert') {
    const id = parsed.options.id ?? parsed.positionals[0]
    const title = parsed.options.title
    if (!id && !title) {
      throw new Error('usage: /asset add <id> [--title <title>] [--setting <id>] [--state <id>] [--slot <slot>] [--kind <kind>] [--prompt <text>]')
    }
    const result = await engine.upsertAsset({
      payload: pruneUndefined({
        id,
        title,
        setting_id: parsed.options.setting,
        setting_state_id: parsed.options.state,
        slot: parsed.options.slot,
        asset_kind: parsed.options.kind ?? 'image',
        prompt_hint: parsed.options.prompt,
        resource_id: parsed.options.resourceId ?? parsed.options['resource-id'],
      }),
    })
    printResult(result, options)
    return
  }
  throw new Error(`unknown /asset action: ${action}`)
}

async function dispatchInteractiveProductionCommand(args: string[], options: WorkspaceOptions, engine: CliEngine): Promise<void> {
  const action = args.shift()
  const parsed = parseSlashOptions(args)
  if (action === 'add' || action === 'create' || action === 'upsert') {
    const result = await engine.createProduction({
      id: parsed.options.id ?? 'main',
      title: parsed.options.title ?? parsed.positionals[0],
    })
    printResult(result, options)
    return
  }
  throw new Error(`unknown /production action: ${action}`)
}

async function dispatchInteractiveSegmentCommand(args: string[], options: WorkspaceOptions, engine: CliEngine): Promise<void> {
  const action = args.shift()
  const parsed = parseSlashOptions(args)
  if (action === 'add' || action === 'create' || action === 'upsert') {
    const result = await engine.createSegment({
      id: parsed.options.id,
      productionId: parsed.options.production ?? 'main',
      title: parsed.options.title ?? parsed.positionals[0],
      kind: parsed.options.kind,
      summary: parsed.options.summary,
      order: parseOptionalNumberOption(parsed.options.order, 'order'),
    })
    printResult(result, options)
    return
  }
  throw new Error(`unknown /segment action: ${action}`)
}

async function dispatchInteractiveSceneMomentCommand(args: string[], options: WorkspaceOptions, engine: CliEngine): Promise<void> {
  const action = args.shift()
  const parsed = parseSlashOptions(args)
  if (action === 'add' || action === 'create' || action === 'upsert') {
    const source = parsePlanningParentOptions({
      production: parsed.options.production,
      segment: parsed.options.segment,
    })
    const result = await engine.createSceneMoment({
      id: parsed.options.id ?? parsed.options.sceneMoment ?? parsed.options['scene-moment'],
      productionId: source.productionId,
      segmentId: source.segmentId,
      title: parsed.options.title ?? parsed.positionals[0],
      storyboardId: parsed.options.storyboard ?? 'main',
      order: parseOptionalNumberOption(parsed.options.order, 'order'),
      timeText: parsed.options.time,
      sceneCode: parsed.options.sceneCode ?? parsed.options['scene-code'],
      locationText: parsed.options.location,
      conditionText: parsed.options.condition,
      actionText: parsed.options.action,
      mood: parsed.options.mood,
      description: parsed.options.description,
    })
    printResult(result, options)
    return
  }
  throw new Error(`unknown /scene-moment action: ${action}`)
}

async function dispatchInteractiveStoryboardCommand(args: string[], options: WorkspaceOptions, engine: CliEngine): Promise<void> {
  const action = args.shift()
  const parsed = parseSlashOptions(args)
  if (action === 'add' || action === 'create' || action === 'upsert') {
    const source = parseStoryboardParentOptions({
      production: parsed.options.production,
      segment: parsed.options.segment,
      sceneMoment: parsed.options.sceneMoment ?? parsed.options['scene-moment'],
    })
    const result = await engine.createStoryboard({
      id: parsed.options.id ?? 'main',
      productionId: source.productionId,
      segmentId: source.segmentId,
      sceneMomentId: source.sceneMomentId,
      title: parsed.options.title ?? parsed.positionals[0],
      order: parseOptionalNumberOption(parsed.options.order, 'order'),
    })
    printResult(result, options)
    return
  }
  throw new Error(`unknown /storyboard action: ${action}`)
}

async function dispatchInteractiveContentUnitCommand(args: string[], options: WorkspaceOptions, engine: CliEngine): Promise<void> {
  const action = args.shift()
  const parsed = parseSlashOptions(args)
  if (action === 'add' || action === 'create' || action === 'upsert') {
    const title = parsed.options.title ?? parsed.positionals[0]
    const sourceOptions: AddContentUnitOptions = {
      id: parsed.options.id,
      title,
      kind: parsed.options.kind ?? 'shot',
      production: parsed.options.production,
      segment: parsed.options.segment,
      sceneMoment: parsed.options.sceneMoment ?? parsed.options['scene-moment'],
      storyboard: parsed.options.storyboard ?? 'main',
      prompt: parsed.options.prompt,
      description: parsed.options.description,
      order: parsed.options.order,
      duration: parsed.options.duration,
      shotSize: parsed.options.shotSize ?? parsed.options['shot-size'],
      cameraAngle: parsed.options.cameraAngle ?? parsed.options['camera-angle'],
      cameraMotion: parsed.options.cameraMotion ?? parsed.options['camera-motion'],
    }
    const source = parseContentUnitSourceOptions(sourceOptions)
    const result = await engine.createContentUnit({
      id: sourceOptions.id,
      title: sourceOptions.title,
      kind: sourceOptions.kind,
      productionId: source.productionId,
      segmentId: source.segmentId,
      sceneMomentId: source.sceneMomentId,
      storyboardId: source.storyboardId,
      prompt: sourceOptions.prompt,
      description: sourceOptions.description,
      order: parseOptionalNumberOption(sourceOptions.order, 'order'),
      durationSeconds: parseOptionalNumberOption(sourceOptions.duration, 'duration'),
      shotSize: sourceOptions.shotSize,
      cameraAngle: sourceOptions.cameraAngle,
      cameraMotion: sourceOptions.cameraMotion,
    })
    printResult(result, options)
    return
  }
  throw new Error(`unknown /content-unit action: ${action}`)
}

async function dispatchInteractiveEntityCommand(args: string[], options: WorkspaceOptions, engine: CliEngine): Promise<void> {
  const action = args.shift()
  if (action !== 'list' && action !== undefined) throw new Error(`unknown /entity action: ${action}`)
  const entityKindInput = args[0]?.startsWith('--') ? undefined : args.shift()
  if (entityKindInput !== undefined && !isSemanticEntityKind(entityKindInput)) {
    throw new Error(`unknown entity kind: ${entityKindInput}`)
  }
  const parsed = parseSlashOptions(args)
  const result = await engine.queryEntities({
    ...(entityKindInput !== undefined ? { entityKind: entityKindInput } : {}),
    ...(parsed.options.kind !== undefined ? { kind: parsed.options.kind } : {}),
    ...(parsed.options.query !== undefined ? { query: parsed.options.query } : {}),
    ...(parsed.options.limit !== undefined ? { limit: parsePositiveIntegerOption(parsed.options.limit, 'limit') } : {}),
  })
  printEntityList(result, options, {
    title: entityKindInput ? `${entityKindInput} entities` : 'Entities',
    columns: [
      { header: 'Kind', value: (item) => item.entityKind },
      { header: 'ID', value: (item) => item.id },
      { header: 'Type', value: (item) => item.record.setting_kind ?? item.record.asset_kind ?? item.record.unit_kind ?? item.record.kind },
      { header: 'Title', value: (item) => item.record.title ?? item.record.label ?? item.id },
      { header: 'Path', value: (item) => item.path, maxWidth: 52 },
    ],
  })
}

async function dispatchInteractiveCandidateCommand(args: string[], options: WorkspaceOptions, engine: CliEngine): Promise<void> {
  const action = args.shift()
  const parsed = parseSlashOptions(args)
  if (action === 'add' || action === 'append') {
    const target = parsed.options.target ?? parsed.positionals[0]
    const resourceId = parsed.options.resourceId ?? parsed.options['resource-id'] ?? parsed.positionals[1]
    if (!target || !resourceId) {
      throw new Error('usage: /candidate add <target> <resource-id> [--id <id>] [--kind <kind>] [--source <source>] [--notes <text>]')
    }
    const result = await engine.appendCandidate({
      targetPath: targetPathFromSelectionTarget(target),
      targetKind: parseTargetKindOption(parsed.options.kind, target),
      payload: pruneUndefined({
        id: parsed.options.id,
        resource_id: resourceId,
        source: parsed.options.source ?? 'manual',
        notes: parsed.options.notes,
      }),
    })
    printResult(result, options)
    return
  }
  throw new Error(`unknown /candidate action: ${action}`)
}

function printInteractiveHelp(): void {
  console.log(`Slash commands:
  /project init [id] [--title <title>] [--language <language>] [--standard <key=value>] [--overwrite]
  /init [id] [--title <title>] [--language <language>] [--standard <key=value>] [--overwrite]
  /setting list [--kind <kind>] [--query <text>] [--limit <n>]
  /setting add <id> [--title <title>] [--kind <kind>] [--description <text>]
  /asset list [--setting <id>] [--state <id>] [--query <text>] [--limit <n>]
  /asset add <id> [--title <title>] [--setting <id>] [--state <id>] [--slot <slot>] [--kind <kind>] [--prompt <text>]
  /production add [--id <id>] [--title <title>]
  /segment add --title <title> [--production <id>] [--id <id>] [--order <n>]
  /scene-moment add --title <title> --segment <id-or-path> [--production <id>] [--id <id>] [--storyboard <id>]
  /storyboard add --scene-moment <id-or-path> [--segment <id-or-path>] [--id <id>] [--title <title>] [--order <n>]
  /content-unit add --title <title> --scene-moment <id-or-path> [--storyboard <id-or-path>] [--prompt <text>]
  /entity list [entityKind] [--kind <kind>] [--query <text>] [--limit <n>]
  /candidate add <target> <resource-id> [--kind <kind>] [--id <id>] [--source <source>] [--notes <text>]
  /compiler review
  /compiler compile
  /compiler prompt <contentUnitId>
  /compiler artifacts [--build-id <id>] [--created-at <iso>]
  /review
  /compile
  /help
  /exit`)
}

function printResult(result: unknown, options: WorkspaceOptions): void {
  if (options.json) {
    console.log(JSON.stringify(result, null, 2))
    return
  }
  console.log(JSON.stringify(result, null, 2))
}

interface TableColumn<T> {
  header: string
  value: (item: T) => unknown
  maxWidth?: number
}

function printEntityList(
  entities: MovScriptWorkspaceIndexedEntity[],
  options: WorkspaceOptions,
  table: { title: string; columns: TableColumn<MovScriptWorkspaceIndexedEntity>[] },
): void {
  if (options.json) {
    printResult(entities, options)
    return
  }
  if (entities.length === 0) {
    console.log(`${table.title}: no entities found`)
    return
  }
  console.log(renderTable(table.columns, entities))
}

function printSettingsTable(settings: MovScriptWorkspaceIndexedEntity[], options: WorkspaceOptions): void {
  printEntityList(settings, options, {
    title: 'Settings',
    columns: [
      { header: 'ID', value: (entity) => entity.id },
      { header: 'Kind', value: (entity) => entity.record.setting_kind ?? entity.record.kind },
      { header: 'Title', value: (entity) => entity.record.title ?? entity.id },
      { header: 'Description', value: (entity) => entity.record.description, maxWidth: 44 },
      { header: 'Path', value: (entity) => entity.path, maxWidth: 52 },
    ],
  })
}

function printAssetsTable(assets: MovScriptWorkspaceIndexedEntity[], options: WorkspaceOptions): void {
  printEntityList(assets, options, {
    title: 'Assets',
    columns: [
      { header: 'ID', value: (entity) => entity.id },
      { header: 'Kind', value: (entity) => entity.record.asset_kind ?? entity.record.kind },
      { header: 'Setting', value: (entity) => entity.record.setting_id },
      { header: 'State', value: (entity) => entity.record.setting_state_id },
      { header: 'Slot', value: (entity) => entity.record.slot },
      { header: 'Title', value: (entity) => entity.record.title ?? entity.id },
      { header: 'Path', value: (entity) => entity.path, maxWidth: 52 },
    ],
  })
}

async function printPlanningEntityList(
  entityKind: CliSemanticEntityKind,
  title: string,
  options: PlanningListOptions,
  command: Command,
): Promise<void> {
  const merged = mergeGlobalOptions(options, command)
  const entities = await listPlanningEntities(createCliEngine(merged), entityKind, planningListInput(options))
  printEntityList(entities, merged, {
    title,
    columns: [
      { header: 'ID', value: (entity) => entity.id },
      { header: 'Kind', value: (entity) => entity.record.segment_kind ?? entity.record.kind },
      { header: 'Order', value: (entity) => entity.record.order },
      { header: 'Title', value: (entity) => entity.record.title ?? entity.record.name },
      { header: 'Path', value: (entity) => entity.path, maxWidth: 64 },
    ],
  })
}

async function deletePlanningEntity(
  entityKind: CliSemanticEntityKind,
  idOrPath: string,
  options: PlanningDeleteOptions,
  command: Command,
): Promise<void> {
  const merged = mergeGlobalOptions(options, command)
  const engine = createCliEngine(merged)
  const result = await deletePlanningEntityWithEngine(engine, entityKind, {
    id: idOrPath,
    ...planningParentInput(options),
  })
  printResult({ deleted: true, entityKind, id: result.entity.id, path: result.entity.path }, merged)
}

function planningListInput(options: PlanningListOptions): {
  kind?: string
  query?: string
  productionId?: string | number
  segmentId?: string | number
  sceneMomentId?: string | number
  limit?: number
} {
  return pruneUndefined({
    kind: options.kind,
    query: options.query,
    productionId: options.production,
    segmentId: options.segment !== undefined ? parseSegmentRefOption(options.segment).segmentId ?? options.segment : undefined,
    sceneMomentId: options.sceneMoment !== undefined ? parseSceneMomentRefOption(options.sceneMoment).sceneMomentId ?? options.sceneMoment : undefined,
    limit: options.limit !== undefined ? parsePositiveIntegerOption(options.limit, 'limit') : undefined,
  })
}

function planningParentInput(options: PlanningDeleteOptions): {
  productionId?: string | number
  segmentId?: string | number
  sceneMomentId?: string | number
} {
  return pruneUndefined({
    productionId: options.production,
    segmentId: options.segment !== undefined ? parseSegmentRefOption(options.segment).segmentId ?? options.segment : undefined,
    sceneMomentId: options.sceneMoment !== undefined ? parseSceneMomentRefOption(options.sceneMoment).sceneMomentId ?? options.sceneMoment : undefined,
  })
}

function listPlanningEntities(
  engine: ReturnType<typeof createCliEngine>,
  entityKind: CliSemanticEntityKind,
  input: ReturnType<typeof planningListInput>,
): Promise<MovScriptWorkspaceIndexedEntity[]> {
  if (entityKind === 'production') return engine.listProductions(input)
  if (entityKind === 'segment') return engine.listSegments(input)
  if (entityKind === 'scene_moment') return engine.listSceneMoments(input)
  if (entityKind === 'storyboard') return engine.listStoryboards(input)
  if (entityKind === 'content_unit') return engine.listContentUnits(input)
  return engine.queryEntities({ entityKind, ...input })
}

function deletePlanningEntityWithEngine(
  engine: ReturnType<typeof createCliEngine>,
  entityKind: CliSemanticEntityKind,
  input: { id: string | number; productionId?: string | number; segmentId?: string | number; sceneMomentId?: string | number },
) {
  if (entityKind === 'production') return engine.deleteProduction(input)
  if (entityKind === 'segment') return engine.deleteSegment(input)
  if (entityKind === 'scene_moment') return engine.deleteSceneMoment(input)
  if (entityKind === 'storyboard') return engine.deleteStoryboard(input)
  if (entityKind === 'content_unit') return engine.deleteContentUnit(input)
  throw new Error(`delete is not supported for ${entityKind}`)
}

function renderTable<T>(columns: TableColumn<T>[], rows: T[]): string {
  const renderedRows = rows.map((row) => columns.map((column) => formatCell(column.value(row), column.maxWidth)))
  const widths = columns.map((column, index) => {
    const values = renderedRows.map((row) => row[index] ?? '')
    return Math.max(column.header.length, ...values.map((value) => value.length))
  })
  const separator = `+-${widths.map((width) => '-'.repeat(width)).join('-+-')}-+`
  const header = tableRow(columns.map((column) => column.header), widths)
  const body = renderedRows.map((row) => tableRow(row, widths))
  return [separator, header, separator, ...body, separator].join('\n')
}

function tableRow(cells: string[], widths: number[]): string {
  return `| ${cells.map((cell, index) => cell.padEnd(widths[index] ?? 0)).join(' | ')} |`
}

function formatCell(value: unknown, maxWidth = 72): string {
  const text = scalarDisplayValue(value).replace(/\s+/g, ' ').trim()
  if (text.length <= maxWidth) return text
  return `${text.slice(0, Math.max(0, maxWidth - 3))}...`
}

function scalarDisplayValue(value: unknown): string {
  if (value === undefined || value === null || value === '') return '-'
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return String(value)
  return JSON.stringify(value)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isSemanticEntityKind(value: string): value is CliSemanticEntityKind {
  return (SEMANTIC_ENTITY_KINDS as readonly string[]).includes(value)
}

function collectOption(value: string, previous: string[]): string[] {
  return [...previous, value]
}

function parseKeyValueOptions(values: string[]): Record<string, unknown> {
  const result: Record<string, unknown> = {}
  for (const value of values) {
    const index = value.indexOf('=')
    if (index <= 0) throw new Error(`expected key=value option: ${value}`)
    result[value.slice(0, index)] = parseScalar(value.slice(index + 1))
  }
  return result
}

function parseOptionalKeyValueOptions(values: string[]): Record<string, unknown> | undefined {
  if (values.length === 0) return undefined
  return parseKeyValueOptions(values)
}

function parseScalar(value: string): unknown {
  if (value === 'true') return true
  if (value === 'false') return false
  if (value !== '' && Number.isFinite(Number(value))) return Number(value)
  return value
}

function pruneUndefined(value: Record<string, unknown>): Record<string, unknown> {
  const output: Record<string, unknown> = {}
  for (const [key, item] of Object.entries(value)) {
    if (item !== undefined) output[key] = item
  }
  return output
}

function parsePositiveIntegerOption(value: string, optionName: string): number {
  const parsed = Number(value)
  if (!Number.isInteger(parsed) || parsed <= 0) throw new Error(`${optionName} must be a positive integer`)
  return parsed
}

function parseOptionalNumberOption(value: string | undefined, optionName: string): number | undefined {
  if (value === undefined) return undefined
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) throw new Error(`${optionName} must be a number`)
  return parsed
}

interface ContentUnitSourceRefs {
  productionId?: string
  segmentId?: string
  sceneMomentId?: string
  storyboardId?: string
}

function parseContentUnitSourceOptions(options: AddContentUnitOptions): ContentUnitSourceRefs {
  const sceneMoment = parseSceneMomentRefOption(options.sceneMoment)
  const storyboard = parseStoryboardRefOption(options.storyboard)
  const source = pruneUndefined({
    productionId: options.production ?? storyboard.productionId ?? sceneMoment.productionId,
    segmentId: options.segment ?? storyboard.segmentId ?? sceneMoment.segmentId,
    sceneMomentId: sceneMoment.sceneMomentId ?? storyboard.sceneMomentId,
    storyboardId: storyboard.storyboardId ?? 'main',
  })
  if (!source.sceneMomentId) {
    throw new Error('--scene-moment is required unless --storyboard is a path under scene_moments')
  }
  return source
}

function parsePlanningParentOptions(options: {
  production?: string
  segment?: string
}): { productionId: string; segmentId: string } {
  const segment = parseSegmentRefOption(options.segment)
  const productionId = options.production ?? segment.productionId ?? 'main'
  const segmentId = segment.segmentId
  if (!segmentId) throw new Error('--segment is required')
  return { productionId, segmentId }
}

function parseStoryboardParentOptions(options: {
  production?: string
  segment?: string
  sceneMoment?: string
}): { productionId: string; segmentId: string; sceneMomentId: string } {
  const segment = parseSegmentRefOption(options.segment)
  const sceneMoment = parseSceneMomentRefOption(options.sceneMoment)
  const productionId = options.production ?? sceneMoment.productionId ?? segment.productionId ?? 'main'
  const segmentId = sceneMoment.segmentId ?? segment.segmentId
  const sceneMomentId = sceneMoment.sceneMomentId
  if (!segmentId) throw new Error('--segment is required unless --scene-moment is a path under segments')
  if (!sceneMomentId) throw new Error('--scene-moment is required')
  return { productionId, segmentId, sceneMomentId }
}

function parseSegmentRefOption(value: string | undefined): ContentUnitSourceRefs {
  if (!value) return {}
  if (value.includes('/')) return parsePlanningSourcePath(value)
  return { segmentId: value }
}

function parseSceneMomentRefOption(value: string | undefined): ContentUnitSourceRefs {
  if (!value) return {}
  if (value.includes('/')) return parsePlanningSourcePath(value)
  return { sceneMomentId: value }
}

function parseStoryboardRefOption(value: string | undefined): ContentUnitSourceRefs {
  if (!value) return {}
  if (value.includes('/')) return parsePlanningSourcePath(value)
  return { storyboardId: value }
}

function parsePlanningSourcePath(value: string): ContentUnitSourceRefs {
  const path = normalizeCliPath(targetPathFromSelectionTarget(value))
  const parts = path.split('/').filter(Boolean)
  return pruneUndefined({
    productionId: pathSegmentAfter(parts, 'productions'),
    segmentId: pathSegmentAfter(parts, 'segments'),
    sceneMomentId: pathSegmentAfter(parts, 'scene_moments'),
    storyboardId: pathSegmentAfter(parts, 'storyboards'),
  })
}

function pathSegmentAfter(parts: string[], marker: string): string | undefined {
  const index = parts.indexOf(marker)
  const value = index >= 0 ? parts[index + 1] : undefined
  if (!value || value.endsWith('.json')) return undefined
  return value
}

function parseSlashOptions(args: string[]): {
  options: Record<string, string>
  positionals: string[]
} {
  const options: Record<string, string> = {}
  const positionals: string[] = []
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index]!
    if (!arg.startsWith('--')) {
      positionals.push(arg)
      continue
    }
    const withoutPrefix = arg.slice(2)
    const equals = withoutPrefix.indexOf('=')
    if (equals >= 0) {
      options[withoutPrefix.slice(0, equals)] = withoutPrefix.slice(equals + 1)
      continue
    }
    const next = args[index + 1]
    if (next === undefined || next.startsWith('--')) {
      options[withoutPrefix] = 'true'
      continue
    }
    options[withoutPrefix] = next
    index += 1
  }
  return { options, positionals }
}

function parseCommandLine(inputValue: string): string[] {
  const args: string[] = []
  let current = ''
  let quote: '"' | "'" | undefined
  let escaping = false

  for (const char of inputValue) {
    if (escaping) {
      current += char
      escaping = false
      continue
    }
    if (char === '\\') {
      escaping = true
      continue
    }
    if (quote) {
      if (char === quote) {
        quote = undefined
      } else {
        current += char
      }
      continue
    }
    if (char === '"' || char === "'") {
      quote = char
      continue
    }
    if (/\s/.test(char)) {
      if (current) {
        args.push(current)
        current = ''
      }
      continue
    }
    current += char
  }

  if (escaping) current += '\\'
  if (quote) throw new Error('unterminated quoted string')
  if (current) args.push(current)
  return args
}

function parseGenerationTarget(value: string): { kind: string; id?: string; path?: string } {
  const separator = value.indexOf(':')
  if (separator > 0) {
    const kind = value.slice(0, separator)
    const target = value.slice(separator + 1)
    if (target.includes('/')) return { kind, path: target }
    if (target) return { kind, id: target }
  }
  if (value.includes('/')) return { kind: inferTargetKind(value), path: value }
  throw new Error('target must use kind:id or a target path')
}

function targetPathFromSelectionTarget(value: string): string {
  const separator = value.indexOf(':')
  if (separator > 0 && value.slice(separator + 1).includes('/')) return value.slice(separator + 1)
  return value
}

function normalizeCliPath(value: string): string {
  return value.replace(/\\/g, '/').replace(/^\.movscript\//, '').replace(/^\/+/, '').replace(/\/+$/, '')
}

function inferTargetKind(value: string): 'asset' | 'keyframe' | 'content_unit' {
  const path = targetPathFromSelectionTarget(value)
  if (path.endsWith('/asset.json') || path.endsWith('asset.json')) return 'asset'
  if (path.endsWith('/keyframe.json') || path.endsWith('keyframe.json')) return 'keyframe'
  if (path.endsWith('/content_unit.json') || path.endsWith('content_unit.json')) return 'content_unit'
  const kind = value.split(':')[0]
  if (kind === 'asset' || kind === 'keyframe' || kind === 'content_unit') return kind
  throw new Error('target kind is required for selection')
}

function parseTargetKindOption(
  kind: string | undefined,
  target: string,
): 'asset' | 'keyframe' | 'content_unit' {
  if (kind === undefined) return inferTargetKind(target)
  if (kind === 'asset' || kind === 'keyframe' || kind === 'content_unit') return kind
  throw new Error('target kind must be asset, keyframe, or content_unit')
}

if (isDirectCliInvocation()) {
  void runMovScriptLangCli()
}

function isDirectCliInvocation(): boolean {
  if (!process.argv[1]) return false
  try {
    return realpathSync(fileURLToPath(import.meta.url)) === realpathSync(process.argv[1])
  } catch {
    return import.meta.url === `file://${process.argv[1]}`
  }
}
