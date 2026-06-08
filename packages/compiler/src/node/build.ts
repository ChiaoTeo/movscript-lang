import { createHash } from 'node:crypto'
import {
  buildMovScriptWorkspaceBuildArtifacts,
  type MovScriptDomainEntityRef,
  type MovScriptImpactReportArtifact,
  type MovScriptWorkspaceBuildArtifacts,
} from '../artifacts/index.js'
import {
  getSemanticEntitySchemaEntry,
} from '@movscript/language/domain'
import {
  buildMovScriptWorkspaceDomainIndex,
  type MovScriptWorkspaceDomainIndex,
  type MovScriptWorkspaceDocument,
} from '@movscript/workspace/indexer'
import type {
  MovScriptWorkspaceFileRepository,
} from '@movscript/workspace/repository'
import {
  MOVSCRIPT_BUILD_CURRENT_DIR,
  MOVSCRIPT_BUILD_INDEXES_DIR,
  MOVSCRIPT_BUILD_MANIFESTS_DIR,
  MOVSCRIPT_BUILD_REVIEWS_DIR,
  MOVSCRIPT_ASSET_INDEX_PATH,
  MOVSCRIPT_DOMAIN_TREE_PATH,
  MOVSCRIPT_DOMAIN_INDEX_PATH,
  MOVSCRIPT_EDITOR_STATE_PATH,
  MOVSCRIPT_RELATION_GRAPH_PATH,
  isMovScriptNonSourceRootDirectory,
  isMovScriptSourceDocumentPath,
  isMovScriptSourcePath,
  normalizeWorkspacePath,
  entityRefAliases,
  entityPathSlug,
} from '@movscript/workspace/layout'

export type MovScriptWorkspaceChangeState = 'added' | 'modified' | 'deleted' | 'unchanged'
export type MovScriptWorkspaceIssueSeverity = 'error' | 'warning'

export interface MovScriptWorkspaceChangedFile {
  path: string
  buildPath: string
  state: MovScriptWorkspaceChangeState
  contentHash?: string
  buildContentHash?: string
}

export interface MovScriptWorkspaceReviewIssue {
  path: string
  severity: MovScriptWorkspaceIssueSeverity
  message: string
}

export interface MovScriptWorkspaceChangedEntity {
  entityKind: string
  path: string
  id?: string | number
  clientId?: string
  state: MovScriptWorkspaceChangeState
}

export interface MovScriptWorkspaceReviewResult {
  schema: 'movscript.workspace-review.v1'
  operation: 'review'
  basePath: typeof MOVSCRIPT_BUILD_CURRENT_DIR
  sourcePath: string
  sourceMode: 'source'
  createdAt: string
  changedFiles: MovScriptWorkspaceChangedFile[]
  changedEntities: MovScriptWorkspaceChangedEntity[]
  issues: MovScriptWorkspaceReviewIssue[]
  readyToBuild: boolean
  summary: {
    total: number
    added: number
    modified: number
    deleted: number
    errors: number
    warnings: number
  }
}

export interface MovScriptWorkspaceInspectionResult extends Omit<MovScriptWorkspaceReviewResult, 'schema' | 'operation'> {
  schema: 'movscript.workspace-inspection.v1'
  operation: 'inspect'
  reviewAlias: {
    schema: MovScriptWorkspaceReviewResult['schema']
    operation: MovScriptWorkspaceReviewResult['operation']
  }
}

export interface MovScriptWorkspaceBuildManifest {
  schema: 'movscript.workspace-build.v1'
  buildId: string
  builtAt: string
  source: {
    sourcePath: string
    sourceMode: 'source'
    sourceFileHashes: Record<string, string>
  }
  output: {
    currentPath: typeof MOVSCRIPT_BUILD_CURRENT_DIR
    domainIndexPath: typeof MOVSCRIPT_DOMAIN_INDEX_PATH
    domainTreePath: typeof MOVSCRIPT_DOMAIN_TREE_PATH
    editorStatePath: typeof MOVSCRIPT_EDITOR_STATE_PATH
    assetIndexPath: typeof MOVSCRIPT_ASSET_INDEX_PATH
    relationGraphPath: typeof MOVSCRIPT_RELATION_GRAPH_PATH
    impactReportPath: string
  }
  review: MovScriptWorkspaceReviewResult
}

export interface MovScriptWorkspaceRegenerationTarget {
  contentUnitId?: string | number
  contentUnitPath?: string
  reasons: string[]
  selected?: boolean
  stale?: boolean
  candidateId?: string | number
  resourceId?: string | number
  currentInputHash?: string
  acceptedInputHash?: string
}

export interface MovScriptWorkspaceRegenerationPlanResult {
  schema: 'movscript.workspace-regeneration-plan.v1'
  operation: 'regen-plan'
  createdAt: string
  status: 'ready' | 'no_build'
  build?: {
    buildId: string
    builtAt: string
    manifestPath: string
    impactReportPath?: string
  }
  changedEntities: MovScriptImpactReportArtifact['changedEntities']
  affectedContentUnits: MovScriptWorkspaceRegenerationTarget[]
  promptBundles: Array<{
    contentUnitId?: string | number
    contentUnitPath?: string
    reasons: string[]
  }>
  previewTimelines: Array<{
    productionId?: string | number
    path?: string
    reasons: string[]
  }>
  summary: {
    changedEntities: number
    affectedContentUnits: number
    staleContentUnits: number
    promptBundles: number
    previewTimelines: number
  }
}

export interface MovScriptWorkspaceOverviewResult {
  schema: 'movscript.workspace-overview.v1'
  operation: 'overview'
  createdAt: string
  workspace: {
    projectId?: string | number
    title?: string
    sourcePath: string
  }
  source: {
    mode: 'source'
    documentCount: number
    entityCount: number
    issueCount: number
    hasPendingEdits: boolean
    readyToCompile: boolean
  }
  build: {
    status: 'missing' | 'current' | 'stale'
    lastBuildId?: string
    lastBuiltAt?: string
    currentIsStale: boolean
  }
  changes: MovScriptWorkspaceInspectionResult['summary'] & {
    affectedEntityKinds: string[]
  }
  regeneration: MovScriptWorkspaceRegenerationPlanResult['summary']
  nextActions: string[]
}

