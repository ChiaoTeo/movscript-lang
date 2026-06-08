import { createHash } from 'node:crypto'
import type {
  MovScriptWorkspaceDomainIndex,
  MovScriptWorkspaceIndexedEntity,
} from '@movscript/workspace/indexer'
import { queryMovScriptWorkspaceEntities } from '@movscript/workspace/indexer'
import { sameEntityRef } from '@movscript/workspace/layout'

export type ContentUnitOutputKind = 'image' | 'video' | 'audio' | 'text' | 'metadata'
export type ContentUnitRuntimePanelStatus = 'ready' | 'blocked'

export interface ContentUnitHashInput {
  role: string
  kind: 'source_field' | 'source_entity' | 'upstream_selection' | 'runtime_intent' | 'adapter_rule' | 'custom'
  ref?: string
  value: unknown
  continuityRole?: string
  required?: boolean
  includedInHash?: boolean
  metadata?: Record<string, unknown>
}

export interface ContentUnitInputVersion {
  schema: 'movscript.input_version.v1'
  hash: string
  compiler_version: string
  adapter_version: string
  content_unit_type: string
  created_at: string
}

export interface ContentUnitUpstreamSelection {
  content_unit_ref: string
  candidate_id?: string | number
  resource_id?: string | number
  accepted_input_hash?: string
  stale?: boolean
  stale_policy?: string
  role?: string
  included_in_hash?: boolean
  continuity_role?: string
}

export interface ContentUnitRuntimePanel {
  schema: 'movscript.content_unit_runtime_panel.v1'
  content_unit_ref: string
  content_unit_id?: string | number
  content_unit_type: string
  adapter_version: string
  output_kind: ContentUnitOutputKind
  input_hash: string
  status: ContentUnitRuntimePanelStatus
  prompt?: {
    text?: string
    negative_text?: string
    structured?: Record<string, unknown>
  }
  runtime_request?: {
    capability: string
    provider_intent?: string
    model_intent?: Record<string, unknown>
    inputs: Array<{
      role: string
      kind: 'text' | 'image' | 'video' | 'audio' | 'metadata'
      ref?: string
      resource_id?: string | number
      mime_type?: string
      required: boolean
    }>
    params?: Record<string, unknown>
    metadata?: Record<string, unknown>
  }
  review?: {
    warnings?: string[]
    blockers?: string[]
  }
}

export interface ContentUnitDependencyReport {
  schema: 'movscript.content_unit_dependency_report.v1'
  content_unit_ref: string
  content_unit_type: string
  input_hash: string
  dependencies: Array<{
    role: string
    entityKind?: string
    id?: string | number
    path?: string
    required?: boolean
  }>
  upstream_selections: ContentUnitUpstreamSelection[]
  hash_inputs: Array<{
    role: string
    kind: ContentUnitHashInput['kind']
    ref?: string
    hash: string
    included_in_hash: boolean
    continuity_role?: string
  }>
  hash_rule: {
    adapter_type: string
    adapter_version: string
    rule_id: string
    rule_version: string
    included_roles: string[]
  }
  issues: Array<{
    severity: 'error' | 'warning'
    message: string
  }>
}

export interface ContentUnitSelectionValidity {
  schema: 'movscript.content_unit_selection_validity.v1'
  content_unit_ref: string
  selected: boolean
  candidate_id?: string | number
  resource_id?: string | number
  current_input_hash: string
  accepted_input_hash?: string
  stale: boolean
  stale_policy: 'strict' | 'accept_stale'
  reason?: string
}

export interface ContentUnitBuildArtifactBundle {
  contentUnitId: string | number
  contentUnitPath: string
  runtimePanel: ContentUnitRuntimePanel
  inputVersion: ContentUnitInputVersion
  dependencyReport: ContentUnitDependencyReport
  selectionValidity: ContentUnitSelectionValidity
}

interface AdapterContext {
  index: MovScriptWorkspaceDomainIndex
  contentUnit: MovScriptWorkspaceIndexedEntity
  compilerVersion: string
  createdAt: string
}

interface AdapterBuild {
  dependencies: AdapterDependencies
  inputVersion: ContentUnitInputVersion
}

