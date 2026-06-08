import {
  getMovScriptWorkspaceModel,
  type MovScriptWorkspaceGetModelInput,
  type MovScriptWorkspaceGetModelResult,
} from './domain/index.js'
import type {
  MovScriptWorkspaceDomainIndex,
  MovScriptWorkspaceIndexedEntity,
} from './indexer/index.js'
import {
  queryMovScriptWorkspaceAssets,
  queryMovScriptWorkspaceEntities,
  queryMovScriptWorkspaceProductionContext,
  queryMovScriptWorkspaceSettings,
  type MovScriptWorkspaceAssetQuery,
  type MovScriptWorkspaceEntityQuery,
  type MovScriptWorkspaceProductionContextQuery,
  type MovScriptWorkspaceSettingQuery,
} from './indexer/index.js'
import {
  MOVSCRIPT_BUILD_CURRENT_DIR,
  MOVSCRIPT_EDITOR_STATE_PATH,
  entityPathSlug,
  normalizeWorkspacePath,
} from './layout/index.js'
import {
  appendMovScriptInlineCandidate,
  createMovScriptWorkspaceAssetSlotCandidate,
  createMovScriptWorkspaceKeyframeCandidate,
  createMovScriptWorkspaceDomainRepository,
  deleteMovScriptWorkspaceEntity,
  selectMovScriptInlineCandidate,
  snapshotMovScriptVersionFromMarkdown,
  unlockMovScriptInlineCandidate,
  updateMovScriptInlineCandidate,
  updateMovScriptContentUnitEditablePrompt,
  upsertMovScriptContentUnit,
  upsertMovScriptProjectStandards,
  updateMovScriptSceneMomentStoryboardTiming,
  updateMovScriptStoryboardShotPlans,
  upsertMovScriptWorkspaceScript,
  readMovScriptWorkspaceScriptSource,
  upsertMovScriptWorkspaceAsset,
  upsertMovScriptWorkspaceSetting,
  saveMovScriptProductionWorkspaceSnapshot,
  type MovScriptContentUnitEditablePromptUpdateInput,
  type MovScriptContentUnitEditablePromptUpdateResult,
  type MovScriptContentUnitWriteInput,
  type MovScriptContentUnitWriteResult,
  type MovScriptProjectStandardsWriteInput,
  type MovScriptProjectStandardsWriteResult,
  type MovScriptWorkspaceEntityDeleteInput,
  type MovScriptWorkspaceEntityWriteInput,
  type MovScriptWorkspaceEntityWriteResult,
  type MovScriptWorkspaceScriptWriteInput,
  type MovScriptWorkspaceScriptWriteResult,
  type MovScriptWorkspaceScriptSourceReadInput,
  type MovScriptProductionWorkspaceSnapshotWriteInput,
  type MovScriptProductionWorkspaceSnapshotWriteResult,
  type MovScriptInlineCandidateLockInput,
  type MovScriptInlineCandidateUnlockInput,
  type MovScriptInlineCandidateUpdateInput,
  type MovScriptInlineCandidateWriteInput,
  type MovScriptInlineCandidateWriteResult,
  type MovScriptWorkspaceCandidateWriteInput,
  type MovScriptWorkspaceCandidateWriteResult,
  type MovScriptScriptVersionSnapshotInput,
  type MovScriptScriptVersionSnapshotResult,
  type MovScriptShotPlanUpdateInput,
  type MovScriptShotPlanUpdateResult,
  type MovScriptStoryboardTimingUpdateInput,
  type MovScriptStoryboardTimingUpdateResult,
  type MovScriptWorkspaceFileRepository,
} from './repository/index.js'

export interface MovScriptWorkspaceServiceOptions {
  fileRepository: MovScriptWorkspaceFileRepository
  now?: () => Date
}

export interface MovScriptWorkspaceInitializeInput {
  projectId?: string
  projectName?: string
  title?: string
  language?: string
  standards?: Record<string, unknown>
  overwrite?: boolean
}

export interface MovScriptWorkspaceInitializeFileResult {
  path: string
  status: 'created' | 'updated' | 'skipped'
  record: Record<string, unknown>
}