export interface MovScriptWorkspaceBuildResult {
  schema: 'movscript.workspace-build-result.v1'
  operation: 'build'
  status: 'built' | 'failed'
  review: MovScriptWorkspaceReviewResult
  index?: MovScriptWorkspaceDomainIndex
  manifest?: MovScriptWorkspaceBuildManifest
}

export interface MovScriptWorkspaceBuildInput {
  fileRepository: MovScriptWorkspaceFileRepository
  now?: Date
}

interface WorkspaceFileSnapshot {
  path: string
  relativePath: string
  content: string
  hash: string
}

interface WorkspaceSourceSnapshot {
  rootPath: string
  mode: 'source'
  files: WorkspaceFileSnapshot[]
}

interface SourceDomainRecord {
  file: WorkspaceFileSnapshot
  data: unknown
  entityKind?: string
  id?: string | number
  dir: string
}

interface SourceDomainGraph {
  records: SourceDomainRecord[]
  entityPaths: Set<string>
  byId: Map<string, SourceDomainRecord>
}

export async function reviewMovScriptBuildWorkspace(input: MovScriptWorkspaceBuildInput): Promise<MovScriptWorkspaceReviewResult> {
  const now = input.now ?? new Date()
  const source = await resolveWorkspaceSource(input.fileRepository)
  const editFiles = source.files
  const currentFiles = await loadBuildCurrentSourceSnapshots(input.fileRepository, source.mode)
  const changedFiles = diffWorkspaceFiles(editFiles, currentFiles)
  const issues = [
    ...validateEditableFiles(editFiles),
    ...validateSourceDomainFiles(editFiles),
  ]
  const changedEntities = changedEntitiesFromFiles(changedFiles, editFiles)
  const summary = summarizeReview(changedFiles, issues)
  return {
    schema: 'movscript.workspace-review.v1',
    operation: 'review',
    basePath: MOVSCRIPT_BUILD_CURRENT_DIR,
    sourcePath: source.rootPath,
    sourceMode: source.mode,
    createdAt: now.toISOString(),
    changedFiles,
    changedEntities,
    issues,
    readyToBuild: summary.errors === 0,
    summary,
  }
}

export async function inspectMovScriptWorkspace(input: MovScriptWorkspaceBuildInput): Promise<MovScriptWorkspaceInspectionResult> {
  const review = await reviewMovScriptBuildWorkspace(input)
  return {
    ...review,
    schema: 'movscript.workspace-inspection.v1',
    operation: 'inspect',
    reviewAlias: {
      schema: 'movscript.workspace-review.v1',
      operation: 'review',
    },
  }
}

export async function overviewMovScriptWorkspace(input: MovScriptWorkspaceBuildInput): Promise<MovScriptWorkspaceOverviewResult> {
  const now = input.now ?? new Date()
  const inspection = await inspectMovScriptWorkspace({ ...input, now })
  const source = await resolveWorkspaceSource(input.fileRepository)
  const latestBuild = await loadLatestBuildManifest(input.fileRepository)
  const regeneration = await planMovScriptWorkspaceRegeneration({ ...input, now })
  const project = projectInfoFromSource(source)
  const affectedEntityKinds = [...new Set(inspection.changedEntities.map((entity) => entity.entityKind))].sort()
  const buildStatus = !latestBuild
    ? 'missing'
    : inspection.summary.total > 0
      ? 'stale'
      : 'current'
  return {
    schema: 'movscript.workspace-overview.v1',
    operation: 'overview',
    createdAt: now.toISOString(),
    workspace: {
      ...(project.projectId !== undefined ? { projectId: project.projectId } : {}),
      ...(project.title !== undefined ? { title: project.title } : {}),
      sourcePath: source.rootPath,
    },
    source: {
      mode: source.mode,
      documentCount: source.files.length,
      entityCount: source.files.filter((file) => sourceEntityKindFromRelativePath(file.relativePath) !== undefined).length,
      issueCount: inspection.issues.length,
      hasPendingEdits: inspection.summary.total > 0,
      readyToCompile: inspection.readyToBuild,
    },
    build: {
      status: buildStatus,
      ...(latestBuild ? { lastBuildId: latestBuild.manifest.buildId, lastBuiltAt: latestBuild.manifest.builtAt } : {}),
      currentIsStale: buildStatus !== 'current',
    },
    changes: {
      ...inspection.summary,
      affectedEntityKinds,
    },
    regeneration: regeneration.summary,
    nextActions: nextActionsForOverview(inspection, regeneration, buildStatus),
  }
}

