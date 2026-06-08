import type {
  MovScriptInlineCandidateLockInput,
  MovScriptInlineCandidateUnlockInput,
  MovScriptInlineCandidateUpdateInput,
  MovScriptInlineCandidateWriteInput,
  MovScriptInlineCandidateWriteResult,
  MovScriptWorkspaceCandidateWriteInput,
  MovScriptWorkspaceCandidateWriteResult,
  MovScriptWorkspaceDomainIndex,
  MovScriptWorkspaceIndexedEntity,
  MovScriptWorkspaceService,
} from '@movscript/workspace'
import type {
  ContentUnitBuildArtifactBundle,
  MovScriptWorkspaceBuildArtifacts,
} from '@movscript/compiler/artifacts'

export interface MovScriptEnginePublishInput {
  productionId?: string | number
  buildId?: string
}

export interface MovScriptEngineListInput {
  query?: string
  kind?: string
  productionId?: string | number
  segmentId?: string | number
  sceneMomentId?: string | number
  limit?: number
}

export interface MovScriptEngineDeleteInput {
  id: string | number
  productionId?: string | number
  segmentId?: string | number
  sceneMomentId?: string | number
}

export interface MovScriptEngineProductionInput {
  id?: string | number
  title?: string
}

export interface MovScriptEngineSegmentInput {
  id?: string | number
  productionId?: string | number
  title?: string
  kind?: string
  summary?: string
  order?: number
}

export interface MovScriptEngineSceneMomentInput {
  id?: string | number
  productionId?: string | number
  segmentId?: string | number
  title?: string
  storyboardId?: string | number
  order?: number
  timeText?: string
  sceneCode?: string
  locationText?: string
  conditionText?: string
  actionText?: string
  mood?: string
  description?: string
}

export interface MovScriptEngineStoryboardInput {
  id?: string | number
  productionId?: string | number
  segmentId?: string | number
  sceneMomentId?: string | number
  title?: string
  order?: number
}

export interface MovScriptEngineAudioCueInput {
  id?: string | number
  productionId?: string | number
  segmentId?: string | number
  sceneMomentId?: string | number
  storyboardId?: string | number
  title?: string
  kind?: string
  order?: number
  shotPlanId?: string
  promptHint?: string
}

export interface MovScriptEngineExpressionUnitInput {
  id?: string | number
  productionId?: string | number
  segmentId?: string | number
  sceneMomentId?: string | number
  title?: string
  kind?: string
  speaker?: string
  text?: string
  note?: string
  intent?: string
  order?: number
  span?: Record<string, unknown>
  scriptBlockId?: string | number | null
}

export interface MovScriptEngineContentUnitInput {
  id?: string | number
  title?: string
  kind?: string
  contentUnitType?: string
  outputKind?: string
  assetRef?: string | number
  productionId?: string | number
  segmentId?: string | number
  sceneMomentId?: string | number
  storyboardId?: string | number
  audioCueId?: string | number
  prompt?: string
  negativePrompt?: string
  description?: string
  order?: number
  durationSeconds?: number
  shotSize?: string
  cameraAngle?: string
  cameraMotion?: string
}

export interface MovScriptEngineOptions {
  workspaceService: MovScriptWorkspaceService
  overviewWorkspace?: () => Promise<unknown>
  inspectWorkspace?: () => Promise<unknown>
  reviewWorkspace?: () => Promise<unknown>
  compileWorkspace?: () => Promise<unknown>
  regenerationPlan?: () => Promise<unknown>
  buildContentUnitArtifact?: (contentUnitId: string | number) => Promise<ContentUnitBuildArtifactBundle>
  buildArtifacts?: (input?: { buildId?: string; createdAt?: string }) => Promise<MovScriptWorkspaceBuildArtifacts>
  publish?: (input?: MovScriptEnginePublishInput) => Promise<unknown>
}

