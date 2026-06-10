import {
  entityPathSlug,
  semanticEntityId,
} from '../layout/index.js'
import type { MovScriptWorkspaceFileRepository } from './types.js'

export interface MovScriptContentUnitWriteInput {
  fileRepository: MovScriptWorkspaceFileRepository
  unit: Record<string, unknown>
}

export interface MovScriptContentUnitWriteResult {
  contentUnitPath: string
  record: Record<string, unknown>
}

export async function upsertMovScriptContentUnit(
  input: MovScriptContentUnitWriteInput,
): Promise<MovScriptContentUnitWriteResult> {
  const contentUnitId = stableEntityId(input.unit.ID ?? input.unit.id ?? input.unit.client_id, 'content_unit')
  const contentUnitPath = movScriptContentUnitPath(input.unit)
  const current = await readOptionalRecord(input.fileRepository, contentUnitPath)
  const record = normalizeContentUnitRecord(input.unit, current, contentUnitId)
  await writeRecord(input.fileRepository, contentUnitPath, record)

  return { contentUnitPath, record }
}

export function movScriptContentUnitPath(unit: Record<string, unknown>): string {
  const id = stableEntityId(unit.ID ?? unit.id ?? unit.client_id, 'content_unit')
  return `${contentUnitDirectory(id)}/content_unit.json`
}

export function movScriptContentUnitKeyframePath(input: {
  contentUnitId: string | number
  keyframeId: string | number
}): string {
  const contentUnitId = stableEntityId(input.contentUnitId, 'content_unit')
  const keyframeId = stableEntityId(input.keyframeId, 'keyframe')
  return `${contentUnitDirectory(contentUnitId)}/keyframes/${entityPathSlug(keyframeId, 'keyframe')}/keyframe.json`
}

export function movScriptContentUnitsSceneAggregatePath(input: { scene_moment_id?: unknown }): string {
  const sceneMomentId = stableEntityId(input.scene_moment_id, 'scene_moment')
  return `content_units/by_scene_moment/${sceneMomentId}.json`
}

function normalizeContentUnitRecord(
  unit: Record<string, unknown>,
  current: Record<string, unknown>,
  id: string,
): Record<string, unknown> {
  const productionId = ref(unit.production_id ?? current.production_id, 'production')
  const segmentId = ref(unit.segment_id ?? current.segment_id, 'segment')
  const sceneMomentId = ref(unit.scene_moment_id ?? current.scene_moment_id, 'scene_moment')
  const shotId = ref(unit.shot_id ?? unit.shotId ?? current.shot_id, 'shot')
  const storyboardId = ref(unit.storyboard_id ?? unit.storyboardId ?? current.storyboard_id, 'storyboard')
  const contentUnitType = stringValue(unit.content_unit_type ?? unit.contentUnitType ?? current.content_unit_type)
    ?? 'storyboard_ref'
  const outputKind = stringValue(unit.output_kind ?? unit.outputKind ?? current.output_kind)
    ?? (contentUnitType === 'asset_ref' || contentUnitType === 'keyframe_ref' ? 'image' : 'video')

  return pruneUndefined({
    ...stripWorkspacePrivateFields(current),
    schema: 'movscript.content_unit.v1',
    kind: 'content_unit',
    id,
    title: stringValue(unit.title ?? current.title) ?? 'Untitled content unit',
    content_unit_type: contentUnitType,
    output_kind: outputKind,
    order: finiteNumber(unit.order) ?? finiteNumber(current.order),
    description: stringValue(unit.description ?? current.description) ?? '',
    scene_moment_ref: stringValue(unit.scene_moment_ref ?? unit.sceneMomentRef ?? current.scene_moment_ref)
      ?? (sceneMomentId ? sceneMomentRef(productionId, segmentId, sceneMomentId) : undefined),
    shot_id: shotId,
    storyboard_ref: stringValue(unit.storyboard_ref ?? unit.storyboardRef ?? current.storyboard_ref)
      ?? (sceneMomentId && shotId ? storyboardRef(productionId, segmentId, sceneMomentId, shotId, storyboardId) : undefined),
    asset_ref: stringValue(unit.asset_ref ?? unit.assetRef ?? current.asset_ref),
    keyframe_refs: arrayField(unit.keyframe_refs ?? unit.keyframeRefs ?? current.keyframe_refs),
    audio_cue_refs: arrayField(unit.audio_cue_refs ?? unit.audioCueRefs ?? current.audio_cue_refs),
    expression_unit_refs: arrayField(unit.expression_unit_refs ?? unit.expressionUnitRefs ?? current.expression_unit_refs),
    edit_prompt: normalizeEditPrompt(unit.edit_prompt ?? unit.editPrompt ?? unit.prompt ?? current.edit_prompt),
    model_intent: isRecord(unit.model_intent ?? unit.modelIntent) ? unit.model_intent ?? unit.modelIntent : current.model_intent,
    ...(unit.__delete === true ? { __delete: true } : {}),
  })
}