export async function buildMovScriptWorkspace(input: MovScriptWorkspaceBuildInput): Promise<MovScriptWorkspaceBuildResult> {
  const now = input.now ?? new Date()
  const review = await reviewMovScriptBuildWorkspace({ ...input, now })
  if (!review.readyToBuild) {
    return {
      schema: 'movscript.workspace-build-result.v1',
      operation: 'build',
      status: 'failed',
      review,
    }
  }

  const source = await resolveWorkspaceSource(input.fileRepository)
  const editFiles = source.files
  for (const file of review.changedFiles.filter((item) => item.state === 'deleted')) {
    await input.fileRepository.delete({ path: file.buildPath })
  }
  for (const file of editFiles) {
    await input.fileRepository.write({
      path: `${MOVSCRIPT_BUILD_CURRENT_DIR}/${file.relativePath}`,
      content: file.content,
    })
  }

  const documents = editFiles.map((file): MovScriptWorkspaceDocument => ({
    path: file.relativePath,
    data: parseWorkspaceDocument(file.path, file.content),
  }))
  const index = buildMovScriptWorkspaceDomainIndex(documents)
  const buildId = buildIdFor(now)
  const artifacts = buildMovScriptWorkspaceBuildArtifacts({
    index,
    changedEntities: review.changedEntities,
    buildId,
    createdAt: now.toISOString(),
  })
  const impactReportPath = `${MOVSCRIPT_BUILD_REVIEWS_DIR}/impact-report_${buildId}.json`
  const manifest: MovScriptWorkspaceBuildManifest = {
    schema: 'movscript.workspace-build.v1',
    buildId,
    builtAt: now.toISOString(),
    source: {
      sourcePath: source.rootPath,
      sourceMode: source.mode,
      sourceFileHashes: Object.fromEntries(editFiles.map((file) => [file.relativePath, file.hash])),
    },
    output: {
      currentPath: MOVSCRIPT_BUILD_CURRENT_DIR,
      domainIndexPath: MOVSCRIPT_DOMAIN_INDEX_PATH,
      domainTreePath: MOVSCRIPT_DOMAIN_TREE_PATH,
      editorStatePath: MOVSCRIPT_EDITOR_STATE_PATH,
      assetIndexPath: MOVSCRIPT_ASSET_INDEX_PATH,
      relationGraphPath: MOVSCRIPT_RELATION_GRAPH_PATH,
      impactReportPath,
    },
    review,
  }

  await input.fileRepository.write({
    path: MOVSCRIPT_DOMAIN_TREE_PATH,
    content: `${JSON.stringify(artifacts.domainTree, null, 2)}\n`,
  })
  await input.fileRepository.write({
    path: MOVSCRIPT_EDITOR_STATE_PATH,
    content: `${JSON.stringify(editorStateFromArtifacts(artifacts), null, 2)}\n`,
  })
  await deleteStaleBuildArtifacts(input.fileRepository, artifacts.previewTimelines.map((timeline) => {
    return `${MOVSCRIPT_BUILD_CURRENT_DIR}/productions/${entityPathSlug(timeline.productionId, 'production')}/preview_timeline.json`
  }), isPreviewTimelineBuildArtifact)
  for (const previewTimeline of artifacts.previewTimelines) {
    await input.fileRepository.write({
      path: `${MOVSCRIPT_BUILD_CURRENT_DIR}/productions/${entityPathSlug(previewTimeline.productionId, 'production')}/preview_timeline.json`,
      content: `${JSON.stringify(previewTimeline, null, 2)}\n`,
    })
  }
  const contentUnitArtifactPaths = artifacts.contentUnitArtifacts.flatMap((artifact) => {
    const dir = `${MOVSCRIPT_BUILD_CURRENT_DIR}/content_units/${entityPathSlug(artifact.contentUnitId, 'content_unit')}`
    return [
      `${dir}/runtime_panel.json`,
      `${dir}/input_version.json`,
      `${dir}/dependency_report.json`,
      `${dir}/selection_validity.json`,
    ]
  })
  await deleteStaleBuildArtifacts(input.fileRepository, contentUnitArtifactPaths, isContentUnitBuildArtifact)
  for (const artifact of artifacts.contentUnitArtifacts) {
    const dir = `${MOVSCRIPT_BUILD_CURRENT_DIR}/content_units/${entityPathSlug(artifact.contentUnitId, 'content_unit')}`
    await input.fileRepository.write({
      path: `${dir}/runtime_panel.json`,
      content: `${JSON.stringify(artifact.runtimePanel, null, 2)}\n`,
    })
    await input.fileRepository.write({
      path: `${dir}/input_version.json`,
      content: `${JSON.stringify(artifact.inputVersion, null, 2)}\n`,
    })
    await input.fileRepository.write({
      path: `${dir}/dependency_report.json`,
      content: `${JSON.stringify(artifact.dependencyReport, null, 2)}\n`,
    })
    await input.fileRepository.write({
      path: `${dir}/selection_validity.json`,
      content: `${JSON.stringify(artifact.selectionValidity, null, 2)}\n`,
    })
  }
  await input.fileRepository.write({
    path: MOVSCRIPT_DOMAIN_INDEX_PATH,
    content: `${JSON.stringify(serializableDomainIndex(index), null, 2)}\n`,
  })
  await input.fileRepository.write({
    path: MOVSCRIPT_ASSET_INDEX_PATH,
    content: `${JSON.stringify(artifacts.assetIndex, null, 2)}\n`,
  })
  await input.fileRepository.write({
    path: MOVSCRIPT_RELATION_GRAPH_PATH,
    content: `${JSON.stringify(artifacts.relationGraph, null, 2)}\n`,
  })
  await input.fileRepository.write({
    path: impactReportPath,
    content: `${JSON.stringify(artifacts.impactReport, null, 2)}\n`,
  })
  await input.fileRepository.write({
    path: `${MOVSCRIPT_BUILD_MANIFESTS_DIR}/${buildId}.json`,
    content: `${JSON.stringify(manifest, null, 2)}\n`,
  })

  return {
    schema: 'movscript.workspace-build-result.v1',
    operation: 'build',
    status: 'built',
    review,
    index,
    manifest,
  }
}

export async function planMovScriptWorkspaceRegeneration(input: MovScriptWorkspaceBuildInput): Promise<MovScriptWorkspaceRegenerationPlanResult> {
  const now = input.now ?? new Date()
  const latestBuild = await loadLatestBuildManifest(input.fileRepository)
  if (!latestBuild) {
    return {
      schema: 'movscript.workspace-regeneration-plan.v1',
      operation: 'regen-plan',
      createdAt: now.toISOString(),
      status: 'no_build',
      changedEntities: [],
      affectedContentUnits: [],
      promptBundles: [],
      previewTimelines: [],
      summary: {
        changedEntities: 0,
        affectedContentUnits: 0,
        staleContentUnits: 0,
        promptBundles: 0,
        previewTimelines: 0,
      },
    }
  }
  const impactReport = await readJsonFile<MovScriptImpactReportArtifact>(
    input.fileRepository,
    latestBuild.manifest.output.impactReportPath,
  )
  const changedEntities = impactReport?.changedEntities ?? []
  const selectionValidity = await loadContentUnitSelectionValidity(input.fileRepository)
  const affectedContentUnits = affectedContentUnitTargets(changedEntities, selectionValidity)
  const promptBundles = affectedContentUnits.map((target) => ({
    ...(target.contentUnitId !== undefined ? { contentUnitId: target.contentUnitId } : {}),
    ...(target.contentUnitPath !== undefined ? { contentUnitPath: target.contentUnitPath } : {}),
    reasons: target.reasons,
  }))
  const previewTimelines = previewTimelineTargets(changedEntities)
  return {
    schema: 'movscript.workspace-regeneration-plan.v1',
    operation: 'regen-plan',
    createdAt: now.toISOString(),
    status: 'ready',
    build: {
      buildId: latestBuild.manifest.buildId,
      builtAt: latestBuild.manifest.builtAt,
      manifestPath: latestBuild.path,
      impactReportPath: latestBuild.manifest.output.impactReportPath,
    },
    changedEntities,
    affectedContentUnits,
    promptBundles,
    previewTimelines,
    summary: {
      changedEntities: changedEntities.length,
      affectedContentUnits: affectedContentUnits.length,
      staleContentUnits: affectedContentUnits.filter((target) => target.stale).length,
      promptBundles: promptBundles.length,
      previewTimelines: previewTimelines.length,
    },
  }
}

