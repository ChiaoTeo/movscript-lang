import {
  displayEntityId,
  entityPathSlug,
  semanticEntityId,
} from '../layout/index.js'
import type { MovScriptWorkspaceFileRepository } from './types.js'

export interface MovScriptProductionWorkspaceSnapshot {
  production?: MovScriptProductionWorkspaceNode
  segments: MovScriptProductionWorkspaceSegmentNode[]
}

export interface MovScriptProductionWorkspaceNode {
  title?: string
}

export interface MovScriptProductionWorkspaceSegmentNode {
  id?: string | number
  client_id?: string
  title?: string
  kind?: string
  summary?: string
  order?: number
  script_block_id?: string | number | null
  scene_moments?: MovScriptProductionWorkspaceSceneMomentNode[]
  __delete?: boolean
}

export interface MovScriptProductionWorkspaceSceneMomentNode {
  id?: string | number
  client_id?: string
  title?: string
  storyboard_id?: string | number
  time_text?: string
  scene_code?: string
  location_text?: string
  condition_text?: string
  action_text?: string
  mood?: string
  description?: string
  order?: number
  script_block_id?: string | number | null
  settings?: MovScriptProductionWorkspaceSettingRefNode[]
  writing_expressions?: MovScriptProductionWorkspaceWritingExpressionNode[]
  storyboards?: MovScriptProductionWorkspaceStoryboardNode[]
  __delete?: boolean
}

export interface MovScriptProductionWorkspaceStoryboardNode {
  id?: string | number
  client_id?: string
  title?: string
  order?: number
  settings?: MovScriptProductionWorkspaceSettingRefNode[]
  shot_plans?: Array<Record<string, unknown>>
  __delete?: boolean
}

export interface MovScriptProductionWorkspaceSettingRefNode {
  id?: string | number
  client_id?: string
  kind?: string
  role?: string
  source_label?: string
  state?: Record<string, unknown>
  __delete?: boolean
}

export interface MovScriptProductionWorkspaceWritingExpressionNode {
  id?: string | number
  client_id?: string
  kind?: string
  speaker?: string
  text?: string
  note?: string
  intent?: string
  order?: number
  script_block_id?: string | number | null
  __delete?: boolean
}

export interface MovScriptProductionWorkspaceSnapshotWriteInput {
  fileRepository: MovScriptWorkspaceFileRepository
  productionId: string | number
  snapshot: MovScriptProductionWorkspaceSnapshot
  now?: Date
}

export interface MovScriptProductionWorkspaceSnapshotWriteResult {
  productionPath: string
  snapshot: MovScriptProductionWorkspaceSnapshot
  writtenPaths: string[]
}