interface ContentUnitAdapter {
  type: string
  version: string
  outputKind: ContentUnitOutputKind
  hashRule: {
    id: string
    version: string
  }
  validate(context: AdapterContext): ContentUnitDependencyReport['issues']
  collectDependencies(context: AdapterContext): AdapterDependencies
  collectHashInputs(context: AdapterContext, dependencies: AdapterDependencies): ContentUnitHashInput[]
  rebuild(context: AdapterContext, build: AdapterBuild): ContentUnitRuntimePanel
}

interface AdapterDependencies {
  entities: Record<string, MovScriptWorkspaceIndexedEntity[]>
  upstreamSelections: ContentUnitUpstreamSelection[]
}

const COMPILER_VERSION = 'movscript-compiler@0.1.0'

const CONTENT_UNIT_ADAPTERS: Record<string, ContentUnitAdapter> = {
  asset_ref: assetRefAdapter(),
  storyboard_video: storyboardVideoAdapter(),
}

export function buildContentUnitArtifacts(
  index: MovScriptWorkspaceDomainIndex,
  input: { createdAt: string; compilerVersion?: string },
): ContentUnitBuildArtifactBundle[] {
  return canonicalEntities(index)
    .filter((entity) => entity.entityKind === 'content_unit' && entity.id !== undefined)
    .map((contentUnit) => buildContentUnitArtifact(index, contentUnit, {
      createdAt: input.createdAt,
      compilerVersion: input.compilerVersion ?? COMPILER_VERSION,
    }))
}

export function buildContentUnitArtifact(
  index: MovScriptWorkspaceDomainIndex,
  contentUnit: MovScriptWorkspaceIndexedEntity,
  input: { createdAt: string; compilerVersion?: string },
): ContentUnitBuildArtifactBundle {
  if (contentUnit.id === undefined) throw new Error(`content_unit missing id: ${contentUnit.path}`)
  const contentUnitType = requiredString(contentUnit.record.content_unit_type, `content_unit_type missing: ${contentUnit.path}`)
  const adapter = CONTENT_UNIT_ADAPTERS[contentUnitType]
  if (!adapter) throw new Error(`unsupported content_unit_type: ${contentUnitType}`)
  const context: AdapterContext = {
    index,
    contentUnit,
    compilerVersion: input.compilerVersion ?? COMPILER_VERSION,
    createdAt: input.createdAt,
  }
  const issues = adapter.validate(context)
  const dependencies = adapter.collectDependencies(context)
  const hashInputs = adapter.collectHashInputs(context, dependencies)
  const inputVersion = inputVersionFor(adapter, context, hashInputs)
  const runtimePanel = adapter.rebuild(context, { dependencies, inputVersion })
  const dependencyReport: ContentUnitDependencyReport = {
    schema: 'movscript.content_unit_dependency_report.v1',
    content_unit_ref: entityDir(contentUnit.path),
    content_unit_type: contentUnitType,
    input_hash: inputVersion.hash,
    dependencies: Object.entries(dependencies.entities).flatMap(([role, entities]) => {
      return entities.map((entity) => ({
        role,
        entityKind: entity.entityKind,
        ...(entity.id !== undefined ? { id: entity.id } : {}),
        path: entity.path,
      }))
    }),
    upstream_selections: dependencies.upstreamSelections,
    hash_inputs: hashInputs.map((hashInput) => ({
      role: hashInput.role,
      kind: hashInput.kind,
      ref: hashInput.ref,
      hash: sha256(JSON.stringify(stableJsonValue(hashInput.value))),
      included_in_hash: hashInput.includedInHash !== false,
      ...(hashInput.continuityRole ? { continuity_role: hashInput.continuityRole } : {}),
    })),
    hash_rule: {
      adapter_type: adapter.type,
      adapter_version: adapter.version,
      rule_id: adapter.hashRule.id,
      rule_version: adapter.hashRule.version,
      included_roles: [...new Set(hashInputs.filter((hashInput) => hashInput.includedInHash !== false).map((hashInput) => hashInput.role))].sort(),
    },
    issues,
  }
  const selection = readSelectedContentUnit(index, entityDir(contentUnit.path))
  const stalePolicy = selection?.stale_policy === 'accept_stale' ? 'accept_stale' : 'strict'
  const acceptedInputHash = stringField(selection?.accepted_input_hash)
  const selectedCandidateId = idField(selection?.candidate_id)
  const selectedResourceId = idField(selection?.resource_id)
  const selectionValidity: ContentUnitSelectionValidity = {
    schema: 'movscript.content_unit_selection_validity.v1',
    content_unit_ref: entityDir(contentUnit.path),
    selected: Boolean(selection),
    ...(selectedCandidateId !== undefined ? { candidate_id: selectedCandidateId } : {}),
    ...(selectedResourceId !== undefined ? { resource_id: selectedResourceId } : {}),
    current_input_hash: inputVersion.hash,
    ...(acceptedInputHash ? { accepted_input_hash: acceptedInputHash } : {}),
    stale: Boolean(acceptedInputHash && acceptedInputHash !== inputVersion.hash),
    stale_policy: stalePolicy,
    reason: stringField(selection?.reason),
  }
  return {
    contentUnitId: contentUnit.id,
    contentUnitPath: contentUnit.path,
    runtimePanel,
    inputVersion,
    dependencyReport,
    selectionValidity,
  }
}