export interface MovScriptEngine {
  readonly workspaceService: MovScriptWorkspaceService
  initProject: MovScriptWorkspaceService['initializeProject']
  initializeProject: MovScriptWorkspaceService['initializeProject']
  getModel: MovScriptWorkspaceService['getModel']
  loadIndex(input?: { path?: string }): Promise<MovScriptWorkspaceDomainIndex>
  queryEntities: MovScriptWorkspaceService['queryEntities']
  querySettings: MovScriptWorkspaceService['querySettings']
  queryAssets: MovScriptWorkspaceService['queryAssets']
  queryProductionContext: MovScriptWorkspaceService['queryProductionContext']
  upsertSetting: MovScriptWorkspaceService['upsertSetting']
  upsertAsset: MovScriptWorkspaceService['upsertAsset']
  upsertContentUnit: MovScriptWorkspaceService['upsertContentUnit']
  saveProductionSnapshot: MovScriptWorkspaceService['saveProductionSnapshot']
  deleteEntity: MovScriptWorkspaceService['deleteEntity']
  listProductions(input?: MovScriptEngineListInput): Promise<MovScriptWorkspaceIndexedEntity[]>
  createProduction(input?: MovScriptEngineProductionInput): ReturnType<MovScriptWorkspaceService['saveProductionSnapshot']>
  updateProduction(input: MovScriptEngineProductionInput & { id: string | number }): ReturnType<MovScriptWorkspaceService['saveProductionSnapshot']>
  deleteProduction(input: MovScriptEngineDeleteInput): Promise<{ deleted: true; entity: MovScriptWorkspaceIndexedEntity }>
  listSegments(input?: MovScriptEngineListInput): Promise<MovScriptWorkspaceIndexedEntity[]>
  createSegment(input: MovScriptEngineSegmentInput): ReturnType<MovScriptWorkspaceService['saveProductionSnapshot']>
  updateSegment(input: MovScriptEngineSegmentInput & { id: string | number }): ReturnType<MovScriptWorkspaceService['saveProductionSnapshot']>
  deleteSegment(input: MovScriptEngineDeleteInput): Promise<{ deleted: true; entity: MovScriptWorkspaceIndexedEntity }>
  listSceneMoments(input?: MovScriptEngineListInput): Promise<MovScriptWorkspaceIndexedEntity[]>
  createSceneMoment(input: MovScriptEngineSceneMomentInput): ReturnType<MovScriptWorkspaceService['saveProductionSnapshot']>
  updateSceneMoment(input: MovScriptEngineSceneMomentInput & { id: string | number }): ReturnType<MovScriptWorkspaceService['saveProductionSnapshot']>
  deleteSceneMoment(input: MovScriptEngineDeleteInput): Promise<{ deleted: true; entity: MovScriptWorkspaceIndexedEntity }>
  listStoryboards(input?: MovScriptEngineListInput): Promise<MovScriptWorkspaceIndexedEntity[]>
  createStoryboard(input: MovScriptEngineStoryboardInput): ReturnType<MovScriptWorkspaceService['saveProductionSnapshot']>
  updateStoryboard(input: MovScriptEngineStoryboardInput & { id: string | number }): ReturnType<MovScriptWorkspaceService['saveProductionSnapshot']>
  deleteStoryboard(input: MovScriptEngineDeleteInput): Promise<{ deleted: true; entity: MovScriptWorkspaceIndexedEntity }>
  listAudioCues(input?: MovScriptEngineListInput): Promise<MovScriptWorkspaceIndexedEntity[]>
  createAudioCue(input: MovScriptEngineAudioCueInput): ReturnType<MovScriptWorkspaceService['saveProductionSnapshot']>
  updateAudioCue(input: MovScriptEngineAudioCueInput & { id: string | number }): ReturnType<MovScriptWorkspaceService['saveProductionSnapshot']>
  deleteAudioCue(input: MovScriptEngineDeleteInput): Promise<{ deleted: true; entity: MovScriptWorkspaceIndexedEntity }>
  listExpressionUnits(input?: MovScriptEngineListInput): Promise<MovScriptWorkspaceIndexedEntity[]>
  createExpressionUnit(input: MovScriptEngineExpressionUnitInput): ReturnType<MovScriptWorkspaceService['saveProductionSnapshot']>
  updateExpressionUnit(input: MovScriptEngineExpressionUnitInput & { id: string | number }): ReturnType<MovScriptWorkspaceService['saveProductionSnapshot']>
  deleteExpressionUnit(input: MovScriptEngineDeleteInput): Promise<{ deleted: true; entity: MovScriptWorkspaceIndexedEntity }>
  listContentUnits(input?: MovScriptEngineListInput): Promise<MovScriptWorkspaceIndexedEntity[]>
  createContentUnit(input: MovScriptEngineContentUnitInput): ReturnType<MovScriptWorkspaceService['upsertContentUnit']>
  updateContentUnit(input: MovScriptEngineContentUnitInput & { id: string | number }): ReturnType<MovScriptWorkspaceService['upsertContentUnit']>
  deleteContentUnit(input: MovScriptEngineDeleteInput): Promise<{ deleted: true; entity: MovScriptWorkspaceIndexedEntity }>
  buildContentUnitArtifact(contentUnitId: string | number): Promise<ContentUnitBuildArtifactBundle>
  buildArtifacts(input?: { buildId?: string; createdAt?: string }): Promise<MovScriptWorkspaceBuildArtifacts>
  overview(): Promise<unknown>
  inspect(): Promise<unknown>
  review(): Promise<unknown>
  compile(): Promise<unknown>
  build(): Promise<unknown>
  regenerationPlan(): Promise<unknown>
  publish(input?: MovScriptEnginePublishInput): Promise<unknown>
  appendCandidate(input: Omit<MovScriptInlineCandidateWriteInput, 'fileRepository'>): Promise<MovScriptInlineCandidateWriteResult>
  createAssetSlotCandidate(
    input: Omit<MovScriptWorkspaceCandidateWriteInput, 'fileRepository' | 'projectPath'> & { projectPath?: string },
  ): Promise<MovScriptWorkspaceCandidateWriteResult>
  createKeyframeCandidate(
    input: Omit<MovScriptWorkspaceCandidateWriteInput, 'fileRepository' | 'projectPath'> & { projectPath?: string },
  ): Promise<MovScriptWorkspaceCandidateWriteResult>
  selectCandidate(input: Omit<MovScriptInlineCandidateLockInput, 'fileRepository'>): Promise<MovScriptInlineCandidateWriteResult>
  updateCandidate(input: Omit<MovScriptInlineCandidateUpdateInput, 'fileRepository'>): Promise<MovScriptInlineCandidateWriteResult>
  unlockCandidate(
    input: Omit<MovScriptInlineCandidateUnlockInput, 'fileRepository'>,
  ): Promise<Omit<MovScriptInlineCandidateWriteResult, 'candidate'>>
}

