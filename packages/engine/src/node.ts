import {
  createNodeMovScriptWorkspaceFileRepository,
  createNodeMovScriptWorkspaceService,
  type NodeMovScriptWorkspaceService,
  type NodeMovScriptWorkspaceServiceInput,
} from '@movscript/workspace/node'
import {
  buildMovScriptWorkspace,
  inspectMovScriptWorkspace,
  overviewMovScriptWorkspace,
  planMovScriptWorkspaceRegeneration,
  reviewMovScriptBuildWorkspace,
} from '@movscript/compiler/node'
import {
  buildContentUnitArtifact,
  buildMovScriptWorkspaceBuildArtifacts,
} from '@movscript/compiler/artifacts'
import {
  createMovScriptEngine,
  type MovScriptEngine,
  type MovScriptEngineOptions,
} from './index.js'

export interface NodeMovScriptEngineInput extends NodeMovScriptWorkspaceServiceInput {
  publish?: MovScriptEngineOptions['publish']
}

export type NodeMovScriptEngine = MovScriptEngine & {
  readonly projectDir: string
  readonly workspaceService: NodeMovScriptWorkspaceService
}

export function createNodeMovScriptEngine(input: NodeMovScriptEngineInput = {}): NodeMovScriptEngine {
  const workspaceService = createNodeMovScriptWorkspaceService(input)
  const fileRepository = createNodeMovScriptWorkspaceFileRepository(workspaceService.projectDir)
  const engine = createMovScriptEngine({
    workspaceService,
    overviewWorkspace: () => overviewMovScriptWorkspace({
      fileRepository,
      ...(input.now ? { now: input.now() } : {}),
    }),
    inspectWorkspace: () => inspectMovScriptWorkspace({
      fileRepository,
      ...(input.now ? { now: input.now() } : {}),
    }),
    reviewWorkspace: () => reviewMovScriptBuildWorkspace({
      fileRepository,
      ...(input.now ? { now: input.now() } : {}),
    }),
    compileWorkspace: () => buildMovScriptWorkspace({
      fileRepository,
      ...(input.now ? { now: input.now() } : {}),
    }),
    regenerationPlan: () => planMovScriptWorkspaceRegeneration({
      fileRepository,
      ...(input.now ? { now: input.now() } : {}),
    }),
    async buildContentUnitArtifact(contentUnitId) {
      const index = await workspaceService.loadIndex()
      const contentUnit = index.byKind.get('content_unit')?.find((entity) => String(entity.id) === String(contentUnitId))
      if (!contentUnit) throw new Error(`content_unit not found: ${String(contentUnitId)}`)
      const now = input.now?.() ?? new Date()
      return buildContentUnitArtifact(index, contentUnit, { createdAt: now.toISOString() })
    },
    async buildArtifacts(artifactInput = {}) {
      const now = input.now?.() ?? new Date()
      const createdAt = artifactInput.createdAt ?? now.toISOString()
      const buildId = artifactInput.buildId ?? `engine_${createdAt.replace(/[-:.TZ]/g, '')}`
      return buildMovScriptWorkspaceBuildArtifacts({
        index: await workspaceService.loadIndex(),
        changedEntities: [],
        buildId,
        createdAt,
      })
    },
    ...(input.publish ? { publish: input.publish } : {}),
  })
  return {
    ...engine,
    projectDir: workspaceService.projectDir,
    workspaceService,
  }
}