function assetRefAdapter(): ContentUnitAdapter {
  return {
    type: 'asset_ref',
    version: 'asset_ref@1',
    outputKind: 'image',
    hashRule: { id: 'asset_ref.hash', version: '1' },
    validate(context) {
      const issues: ContentUnitDependencyReport['issues'] = []
      if (context.contentUnit.record.output_kind !== 'image') issues.push({ severity: 'error', message: 'asset_ref output_kind must be image' })
      if (!stringField(context.contentUnit.record.asset_ref)) issues.push({ severity: 'error', message: 'asset_ref requires asset_ref' })
      return issues
    },
    collectDependencies(context) {
      const asset = findEntityByRef(context.index, 'asset', context.contentUnit.record.asset_ref)
      const owners = asset ? assetOwners(context.index, asset) : []
      return {
        entities: {
          project_standards: optionalEntity(firstEntity(context.index, 'project_standards')),
          asset: optionalEntity(asset),
          owner: owners,
        },
        upstreamSelections: [],
      }
    },
    collectHashInputs(context, dependencies) {
      return [
        hashSourceField(context.contentUnit, 'content_unit_type'),
        hashSourceField(context.contentUnit, 'output_kind'),
        hashSourceField(context.contentUnit, 'asset_ref'),
        hashSourceField(context.contentUnit, 'edit_prompt'),
        hashSourceField(context.contentUnit, 'model_intent'),
        ...hashEntities(entityList(dependencies, 'project_standards'), 'project_standards'),
        ...hashEntities(entityList(dependencies, 'asset'), 'asset'),
        ...hashEntities(entityList(dependencies, 'owner'), 'owner'),
      ]
    },
    rebuild(context, build) {
      const asset = entityList(build.dependencies, 'asset')[0]
      const owner = entityList(build.dependencies, 'owner')[0]
      const standards = entityList(build.dependencies, 'project_standards')[0]
      const editPrompt = recordField(context.contentUnit.record.edit_prompt)
      const promptParts = [
        'Create an asset reference image.',
        summaryLine('Asset', asset?.record),
        summaryLine('Owner', owner?.record),
        summaryLine('Project standards', standards?.record),
        stringField(asset?.record.prompt_hint),
        stringField(editPrompt?.text),
      ].filter(isString)
      return {
        schema: 'movscript.content_unit_runtime_panel.v1',
        content_unit_ref: entityDir(context.contentUnit.path),
        content_unit_id: context.contentUnit.id,
        content_unit_type: 'asset_ref',
        adapter_version: this.version,
        output_kind: 'image',
        input_hash: build.inputVersion.hash,
        status: entityList(build.dependencies, 'asset').length > 0 ? 'ready' : 'blocked',
        prompt: {
          text: promptParts.join('\n'),
          negative_text: stringField(editPrompt?.negative_text),
          structured: recordField(editPrompt?.structured),
        },
        runtime_request: {
          capability: 'image',
          model_intent: recordField(context.contentUnit.record.model_intent),
          inputs: [],
          params: recordField(recordField(context.contentUnit.record.model_intent)?.params),
        },
        review: entityList(build.dependencies, 'asset').length > 0 ? undefined : { blockers: ['asset_ref does not resolve'] },
      }
    },
  }
}