export function createMovScriptEngine(options: MovScriptEngineOptions): MovScriptEngine {
  const workspaceService = options.workspaceService
  const overviewWorkspace = options.overviewWorkspace
  const inspectWorkspace = options.inspectWorkspace
  const reviewWorkspace = options.reviewWorkspace
  const compileWorkspace = options.compileWorkspace
  const regenerationPlan = options.regenerationPlan
  const buildContentUnitArtifact = options.buildContentUnitArtifact
  const buildArtifacts = options.buildArtifacts

  return {
    workspaceService,
    initProject: workspaceService.initializeProject.bind(workspaceService),
    initializeProject: workspaceService.initializeProject.bind(workspaceService),
    getModel: workspaceService.getModel.bind(workspaceService),
    loadIndex: workspaceService.loadIndex.bind(workspaceService),
    queryEntities: workspaceService.queryEntities.bind(workspaceService),
    querySettings: workspaceService.querySettings.bind(workspaceService),
    queryAssets: workspaceService.queryAssets.bind(workspaceService),
    queryProductionContext: workspaceService.queryProductionContext.bind(workspaceService),
    upsertSetting: workspaceService.upsertSetting.bind(workspaceService),
    upsertAsset: workspaceService.upsertAsset.bind(workspaceService),
    upsertContentUnit: workspaceService.upsertContentUnit.bind(workspaceService),
    saveProductionSnapshot: workspaceService.saveProductionSnapshot.bind(workspaceService),
    deleteEntity: workspaceService.deleteEntity.bind(workspaceService),
    listProductions(input = {}) {
      return workspaceService.queryEntities({ entityKind: 'production', query: input.query, limit: input.limit })
    },
    createProduction(input = {}) {
      return saveProduction(workspaceService, input)
    },
    updateProduction(input) {
      return saveProduction(workspaceService, input)
    },
    deleteProduction(input) {
      return deletePlanningEntity(workspaceService, 'production', input)
    },
    listSegments(input = {}) {
      return workspaceService.queryEntities(planningQuery('segment', input))
    },
    createSegment(input) {
      return saveSegment(workspaceService, input)
    },
    updateSegment(input) {
      return saveSegment(workspaceService, input)
    },
    deleteSegment(input) {
      return deletePlanningEntity(workspaceService, 'segment', input)
    },
    listSceneMoments(input = {}) {
      return workspaceService.queryEntities(planningQuery('scene_moment', input))
    },
    createSceneMoment(input) {
      return saveSceneMoment(workspaceService, input)
    },
    updateSceneMoment(input) {
      return saveSceneMoment(workspaceService, input)
    },
    deleteSceneMoment(input) {
      return deletePlanningEntity(workspaceService, 'scene_moment', input)
    },
    listStoryboards(input = {}) {
      return workspaceService.queryEntities(planningQuery('storyboard', input))
    },
    createStoryboard(input) {
      return saveStoryboard(workspaceService, input)
    },
    updateStoryboard(input) {
      return saveStoryboard(workspaceService, input)
    },
    deleteStoryboard(input) {
      return deletePlanningEntity(workspaceService, 'storyboard', input)
    },
    listAudioCues(input = {}) {
      return workspaceService.queryEntities(planningQuery('audio_cue', input))
    },
    createAudioCue(input) {
      return saveAudioCue(workspaceService, input)
    },
    updateAudioCue(input) {
      return saveAudioCue(workspaceService, input)
    },
    deleteAudioCue(input) {
      return deletePlanningEntity(workspaceService, 'audio_cue', input)
    },
    listExpressionUnits(input = {}) {
      return workspaceService.queryEntities(planningQuery('expression_unit', input))
    },
    createExpressionUnit(input) {
      return saveExpressionUnit(workspaceService, input)
    },
    updateExpressionUnit(input) {
      return saveExpressionUnit(workspaceService, input)
    },
    deleteExpressionUnit(input) {
      return deletePlanningEntity(workspaceService, 'expression_unit', input)
    },
    listContentUnits(input = {}) {
      return listContentUnits(workspaceService, input)
    },
    createContentUnit(input) {
      return saveContentUnit(workspaceService, input)
    },
    updateContentUnit(input) {
      return saveContentUnit(workspaceService, input)
    },
    deleteContentUnit(input) {
      return deletePlanningEntity(workspaceService, 'content_unit', input)
    },
    buildContentUnitArtifact(contentUnitId) {
      return callRequiredOperation(
        buildContentUnitArtifact ? () => buildContentUnitArtifact(contentUnitId) : undefined,
        'buildContentUnitArtifact',
      )
    },
    buildArtifacts(input = {}) {
      return callRequiredOperation(
        buildArtifacts ? () => buildArtifacts(input) : undefined,
        'buildArtifacts',
      )
    },
    overview() {
      return callRequiredOperation(overviewWorkspace, 'overview')
    },
    inspect() {
      return callRequiredOperation(inspectWorkspace ?? reviewWorkspace, 'inspect')
    },
    review() {
      return callRequiredOperation(inspectWorkspace ?? reviewWorkspace, 'review')
    },
    compile() {
      return callRequiredOperation(compileWorkspace, 'compile')
    },
    build() {
      return callRequiredOperation(compileWorkspace, 'compile')
    },
    regenerationPlan() {
      return callRequiredOperation(regenerationPlan, 'regenerationPlan')
    },
    publish(input = {}) {
      return callRequiredOperation(
        options.publish ? () => options.publish!(input) : undefined,
        'publish',
      )
    },
    appendCandidate: workspaceService.appendCandidate.bind(workspaceService),
    createAssetSlotCandidate: workspaceService.createAssetSlotCandidate.bind(workspaceService),
    createKeyframeCandidate: workspaceService.createKeyframeCandidate.bind(workspaceService),
    selectCandidate: workspaceService.selectCandidate.bind(workspaceService),
    updateCandidate: workspaceService.updateCandidate.bind(workspaceService),
    unlockCandidate: workspaceService.unlockCandidate.bind(workspaceService),
  }
}