export interface MovScriptWorkspaceInitializeResult {
  projectId: string
  projectName: string
  files: MovScriptWorkspaceInitializeFileResult[]
}

export interface MovScriptWorkspaceService {
  initializeProject(input?: MovScriptWorkspaceInitializeInput): Promise<MovScriptWorkspaceInitializeResult>
  getModel(input: MovScriptWorkspaceGetModelInput): MovScriptWorkspaceGetModelResult
  loadIndex(input?: { path?: string }): Promise<MovScriptWorkspaceDomainIndex>
  queryEntities(query?: MovScriptWorkspaceEntityQuery): Promise<MovScriptWorkspaceIndexedEntity[]>
  querySettings(query?: MovScriptWorkspaceSettingQuery): Promise<MovScriptWorkspaceIndexedEntity[]>
  queryAssets(query?: MovScriptWorkspaceAssetQuery): Promise<ReturnType<typeof queryMovScriptWorkspaceAssets>>
  queryProductionContext(query?: MovScriptWorkspaceProductionContextQuery): Promise<Record<string, MovScriptWorkspaceIndexedEntity[]>>
  readEditorState(): Promise<Record<string, unknown> | undefined>
  readPreviewTimeline(productionId: string | number): Promise<Record<string, unknown> | undefined>
  readContentGenerationPrompt(contentUnitId: string | number): Promise<Record<string, unknown> | undefined>
  upsertSetting(input: Omit<MovScriptWorkspaceEntityWriteInput, 'fileRepository'>): Promise<MovScriptWorkspaceEntityWriteResult>
  upsertAsset(input: Omit<MovScriptWorkspaceEntityWriteInput, 'fileRepository'>): Promise<MovScriptWorkspaceEntityWriteResult>
  upsertScript(input: Omit<MovScriptWorkspaceScriptWriteInput, 'fileRepository'>): Promise<MovScriptWorkspaceScriptWriteResult>
  readScriptSource(input: Omit<MovScriptWorkspaceScriptSourceReadInput, 'fileRepository'>): Promise<string>
  saveProductionSnapshot(
    input: Omit<MovScriptProductionWorkspaceSnapshotWriteInput, 'fileRepository'>,
  ): Promise<MovScriptProductionWorkspaceSnapshotWriteResult>
  deleteEntity(input: Omit<MovScriptWorkspaceEntityDeleteInput, 'fileRepository'>): Promise<void>
  snapshotScriptVersionFromMarkdown(
    input: Omit<MovScriptScriptVersionSnapshotInput, 'fileRepository'>,
  ): Promise<MovScriptScriptVersionSnapshotResult>
  updateContentUnitEditablePrompt(
    input: Omit<MovScriptContentUnitEditablePromptUpdateInput, 'fileRepository'>,
  ): Promise<MovScriptContentUnitEditablePromptUpdateResult>
  upsertContentUnit(input: Omit<MovScriptContentUnitWriteInput, 'fileRepository'>): Promise<MovScriptContentUnitWriteResult>
  upsertProjectStandards(
    input: Omit<MovScriptProjectStandardsWriteInput, 'fileRepository'>,
  ): Promise<MovScriptProjectStandardsWriteResult>
  updateSceneMomentStoryboardTiming(
    input: Omit<MovScriptStoryboardTimingUpdateInput, 'fileRepository'>,
  ): Promise<MovScriptStoryboardTimingUpdateResult>
  updateStoryboardShotPlans(
    input: Omit<MovScriptShotPlanUpdateInput, 'fileRepository'>,
  ): Promise<MovScriptShotPlanUpdateResult>
  appendCandidate(
    input: Omit<MovScriptInlineCandidateWriteInput, 'fileRepository'>,
  ): Promise<MovScriptInlineCandidateWriteResult>
  createAssetSlotCandidate(
    input: Omit<MovScriptWorkspaceCandidateWriteInput, 'fileRepository' | 'projectPath'> & { projectPath?: string },
  ): Promise<MovScriptWorkspaceCandidateWriteResult>
  createKeyframeCandidate(
    input: Omit<MovScriptWorkspaceCandidateWriteInput, 'fileRepository' | 'projectPath'> & { projectPath?: string },
  ): Promise<MovScriptWorkspaceCandidateWriteResult>
  selectCandidate(
    input: Omit<MovScriptInlineCandidateLockInput, 'fileRepository'>,
  ): Promise<MovScriptInlineCandidateWriteResult>
  updateCandidate(
    input: Omit<MovScriptInlineCandidateUpdateInput, 'fileRepository'>,
  ): Promise<MovScriptInlineCandidateWriteResult>
  unlockCandidate(
    input: Omit<MovScriptInlineCandidateUnlockInput, 'fileRepository'>,
  ): Promise<Omit<MovScriptInlineCandidateWriteResult, 'candidate'>>
}