function storyboardVideoAdapter(): ContentUnitAdapter {
  return {
    type: 'storyboard_video',
    version: 'storyboard_video@1',
    outputKind: 'video',
    hashRule: { id: 'storyboard_video.hash', version: '1' },
    validate(context) {
      const issues: ContentUnitDependencyReport['issues'] = []
      if (context.contentUnit.record.output_kind !== 'video') issues.push({ severity: 'error', message: 'storyboard_video output_kind must be video' })
      if (!stringField(context.contentUnit.record.scene_moment_ref)) issues.push({ severity: 'error', message: 'storyboard_video requires scene_moment_ref' })
      if (!stringField(context.contentUnit.record.storyboard_ref)) issues.push({ severity: 'error', message: 'storyboard_video requires storyboard_ref' })
      return issues
    },
    collectDependencies(context) {
      const sceneMoment = findEntityByRef(context.index, 'scene_moment', context.contentUnit.record.scene_moment_ref)
      const storyboard = findEntityByRef(context.index, 'storyboard', context.contentUnit.record.storyboard_ref)
      const sceneMomentDir = sceneMoment ? entityDir(sceneMoment.path) : ''
      const keyframeRefs = arrayField(context.contentUnit.record.keyframe_refs)
      const keyframes = keyframeRefs.length > 0
        ? keyframeRefs.map((ref) => findEntityByRef(context.index, 'keyframe', ref)).filter(isDefined)
        : sceneMomentDir
          ? queryMovScriptWorkspaceEntities(context.index, { entityKind: 'keyframe' })
            .filter((entity) => entity.path.startsWith(`${sceneMomentDir}/keyframes/`))
          : []
      const expressionUnits = sceneMomentDir
        ? queryMovScriptWorkspaceEntities(context.index, { entityKind: 'expression_unit' })
          .filter((entity) => entity.path.startsWith(`${sceneMomentDir}/expression_units/`))
        : []
      const audioCues = sceneMomentDir
        ? queryMovScriptWorkspaceEntities(context.index, { entityKind: 'audio_cue' })
          .filter((entity) => entity.path.startsWith(`${sceneMomentDir}/audio_cues/`))
        : []
      const assetRefs = [
        ...arrayField(storyboard?.record.setting_refs).filter(isRecord).map((ref) => ref.setting_id),
        ...keyframes.flatMap((keyframe) => arrayField(keyframe.record.reference_asset_refs)),
      ].filter((item) => item !== undefined)
      const upstreamSelections = resolveAssetRefSelections(context.index, assetRefs)
      return {
        entities: {
          project_standards: optionalEntity(firstEntity(context.index, 'project_standards')),
          scene_moment: optionalEntity(sceneMoment),
          storyboard: optionalEntity(storyboard),
          keyframes,
          expression_units: expressionUnits,
          audio_cues: audioCues,
        },
        upstreamSelections,
      }
    },
    collectHashInputs(context, dependencies) {
      return [
        hashSourceField(context.contentUnit, 'content_unit_type'),
        hashSourceField(context.contentUnit, 'output_kind'),
        hashSourceField(context.contentUnit, 'scene_moment_ref'),
        hashSourceField(context.contentUnit, 'storyboard_ref'),
        hashSourceField(context.contentUnit, 'keyframe_refs'),
        hashSourceField(context.contentUnit, 'edit_prompt'),
        hashSourceField(context.contentUnit, 'model_intent'),
        ...hashEntities(entityList(dependencies, 'project_standards'), 'project_standards'),
        ...hashEntities(entityList(dependencies, 'scene_moment'), 'scene_moment'),
        ...hashEntities(entityList(dependencies, 'storyboard'), 'storyboard'),
        ...hashEntities(entityList(dependencies, 'keyframes'), 'keyframe', 'video_continuity'),
        ...hashEntities(entityList(dependencies, 'expression_units'), 'expression_unit', 'narrative_continuity'),
        ...hashEntities(entityList(dependencies, 'audio_cues'), 'audio_cue', 'sound_continuity'),
        ...dependencies.upstreamSelections.map((selection) => ({
          role: selection.role ?? 'asset_ref',
          kind: 'upstream_selection' as const,
          ref: selection.content_unit_ref,
          value: selection,
          continuityRole: selection.continuity_role,
        })),
      ]
    },
    rebuild(context, build) {
      const sceneMoment = entityList(build.dependencies, 'scene_moment')[0]
      const storyboard = entityList(build.dependencies, 'storyboard')[0]
      const standards = entityList(build.dependencies, 'project_standards')[0]
      const keyframes = entityList(build.dependencies, 'keyframes')
      const expressionUnits = entityList(build.dependencies, 'expression_units')
      const audioCues = entityList(build.dependencies, 'audio_cues')
      const editPrompt = recordField(context.contentUnit.record.edit_prompt)
      const promptParts = [
        'Create a storyboard video.',
        summaryLine('Project standards', standards?.record),
        summaryLine('Scene moment', sceneMoment?.record),
        summaryLine('Storyboard', storyboard?.record),
        ...keyframes.map((keyframe) => summaryLine('Keyframe', keyframe.record)),
        ...expressionUnits.map((expressionUnit) => summaryLine('Expression', expressionUnit.record)),
        ...audioCues.map((audioCue) => summaryLine('Audio cue', audioCue.record)),
        stringField(editPrompt?.text),
      ].filter(isString)
      return {
        schema: 'movscript.content_unit_runtime_panel.v1',
        content_unit_ref: entityDir(context.contentUnit.path),
        content_unit_id: context.contentUnit.id,
        content_unit_type: 'storyboard_video',
        adapter_version: this.version,
        output_kind: 'video',
        input_hash: build.inputVersion.hash,
        status: sceneMoment && storyboard ? 'ready' : 'blocked',
        prompt: {
          text: promptParts.join('\n'),
          negative_text: stringField(editPrompt?.negative_text),
          structured: recordField(editPrompt?.structured),
        },
        runtime_request: {
          capability: 'video',
          model_intent: recordField(context.contentUnit.record.model_intent),
          inputs: build.dependencies.upstreamSelections.map((selection) => ({
            role: selection.role ?? 'asset_ref',
            kind: 'image',
            resource_id: selection.resource_id,
            ref: selection.content_unit_ref,
            required: false,
          })),
          params: recordField(recordField(context.contentUnit.record.model_intent)?.params),
          metadata: {
            duration_sec: numberField(recordField(context.contentUnit.record.model_intent)?.duration_sec),
          },
        },
        review: sceneMoment && storyboard ? undefined : { blockers: ['scene_moment_ref or storyboard_ref does not resolve'] },
      }
    },
  }
}