async function loadWorkspaceFileSnapshots(
  fileRepository: MovScriptWorkspaceFileRepository,
  rootPath: string,
): Promise<WorkspaceFileSnapshot[]> {
  const files: WorkspaceFileSnapshot[] = []
  await collectWorkspaceFileSnapshots(fileRepository, rootPath, rootPath, files)
  return files.sort((left, right) => left.path.localeCompare(right.path))
}

async function deleteStaleBuildArtifacts(
  fileRepository: MovScriptWorkspaceFileRepository,
  nextArtifactPaths: string[],
  matchesArtifact: (relativePath: string) => boolean,
): Promise<void> {
  const nextPaths = new Set(nextArtifactPaths.map(normalizeWorkspacePath))
  const currentFiles = await loadWorkspaceFileSnapshots(fileRepository, MOVSCRIPT_BUILD_CURRENT_DIR)
  for (const file of currentFiles) {
    if (!matchesArtifact(file.relativePath)) continue
    if (nextPaths.has(file.path)) continue
    await fileRepository.delete({ path: file.path })
  }
}

function isPreviewTimelineBuildArtifact(relativePath: string): boolean {
  return relativePath.startsWith('productions/') && relativePath.endsWith('/preview_timeline.json')
}

function isContentUnitBuildArtifact(relativePath: string): boolean {
  return relativePath.startsWith('content_units/')
    && (relativePath.endsWith('/runtime_panel.json')
      || relativePath.endsWith('/input_version.json')
      || relativePath.endsWith('/dependency_report.json')
      || relativePath.endsWith('/selection_validity.json')
      || relativePath.endsWith('/generation_prompt.json'))
}

async function resolveWorkspaceSource(fileRepository: MovScriptWorkspaceFileRepository): Promise<WorkspaceSourceSnapshot> {
  const sourceFiles = await loadWorkspaceSourceFileSnapshots(fileRepository)
  return { rootPath: '', mode: 'source', files: sourceFiles }
}

async function loadWorkspaceSourceFileSnapshots(
  fileRepository: MovScriptWorkspaceFileRepository,
): Promise<WorkspaceFileSnapshot[]> {
  const files: WorkspaceFileSnapshot[] = []
  await collectWorkspaceFileSnapshots(fileRepository, '', '', files)
  return files
    .filter((file) => isMovScriptSourceRelativePath(file.relativePath))
    .sort((left, right) => left.path.localeCompare(right.path))
}

async function loadBuildCurrentSourceSnapshots(
  fileRepository: MovScriptWorkspaceFileRepository,
  _sourceMode: WorkspaceSourceSnapshot['mode'],
): Promise<WorkspaceFileSnapshot[]> {
  const files = await loadWorkspaceFileSnapshots(fileRepository, MOVSCRIPT_BUILD_CURRENT_DIR)
  return files.filter((file) => isMovScriptSourceRelativePath(file.relativePath))
}

async function collectWorkspaceFileSnapshots(
  fileRepository: MovScriptWorkspaceFileRepository,
  rootPath: string,
  path: string,
  out: WorkspaceFileSnapshot[],
): Promise<void> {
  let listed: Awaited<ReturnType<MovScriptWorkspaceFileRepository['list']>>
  try {
    listed = await fileRepository.list({ path })
  } catch {
    return
  }
  for (const entry of listed.entries) {
    if (entry.kind === 'directory') {
      if (rootPath === '' && isMovScriptNonSourceRootDirectory(entry.path)) continue
      await collectWorkspaceFileSnapshots(fileRepository, rootPath, entry.path, out)
      continue
    }
    if (!isMovScriptSourceDocumentPath(entry.path)) continue
    const file = await fileRepository.read({ path: entry.path })
    const normalizedPath = normalizeWorkspacePath(file.path)
    out.push({
      path: normalizedPath,
      relativePath: relativeWorkspacePath(rootPath, normalizedPath),
      content: file.content,
      hash: contentHash(file.content),
    })
  }
}

function diffWorkspaceFiles(
  editFiles: WorkspaceFileSnapshot[],
  currentFiles: WorkspaceFileSnapshot[],
): MovScriptWorkspaceChangedFile[] {
  const editByRelativePath = new Map(editFiles.map((file) => [file.relativePath, file]))
  const currentByRelativePath = new Map(currentFiles.map((file) => [file.relativePath, file]))
  const keys = [...new Set([...editByRelativePath.keys(), ...currentByRelativePath.keys()])].sort()
  return keys.flatMap((relativePath): MovScriptWorkspaceChangedFile[] => {
    const edit = editByRelativePath.get(relativePath)
    const current = currentByRelativePath.get(relativePath)
    if (edit && !current) {
      return [{
        path: edit.path,
        buildPath: `${MOVSCRIPT_BUILD_CURRENT_DIR}/${relativePath}`,
        state: 'added' as const,
        contentHash: edit.hash,
      }]
    }
    if (!edit && current) {
      return [{
        path: relativePath,
        buildPath: current.path,
        state: 'deleted' as const,
        buildContentHash: current.hash,
      }]
    }
    if (edit && current && edit.hash !== current.hash) {
      return [{
        path: edit.path,
        buildPath: current.path,
        state: 'modified' as const,
        contentHash: edit.hash,
        buildContentHash: current.hash,
      }]
    }
    return []
  })
}

function validateEditableFiles(files: WorkspaceFileSnapshot[]): MovScriptWorkspaceReviewIssue[] {
  const issues: MovScriptWorkspaceReviewIssue[] = []
  for (const file of files) {
    if (file.path.endsWith('.json')) {
      try {
        JSON.parse(file.content)
      } catch (error) {
        issues.push({
          path: file.path,
          severity: 'error',
          message: `invalid JSON: ${error instanceof Error ? error.message : String(error)}`,
        })
      }
    }
  }
  return issues
}