export function createMovScriptWorkspaceService(
  options: MovScriptWorkspaceServiceOptions,
): MovScriptWorkspaceService {
  const domainRepository = createMovScriptWorkspaceDomainRepository({
    fileRepository: options.fileRepository,
  })
  const loadIndex = (input?: { path?: string }) => domainRepository.loadIndex(input)

  return {
    async initializeProject(input = {}) {
      const now = options.now?.() ?? new Date()
      const createdAt = now.toISOString()
      const title = stringField(input.title) ?? 'MovScript Project'
      const projectId = stringField(input.projectId ?? input.projectName) ?? title
      const files = [
        await writeJSONDocument(options.fileRepository, 'workspace.json', {
          schema: 'movscript.workspace.v1',
          project_name: projectId,
          title,
          created_at: createdAt,
          updated_at: createdAt,
        }, Boolean(input.overwrite)),
        await writeJSONDocument(options.fileRepository, 'project.json', {
          schema: 'movscript.project.v1',
          kind: 'project',
          project_id: projectId,
          title,
          language: stringField(input.language),
          created_at: createdAt,
          updated_at: createdAt,
        }, Boolean(input.overwrite)),
        await writeJSONDocument(options.fileRepository, 'project_standards.json', {
          schema: 'movscript.project_standards.v1',
          kind: 'project_standards',
          id: 'project_standards',
          project_id: projectId,
          title: 'Project standards',
          ...(input.standards ?? {}),
          updated_at: createdAt,
        }, Boolean(input.overwrite)),
      ]
      return { projectId, projectName: projectId, files }
    },
    getModel: getMovScriptWorkspaceModel,
    loadIndex,
    async queryEntities(query = {}) {
      return queryMovScriptWorkspaceEntities(await loadIndex(), query)
    },
    async querySettings(query = {}) {
      return queryMovScriptWorkspaceSettings(await loadIndex(), query)
    },
    async queryAssets(query = {}) {
      return queryMovScriptWorkspaceAssets(await loadIndex(), query)
    },
    async queryProductionContext(query = {}) {
      return queryMovScriptWorkspaceProductionContext(await loadIndex(), query)
    },
    readEditorState() {
      return readJSONArtifact(options.fileRepository, MOVSCRIPT_EDITOR_STATE_PATH)
    },
    readPreviewTimeline(productionId) {
      return readJSONArtifact(options.fileRepository, `${MOVSCRIPT_BUILD_CURRENT_DIR}/productions/${entityPathSlug(productionId, 'production')}/preview_timeline.json`)
    },
    readContentGenerationPrompt(contentUnitId) {
      return readJSONArtifact(options.fileRepository, `${MOVSCRIPT_BUILD_CURRENT_DIR}/content_units/${entityPathSlug(contentUnitId, 'content_unit')}/generation_prompt.json`)
    },
    upsertSetting(input) {
      return upsertMovScriptWorkspaceSetting({
        fileRepository: options.fileRepository,
        now: options.now?.(),
        ...input,
      })
    },
    upsertAsset(input) {
      return upsertMovScriptWorkspaceAsset({
        fileRepository: options.fileRepository,
        now: options.now?.(),
        ...input,
      })
    },
    upsertScript(input) {
      return upsertMovScriptWorkspaceScript({
        fileRepository: options.fileRepository,
        now: options.now?.(),
        ...input,
      })
    },
    readScriptSource(input) {
      return readMovScriptWorkspaceScriptSource({
        fileRepository: options.fileRepository,
        ...input,
      })
    },
    saveProductionSnapshot(input) {
      return saveMovScriptProductionWorkspaceSnapshot({
        fileRepository: options.fileRepository,
        now: options.now?.(),
        ...input,
      })
    },
    deleteEntity(input) {
      return deleteMovScriptWorkspaceEntity({
        fileRepository: options.fileRepository,
        ...input,
      })
    },
    snapshotScriptVersionFromMarkdown(input) {
      return snapshotMovScriptVersionFromMarkdown({
        fileRepository: options.fileRepository,
        ...input,
      })
    },
    updateContentUnitEditablePrompt(input) {
      return updateMovScriptContentUnitEditablePrompt({
        fileRepository: options.fileRepository,
        ...input,
      })
    },
    upsertContentUnit(input) {
      return upsertMovScriptContentUnit({
        fileRepository: options.fileRepository,
        ...input,
      })
    },
    upsertProjectStandards(input) {
      return upsertMovScriptProjectStandards({
        fileRepository: options.fileRepository,
        now: options.now?.(),
        ...input,
      })
    },
    updateSceneMomentStoryboardTiming(input) {
      return updateMovScriptSceneMomentStoryboardTiming({
        fileRepository: options.fileRepository,
        ...input,
      })
    },
    updateStoryboardShotPlans(input) {
      return updateMovScriptStoryboardShotPlans({
        fileRepository: options.fileRepository,
        ...input,
      })
    },
    appendCandidate(input) {
      return appendMovScriptInlineCandidate({
        fileRepository: options.fileRepository,
        ...input,
      })
    },
    createAssetSlotCandidate(input) {
      return createMovScriptWorkspaceAssetSlotCandidate({
        fileRepository: options.fileRepository,
        projectPath: input.projectPath ?? '',
        ...input,
      })
    },
    createKeyframeCandidate(input) {
      return createMovScriptWorkspaceKeyframeCandidate({
        fileRepository: options.fileRepository,
        projectPath: input.projectPath ?? '',
        ...input,
      })
    },
    selectCandidate(input) {
      return selectMovScriptInlineCandidate({
        fileRepository: options.fileRepository,
        ...input,
      })
    },
    updateCandidate(input) {
      return updateMovScriptInlineCandidate({
        fileRepository: options.fileRepository,
        ...input,
      })
    },
    unlockCandidate(input) {
      return unlockMovScriptInlineCandidate({
        fileRepository: options.fileRepository,
        ...input,
      })
    },
  }
}