function inputVersionFor(
  adapter: ContentUnitAdapter,
  context: AdapterContext,
  hashInputs: ContentUnitHashInput[],
): ContentUnitInputVersion {
  const canonicalInputs = hashInputs
    .filter((input) => input.includedInHash !== false)
    .map((input) => ({
      role: input.role,
      kind: input.kind,
      ref: input.ref,
      value: stableJsonValue(input.value),
      continuityRole: input.continuityRole,
    }))
    .sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)))
  const hash = sha256(JSON.stringify({
    adapter: adapter.type,
    adapterVersion: adapter.version,
    hashRule: adapter.hashRule,
    compilerVersion: context.compilerVersion,
    inputs: canonicalInputs,
  }))
  return {
    schema: 'movscript.input_version.v1',
    hash,
    compiler_version: context.compilerVersion,
    adapter_version: adapter.version,
    content_unit_type: adapter.type,
    created_at: context.createdAt,
  }
}

function resolveAssetRefSelections(
  index: MovScriptWorkspaceDomainIndex,
  refs: unknown[],
): ContentUnitUpstreamSelection[] {
  const assetRefs = refs.map(idField).filter(isDefined)
  const assetRefUnits = queryMovScriptWorkspaceEntities(index, { entityKind: 'content_unit' })
    .filter((entity) => entity.record.content_unit_type === 'asset_ref'
      && assetRefs.some((ref) => sameEntityRef(entity.record.asset_ref, ref, 'asset')))
  return assetRefUnits.flatMap((entity) => {
    const selection = readSelectedContentUnit(index, entityDir(entity.path))
    if (!selection) return []
    const candidateId = idField(selection.candidate_id)
    const resourceId = idField(selection.resource_id)
    return [{
      content_unit_ref: entityDir(entity.path),
      ...(candidateId !== undefined ? { candidate_id: candidateId } : {}),
      ...(resourceId !== undefined ? { resource_id: resourceId } : {}),
      accepted_input_hash: stringField(selection.accepted_input_hash),
      stale_policy: selection.stale_policy === 'accept_stale' ? 'accept_stale' : 'strict',
      role: 'asset_ref',
      included_in_hash: true,
      continuity_role: 'visual_reference',
    }]
  })
}