export async function saveMovScriptProductionWorkspaceSnapshot(
  input: MovScriptProductionWorkspaceSnapshotWriteInput,
): Promise<MovScriptProductionWorkspaceSnapshotWriteResult> {
  const productionId = stableId(input.productionId, 'production')
  const productionSlug = slugId(productionId, 'production')
  const productionPath = `productions/${productionSlug}/production.json`
  const writtenPaths: string[] = []
  const production = await readOptionalRecord(input.fileRepository, productionPath)
  await writeRecord(input.fileRepository, productionPath, pruneUndefined({
    ...stripWorkspacePrivateFields(production),
    schema: 'movscript.production.v1',
    kind: 'production',
    id: productionId,
    title: stringValue(input.snapshot.production?.title ?? production.title) ?? `Production ${displayId(productionId, 'production')}`,
    updated_at: (input.now ?? new Date()).toISOString(),
  }))
  writtenPaths.push(productionPath)

  for (const segment of input.snapshot.segments) {
    const segmentId = stableId(segment.id ?? segment.client_id ?? writtenPaths.length + 1, 'segment')
    const segmentSlug = slugId(segmentId, 'segment')
    const segmentPath = `productions/${productionSlug}/segments/${segmentSlug}/segment.json`
    const existingSegment = await readOptionalRecord(input.fileRepository, segmentPath)
    await writeRecord(input.fileRepository, segmentPath, pruneUndefined({
      ...stripWorkspacePrivateFields(existingSegment),
      schema: 'movscript.segment.v1',
      kind: 'segment',
      id: segmentId,
      title: stringValue(segment.title) ?? stringValue(existingSegment.title) ?? `Segment ${displayId(segmentId, 'segment')}`,
      segment_kind: stringValue(segment.kind ?? existingSegment.segment_kind),
      summary: stringValue(segment.summary ?? existingSegment.summary),
      order: finiteNumber(segment.order) ?? finiteNumber(existingSegment.order),
      script_block_id: nullableRef(segment.script_block_id ?? existingSegment.script_block_id, 'script_block'),
      ...(segment.__delete === true ? { __delete: true } : {}),
    }))
    writtenPaths.push(segmentPath)

    for (const moment of segment.scene_moments ?? []) {
      const momentId = stableId(moment.id ?? moment.client_id ?? `${segmentId}_${writtenPaths.length + 1}`, 'scene_moment')
      const momentSlug = slugId(momentId, 'scene_moment')
      const momentDir = `productions/${productionSlug}/segments/${segmentSlug}/scene_moments/${momentSlug}`
      const momentPath = `${momentDir}/scene_moment.json`
      const existingMoment = await readOptionalRecord(input.fileRepository, momentPath)
      const storyboardInputs = (moment.storyboards?.length ? moment.storyboards : [{
        id: moment.storyboard_id ?? firstExistingStoryboardTimingId(existingMoment) ?? 'main',
        settings: moment.settings,
      }]) satisfies MovScriptProductionWorkspaceStoryboardNode[]
      const storyboardTiming = moment.storyboards?.length
        ? mergeStoryboardTiming(existingMoment, storyboardInputs)
        : (isRecord(existingMoment.storyboard_timing)
            ? existingMoment.storyboard_timing
            : buildStoryboardTiming(storyboardInputs))
      await writeRecord(input.fileRepository, momentPath, pruneUndefined({
        ...stripWorkspacePrivateFields(existingMoment),
        schema: 'movscript.scene_moment.v1',
        kind: 'scene_moment',
        id: momentId,
        title: stringValue(moment.title) ?? stringValue(existingMoment.title) ?? `Scene Moment ${displayId(momentId, 'scene_moment')}`,
        scene_code: stringValue(moment.scene_code ?? existingMoment.scene_code),
        when: stringValue(moment.time_text ?? existingMoment.when),
        where: stringValue(moment.location_text ?? existingMoment.where),
        condition_text: stringValue(moment.condition_text ?? existingMoment.condition_text),
        action: stringValue(moment.action_text ?? existingMoment.action),
        emotion: stringValue(moment.mood ?? existingMoment.emotion),
        description: stringValue(moment.description ?? existingMoment.description),
        order: finiteNumber(moment.order) ?? finiteNumber(existingMoment.order),
        script_block_id: nullableRef(moment.script_block_id ?? existingMoment.script_block_id, 'script_block'),
        storyboard_timing: storyboardTiming,
        ...(moment.__delete === true ? { __delete: true } : {}),
      }))
      writtenPaths.push(momentPath)

      for (const storyboard of storyboardInputs) {
        const storyboardId = stableId(storyboard.id ?? storyboard.client_id ?? 'main', 'storyboard')
        const storyboardPath = `${momentDir}/storyboards/${slugId(storyboardId, 'storyboard')}/storyboard.json`
        const existingStoryboard = await readOptionalRecord(input.fileRepository, storyboardPath)
        await writeRecord(input.fileRepository, storyboardPath, pruneUndefined({
          ...stripWorkspacePrivateFields(existingStoryboard),
          schema: 'movscript.storyboard.v1',
          kind: 'storyboard',
          id: storyboardId,
          title: stringValue(storyboard.title ?? existingStoryboard.title) ?? `${stringValue(moment.title) ?? displayId(momentId, 'scene_moment')} storyboard`,
          setting_refs: normalizeSettingRefs(storyboard.settings ?? moment.settings, existingStoryboard.setting_refs),
          shot_plans: Array.isArray(storyboard.shot_plans) ? storyboard.shot_plans.filter(isRecord) : existingStoryboard.shot_plans,
          ...(storyboard.__delete === true ? { __delete: true } : {}),
        }))
        writtenPaths.push(storyboardPath)
      }

      for (const expression of moment.writing_expressions ?? []) {
        const writingExpressionStoryboardId = stableId(storyboardInputs[0]?.id ?? storyboardInputs[0]?.client_id ?? 'main', 'storyboard')
        const expressionId = stableId(expression.id ?? expression.client_id ?? `${momentId}_${writtenPaths.length + 1}`, 'writing_expression')
        const expressionPath = `${momentDir}/storyboards/${slugId(writingExpressionStoryboardId, 'storyboard')}/writing_expressions/${expressionId}/writing_expression.json`
        const existingExpression = await readOptionalRecord(input.fileRepository, expressionPath)
        await writeRecord(input.fileRepository, expressionPath, pruneUndefined({
          ...stripWorkspacePrivateFields(existingExpression),
          schema: 'movscript.writing_expression.v1',
          kind: 'writing_expression',
          id: expressionId,
          title: stringValue(existingExpression.title) ?? stringValue(expression.text) ?? `Writing Expression ${displayId(expressionId, 'writing_expression')}`,
          expression_kind: normalizeExpressionKind(expression.kind ?? existingExpression.expression_kind),
          speaker: stringValue(expression.speaker ?? existingExpression.speaker),
          text: stringValue(expression.text ?? existingExpression.text) ?? '',
          note: stringValue(expression.note ?? existingExpression.note),
          intent: stringValue(expression.intent ?? existingExpression.intent),
          order: finiteNumber(expression.order) ?? finiteNumber(existingExpression.order),
          target_ref: momentPath,
          script_block_id: nullableRef(expression.script_block_id ?? existingExpression.script_block_id, 'script_block'),
          ...(expression.__delete === true ? { __delete: true } : {}),
        }))
        writtenPaths.push(expressionPath)
      }
    }
  }

  return { productionPath, snapshot: input.snapshot, writtenPaths }
}