function validateSourceDomainFiles(files: WorkspaceFileSnapshot[]): MovScriptWorkspaceReviewIssue[] {
  const issues: MovScriptWorkspaceReviewIssue[] = []
  const graph = buildSourceDomainGraph(files)

  for (const entry of graph.records) {
    if (!entry.file.path.endsWith('.json')) continue
    if (!isRecord(entry.data)) continue
    const expectedKind = entry.entityKind
    const schemaKind = typeof entry.data.schema === 'string'
      ? entry.data.schema.replace(/^movscript\./, '').replace(/\.v\d+$/, '')
      : undefined
    const actualKind = typeof entry.data.kind === 'string' ? entry.data.kind : undefined
    if (!expectedKind && isRuntimeContentUnitDocument(entry.file.relativePath)) {
      continue
    }
    if (!expectedKind) {
      issues.push({
        path: entry.file.path,
        severity: 'error',
        message: 'unsupported source file path for MovScript domain entity',
      })
      continue
    }
    if (!sourcePathMatchesEntityKind(entry.file.relativePath, expectedKind)) {
      issues.push({
        path: entry.file.path,
        severity: 'error',
        message: `source path does not match required workspace hierarchy for ${expectedKind}`,
      })
    }
    const directoryId = stableDirectoryIdForSourceEntity(entry.file.relativePath, expectedKind)
    const recordId = sourceEntityStableId(entry.data, expectedKind)
    if (directoryId !== undefined && recordId !== undefined && String(recordId) !== directoryId) {
      issues.push({
        path: entry.file.path,
        severity: 'error',
        message: `id ${String(recordId)} does not match source directory id ${directoryId}`,
      })
    }
    if (!schemaKind) {
      issues.push({
        path: entry.file.path,
        severity: 'error',
        message: 'missing schema field',
      })
    } else if (schemaKind !== expectedKind) {
      issues.push({
        path: entry.file.path,
        severity: 'error',
        message: `schema kind ${schemaKind} does not match source path entity ${expectedKind}`,
      })
    } else {
      validateSemanticEntitySchema(entry.file, entry.data, issues)
    }
    if (actualKind && actualKind !== expectedKind) {
      issues.push({
        path: entry.file.path,
        severity: 'error',
        message: `kind ${actualKind} does not match source path entity ${expectedKind}`,
      })
    }
    if (sourceEntityStableId(entry.data, expectedKind) === undefined) {
      issues.push({
        path: entry.file.path,
        severity: 'error',
        message: 'missing stable id field',
      })
    }
    if (expectedKind === 'content_unit') {
      validateContentUnitRefs(entry.file, entry.data, graph, issues)
    }
    if (expectedKind === 'storyboard') {
      validateStoryboardSettingRefs(entry.file, entry.data, graph, issues)
    }
    if (expectedKind === 'audio_cue') {
      validateAudioCueRefs(entry.file, entry.data, graph, issues)
    }
    if (expectedKind === 'keyframe') {
      validateKeyframeReferenceAssetRefs(entry.file, entry.data, graph, issues)
    }
  }
  return issues
}

function buildSourceDomainGraph(files: WorkspaceFileSnapshot[]): SourceDomainGraph {
  const records = files.map((file): SourceDomainRecord => {
    const data = parseWorkspaceDocument(file.path, file.content)
    const entityKind = sourceEntityKindFromRelativePath(file.relativePath)
    const id = isRecord(data) && entityKind ? sourceEntityStableId(data, entityKind) : undefined
    return {
      file,
      data,
      entityKind,
      ...(id !== undefined ? { id } : {}),
      dir: file.relativePath.replace(/\/[^/]+$/, ''),
    }
  })
  const byId = new Map<string, SourceDomainRecord>()
  for (const record of records) {
    if (!record.entityKind) continue
    if (record.id !== undefined) {
      for (const alias of entityRefAliases(record.id, record.entityKind)) {
        byId.set(entityKey(record.entityKind, alias), record)
      }
    }
    const directoryId = stableDirectoryIdForSourceEntity(record.file.relativePath, record.entityKind)
    if (directoryId !== undefined) {
      for (const alias of entityRefAliases(directoryId, record.entityKind)) {
        byId.set(entityKey(record.entityKind, alias), record)
      }
    }
  }
  return {
    records,
    entityPaths: new Set(records.map((record) => record.dir)),
    byId,
  }
}

function sourceRecordByPathOrId(
  graph: SourceDomainGraph,
  entityKind: string,
  ref: string | number,
): SourceDomainRecord | undefined {
  const normalizedRef = typeof ref === 'string' ? normalizeWorkspacePath(ref) : String(ref)
  return graph.records.find((record) => {
    return record.entityKind === entityKind
      && (record.dir === normalizedRef || record.file.relativePath === normalizedRef || String(record.id) === String(ref))
  }) ?? entityRefAliases(ref, entityKind)
    .map((alias) => graph.byId.get(entityKey(entityKind, alias)))
    .find((record): record is SourceDomainRecord => record !== undefined)
}

function entityKey(entityKind: string, id: unknown): string {
  return `${entityKind}:${String(id ?? '')}`
}

function arrayField(value: unknown): unknown[] {
  return Array.isArray(value) ? value : []
}

function validateSemanticEntitySchema(
  file: WorkspaceFileSnapshot,
  record: Record<string, unknown>,
  issues: MovScriptWorkspaceReviewIssue[],
): void {
  const schemaId = typeof record.schema === 'string' ? record.schema : undefined
  const schema = schemaId ? getSemanticEntitySchemaEntry(schemaId) : null
  if (!schema) {
    issues.push({
      path: file.path,
      severity: 'error',
      message: `unknown semantic entity schema: ${schemaId ?? '<missing>'}`,
    })
    return
  }
  for (const message of validateJsonSchemaValue(record, schema.jsonSchema, '$')) {
    issues.push({
      path: file.path,
      severity: 'error',
      message: `schema validation failed: ${message}`,
    })
  }
}