type PlanningEntityKind = 'production' | 'segment' | 'scene_moment' | 'storyboard' | 'audio_cue' | 'expression_unit' | 'content_unit'

function planningQuery(entityKind: PlanningEntityKind, input: MovScriptEngineListInput = {}) {
  return pruneUndefined({
    entityKind,
    kind: input.kind,
    query: input.query,
    productionId: input.productionId,
    segmentId: input.segmentId,
    sceneMomentId: input.sceneMomentId,
    limit: input.limit,
  })
}

function saveProduction(
  workspaceService: MovScriptWorkspaceService,
  input: MovScriptEngineProductionInput,
) {
  return workspaceService.saveProductionSnapshot({
    productionId: input.id ?? 'main',
    snapshot: {
      production: pruneUndefined({ title: input.title }),
      segments: [],
    },
  })
}

function saveSegment(
  workspaceService: MovScriptWorkspaceService,
  input: MovScriptEngineSegmentInput,
) {
  return workspaceService.saveProductionSnapshot({
    productionId: input.productionId ?? 'main',
    snapshot: {
      segments: [pruneUndefined({
        id: input.id,
        title: input.title,
        kind: input.kind,
        summary: input.summary,
        order: input.order,
      })],
    },
  })
}

function saveSceneMoment(
  workspaceService: MovScriptWorkspaceService,
  input: MovScriptEngineSceneMomentInput,
) {
  const segmentId = requiredId(input.segmentId, 'segmentId')
  return workspaceService.saveProductionSnapshot({
    productionId: input.productionId ?? 'main',
    snapshot: {
      segments: [{
        id: segmentId,
        scene_moments: [pruneUndefined({
          id: input.id,
          title: input.title,
          storyboard_id: input.storyboardId,
          order: input.order,
          time_text: input.timeText,
          scene_code: input.sceneCode,
          location_text: input.locationText,
          condition_text: input.conditionText,
          action_text: input.actionText,
          mood: input.mood,
          description: input.description,
        })],
      }],
    },
  })
}