async function readJSONArtifact(
  fileRepository: MovScriptWorkspaceFileRepository,
  path: string,
): Promise<Record<string, unknown> | undefined> {
  const file = await fileRepository.read({ path: normalizeWorkspacePath(path) }).catch(() => undefined)
  if (!file) return undefined
  const parsed = JSON.parse(file.content) as unknown
  return isRecord(parsed) ? parsed : undefined
}

async function writeJSONDocument(
  fileRepository: MovScriptWorkspaceFileRepository,
  path: string,
  record: Record<string, unknown>,
  overwrite: boolean,
): Promise<MovScriptWorkspaceInitializeFileResult> {
  const normalizedPath = normalizeWorkspacePath(path)
  if (!overwrite) {
    const existing = await readJSONArtifact(fileRepository, normalizedPath)
    if (existing) {
      return { path: normalizedPath, status: 'skipped', record: existing }
    }
  }
  const existing = await readJSONArtifact(fileRepository, normalizedPath)
  await fileRepository.write({
    path: normalizedPath,
    content: `${JSON.stringify(pruneUndefined(record), null, 2)}\n`,
  })
  return {
    path: normalizedPath,
    status: existing ? 'updated' : 'created',
    record: pruneUndefined(record),
  }
}

function stringField(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function pruneUndefined(value: Record<string, unknown>): Record<string, unknown> {
  const output: Record<string, unknown> = {}
  for (const [key, item] of Object.entries(value)) {
    if (item !== undefined) output[key] = item
  }
  return output
}