function validateContentUnitRefs(
  file: WorkspaceFileSnapshot,
  record: Record<string, unknown>,
  graph: SourceDomainGraph,
  issues: MovScriptWorkspaceReviewIssue[],
): void {
  const contentUnitType = typeof record.content_unit_type === 'string' ? record.content_unit_type : undefined
  const outputKind = typeof record.output_kind === 'string' ? record.output_kind : undefined
  if (contentUnitType === 'asset_ref') {
    const assetRef = idField(record.asset_ref)
    if (outputKind !== 'image') {
      issues.push({
        path: file.path,
        severity: 'error',
        message: 'asset_ref content_unit output_kind must be image',
      })
    }
    if (assetRef === undefined || !sourceRecordByPathOrId(graph, 'asset', assetRef)) {
      issues.push({
        path: file.path,
        severity: 'error',
        message: `asset_ref content_unit asset_ref does not resolve: ${String(record.asset_ref ?? '<missing>')}`,
      })
    }
    return
  }
  if (contentUnitType === 'storyboard_video') {
    if (outputKind !== 'video') {
      issues.push({
        path: file.path,
        severity: 'error',
        message: 'storyboard_video content_unit output_kind must be video',
      })
    }
    const sceneMomentRef = typeof record.scene_moment_ref === 'string' ? normalizeWorkspacePath(record.scene_moment_ref) : undefined
    const storyboardRef = typeof record.storyboard_ref === 'string' ? normalizeWorkspacePath(record.storyboard_ref) : undefined
    const sceneMoment = sceneMomentRef ? sourceRecordByPathOrId(graph, 'scene_moment', sceneMomentRef) : undefined
    const storyboard = storyboardRef ? sourceRecordByPathOrId(graph, 'storyboard', storyboardRef) : undefined
    if (!sceneMomentRef || !sceneMoment) {
      issues.push({
        path: file.path,
        severity: 'error',
        message: `storyboard_video content_unit scene_moment_ref does not resolve: ${sceneMomentRef ?? '<missing>'}`,
      })
    }
    if (!storyboardRef || !storyboard) {
      issues.push({
        path: file.path,
        severity: 'error',
        message: `storyboard_video content_unit storyboard_ref does not resolve: ${storyboardRef ?? '<missing>'}`,
      })
    }
    if (sceneMoment && storyboard && !storyboard.dir.startsWith(`${sceneMoment.dir}/storyboards/`)) {
      issues.push({
        path: file.path,
        severity: 'error',
        message: `storyboard_video content_unit storyboard_ref is not under scene_moment_ref: ${storyboardRef}`,
      })
    }
    for (const [index, keyframeRef] of arrayField(record.keyframe_refs).entries()) {
      const keyframeId = idField(keyframeRef)
      if (keyframeId === undefined || !sourceRecordByPathOrId(graph, 'keyframe', keyframeId)) {
        issues.push({
          path: file.path,
          severity: 'error',
          message: `storyboard_video content_unit keyframe_refs[${index}] does not resolve: ${String(keyframeRef)}`,
        })
      }
    }
    return
  }
  if (contentUnitType !== undefined) {
    issues.push({
      path: file.path,
      severity: 'error',
      message: `unsupported content_unit_type: ${contentUnitType}`,
    })
  }
}

function validateAudioCueRefs(
  file: WorkspaceFileSnapshot,
  record: Record<string, unknown>,
  graph: SourceDomainGraph,
  issues: MovScriptWorkspaceReviewIssue[],
): void {
  const scopeRef = typeof record.scope_ref === 'string' ? normalizeWorkspacePath(record.scope_ref) : undefined
  const storyboardRef = typeof record.storyboard_ref === 'string' ? normalizeWorkspacePath(record.storyboard_ref) : undefined
  const scope = scopeRef ? sourceRecordByPathOrId(graph, 'scene_moment', scopeRef) : undefined
  const storyboard = storyboardRef ? sourceRecordByPathOrId(graph, 'storyboard', storyboardRef) : undefined
  const cueDir = file.relativePath.replace(/\/audio_cue\.json$/, '')
  const sceneMomentDir = cueDir.replace(/\/audio_cues\/[^/]+$/, '')
  if (scopeRef && !scope) {
    issues.push({
      path: file.path,
      severity: 'error',
      message: `audio_cue scope_ref does not resolve: ${scopeRef}`,
    })
  }
  if (scope && scope.dir !== sceneMomentDir) {
    issues.push({
      path: file.path,
      severity: 'error',
      message: `audio_cue scope_ref must reference the owning scene moment: ${scopeRef}`,
    })
  }
  if (storyboardRef && !storyboard) {
    issues.push({
      path: file.path,
      severity: 'error',
      message: `audio_cue storyboard_ref does not resolve: ${storyboardRef}`,
    })
  }
  if (storyboard && !storyboard.dir.startsWith(`${sceneMomentDir}/storyboards/`)) {
    issues.push({
      path: file.path,
      severity: 'error',
      message: `audio_cue storyboard_ref is not under owning scene moment: ${storyboardRef}`,
    })
  }
  const assetRefs = Array.isArray(record.asset_refs) ? record.asset_refs : []
  for (const [index, assetRef] of assetRefs.entries()) {
    const assetId = idField(assetRef)
    const asset = assetId !== undefined ? sourceRecordByPathOrId(graph, 'asset', assetId) : undefined
    if (assetId === undefined || !asset) {
      issues.push({
        path: file.path,
        severity: 'error',
        message: `audio_cue asset_refs[${index}] does not resolve: ${String(assetRef)}`,
      })
    }
  }
}

function validateStoryboardSettingRefs(
  file: WorkspaceFileSnapshot,
  record: Record<string, unknown>,
  graph: SourceDomainGraph,
  issues: MovScriptWorkspaceReviewIssue[],
): void {
  const settingRefs = Array.isArray(record.setting_refs) ? record.setting_refs.filter(isRecord) : []
  for (const [index, settingRef] of settingRefs.entries()) {
    const settingId = idField(settingRef.setting_id)
    const settingStateId = idField(settingRef.setting_state_id)
    const setting = settingId !== undefined ? sourceRecordByPathOrId(graph, 'setting', settingId) : undefined
    if (settingId !== undefined && !setting) {
      issues.push({
        path: file.path,
        severity: 'error',
        message: `storyboard setting_refs[${index}].setting_id does not resolve: ${String(settingId)}`,
      })
    }
    if (settingStateId !== undefined) {
      const settingState = sourceRecordByPathOrId(graph, 'setting_state', settingStateId)
      if (!settingState) {
        issues.push({
          path: file.path,
          severity: 'error',
          message: `storyboard setting_refs[${index}].setting_state_id does not resolve: ${String(settingStateId)}`,
        })
      } else if (setting && !settingState.dir.startsWith(`${setting.dir}/states/`)) {
        issues.push({
          path: file.path,
          severity: 'error',
          message: `storyboard setting_refs[${index}].setting_state_id does not belong to setting_id: ${String(settingStateId)}`,
        })
      }
    }
  }
}