function saveStoryboard(
  workspaceService: MovScriptWorkspaceService,
  input: MovScriptEngineStoryboardInput,
) {
  const segmentId = requiredId(input.segmentId, 'segmentId')
  const sceneMomentId = requiredId(input.sceneMomentId, 'sceneMomentId')
  return workspaceService.saveProductionSnapshot({
    productionId: input.productionId ?? 'main',
    snapshot: {
      segments: [{
        id: segmentId,
        scene_moments: [{
          id: sceneMomentId,
          storyboards: [pruneUndefined({
            id: input.id ?? 'main',
            title: input.title,
            order: input.order,
          })],
        }],
      }],
    },
  })
}

function saveAudioCue(
  workspaceService: MovScriptWorkspaceService,
  input: MovScriptEngineAudioCueInput,
) {
  const segmentId = requiredId(input.segmentId, 'segmentId')
  const sceneMomentId = requiredId(input.sceneMomentId, 'sceneMomentId')
  return workspaceService.saveProductionSnapshot({
    productionId: input.productionId ?? 'main',
    snapshot: {
      segments: [{
        id: segmentId,
        scene_moments: [{
          id: sceneMomentId,
          audio_cues: [pruneUndefined({
            id: input.id,
            title: input.title,
            kind: input.kind,
            order: input.order,
            storyboard_id: input.storyboardId,
            shot_plan_id: input.shotPlanId,
            prompt_hint: input.promptHint,
          })],
        }],
      }],
    },
  })
}

function saveExpressionUnit(
  workspaceService: MovScriptWorkspaceService,
  input: MovScriptEngineExpressionUnitInput,
) {
  const segmentId = requiredId(input.segmentId, 'segmentId')
  const sceneMomentId = requiredId(input.sceneMomentId, 'sceneMomentId')
  return workspaceService.saveProductionSnapshot({
    productionId: input.productionId ?? 'main',
    snapshot: {
      segments: [{
        id: segmentId,
        scene_moments: [{
          id: sceneMomentId,
          expression_units: [pruneUndefined({
            id: input.id,
            title: input.title,
            kind: input.kind,
            speaker: input.speaker,
            text: input.text,
            note: input.note,
            intent: input.intent,
            order: input.order,
            span: input.span,
            script_block_id: input.scriptBlockId,
          })],
        }],
      }],
    },
  })
}

function saveContentUnit(
  workspaceService: MovScriptWorkspaceService,
  input: MovScriptEngineContentUnitInput,
) {
  return workspaceService.upsertContentUnit({
    unit: pruneUndefined({
      id: input.id,
      title: input.title,
      content_unit_type: input.contentUnitType ?? input.kind ?? 'storyboard_video',
      output_kind: input.outputKind ?? (input.contentUnitType === 'asset_ref' || input.kind === 'asset_ref' ? 'image' : 'video'),
      production_id: input.productionId,
      segment_id: input.segmentId,
      scene_moment_id: input.sceneMomentId,
      storyboard_id: input.storyboardId,
      audio_cue_id: input.audioCueId,
      asset_ref: input.assetRef,
      edit_prompt: pruneUndefined({
        text: input.prompt,
        negative_text: input.negativePrompt,
      }),
      model_intent: pruneUndefined({
        duration_sec: input.durationSeconds,
        params: pruneUndefined({
          shot_size: input.shotSize,
          camera_angle: input.cameraAngle,
          camera_motion: input.cameraMotion,
        }),
      }),
      description: input.description,
      order: input.order,
    }),
  })
}

