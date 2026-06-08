import type { MovScriptWorkspaceFileRepository } from './types.js'

export interface MovScriptTransitionBoundary {
  in?: string
  out?: string
  notes?: string
}

export interface MovScriptEntityTransitionUpdateInput {
  fileRepository: MovScriptWorkspaceFileRepository
  targetPath: string
  transition?: MovScriptTransitionBoundary
}

export interface MovScriptEntityTransitionUpdateResult {
  path: string
  record: Record<string, unknown>
}

export interface MovScriptStoryboardTimelineUpdateInput {
  fileRepository: MovScriptWorkspaceFileRepository
  targetPath: string
  timeline?: MovScriptStoryboardTimeline
}

export interface MovScriptStoryboardTimeline {
  gap_after_sec?: number
  caption?: string
  duration_sec?: number
}

export interface MovScriptStoryboardTimelineUpdateResult {
  path: string
  record: Record<string, unknown>
}

export interface MovScriptShotPlanUpdateInput {
  fileRepository: MovScriptWorkspaceFileRepository
  targetPath: string
  shotPlans: Array<Record<string, unknown>>
}

export interface MovScriptShotPlanUpdateResult {
  path: string
  record: Record<string, unknown>
}

export async function updateMovScriptEntityTransition(
  input: MovScriptEntityTransitionUpdateInput,
): Promise<MovScriptEntityTransitionUpdateResult> {
  const targetPath = normalizeWorkspacePath(input.targetPath)
  const current = await readWorkspaceRecord(input.fileRepository, targetPath)
  const record = pruneUndefined({
    ...current,
    transition: normalizeTransition(input.transition),
  })
  await input.fileRepository.write({ path: targetPath, content: serializeWorkspaceRecord(record) })
  return { path: targetPath, record }
}

export async function updateMovScriptStoryboardTimeline(
  input: MovScriptStoryboardTimelineUpdateInput,
): Promise<MovScriptStoryboardTimelineUpdateResult> {
  const targetPath = normalizeWorkspacePath(input.targetPath)
  const current = await readWorkspaceRecord(input.fileRepository, targetPath, 'storyboard')
  const record = pruneUndefined({
    ...current,
    timeline: normalizeTimeline(input.timeline),
  })
  await input.fileRepository.write({ path: targetPath, content: serializeWorkspaceRecord(record) })
  return { path: targetPath, record }
}

export async function updateMovScriptStoryboardShotPlans(
  input: MovScriptShotPlanUpdateInput,
): Promise<MovScriptShotPlanUpdateResult> {
  const targetPath = normalizeWorkspacePath(input.targetPath)
  const current = await readWorkspaceRecord(input.fileRepository, targetPath, 'storyboard')
  const shot_plans = input.shotPlans.map((item, index) => normalizeShotPlan(item, index))
  const record = {
    ...current,
    shot_plans,
  }
  await input.fileRepository.write({ path: targetPath, content: serializeWorkspaceRecord(record) })
  return { path: targetPath, record }
}

async function readWorkspaceRecord(
  fileRepository: MovScriptWorkspaceFileRepository,
  targetPath: string,
  expectedKind?: string,
): Promise<Record<string, unknown>> {
  const file = await fileRepository.read({ path: targetPath })
  const parsed = JSON.parse(file.content) as unknown
  if (!isRecord(parsed)) throw new Error(`target JSON must be an object: ${targetPath}`)
  const schemaKind = typeof parsed.schema === 'string'
    ? parsed.schema.replace(/^movscript\./, '').replace(/\.v\d+$/, '')
    : undefined
  if (expectedKind !== undefined && parsed.kind !== expectedKind && schemaKind !== expectedKind) {
    throw new Error(`target kind mismatch: expected ${expectedKind}`)
  }
  return parsed
}

function normalizeTransition(transition: MovScriptTransitionBoundary | undefined): Record<string, unknown> | undefined {
  if (!transition) return undefined
  return pruneUndefined({
    in: stringValue(transition.in),
    out: stringValue(transition.out),
    notes: stringValue(transition.notes),
  })
}

function normalizeTimeline(timeline: MovScriptStoryboardTimeline | undefined): Record<string, unknown> | undefined {
  if (!timeline) return undefined
  return pruneUndefined({
    gap_after_sec: finiteNumber(timeline.gap_after_sec),
    caption: stringValue(timeline.caption),
    duration_sec: finiteNumber(timeline.duration_sec),
  })
}

function normalizeShotPlan(item: Record<string, unknown>, index: number): Record<string, unknown> {
  const id = stringValue(item.id)
  const order = typeof item.order === 'number' && Number.isFinite(item.order) ? item.order : undefined
  if (!id) throw new Error(`shot_plans[${index}].id required`)
  if (order === undefined) throw new Error(`shot_plans[${index}].order required`)
  return pruneUndefined({
    ...item,
    id,
    order,
    shot_size: stringValue(item.shot_size),
    camera: isRecord(item.camera) ? item.camera : undefined,
    blocking: isRecord(item.blocking) ? item.blocking : undefined,
    lighting: isRecord(item.lighting) ? item.lighting : undefined,
    performance: Array.isArray(item.performance) ? item.performance.filter(isRecord) : undefined,
    reference_image_refs: Array.isArray(item.reference_image_refs) ? item.reference_image_refs.filter(isString) : undefined,
  })
}

function serializeWorkspaceRecord(value: Record<string, unknown>): string {
  return `${JSON.stringify(value, null, 2)}\n`
}

function normalizeWorkspacePath(value: string): string {
  return value.replace(/\\/g, '/').replace(/^\.movscript\//, '').replace(/^\/+/, '').replace(/\/+$/, '')
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value : undefined
}

function finiteNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

function isString(value: unknown): value is string {
  return typeof value === 'string'
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function pruneUndefined<T extends Record<string, unknown>>(value: T): T {
  const output: Record<string, unknown> = {}
  for (const [key, item] of Object.entries(value)) {
    if (item !== undefined) output[key] = item
  }
  return output as T
}