function validateKeyframeReferenceAssetRefs(
  file: WorkspaceFileSnapshot,
  record: Record<string, unknown>,
  graph: SourceDomainGraph,
  issues: MovScriptWorkspaceReviewIssue[],
): void {
  const assetRefs = Array.isArray(record.reference_asset_refs) ? record.reference_asset_refs : []
  for (const [index, assetRef] of assetRefs.entries()) {
    const assetId = idField(assetRef)
    if (assetId === undefined) {
      issues.push({
        path: file.path,
        severity: 'error',
        message: `keyframe reference_asset_refs[${index}] must be a stable asset id or path`,
      })
      continue
    }
    if (!sourceRecordByPathOrId(graph, 'asset', assetId)) {
      issues.push({
        path: file.path,
        severity: 'error',
        message: `keyframe reference_asset_refs[${index}] does not resolve: ${String(assetId)}`,
      })
    }
  }
}

function validateJsonSchemaValue(value: unknown, schema: unknown, path: string): string[] {
  if (!isRecord(schema)) return []
  const messages: string[] = []
  if ('const' in schema && !jsonValueEquals(value, schema.const)) {
    messages.push(`${path} must be ${JSON.stringify(schema.const)}`)
  }
  if (Array.isArray(schema.enum) && !schema.enum.some((item) => jsonValueEquals(value, item))) {
    messages.push(`${path} must be one of ${schema.enum.map((item) => JSON.stringify(item)).join(', ')}`)
  }
  if (schema.type !== undefined && !jsonSchemaTypeMatches(value, schema.type)) {
    messages.push(`${path} must be ${Array.isArray(schema.type) ? schema.type.join(' or ') : String(schema.type)}`)
    return messages
  }
  if (typeof value === 'string' && typeof schema.minLength === 'number' && value.length < schema.minLength) {
    messages.push(`${path} must contain at least ${schema.minLength} character${schema.minLength === 1 ? '' : 's'}`)
  }
  if (schema.type === 'object' && isRecord(value)) {
    const properties = isRecord(schema.properties) ? schema.properties : {}
    const required = Array.isArray(schema.required) ? schema.required.filter((item): item is string => typeof item === 'string') : []
    for (const key of required) {
      if (value[key] === undefined) messages.push(`${path}.${key} is required`)
    }
    if (schema.additionalProperties === false) {
      for (const key of Object.keys(value)) {
        if (properties[key] === undefined) messages.push(`${path}.${key} is not allowed`)
      }
    }
    for (const [key, propertySchema] of Object.entries(properties)) {
      if (value[key] !== undefined) messages.push(...validateJsonSchemaValue(value[key], propertySchema, `${path}.${key}`))
    }
  }
  if (schema.type === 'array' && Array.isArray(value) && schema.items !== undefined) {
    value.forEach((item, index) => {
      messages.push(...validateJsonSchemaValue(item, schema.items, `${path}[${index}]`))
    })
  }
  return messages
}

function jsonSchemaTypeMatches(value: unknown, type: unknown): boolean {
  if (Array.isArray(type)) return type.some((item) => jsonSchemaTypeMatches(value, item))
  if (type === 'object') return isRecord(value)
  if (type === 'array') return Array.isArray(value)
  if (type === 'string') return typeof value === 'string'
  if (type === 'number') return typeof value === 'number' && Number.isFinite(value)
  if (type === 'boolean') return typeof value === 'boolean'
  if (type === 'null') return value === null
  return true
}

function jsonValueEquals(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right)
}

function changedEntitiesFromFiles(
  changedFiles: MovScriptWorkspaceChangedFile[],
  editFiles: WorkspaceFileSnapshot[],
): MovScriptWorkspaceChangedEntity[] {
  const editByPath = new Map(editFiles.map((file) => [file.path, file]))
  return changedFiles.flatMap((file) => {
    if (!file.path.endsWith('.json')) return []
    const edit = editByPath.get(file.path)
    const record = edit ? parseWorkspaceDocument(edit.path, edit.content) : undefined
    const entity = isRecord(record) ? record : {}
    const entityKind = entityKindFromFilePath(file.path, entity)
    const id = sourceEntityStableId(entity, entityKind)
    return [{
      entityKind,
      path: file.path,
      ...(id !== undefined ? { id } : {}),
      ...(typeof entity.client_id === 'string' ? { clientId: entity.client_id } : {}),
      state: file.state,
    }]
  })
}

function summarizeReview(
  changedFiles: MovScriptWorkspaceChangedFile[],
  issues: MovScriptWorkspaceReviewIssue[],
): MovScriptWorkspaceReviewResult['summary'] {
  return {
    total: changedFiles.length,
    added: changedFiles.filter((file) => file.state === 'added').length,
    modified: changedFiles.filter((file) => file.state === 'modified').length,
    deleted: changedFiles.filter((file) => file.state === 'deleted').length,
    errors: issues.filter((issue) => issue.severity === 'error').length,
    warnings: issues.filter((issue) => issue.severity === 'warning').length,
  }
}

function serializableDomainIndex(index: MovScriptWorkspaceDomainIndex): Record<string, unknown> {
  const byKind: Record<string, unknown[]> = {}
  for (const entity of index.entities) {
    byKind[entity.entityKind] = [...(byKind[entity.entityKind] ?? []), {
      path: entity.path,
      index: entity.index,
      ...(entity.id !== undefined ? { id: entity.id } : {}),
      ...(entity.clientId ? { clientId: entity.clientId } : {}),
      ...(entity.schema ? { schema: entity.schema } : {}),
    }]
  }
  return {
    schema: 'movscript.domain-index.v1',
    documents: index.documents.map((document) => ({ path: document.path })),
    entities: index.entities,
    byKind,
  }
}

function editorStateFromArtifacts(artifacts: MovScriptWorkspaceBuildArtifacts): Record<string, unknown> {
  return {
    schema: 'movscript.editor-state.v1',
    domainTree: artifacts.domainTree,
    assetIndex: artifacts.assetIndex,
    relationSummary: {
      total: artifacts.relationGraph.relations.length,
      byKind: artifacts.relationGraph.relations.reduce<Record<string, number>>((out, relation) => {
        out[relation.type] = (out[relation.type] ?? 0) + 1
        return out
      }, {}),
    },
    previewTimelines: artifacts.previewTimelines.map((timeline) => ({
      productionId: timeline.productionId,
      productionPath: timeline.productionPath,
      itemCount: timeline.items.length,
    })),
    contentUnitRuntimePanels: artifacts.contentUnitArtifacts.map((artifact) => ({
      contentUnitId: artifact.contentUnitId,
      contentUnitPath: artifact.contentUnitPath,
      contentUnitType: artifact.runtimePanel.content_unit_type,
      inputHash: artifact.inputVersion.hash,
      stale: artifact.selectionValidity.stale,
    })),
  }
}

