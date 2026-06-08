import {
  createNodeMovScriptWorkspaceFileRepository,
  createNodeMovScriptWorkspaceService,
  type NodeMovScriptWorkspaceService,
  type NodeMovScriptWorkspaceServiceInput,
} from '@movscript/workspace/node'
import {
  buildMovScriptWorkspace,
  reviewMovScriptBuildWorkspace,
} from '@movscript/compiler/node'
import {
  buildMovScriptWorkspaceBuildArtifacts,
  compileContentGenerationPromptBundle,
  prepareContentProductionContext,
} from '@movscript/compiler/artifacts'
import {
  createMovScriptEngine,
  type MovScriptEngine,
  type MovScriptEngineOptions,
} from './index.js'

export interface NodeMovScriptEngineInput extends NodeMovScriptWorkspaceServiceInput {
  generate?: MovScriptEngineOptions['generate']
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
    reviewWorkspace: () => reviewMovScriptBuildWorkspace({
      fileRepository,
      ...(input.now ? { now: input.now() } : {}),
    }),
    compileWorkspace: () => buildMovScriptWorkspace({
      fileRepository,
      ...(input.now ? { now: input.now() } : {}),
    }),
    async compileContentGenerationPrompt(contentUnitId) {
      const index = await workspaceService.loadIndex()
      return compileContentGenerationPromptBundle(prepareContentProductionContext(index, contentUnitId))
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
    ...(input.generate ? { generate: input.generate } : {}),
    ...(input.publish ? { publish: input.publish } : {}),
  })
  return {
    ...engine,
    projectDir: workspaceService.projectDir,
    workspaceService,
  }
}