async function listContentUnits(
  workspaceService: MovScriptWorkspaceService,
  input: MovScriptEngineListInput,
): Promise<MovScriptWorkspaceIndexedEntity[]> {
  const entities = await workspaceService.queryEntities({
    entityKind: 'content_unit',
    query: input.query,
  })
  const filtered = entities.filter((entity) => {
    if (input.kind && String(entity.record.content_unit_type ?? entity.record.kind) !== input.kind) return false
    const sceneMomentRef = stringValue(entity.record.scene_moment_ref)
    if (input.productionId !== undefined && !pathSegmentMatches(sceneMomentRef, 'productions', input.productionId, 'production')) return false
    if (input.segmentId !== undefined && !pathSegmentMatches(sceneMomentRef, 'segments', input.segmentId, 'segment')) return false
    if (input.sceneMomentId !== undefined && !pathSegmentMatches(sceneMomentRef, 'scene_moments', input.sceneMomentId, 'scene_moment')) return false
    return true
  })
  return input.limit === undefined ? filtered : filtered.slice(0, input.limit)
}

async function deletePlanningEntity(
  workspaceService: MovScriptWorkspaceService,
  entityKind: PlanningEntityKind,
  input: MovScriptEngineDeleteInput,
): Promise<{ deleted: true; entity: MovScriptWorkspaceIndexedEntity }> {
  const entity = await findPlanningEntity(workspaceService, entityKind, input)
  await workspaceService.deleteEntity({ entity })
  return { deleted: true, entity }
}

async function findPlanningEntity(
  workspaceService: MovScriptWorkspaceService,
  entityKind: PlanningEntityKind,
  input: MovScriptEngineDeleteInput,
): Promise<MovScriptWorkspaceIndexedEntity> {
  const id = String(input.id)
  const entities = await workspaceService.queryEntities(planningQuery(entityKind, input))
  const match = entities.find((entity) => normalizePath(entity.path) === normalizePath(id))
    ?? entities.find((entity) => sameEntityId(entity, id, entityKind))
  if (!match) throw new Error(`${entityKind} not found: ${id}`)
  return match
}

function sameEntityId(entity: MovScriptWorkspaceIndexedEntity, id: string, entityKind: PlanningEntityKind): boolean {
  const entityId = entity.id === undefined ? undefined : String(entity.id)
  if (entityId === id) return true
  if (entityId === `${entityKind}_${id}`) return true
  if (entityId?.startsWith(`${entityKind}_`) && entityId.slice(entityKind.length + 1) === id) return true
  return entity.path.includes(`/${id}/`)
}

function requiredId(value: string | number | undefined, name: string): string | number {
  if (value === undefined || value === null || String(value).trim() === '') throw new Error(`${name} is required`)
  return value
}

function normalizePath(value: string): string {
  return value.replace(/\\/g, '/').replace(/^\.movscript\//, '').replace(/^\/+/, '').replace(/\/+$/, '')
}

function pathSegmentMatches(path: string | undefined, marker: string, id: string | number, entityKind: string): boolean {
  if (!path) return false
  const segment = pathSegmentAfter(path, marker)
  if (!segment) return false
  return refAliases(id, entityKind).includes(segment)
}

function pathSegmentAfter(path: string, marker: string): string | undefined {
  const parts = normalizePath(path).split('/').filter(Boolean)
  const index = parts.indexOf(marker)
  return index >= 0 ? parts[index + 1] : undefined
}

function refAliases(value: string | number, entityKind: string): string[] {
  const raw = String(value)
  const withoutPrefix = raw.startsWith(`${entityKind}_`) ? raw.slice(entityKind.length + 1) : raw
  return [raw, withoutPrefix, `${entityKind}_${withoutPrefix}`]
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function pruneUndefined<T extends Record<string, unknown>>(value: T): T {
  const output: Record<string, unknown> = {}
  for (const [key, item] of Object.entries(value)) {
    if (item !== undefined && item !== '') output[key] = item
  }
  return output as T
}

function callRequiredOperation<T>(
  operation: (() => Promise<T | undefined>) | undefined,
  operationName: string,
): Promise<T> {
  if (!operation) {
    return Promise.reject(new Error(`MovScript engine ${operationName} operation is not configured`))
  }
  return operation().then((result) => result as T)
}