export function movScriptProductionWorkspacePath(productionId: string | number): string {
  return `productions/${slugId(productionId, 'production')}/production.json`
}

function normalizeSettingRefs(
  refs: MovScriptProductionWorkspaceSettingRefNode[] | undefined,
  fallback: unknown,
): Record<string, unknown>[] | undefined {
  if (!refs) return Array.isArray(fallback) ? fallback.filter(isRecord) : undefined
  return refs.map((ref) => pruneUndefined({
    setting_id: stableId(ref.id ?? ref.client_id ?? 'unassigned', 'setting'),
    role: stringValue(ref.role),
    notes: stringValue(ref.source_label),
    setting_kind: stringValue(ref.kind),
    state: isRecord(ref.state) ? ref.state : undefined,
    ...(ref.__delete === true ? { __delete: true } : {}),
  }))
}

function normalizeExpressionKind(value: unknown): string {
  const kind = stringValue(value)
  if (kind === 'dialogue' || kind === 'narration' || kind === 'subtitle' || kind === 'caption' || kind === 'action') return kind
  if (kind === 'visual' || kind === 'visual_note') return 'visual_note'
  return 'dialogue'
}

function firstExistingStoryboardTimingId(record: Record<string, unknown>): string | undefined {
  const timing = isRecord(record.storyboard_timing) ? record.storyboard_timing : undefined
  const items = Array.isArray(timing?.items) ? timing.items.filter(isRecord) : []
  return stringValue(items[0]?.storyboard_id)
}

function buildStoryboardTiming(storyboards: MovScriptProductionWorkspaceStoryboardNode[]): Record<string, unknown> {
  return { items: storyboards.map((storyboard, index) => ({
    storyboard_id: stableId(storyboard.id ?? storyboard.client_id ?? index + 1, 'storyboard'),
    order: finiteNumber(storyboard.order) ?? index + 1,
  })) }
}

function mergeStoryboardTiming(
  record: Record<string, unknown>,
  storyboards: MovScriptProductionWorkspaceStoryboardNode[],
): Record<string, unknown> {
  const current = isRecord(record.storyboard_timing) ? record.storyboard_timing : {}
  const currentItems = Array.isArray(current.items) ? current.items.filter(isRecord) : []
  const nextItems = [...currentItems]
  const existingIds = new Set(currentItems.map((item) => stringValue(item.storyboard_id)).filter(isString))
  let nextOrder = Math.max(0, ...currentItems.map((item) => finiteNumber(item.order) ?? 0))
  for (const storyboard of storyboards) {
    const storyboardId = stableId(storyboard.id ?? storyboard.client_id ?? nextOrder + 1, 'storyboard')
    if (existingIds.has(storyboardId)) continue
    const order = finiteNumber(storyboard.order) ?? nextOrder + 1
    nextOrder = Math.max(nextOrder, order)
    nextItems.push({ storyboard_id: storyboardId, order })
    existingIds.add(storyboardId)
  }
  return pruneUndefined({
    ...current,
    items: nextItems.length ? nextItems : buildStoryboardTiming(storyboards).items,
  })
}

async function readRecord(fileRepository: MovScriptWorkspaceFileRepository, path: string): Promise<Record<string, unknown>> {
  const file = await fileRepository.read({ path })
  const parsed = JSON.parse(file.content) as unknown
  return isRecord(parsed) ? parsed : {}
}

async function readOptionalRecord(fileRepository: MovScriptWorkspaceFileRepository, path: string): Promise<Record<string, unknown>> {
  return readRecord(fileRepository, path).catch(() => ({}))
}

async function writeRecord(
  fileRepository: MovScriptWorkspaceFileRepository,
  path: string,
  record: Record<string, unknown>,
): Promise<void> {
  await fileRepository.write({ path, content: `${JSON.stringify(record, null, 2)}\n` })
}

function stableId(value: unknown, prefix: string): string {
  return semanticEntityId(value, prefix)
}

function slugId(value: unknown, prefix: string): string {
  return entityPathSlug(value, prefix)
}

function nullableRef(value: unknown, prefix: string): string | null | undefined {
  if (value === null) return null
  if (value === undefined || String(value).trim() === '') return undefined
  return stableId(value, prefix)
}

function displayId(value: string, prefix: string): string {
  return displayEntityId(value, prefix)
}

function finiteNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function isString(value: unknown): value is string {
  return typeof value === 'string'
}

function stripWorkspacePrivateFields(record: Record<string, unknown>): Record<string, unknown> {
  const output: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(record)) {
    if (key.startsWith('__workspace_')) continue
    output[key] = value
  }
  return output
}

function pruneUndefined<T extends Record<string, unknown>>(value: T): T {
  const output: Record<string, unknown> = {}
  for (const [key, item] of Object.entries(value)) {
    if (item !== undefined && item !== '') output[key] = item
  }
  return output as T
}