function readSelectedContentUnit(
  index: MovScriptWorkspaceDomainIndex,
  contentUnitRef: string,
): Record<string, unknown> | undefined {
  return index.documents.find((document) => {
    return document.path === `${contentUnitRef}/selection.json` && isRecord(document.data)
  })?.data as Record<string, unknown> | undefined
}

function findEntityByRef(
  index: MovScriptWorkspaceDomainIndex,
  entityKind: 'asset' | 'setting' | 'setting_state' | 'scene_moment' | 'storyboard' | 'keyframe',
  ref: unknown,
): MovScriptWorkspaceIndexedEntity | undefined {
  const value = idField(ref)
  if (value === undefined) return undefined
  const normalized = typeof value === 'string' ? value.replace(/\/+$/, '') : String(value)
  return queryMovScriptWorkspaceEntities(index, { entityKind })
    .find((entity) => {
      const dir = entityDir(entity.path)
      return dir === normalized || entity.path === `${normalized}/${entityKind}.json` || sameEntityRef(entity.id, value, entityKind)
    })
}

function requiredString(value: unknown, message: string): string {
  const next = stringField(value)
  if (!next) throw new Error(message)
  return next
}

function entityList(dependencies: AdapterDependencies, role: string): MovScriptWorkspaceIndexedEntity[] {
  return dependencies.entities[role] ?? []
}

function firstEntity(index: MovScriptWorkspaceDomainIndex, entityKind: 'project_standards'): MovScriptWorkspaceIndexedEntity | undefined {
  return queryMovScriptWorkspaceEntities(index, { entityKind, limit: 1 })[0]
}

function assetOwners(index: MovScriptWorkspaceDomainIndex, asset: MovScriptWorkspaceIndexedEntity): MovScriptWorkspaceIndexedEntity[] {
  const settingId = pathSegmentAfter(asset.path, 'settings')
  const stateId = pathSegmentAfter(asset.path, 'states')
  return [
    stateId ? findEntityByRef(index, 'setting_state', stateId) : undefined,
    settingId ? findEntityByRef(index, 'setting', settingId) : undefined,
  ].filter(isDefined)
}

function hashSourceField(entity: MovScriptWorkspaceIndexedEntity, field: string): ContentUnitHashInput {
  return { role: field, kind: 'source_field', ref: `${entity.path}#${field}`, value: entity.record[field] }
}

function hashEntities(
  entities: MovScriptWorkspaceIndexedEntity[],
  role: string,
  continuityRole?: string,
): ContentUnitHashInput[] {
  return entities.map((entity) => ({
    role,
    kind: 'source_entity' as const,
    ref: entity.path,
    value: entity.record,
    ...(continuityRole ? { continuityRole } : {}),
  }))
}

function optionalEntity<T>(entity: T | undefined): T[] {
  return entity ? [entity] : []
}

function canonicalEntities(index: MovScriptWorkspaceDomainIndex): MovScriptWorkspaceIndexedEntity[] {
  return index.entities
}

function entityDir(path: string): string {
  return path.replace(/\/[^/]+$/, '')
}

function summaryLine(label: string, record: Record<string, unknown> | undefined): string | undefined {
  if (!record) return undefined
  const title = stringField(record.title)
  const intent = stringField(record.visual_intent ?? record.action ?? record.prompt_hint ?? record.text ?? record.description)
  return `${label}: ${[title, intent].filter(isString).join(' - ')}`
}

function recordField(value: unknown): Record<string, unknown> | undefined {
  return isRecord(value) ? value : undefined
}

function arrayField(value: unknown): unknown[] {
  return Array.isArray(value) ? value : []
}

function stringField(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function numberField(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

function idField(value: unknown): string | number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim()) return value.trim()
  return undefined
}

function pathSegmentAfter(path: string, segment: string): string | undefined {
  const parts = path.split('/')
  const index = parts.indexOf(segment)
  return index >= 0 ? parts[index + 1] : undefined
}

function stableJsonValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableJsonValue)
  if (!isRecord(value)) return value
  return Object.fromEntries(Object.entries(value)
    .filter(([key]) => !key.startsWith('__workspace_'))
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, item]) => [key, stableJsonValue(item)]))
}

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex')
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

function isDefined<T>(value: T | undefined): value is T {
  return value !== undefined
}