function contentUnitDirectory(id: string): string {
  return `content_units/${entityPathSlug(id, 'content_unit')}`
}

function sceneMomentRef(
  productionId: string | undefined,
  segmentId: string | undefined,
  sceneMomentId: string,
): string {
  const sceneMomentSlug = entityPathSlug(sceneMomentId, 'scene_moment')
  if (productionId && segmentId) {
    return `productions/${entityPathSlug(productionId, 'production')}/segments/${entityPathSlug(segmentId, 'segment')}/scene_moments/${sceneMomentSlug}`
  }
  return `scene_moments/${sceneMomentSlug}`
}

function storyboardRef(
  productionId: string | undefined,
  segmentId: string | undefined,
  sceneMomentId: string,
  shotId: string,
  storyboardId: string | undefined,
): string {
  const id = storyboardId ?? 'main'
  return `${sceneMomentRef(productionId, segmentId, sceneMomentId)}/shots/${entityPathSlug(shotId, 'shot')}/storyboards/${entityPathSlug(id, 'storyboard')}`
}

function stableEntityId(value: unknown, prefix: string): string {
  return semanticEntityId(value, prefix)
}

function ref(value: unknown, prefix: string): string | undefined {
  if (value === undefined || value === null || String(value).trim() === '') return undefined
  return stableEntityId(value, prefix)
}

async function readOptionalRecord(fileRepository: MovScriptWorkspaceFileRepository, path: string): Promise<Record<string, unknown>> {
  return fileRepository.read({ path }).then((file) => {
    const parsed = JSON.parse(file.content) as unknown
    return isRecord(parsed) ? parsed : {}
  }).catch(() => ({}))
}

async function writeRecord(
  fileRepository: MovScriptWorkspaceFileRepository,
  path: string,
  record: Record<string, unknown>,
): Promise<void> {
  await fileRepository.write({ path, content: `${JSON.stringify(record, null, 2)}\n` })
}

function stripWorkspacePrivateFields(record: Record<string, unknown>): Record<string, unknown> {
  const output: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(record)) {
    if (key.startsWith('__workspace_')) continue
    output[key] = value
  }
  return output
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function finiteNumber(value: unknown): number | undefined {
  const next = Number(value)
  return Number.isFinite(next) ? next : undefined
}

function positiveNumberOrNull(value: unknown): number | null | undefined {
  if (value === null) return null
  const next = Number(value)
  return Number.isFinite(next) && next > 0 ? next : undefined
}

function arrayField(value: unknown): unknown[] | undefined {
  return Array.isArray(value) ? value : undefined
}

function normalizeEditPrompt(value: unknown): Record<string, unknown> | undefined {
  if (typeof value === 'string') return { text: value }
  if (isRecord(value)) return value
  return undefined
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function pruneUndefined<T extends Record<string, unknown>>(value: T): T {
  const output: Record<string, unknown> = {}
  for (const [key, item] of Object.entries(value)) {
    if (item !== undefined && item !== '') output[key] = item
  }
  return output as T
}