function parseWorkspaceDocument(path: string, content: string): unknown {
  if (!path.endsWith('.json')) return content
  try {
    return JSON.parse(content) as unknown
  } catch {
    return undefined
  }
}

function entityKindFromFilePath(path: string, record: Record<string, unknown>): string {
  const schema = typeof record.schema === 'string' ? record.schema : undefined
  if (schema) return schema.replace(/^movscript\./, '').replace(/\.v\d+$/, '')
  const fileName = path.split('/').pop() ?? path
  const prefix = /^([a-z_]+)_/.exec(fileName)?.[1]
  return prefix ?? fileName.replace(/\.[^.]+$/, '')
}

function relativeWorkspacePath(rootPath: string, path: string): string {
  const root = normalizeWorkspacePath(rootPath)
  const normalized = normalizeWorkspacePath(path)
  if (!root) return normalized
  return normalized === root ? '' : normalized.replace(new RegExp(`^${escapeRegExp(root)}/?`), '')
}

function isMovScriptSourceRelativePath(path: string): boolean {
  return isMovScriptSourcePath(path)
}

function sourceEntityKindFromRelativePath(path: string): string | undefined {
  const normalized = normalizeWorkspacePath(path)
  const fileName = normalized.split('/').pop()
  if (fileName === 'project.json') return 'project'
  if (fileName === 'project_standards.json') return 'project_standards'
  if (fileName === 'setting.json') return 'setting'
  if (fileName === 'setting_state.json') return 'setting_state'
  if (fileName === 'asset.json') return 'asset'
  if (fileName === 'script.json') return 'script'
  if (fileName === 'script_version.json') return 'script_version'
  if (fileName === 'script_block.json') return 'script_block'
  if (fileName === 'content_unit.json') return 'content_unit'
  if (fileName === 'keyframe.json') return 'keyframe'
  if (fileName === 'production.json') return 'production'
  if (fileName === 'segment.json') return 'segment'
  if (fileName === 'scene_moment.json') return 'scene_moment'
  if (fileName === 'storyboard.json') return 'storyboard'
  if (fileName === 'audio_cue.json') return 'audio_cue'
  if (fileName === 'expression_unit.json') return 'expression_unit'
  return undefined
}

function isRuntimeContentUnitDocument(path: string): boolean {
  const normalized = normalizeWorkspacePath(path)
  return /^content_units\/[^/]+\/selection\.json$/.test(normalized)
    || /^content_units\/[^/]+\/candidates\/[^/]+\/content_candidate\.json$/.test(normalized)
}

function sourcePathMatchesEntityKind(path: string, entityKind: string): boolean {
  const normalized = normalizeWorkspacePath(path)
  const patterns: Record<string, RegExp> = {
    project: /^project\.json$/,
    project_standards: /^(project_standards\.json|project_standards\/project_standards\.json)$/,
    setting: /^settings\/[^/]+\/setting\.json$/,
    setting_state: /^settings\/[^/]+\/states\/[^/]+\/setting_state\.json$/,
    asset: /^settings\/[^/]+\/(assets\/[^/]+\/asset\.json|states\/[^/]+\/assets\/[^/]+\/asset\.json)$/,
    script: /^scripts\/[^/]+\/script\.json$/,
    script_version: /^scripts\/[^/]+\/versions\/[^/]+\/script_version\.json$/,
    script_block: /^scripts\/[^/]+\/versions\/[^/]+\/blocks\/[^/]+\/script_block\.json$/,
    content_unit: /^content_units\/[^/]+\/content_unit\.json$/,
    keyframe: /^(content_units\/[^/]+\/keyframes\/[^/]+\/keyframe\.json|productions\/[^/]+\/segments\/[^/]+\/scene_moments\/[^/]+\/keyframes\/[^/]+\/keyframe\.json)$/,
    production: /^productions\/[^/]+\/production\.json$/,
    segment: /^productions\/[^/]+\/segments\/[^/]+\/segment\.json$/,
    scene_moment: /^productions\/[^/]+\/segments\/[^/]+\/scene_moments\/[^/]+\/scene_moment\.json$/,
    storyboard: /^productions\/[^/]+\/segments\/[^/]+\/scene_moments\/[^/]+\/storyboards\/[^/]+\/storyboard\.json$/,
    audio_cue: /^productions\/[^/]+\/segments\/[^/]+\/scene_moments\/[^/]+\/audio_cues\/[^/]+\/audio_cue\.json$/,
    expression_unit: /^productions\/[^/]+\/segments\/[^/]+\/scene_moments\/[^/]+\/expression_units\/[^/]+\/expression_unit\.json$/,
  }
  return patterns[entityKind]?.test(normalized) ?? false
}

function stableDirectoryIdForSourceEntity(path: string, entityKind: string): string | undefined {
  const parts = normalizeWorkspacePath(path).split('/')
  if (entityKind === 'project' || entityKind === 'project_standards') return undefined
  if (entityKind === 'setting') return parts[1]
  if (entityKind === 'setting_state') return parts[3]
  if (entityKind === 'asset') return parts[2] === 'assets' ? parts[3] : parts[5]
  if (entityKind === 'script') return parts[1]
  if (entityKind === 'script_version') return parts[3]
  if (entityKind === 'script_block') return parts[5]
  if (entityKind === 'content_unit') return parts[1]
  if (entityKind === 'keyframe') return parts[0] === 'content_units' ? parts[3] : parts[7]
  if (entityKind === 'production') return parts[1]
  if (entityKind === 'segment') return parts[3]
  if (entityKind === 'scene_moment') return parts[5]
  if (entityKind === 'storyboard') return parts[7]
  if (entityKind === 'audio_cue') return parts[7]
  if (entityKind === 'expression_unit') return parts[7]
  return undefined
}

function contentHash(content: string): string {
  return createHash('sha256').update(content).digest('hex')
}

function buildIdFor(date: Date): string {
  return `build_${date.toISOString().replace(/[^0-9]/g, '')}`
}

function idField(value: unknown): string | number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim()) return value.trim()
  return undefined
}

function sourceEntityStableId(record: Record<string, unknown>, entityKind: string): string | number | undefined {
  if (entityKind === 'project') return idField(record.project_id ?? record.ID ?? record.id)
  return idField(record.id ?? record.ID)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
