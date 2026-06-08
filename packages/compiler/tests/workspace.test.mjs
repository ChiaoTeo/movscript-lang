import assert from 'node:assert/strict'
import { mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'

import {
  appendMovScriptInlineCandidate,
  buildMovScriptWorkspaceDomainIndex,
  createMovScriptWorkspaceService,
  createMovScriptWorkspaceDomainRepository,
  getMovScriptWorkspaceModel,
  lockMovScriptInlineCandidate,
  queryMovScriptCanonicalEntities,
  queryMovScriptWorkspaceAssets,
  queryMovScriptWorkspaceProductionContext,
  queryMovScriptWorkspaceSettings,
  selectMovScriptInlineCandidate,
  unlockMovScriptInlineCandidate,
  updateMovScriptContentUnitEditablePrompt,
} from '../../workspace/dist/index.js'
import {
  buildMovScriptWorkspaceBuildArtifacts,
  compileContentGenerationPromptBundle,
  prepareContentProductionContext,
} from '../dist/index.js'
import {
  buildMovScriptWorkspace,
  reviewMovScriptBuildWorkspace,
} from '../dist/node.js'
import {
  createNodeMovScriptWorkspaceFileRepository,
  createNodeMovScriptWorkspaceService,
  resolveMovScriptProjectWorkspacePaths,
} from '../../workspace/dist/node.js'
import {
  getSemanticEntitySchemaEntry,
} from '../../language/dist/domain/index.js'

test('workspace domain indexes hierarchical source entities', () => {
  const index = buildMovScriptWorkspaceDomainIndex(sourceDocuments())

  assert.equal(queryMovScriptWorkspaceSettings(index, { kind: 'character' }).length, 1)
  assert.equal(index.byKind.get('asset')?.length, 1)
  assert.equal(index.byKind.get('storyboard')?.length, 1)
  assert.equal(index.byKind.get('content_unit')?.length, 1)
  assert.equal(index.byKind.get('writing_expression')?.length, 1)
  assert.equal(index.byKind.get('script')?.[0]?.path, 'scripts/main/script.json')
  assert.equal(index.documents.some((document) => document.path === 'scripts/main/script.md'), true)
  assert.equal(queryMovScriptCanonicalEntities(index).some((entity) => entity.path === 'scripts/main/script.md'), false)

  const assets = queryMovScriptWorkspaceAssets(index, {
    settingId: 'hero',
    settingStateId: 'rain',
    includeCandidates: true,
  })
  assert.equal(assets.assets.length, 1)
  assert.equal(assets.candidates?.length, 0)

  const context = queryMovScriptWorkspaceProductionContext(index, {
    productionId: 'p8f3',
    segmentId: 'a19d',
    sceneMomentId: 'r72k',
  })
  assert.equal(context.productions.length, 1)
  assert.equal(context.segments.length, 1)
  assert.equal(context.scene_moments.length, 1)
  assert.equal(context.storyboards.length, 1)
  assert.equal(context.writing_expressions.length, 1)
  assert.equal(context.content_units.length, 1)
})

test('compiler build artifacts are derived from canonical source only', () => {
  const index = buildMovScriptWorkspaceDomainIndex(sourceDocuments())
  const artifacts = buildMovScriptWorkspaceBuildArtifacts({
    index,
    changedEntities: [{
      entityKind: 'content_unit',
      id: 'k41m',
      path: 'content_units/k41m/content_unit.json',
      state: 'modified',
    }],
    buildId: 'build_test',
    createdAt: '2026-06-07T00:00:00.000Z',
  })

  assert.equal(artifacts.domainTree.schema, 'movscript.domain-tree.v1')
  assert.equal(artifacts.assetIndex.schema, 'movscript.asset-index.v1')
  assert.equal(artifacts.relationGraph.schema, 'movscript.relation-graph.v1')
  assert.ok(artifacts.assetIndex.assets.some((asset) => asset.id === 'wet_hair' && asset.owner.id === 'rain'))
  assert.ok(artifacts.relationGraph.relations.some((relation) => relation.type === 'references' && relation.from.id === 'k41m' && relation.to.id === 'r72k'))
  assert.ok(artifacts.relationGraph.relations.some((relation) => relation.type === 'references' && relation.from.id === 'k41m' && relation.to.id === 'main'))
  assert.ok(artifacts.relationGraph.relations.some((relation) => relation.type === 'uses' && relation.from.id === 'c83x' && relation.to.id === 'wet_hair'))
  assert.ok(artifacts.previewTimelines[0].items.some((item) => item.itemType === 'scene_moment' && item.audio.note === 'Rain low, phone vibration sharp.' && item.transition.out === 'hold_then_cut'))
  assert.ok(artifacts.previewTimelines[0].items.some((item) => item.itemType === 'storyboard' && item.entity.id === 'main' && item.contentUnitIds.includes('k41m')))
  assert.ok(artifacts.impactReport.changedEntities[0].editorImpacts.some((impact) => impact.includes('Content production context')))
})

test('compiler impact report traces planning and asset changes to affected content units', () => {
  const index = buildMovScriptWorkspaceDomainIndex(sourceDocuments())
  const artifacts = buildMovScriptWorkspaceBuildArtifacts({
    index,
    changedEntities: [
      {
        entityKind: 'storyboard',
        id: 'main',
        path: 'productions/p8f3/segments/a19d/scene_moments/r72k/storyboards/main/storyboard.json',
        state: 'modified',
      },
      {
        entityKind: 'asset',
        id: 'wet_hair',
        path: 'settings/hero/states/rain/assets/wet_hair/asset.json',
        state: 'modified',
      },
      {
        entityKind: 'keyframe',
        id: 'c83x',
        path: 'content_units/k41m/keyframes/c83x/keyframe.json',
        state: 'modified',
      },
    ],
    buildId: 'build_test',
    createdAt: '2026-06-07T00:00:00.000Z',
  })

  const storyboardChange = artifacts.impactReport.changedEntities.find((entity) => entity.entityKind === 'storyboard')
  const assetChange = artifacts.impactReport.changedEntities.find((entity) => entity.entityKind === 'asset')
  const keyframeChange = artifacts.impactReport.changedEntities.find((entity) => entity.entityKind === 'keyframe')

  assert.ok(storyboardChange?.affectedContentUnits.some((entity) => entity.id === 'k41m'))
  assert.ok(storyboardChange?.staleMarkers.includes('content_unit:k41m:planning_context_changed'))
  assert.ok(assetChange?.affectedContentUnits.some((entity) => entity.id === 'k41m'))
  assert.ok(assetChange?.staleMarkers.includes('content_unit:k41m:setting_context_changed'))
  assert.ok(keyframeChange?.affectedContentUnits.some((entity) => entity.id === 'k41m'))
  assert.ok(keyframeChange?.staleMarkers.includes('content_unit:k41m:visual_anchor_changed'))
})

test('content production context compiles prompt bundle from editable prompt plus planning refs', () => {
  const index = buildMovScriptWorkspaceDomainIndex(sourceDocuments())

  const context = prepareContentProductionContext(index, 'k41m')
  const bundle = compileContentGenerationPromptBundle(context)

  assert.equal(bundle.prompt, 'Cold phone light on frightened face.')
  assert.equal(bundle.negativePrompt, 'cartoon')
  assert.equal(bundle.context.sceneMoment?.id, 'r72k')
  assert.equal(bundle.context.storyboard?.id, 'main')
  assert.equal(bundle.context.shotPlans.length, 1)
  assert.equal(bundle.context.writingExpressions.length, 1)
  assert.equal(bundle.context.projectStandards?.id, 'project_standards')
  assert.equal(bundle.context.sceneKeyframes.length, 1)
  assert.equal(bundle.context.sceneKeyframes[0].id, 'scene_anchor')
  assert.equal(bundle.context.contentUnitKeyframes.length, 1)
  assert.equal(bundle.context.contentUnitKeyframes[0].id, 'c83x')
  assert.equal(bundle.references.assets.length, 1)
  assert.equal(bundle.references.sceneKeyframes.length, 1)
  assert.equal(bundle.references.contentUnitKeyframes.length, 1)
  assert.equal(bundle.references.contentUnitResult?.resourceId, 'resource_video_1')
})

test('workspace inline candidate writer updates asset json candidates and locks explicitly', async () => {
  const files = new Map([
    ['settings/hero/assets/portrait/asset.json', JSON.stringify({
      schema: 'movscript.asset.v1',
      kind: 'asset',
      id: 'portrait',
      slot: 'character_base_portrait',
    })],
  ])
  const repository = memoryWorkspaceFileRepository(files)

  const result = await appendMovScriptInlineCandidate({
    fileRepository: repository,
    targetPath: 'settings/hero/assets/portrait/asset.json',
    targetKind: 'asset',
    nonce: 'fixed',
    payload: {
      resource_id: 'resource_99',
      source: 'uploaded',
      status: 'accepted',
      notes: 'Uploaded portrait',
    },
  })

  assert.equal(result.path, 'settings/hero/assets/portrait/asset.json')
  assert.equal(result.candidate.id, 'candidate_resource_99_fixed')
  assert.equal(result.record.candidates.length, 1)
  assert.equal(result.record.lock, undefined)

  const locked = await lockMovScriptInlineCandidate({
    fileRepository: repository,
    targetPath: 'settings/hero/assets/portrait/asset.json',
    targetKind: 'asset',
    candidateId: 'candidate_resource_99_fixed',
    reason: 'confirmed_by_user',
  })

  assert.deepEqual(locked.record.lock, {
    candidate_id: 'candidate_resource_99_fixed',
    resource_id: 'resource_99',
    reason: 'confirmed_by_user',
  })
  const saved = JSON.parse(files.get(result.path))
  assert.equal(saved.candidates[0].resource_id, 'resource_99')
  assert.equal(saved.lock.candidate_id, 'candidate_resource_99_fixed')
})

test('workspace inline candidate writer locks existing keyframe candidate', async () => {
  const files = new Map([
    ['content_units/k41m/keyframes/c83x/keyframe.json', JSON.stringify({
      schema: 'movscript.keyframe.v1',
      kind: 'keyframe',
      id: 'c83x',
    })],
  ])
  const repository = memoryWorkspaceFileRepository(files)

  await appendMovScriptInlineCandidate({
    fileRepository: repository,
    targetPath: 'content_units/k41m/keyframes/c83x/keyframe.json',
    targetKind: 'keyframe',
    nonce: 'fixed',
    payload: {
      resource_id: 'resource_keyframe_1',
      source: 'generated',
      status: 'draft',
    },
  })
  const locked = await lockMovScriptInlineCandidate({
    fileRepository: repository,
    targetPath: 'content_units/k41m/keyframes/c83x/keyframe.json',
    targetKind: 'keyframe',
    candidateId: 'candidate_resource_keyframe_1_fixed',
    reason: 'selected_for_generation_reference',
  })

  assert.deepEqual(locked.record.lock, {
    candidate_id: 'candidate_resource_keyframe_1_fixed',
    resource_id: 'resource_keyframe_1',
    reason: 'selected_for_generation_reference',
  })
  const saved = JSON.parse(files.get(locked.path))
  assert.equal(saved.candidates.length, 1)
  assert.equal(saved.lock.resource_id, 'resource_keyframe_1')
})

test('workspace inline candidate writer selects and unlocks content unit candidates', async () => {
  const files = new Map([
    ['content_units/k41m/content_unit.json', JSON.stringify({
      schema: 'movscript.content_unit.v1',
      kind: 'content_unit',
      id: 'k41m',
      unit_kind: 'shot',
      title: 'Phone close-up',
      source_context: {
        scene_moment_ref: 'productions/p8f3/segments/a19d/scene_moments/r72k',
        storyboard_ref: 'productions/p8f3/segments/a19d/scene_moments/r72k/storyboards/main',
      },
      candidates: [
        { id: 'candidate_video_1', resource_id: 'resource_video_1' },
        { id: 'candidate_video_2', resource_id: 'resource_video_2' },
      ],
      lock: { candidate_id: 'candidate_video_1', resource_id: 'resource_video_1' },
    })],
  ])
  const repository = memoryWorkspaceFileRepository(files)

  const selected = await selectMovScriptInlineCandidate({
    fileRepository: repository,
    targetPath: 'content_units/k41m/content_unit.json',
    targetKind: 'content_unit',
    candidateId: 'candidate_video_2',
    reason: 'approved_by_director',
  })

  assert.deepEqual(selected.record.lock, {
    candidate_id: 'candidate_video_2',
    resource_id: 'resource_video_2',
    reason: 'approved_by_director',
  })

  const unlocked = await unlockMovScriptInlineCandidate({
    fileRepository: repository,
    targetPath: 'content_units/k41m/content_unit.json',
    targetKind: 'content_unit',
  })
  const saved = JSON.parse(files.get(unlocked.path))
  assert.equal(saved.lock, undefined)
  assert.equal(saved.candidates.length, 2)
})

test('workspace content unit prompt updater only changes editable prompt', async () => {
  const files = new Map([
    ['content_units/k41m/content_unit.json', JSON.stringify({
      schema: 'movscript.content_unit.v1',
      kind: 'content_unit',
      id: 'k41m',
      unit_kind: 'shot',
      title: 'Phone close-up',
      source_context: {
        scene_moment_ref: 'productions/p8f3/segments/a19d/scene_moments/r72k',
        storyboard_ref: 'productions/p8f3/segments/a19d/scene_moments/r72k/storyboards/main',
      },
      editable_prompt: {
        prompt: 'Old prompt',
      },
      candidates: [{ id: 'candidate_video_1', resource_id: 'resource_video_1' }],
      lock: { candidate_id: 'candidate_video_1', resource_id: 'resource_video_1' },
    })],
  ])
  const repository = memoryWorkspaceFileRepository(files)

  const result = await updateMovScriptContentUnitEditablePrompt({
    fileRepository: repository,
    targetPath: 'content_units/k41m/content_unit.json',
    editablePrompt: {
      prompt: 'New prompt',
      negative_prompt: 'distorted hands',
      notes: 'Keep camera movement restrained.',
    },
  })

  assert.deepEqual(result.record.editable_prompt, {
    prompt: 'New prompt',
    negative_prompt: 'distorted hands',
    notes: 'Keep camera movement restrained.',
  })
  assert.deepEqual(result.record.source_context, {
    scene_moment_ref: 'productions/p8f3/segments/a19d/scene_moments/r72k',
    storyboard_ref: 'productions/p8f3/segments/a19d/scene_moments/r72k/storyboards/main',
  })
  assert.equal(result.record.candidates.length, 1)
  assert.deepEqual(result.record.lock, { candidate_id: 'candidate_video_1', resource_id: 'resource_video_1' })
  const saved = JSON.parse(files.get(result.path))
  assert.equal(saved.editable_prompt.prompt, 'New prompt')
})

test('workspace service facade exposes frontend-oriented domain operations', async () => {
  const files = new Map(sourceFileEntries())
  const service = createMovScriptWorkspaceService({
    fileRepository: memoryWorkspaceFileRepository(files),
    now: () => new Date('2026-06-07T00:00:00.000Z'),
  })

  const model = service.getModel({ entityKind: 'content_unit', entityId: 'k41m' })
  assert.equal(model.workspaceKind, 'content_unit_workspace')

  const productionContext = await service.queryProductionContext({
    productionId: 'p8f3',
    sceneMomentId: 'r72k',
  })
  assert.equal(productionContext.storyboards.length, 1)
  assert.equal(productionContext.content_units.length, 1)

  await service.updateContentUnitEditablePrompt({
    targetPath: 'content_units/k41m/content_unit.json',
    editablePrompt: {
      prompt: 'Service prompt',
      negative_prompt: 'flat lighting',
    },
  })
  await service.updateSceneMomentStoryboardTiming({
    targetPath: 'productions/p8f3/segments/a19d/scene_moments/r72k/scene_moment.json',
    activeStoryboardId: 'main',
    items: [{
      storyboard_id: 'main',
      order: 1,
      gap_after_sec: 0.4,
      caption: 'Phone glow returns.',
    }],
    audio: { note: 'Rain fades under phone vibration.' },
    transition: { out: 'hard_cut' },
  })
  await service.updateStoryboardShotPlans({
    targetPath: 'productions/p8f3/segments/a19d/scene_moments/r72k/storyboards/main/storyboard.json',
    shotPlans: [{
      id: 'shot_plan_1',
      order: 1,
      shot_size: 'close_up',
      camera: { movement: 'slow_push_in', lens_mm: 50 },
      blocking: { subject: 'hero at window edge' },
      lighting: { key: 'phone screen blue light' },
      performance: [{ setting_id: 'hero', expression: 'controlled panic' }],
      reference_image_refs: ['wet_hair'],
    }],
  })
  await service.appendCandidate({
    targetPath: 'content_units/k41m/content_unit.json',
    targetKind: 'content_unit',
    nonce: 'fixed',
    payload: {
      id: 'candidate_video_1',
      resource_id: 'resource_video_1',
      source: 'generated',
    },
  })
  await service.selectCandidate({
    targetPath: 'content_units/k41m/content_unit.json',
    targetKind: 'content_unit',
    candidateId: 'candidate_video_1',
    reason: 'selected_from_frontend',
  })
  const prompt = compileContentGenerationPromptBundle(
    prepareContentProductionContext(await service.loadIndex(), 'k41m'),
  )
  assert.equal(prompt.prompt, 'Service prompt')
  assert.equal(prompt.negativePrompt, 'flat lighting')
  assert.equal(prompt.context.shotPlans[0].camera.lens_mm, 50)
  assert.equal(prompt.context.shotPlans[0].lighting.key, 'phone screen blue light')
  assert.equal(prompt.references.contentUnitResult?.resourceId, 'resource_video_1')

  await service.unlockCandidate({
    targetPath: 'content_units/k41m/content_unit.json',
    targetKind: 'content_unit',
  })
  const unlockedPrompt = compileContentGenerationPromptBundle(
    prepareContentProductionContext(await service.loadIndex(), 'k41m'),
  )
  assert.equal(unlockedPrompt.references.contentUnitResult, undefined)

  const artifacts = buildMovScriptWorkspaceBuildArtifacts({
    index: await service.loadIndex(),
    changedEntities: [],
    buildId: 'service_build',
    createdAt: '2026-06-07T00:00:00.000Z',
  })
  assert.equal(artifacts.contentGenerationPrompts[0].prompt, 'Service prompt')
  assert.ok(artifacts.previewTimelines[0].items.some((item) => item.itemType === 'scene_moment' && item.audio.note === 'Rain fades under phone vibration.' && item.transition.out === 'hard_cut'))
  assert.ok(artifacts.previewTimelines[0].items.some((item) => item.itemType === 'storyboard' && item.caption === 'Phone glow returns.' && item.gapAfterSec === 0.4))
})

test('workspace service snapshots script markdown into explicit version and blocks', async () => {
  const files = new Map([
    ['scripts/main/script.json', JSON.stringify({
      schema: 'movscript.script.v1',
      kind: 'script',
      id: 'main',
      title: 'Main Script',
      source_ref: 'script.md',
    })],
    ['scripts/main/script.md', [
      'INT. APARTMENT - NIGHT',
      'Rain hits the window.',
      '',
      'MIA',
      'Who is calling me?',
      '',
      '(phone vibrates)',
    ].join('\n')],
  ])
  const service = createMovScriptWorkspaceService({
    fileRepository: memoryWorkspaceFileRepository(files),
    now: () => new Date('2026-06-07T00:00:00.000Z'),
  })

  const snapshot = await service.snapshotScriptVersionFromMarkdown({
    scriptId: 'main',
    versionId: 'v1',
    versionLabel: 'V1',
    now: new Date('2026-06-07T00:00:00.000Z'),
  })

  assert.equal(snapshot.versionPath, 'scripts/main/versions/v1/script_version.json')
  assert.equal(snapshot.blockCount, 3)
  const version = JSON.parse(files.get(snapshot.versionPath))
  const firstBlock = JSON.parse(files.get(snapshot.blockPaths[0]))
  const secondBlock = JSON.parse(files.get(snapshot.blockPaths[1]))
  assert.equal(version.kind, 'script_version')
  assert.equal(version.source_ref, 'script.md')
  assert.equal(version.block_count, 3)
  assert.equal(firstBlock.kind, 'script_block')
  assert.equal(firstBlock.block_kind, 'scene_heading')
  assert.equal(firstBlock.text, 'INT. APARTMENT - NIGHT\nRain hits the window.')
  assert.equal(secondBlock.block_kind, 'character')

  const index = await service.loadIndex()
  assert.equal(index.byKind.get('script_version')?.length, 1)
  assert.equal(index.byKind.get('script_block')?.length, 3)
})

test('node workspace service composes with compiler review and build for adapters', async () => {
  const rootDir = join(tmpdir(), `movscript-node-workspace-service-${Date.now()}-${Math.random().toString(36).slice(2)}`)
  const paths = resolveMovScriptProjectWorkspacePaths({ workspaceDir: rootDir, userId: 1, projectId: 6 })
  try {
    for (const [path, content] of sourceFileEntries()) {
      const targetPath = join(paths.projectDir, path)
      await mkdir(targetPath.replace(/\/[^/]+$/, ''), { recursive: true })
      await writeFile(targetPath, content, 'utf8')
    }

    const service = createNodeMovScriptWorkspaceService({
      projectDir: paths.projectDir,
      now: () => new Date('2026-06-07T00:00:00.000Z'),
    })
    assert.equal(service.projectDir, paths.projectDir)
    const fileRepository = createNodeMovScriptWorkspaceFileRepository(paths.projectDir)

    const review = await reviewMovScriptBuildWorkspace({
      fileRepository,
      now: new Date('2026-06-07T00:00:00.000Z'),
    })
    assert.equal(review.readyToBuild, true)

    await service.updateContentUnitEditablePrompt({
      targetPath: 'content_units/k41m/content_unit.json',
      editablePrompt: { prompt: 'Node service prompt' },
    })
    const prompt = compileContentGenerationPromptBundle(
      prepareContentProductionContext(await service.loadIndex(), 'k41m'),
    )
    assert.equal(prompt.prompt, 'Node service prompt')

    const build = await buildMovScriptWorkspace({
      fileRepository,
      now: new Date('2026-06-07T00:00:00.000Z'),
    })
    assert.equal(build.status, 'built')
    assert.equal(build.manifest?.output.editorStatePath, '.build/current/editor-state.json')
    const editorState = await service.readEditorState()
    const previewTimeline = await service.readPreviewTimeline('p8f3')
    const generationPrompt = await service.readContentGenerationPrompt('k41m')
    assert.equal(editorState?.schema, 'movscript.editor-state.v1')
    assert.equal(previewTimeline?.schema, 'movscript.preview_timeline.v1')
    assert.equal(generationPrompt?.schema, 'movscript.compiled_generation_prompt.v1')
    assert.equal(generationPrompt?.prompt, 'Node service prompt')
  } finally {
    await rm(rootDir, { recursive: true, force: true })
  }
})

test('initialized project source uses project_id and can compile immediately', async () => {
  const files = new Map()
  const repository = memoryWorkspaceFileRepository(files)
  const service = createMovScriptWorkspaceService({
    fileRepository: repository,
    now: () => new Date('2026-06-07T00:00:00.000Z'),
  })

  const initialized = await service.initializeProject({
    projectId: 'smoke',
    title: 'Smoke',
  })
  const project = JSON.parse(files.get('project.json'))

  assert.equal(initialized.projectId, 'smoke')
  assert.equal(project.project_id, 'smoke')
  assert.equal(project.title, 'Smoke')
  assert.equal(project.project_name, undefined)

  const review = await reviewMovScriptBuildWorkspace({
    fileRepository: repository,
    now: new Date('2026-06-07T00:00:00.000Z'),
  })
  assert.equal(review.readyToBuild, true)

  const build = await buildMovScriptWorkspace({
    fileRepository: repository,
    now: new Date('2026-06-07T00:00:00.000Z'),
  })
  assert.equal(build.status, 'built')
  assert.equal(files.has('.build/current/project.json'), true)
  assert.equal(files.has('.build/current/project_standards.json'), true)
})

test('workspace domain repository loads source files through a repository boundary', async () => {
  const files = new Map([
    ['project.json', JSON.stringify({ schema: 'movscript.project.v1', kind: 'project', project_id: 'project_demo', title: 'Demo' })],
    ['workspace.json', JSON.stringify({ schema: 'movscript.workspace.v1', id: 'workspace_demo' })],
    ['settings/1/setting.json', JSON.stringify({ schema: 'movscript.setting.v1', kind: 'setting', id: '1', title: 'Mia', setting_kind: 'character' })],
    ['settings/1/setting.meta.json', JSON.stringify({ state: { dirty: false } })],
    ['scripts/main/script.json', JSON.stringify({ schema: 'movscript.script.v1', kind: 'script', id: 'main', title: 'Main Script', source_ref: 'script.md' })],
    ['scripts/main/script.md', '# Script\n'],
    ['.build/current/settings/built/setting.json', JSON.stringify({ schema: 'movscript.setting.v1', kind: 'setting', id: 'built', title: 'Built' })],
    ['references/2.json', JSON.stringify({ schema: 'movscript.setting.v1', kind: 'setting', id: '2', title: 'Old loose reference' })],
  ])
  const repository = createMovScriptWorkspaceDomainRepository({
    fileRepository: memoryWorkspaceFileRepository(files),
  })

  const index = await repository.loadIndex()

  assert.equal(queryMovScriptWorkspaceSettings(index, { query: 'mia' }).length, 1)
  assert.equal(index.byKind.get('script')?.[0]?.record.source_ref, 'script.md')
  assert.equal(index.documents.some((document) => document.path === 'scripts/main/script.md'), true)
  assert.equal(index.entities.some((entity) => entity.path === 'scripts/main/script.md'), false)
  assert.equal(index.entities.some((entity) => entity.path.endsWith('.meta.json')), false)
  assert.equal(index.entities.some((entity) => entity.path.startsWith('.build/')), false)
  assert.equal(index.entities.some((entity) => entity.path.startsWith('references/')), false)
  assert.equal(index.entities.some((entity) => entity.path === 'workspace.json'), false)
})

test('workspace domain model resolves entity editing model with semantic schemas only', () => {
  const model = getMovScriptWorkspaceModel({ entityKind: 'project_standards' })
  const schemaId = model.schemaIds[0]
  const schema = getSemanticEntitySchemaEntry(schemaId)

  assert.equal(model.workspaceKind, 'project_standards_workspace')
  assert.equal(schemaId, 'movscript.project_standards.v1')
  assert.equal(schema?.entityKind, 'project_standards')
  assert.deepEqual(model.schemaIds, ['movscript.project_standards.v1'])
})

test('scene moment source schema keeps audio and transition at storyboard timing level', () => {
  const schema = getSemanticEntitySchemaEntry('movscript.scene_moment.v1')
  const timing = schema?.jsonSchema.properties.storyboard_timing

  assert.equal(schema?.entityKind, 'scene_moment')
  assert.ok(timing.properties.audio)
  assert.ok(timing.properties.transition)
  assert.equal(timing.properties.items.items.properties.audio, undefined)
  assert.equal(timing.properties.items.items.properties.transition, undefined)
})

test('project workspace paths use source root and build at repository root', () => {
  const paths = resolveMovScriptProjectWorkspacePaths({
    workspaceDir: '/tmp/movscript-demo',
    userId: 1,
    projectId: 6,
  })

  assert.equal(paths.projectDir, '/tmp/movscript-demo')
  assert.equal(paths.projectFile, '/tmp/movscript-demo/project.json')
  assert.equal(paths.sourceDir, '/tmp/movscript-demo')
  assert.equal(paths.buildDir, '/tmp/movscript-demo/.build')
  assert.equal(paths.projectStandardsFile, '/tmp/movscript-demo/project_standards.json')
  assert.equal(paths.settingDir, '/tmp/movscript-demo/settings')
  assert.equal(paths.contentUnitsDir, '/tmp/movscript-demo/content_units')
})

test('project workspace paths distinguish local personal and organization owners', () => {
  assert.equal(
    resolveMovScriptProjectWorkspacePaths({
      workspaceDir: '/tmp/movscript-demo',
      projectId: 6,
    }).projectDir,
    '/tmp/movscript-demo',
  )
  assert.equal(
    resolveMovScriptProjectWorkspacePaths({
      workspaceDir: '/tmp/movscript-demo',
      userId: 7,
      projectId: 6,
    }).projectDir,
    '/tmp/movscript-demo',
  )
  assert.equal(
    resolveMovScriptProjectWorkspacePaths({
      workspaceDir: '/tmp/movscript-demo',
      userId: 7,
      orgId: 9,
      projectId: 6,
    }).projectDir,
    '/tmp/movscript-demo',
  )
})

test('compiler build reads hierarchical source root and writes derived artifacts', async () => {
  const files = new Map(sourceFileEntries())
  files.set('.build/current/settings/hero/setting.json', JSON.stringify({ schema: 'movscript.setting.v1', kind: 'setting', id: 'hero', setting_kind: 'character', title: 'Old Hero' }))
  files.set('.build/current/productions/p8f3/preview_timeline.json', JSON.stringify({ schema: 'movscript.preview_timeline.v1', items: [] }))
  const repository = memoryWorkspaceFileRepository(files)

  const review = await reviewMovScriptBuildWorkspace({
    fileRepository: repository,
    now: new Date('2026-06-07T00:00:00.000Z'),
  })

  assert.equal(review.sourcePath, '')
  assert.equal(review.sourceMode, 'source')
  assert.equal(review.readyToBuild, true)
  assert.equal(review.changedFiles.some((file) => file.buildPath === '.build/current/productions/p8f3/preview_timeline.json'), false)

  const result = await buildMovScriptWorkspace({
    fileRepository: repository,
    now: new Date('2026-06-07T00:00:00.000Z'),
  })

  assert.equal(result.status, 'built')
  assert.equal(result.manifest?.source.sourceMode, 'source')
  assert.equal(files.has('.build/current/settings/hero/setting.json'), true)
  assert.equal(files.has('.build/current/content_units/k41m/content_unit.json'), true)
  assert.equal(files.has('.build/indexes/domain-index.json'), true)
  assert.equal(files.has('.build/indexes/asset-index.json'), true)
  assert.equal(files.has('.build/indexes/relation-graph.json'), true)
  assert.equal(files.has('.build/current/domain-tree.json'), true)
  assert.equal(files.has('.build/current/editor-state.json'), true)
  assert.equal(files.has('.build/current/content_units/k41m/generation_prompt.json'), true)

  const domainIndex = JSON.parse(files.get('.build/indexes/domain-index.json'))
  const previewTimeline = JSON.parse(files.get('.build/current/productions/p8f3/preview_timeline.json'))
  const generationPrompt = JSON.parse(files.get('.build/current/content_units/k41m/generation_prompt.json'))
  const editorState = JSON.parse(files.get('.build/current/editor-state.json'))
  const impactReport = JSON.parse(files.get(result.manifest.output.impactReportPath))
  assert.ok(domainIndex.entities.some((entity) => entity.entityKind === 'asset'))
  assert.ok(domainIndex.entities.some((entity) => entity.entityKind === 'storyboard'))
  assert.ok(domainIndex.entities.some((entity) => entity.entityKind === 'content_unit'))
  assert.equal(previewTimeline.schema, 'movscript.preview_timeline.v1')
  assert.equal(generationPrompt.schema, 'movscript.compiled_generation_prompt.v1')
  assert.equal(generationPrompt.prompt, 'Cold phone light on frightened face.')
  assert.equal(generationPrompt.context.storyboard.id, 'main')
  assert.equal(generationPrompt.context.shotPlans.length, 1)
  assert.equal(generationPrompt.context.assets[0].id, 'wet_hair')
  assert.equal(generationPrompt.context.contentUnitKeyframes[0].id, 'c83x')
  assert.equal(generationPrompt.references.assets[0].resourceId, 'resource_1')
  assert.equal(generationPrompt.references.sceneKeyframes[0].resourceId, 'resource_scene_anchor')
  assert.equal(generationPrompt.references.contentUnitKeyframes[0].resourceId, 'resource_keyframe_1')
  assert.equal(generationPrompt.references.contentUnitResult.resourceId, 'resource_video_1')
  assert.equal(editorState.contentGenerationPrompts[0].contentUnitId, 'k41m')
  assert.ok(impactReport.changedEntities.some((entity) => entity.entityKind === 'content_unit' && entity.editorImpacts.some((impact) => impact.includes('Content production context'))))
})

test('workspace review treats script markdown as document source, not semantic entity', async () => {
  const files = new Map([
    ['scripts/main/script.json', JSON.stringify({
      schema: 'movscript.script.v1',
      kind: 'script',
      id: 'main',
      title: 'Main Script',
      source_ref: 'script.md',
    })],
    ['scripts/main/script.md', 'new script text\n'],
    ['.build/current/scripts/main/script.json', JSON.stringify({
      schema: 'movscript.script.v1',
      kind: 'script',
      id: 'main',
      title: 'Main Script',
      source_ref: 'script.md',
    })],
    ['.build/current/scripts/main/script.md', 'old script text\n'],
  ])
  const repository = memoryWorkspaceFileRepository(files)

  const review = await reviewMovScriptBuildWorkspace({
    fileRepository: repository,
    now: new Date('2026-06-07T00:00:00.000Z'),
  })

  assert.equal(review.readyToBuild, true)
  assert.ok(review.changedFiles.some((file) => file.path === 'scripts/main/script.md' && file.state === 'modified'))
  assert.equal(review.changedEntities.some((entity) => entity.path === 'scripts/main/script.md'), false)
  assert.equal(review.changedEntities.some((entity) => entity.entityKind === 'script'), false)
})

test('workspace build removes deleted source files from current build', async () => {
  const files = new Map([
    ['project.json', JSON.stringify({ schema: 'movscript.project.v1', kind: 'project', project_id: 'project_demo', title: 'Demo' })],
    ['.build/current/project.json', JSON.stringify({ schema: 'movscript.project.v1', kind: 'project', project_id: 'project_demo', title: 'Demo' })],
    ['.build/current/settings/removed/setting.json', JSON.stringify({ schema: 'movscript.setting.v1', kind: 'setting', id: 'removed', title: 'Removed' })],
  ])
  const repository = memoryWorkspaceFileRepository(files)

  const review = await reviewMovScriptBuildWorkspace({
    fileRepository: repository,
    now: new Date('2026-06-07T00:00:00.000Z'),
  })

  assert.equal(review.summary.deleted, 1)
  assert.ok(review.changedFiles.some((file) => file.state === 'deleted' && file.buildPath === '.build/current/settings/removed/setting.json'))

  const result = await buildMovScriptWorkspace({
    fileRepository: repository,
    now: new Date('2026-06-07T00:00:00.000Z'),
  })

  assert.equal(result.status, 'built')
  assert.equal(files.has('.build/current/settings/removed/setting.json'), false)
})

test('workspace build removes stale preview timelines for deleted productions', async () => {
  const files = new Map(sourceFileEntries())
  files.set('.build/current/productions/old/preview_timeline.json', JSON.stringify({
    schema: 'movscript.preview_timeline.v1',
    productionId: 'old',
    items: [],
  }))
  const repository = memoryWorkspaceFileRepository(files)

  const result = await buildMovScriptWorkspace({
    fileRepository: repository,
    now: new Date('2026-06-07T00:00:00.000Z'),
  })

  assert.equal(result.status, 'built')
  assert.equal(files.has('.build/current/productions/old/preview_timeline.json'), false)
  assert.equal(files.has('.build/current/productions/p8f3/preview_timeline.json'), true)
})

test('workspace build removes stale compiled prompts for deleted content units', async () => {
  const files = new Map(sourceFileEntries())
  files.set('.build/current/content_units/old/generation_prompt.json', JSON.stringify({
    schema: 'movscript.compiled_generation_prompt.v1',
    contentUnitId: 'old',
    prompt: 'old',
    context: {},
  }))
  const repository = memoryWorkspaceFileRepository(files)

  const result = await buildMovScriptWorkspace({
    fileRepository: repository,
    now: new Date('2026-06-07T00:00:00.000Z'),
  })

  assert.equal(result.status, 'built')
  assert.equal(files.has('.build/current/content_units/old/generation_prompt.json'), false)
  assert.equal(files.has('.build/current/content_units/k41m/generation_prompt.json'), true)
})

test('workspace source review rejects path schema mismatch and unresolved content unit references', async () => {
  const files = new Map([
    ['settings/hero/setting.json', JSON.stringify({
      schema: 'movscript.asset.v1',
      kind: 'asset',
      id: 'hero',
      slot: 'wrong_place',
    })],
    ['content_units/k41m/content_unit.json', JSON.stringify({
      schema: 'movscript.content_unit.v1',
      kind: 'content_unit',
      id: 'k41m',
      unit_kind: 'shot',
      title: 'Phone close-up',
      source_context: {
        scene_moment_ref: 'productions/missing/segments/missing/scene_moments/missing',
        storyboard_ref: 'productions/missing/segments/missing/scene_moments/missing/storyboards/missing',
        shot_plan_id: 'shot_plan_1',
      },
    })],
  ])
  const repository = memoryWorkspaceFileRepository(files)

  const review = await reviewMovScriptBuildWorkspace({
    fileRepository: repository,
    now: new Date('2026-06-07T00:00:00.000Z'),
  })

  assert.equal(review.sourceMode, 'source')
  assert.equal(review.readyToBuild, false)
  assert.ok(review.issues.some((issue) => issue.message.includes('schema kind asset does not match source path entity setting')))
  assert.ok(review.issues.some((issue) => issue.message.includes('scene_moment_ref does not resolve')))
  assert.ok(review.issues.some((issue) => issue.message.includes('storyboard_ref does not resolve')))
  assert.ok(review.issues.some((issue) => issue.message.includes('do not reference shot_plan_id')))
  assert.ok(review.issues.some((issue) => issue.message.includes('$.source_context.shot_plan_id is not allowed')))
})

test('workspace source review rejects content unit storyboard outside referenced scene moment', async () => {
  const files = new Map([
    ['productions/p8f3/production.json', JSON.stringify({ schema: 'movscript.production.v1', kind: 'production', id: 'p8f3', title: 'Episode 1' })],
    ['productions/p8f3/segments/a19d/segment.json', JSON.stringify({ schema: 'movscript.segment.v1', kind: 'segment', id: 'a19d', title: 'Opening', order: 1 })],
    ['productions/p8f3/segments/a19d/scene_moments/a/scene_moment.json', JSON.stringify({
      schema: 'movscript.scene_moment.v1',
      kind: 'scene_moment',
      id: 'a',
      title: 'A',
      order: 1,
    })],
    ['productions/p8f3/segments/a19d/scene_moments/b/scene_moment.json', JSON.stringify({
      schema: 'movscript.scene_moment.v1',
      kind: 'scene_moment',
      id: 'b',
      title: 'B',
      order: 2,
    })],
    ['productions/p8f3/segments/a19d/scene_moments/b/storyboards/b/storyboard.json', JSON.stringify({
      schema: 'movscript.storyboard.v1',
      kind: 'storyboard',
      id: 'b',
    })],
    ['content_units/k41m/content_unit.json', JSON.stringify({
      schema: 'movscript.content_unit.v1',
      kind: 'content_unit',
      id: 'k41m',
      unit_kind: 'shot',
      title: 'Phone close-up',
      source_context: {
        scene_moment_ref: 'productions/p8f3/segments/a19d/scene_moments/a',
        storyboard_ref: 'productions/p8f3/segments/a19d/scene_moments/b/storyboards/b',
      },
    })],
  ])
  const repository = memoryWorkspaceFileRepository(files)

  const review = await reviewMovScriptBuildWorkspace({
    fileRepository: repository,
    now: new Date('2026-06-07T00:00:00.000Z'),
  })

  assert.equal(review.readyToBuild, false)
  assert.ok(review.issues.some((issue) => issue.message.includes('storyboard_ref is not under source_context.scene_moment_ref')))
})

test('workspace source review rejects unresolved storyboard setting refs', async () => {
  const files = new Map([
    ['settings/hero/setting.json', JSON.stringify({ schema: 'movscript.setting.v1', kind: 'setting', id: 'hero', title: 'Hero', setting_kind: 'character' })],
    ['settings/other/setting.json', JSON.stringify({ schema: 'movscript.setting.v1', kind: 'setting', id: 'other', title: 'Other', setting_kind: 'character' })],
    ['settings/other/states/other/setting_state.json', JSON.stringify({ schema: 'movscript.setting_state.v1', kind: 'setting_state', id: 'other', title: 'Other state' })],
    ['productions/p8f3/production.json', JSON.stringify({ schema: 'movscript.production.v1', kind: 'production', id: 'p8f3', title: 'Episode 1' })],
    ['productions/p8f3/segments/a19d/segment.json', JSON.stringify({ schema: 'movscript.segment.v1', kind: 'segment', id: 'a19d', title: 'Opening', order: 1 })],
    ['productions/p8f3/segments/a19d/scene_moments/r72k/scene_moment.json', JSON.stringify({
      schema: 'movscript.scene_moment.v1',
      kind: 'scene_moment',
      id: 'r72k',
      title: 'Phone call',
      order: 1,
    })],
    ['productions/p8f3/segments/a19d/scene_moments/r72k/storyboards/main/storyboard.json', JSON.stringify({
      schema: 'movscript.storyboard.v1',
      kind: 'storyboard',
      id: 'main',
      setting_refs: [
        { setting_id: 'missing' },
        { setting_id: 'hero', setting_state_id: 'missing' },
        { setting_id: 'hero', setting_state_id: 'other' },
      ],
    })],
  ])
  const repository = memoryWorkspaceFileRepository(files)

  const review = await reviewMovScriptBuildWorkspace({
    fileRepository: repository,
    now: new Date('2026-06-07T00:00:00.000Z'),
  })

  assert.equal(review.readyToBuild, false)
  assert.ok(review.issues.some((issue) => issue.message.includes('setting_refs[0].setting_id does not resolve')))
  assert.ok(review.issues.some((issue) => issue.message.includes('setting_refs[1].setting_state_id does not resolve')))
  assert.ok(review.issues.some((issue) => issue.message.includes('setting_refs[2].setting_state_id does not belong to setting_id')))
})

test('workspace source review rejects wrong hierarchy and id directory mismatch', async () => {
  const files = new Map([
    ['productions/p8f3/scene_moments/orphan/scene_moment.json', JSON.stringify({
      schema: 'movscript.scene_moment.v1',
      kind: 'scene_moment',
      id: 'orphan',
      title: 'Wrong level',
      order: 1,
    })],
    ['settings/hero/assets/portrait/asset.json', JSON.stringify({
      schema: 'movscript.asset.v1',
      kind: 'asset',
      id: 'wrong_id',
      slot: 'character_base_portrait',
    })],
    ['content_units/k41m/keyframes/c83x/keyframe.json', JSON.stringify({
      schema: 'movscript.keyframe.v1',
      kind: 'keyframe',
      id: 'other',
    })],
  ])
  const repository = memoryWorkspaceFileRepository(files)

  const review = await reviewMovScriptBuildWorkspace({
    fileRepository: repository,
    now: new Date('2026-06-07T00:00:00.000Z'),
  })

  assert.equal(review.sourceMode, 'source')
  assert.equal(review.readyToBuild, false)
  assert.ok(review.issues.some((issue) => issue.path.includes('orphan') && issue.message.includes('required workspace hierarchy')))
  assert.ok(review.issues.some((issue) => issue.path.includes('portrait') && issue.message.includes('source directory id portrait')))
  assert.ok(review.issues.some((issue) => issue.path.includes('c83x') && issue.message.includes('source directory id c83x')))
})

test('workspace source review validates semantic entity schemas', async () => {
  const files = new Map([
    ['settings/hero/setting.json', JSON.stringify({
      schema: 'movscript.setting.v1',
      kind: 'setting',
      id: '',
      setting_kind: 'not_a_kind',
    })],
    ['productions/p8f3/production.json', JSON.stringify({
      schema: 'movscript.production.v1',
      kind: 'production',
      id: 'p8f3',
      title: 'Episode',
    })],
  ])
  const repository = memoryWorkspaceFileRepository(files)

  const review = await reviewMovScriptBuildWorkspace({
    fileRepository: repository,
    now: new Date('2026-06-07T00:00:00.000Z'),
  })

  assert.equal(review.readyToBuild, false)
  assert.ok(review.issues.some((issue) => issue.message.includes('$.title is required')))
  assert.ok(review.issues.some((issue) => issue.message.includes('$.id must contain at least 1 character')))
  assert.ok(review.issues.some((issue) => issue.message.includes('$.setting_kind must be one of')))
})

test('workspace source review validates min length in source references', async () => {
  const files = new Map([
    ['content_units/k41m/content_unit.json', JSON.stringify({
      schema: 'movscript.content_unit.v1',
      kind: 'content_unit',
      id: 'k41m',
      unit_kind: 'shot',
      title: 'Phone close-up',
      source_context: {
        scene_moment_ref: '',
        storyboard_ref: '',
      },
    })],
  ])
  const repository = memoryWorkspaceFileRepository(files)

  const review = await reviewMovScriptBuildWorkspace({
    fileRepository: repository,
    now: new Date('2026-06-07T00:00:00.000Z'),
  })

  assert.equal(review.readyToBuild, false)
  assert.ok(review.issues.some((issue) => issue.message.includes('$.source_context.scene_moment_ref must contain at least 1 character')))
  assert.ok(review.issues.some((issue) => issue.message.includes('$.source_context.storyboard_ref must contain at least 1 character')))
})

test('workspace source review rejects unresolved scene moment storyboard timing', async () => {
  const files = new Map([
    ['productions/p8f3/production.json', JSON.stringify({ schema: 'movscript.production.v1', kind: 'production', id: 'p8f3', title: 'Episode 1' })],
    ['productions/p8f3/segments/a19d/segment.json', JSON.stringify({ schema: 'movscript.segment.v1', kind: 'segment', id: 'a19d', title: 'Opening', order: 1 })],
    ['productions/p8f3/segments/a19d/scene_moments/r72k/scene_moment.json', JSON.stringify({
      schema: 'movscript.scene_moment.v1',
      kind: 'scene_moment',
      id: 'r72k',
      title: 'Phone call',
      order: 1,
      storyboard_timing: {
        items: [{ storyboard_id: 'missing', order: 1 }],
      },
    })],
  ])
  const repository = memoryWorkspaceFileRepository(files)

  const review = await reviewMovScriptBuildWorkspace({
    fileRepository: repository,
    now: new Date('2026-06-07T00:00:00.000Z'),
  })

  assert.equal(review.readyToBuild, false)
  assert.ok(review.issues.some((issue) => issue.message.includes('storyboard_timing.items[0].storyboard_id does not resolve')))
})

test('workspace source review rejects unresolved keyframe reference assets', async () => {
  const files = new Map([
    ['productions/p8f3/production.json', JSON.stringify({ schema: 'movscript.production.v1', kind: 'production', id: 'p8f3', title: 'Episode 1' })],
    ['productions/p8f3/segments/a19d/segment.json', JSON.stringify({ schema: 'movscript.segment.v1', kind: 'segment', id: 'a19d', title: 'Opening', order: 1 })],
    ['productions/p8f3/segments/a19d/scene_moments/r72k/scene_moment.json', JSON.stringify({
      schema: 'movscript.scene_moment.v1',
      kind: 'scene_moment',
      id: 'r72k',
      title: 'Phone call',
      order: 1,
    })],
    ['productions/p8f3/segments/a19d/scene_moments/r72k/storyboards/main/storyboard.json', JSON.stringify({
      schema: 'movscript.storyboard.v1',
      kind: 'storyboard',
      id: 'main',
    })],
    ['content_units/k41m/content_unit.json', JSON.stringify({
      schema: 'movscript.content_unit.v1',
      kind: 'content_unit',
      id: 'k41m',
      unit_kind: 'shot',
      title: 'Phone close-up',
      source_context: {
        scene_moment_ref: 'productions/p8f3/segments/a19d/scene_moments/r72k',
        storyboard_ref: 'productions/p8f3/segments/a19d/scene_moments/r72k/storyboards/main',
      },
    })],
    ['content_units/k41m/keyframes/c83x/keyframe.json', JSON.stringify({
      schema: 'movscript.keyframe.v1',
      kind: 'keyframe',
      id: 'c83x',
      reference_asset_refs: ['missing'],
    })],
  ])
  const repository = memoryWorkspaceFileRepository(files)

  const review = await reviewMovScriptBuildWorkspace({
    fileRepository: repository,
    now: new Date('2026-06-07T00:00:00.000Z'),
  })

  assert.equal(review.readyToBuild, false)
  assert.ok(review.issues.some((issue) => issue.message.includes('keyframe reference_asset_refs[0] does not resolve: missing')))
})

test('workspace source review leaves legacy inline candidate fields to runtime and decision stores', async () => {
  const files = new Map([
    ['settings/hero/setting.json', JSON.stringify({
      schema: 'movscript.setting.v1',
      kind: 'setting',
      id: 'hero',
      title: 'Hero',
      setting_kind: 'character',
    })],
    ['settings/hero/assets/portrait/asset.json', JSON.stringify({
      schema: 'movscript.asset.v1',
      kind: 'asset',
      id: 'portrait',
      slot: 'character_base_portrait',
      candidates: [{ id: 'candidate_a', resource_id: 'resource_a' }],
      lock: { candidate_id: 'candidate_missing', resource_id: 'resource_a' },
    })],
    ['content_units/k41m/content_unit.json', JSON.stringify({
      schema: 'movscript.content_unit.v1',
      kind: 'content_unit',
      id: 'k41m',
      unit_kind: 'shot',
      title: 'Phone close-up',
      source_context: {
        scene_moment_ref: 'missing',
        storyboard_ref: 'missing',
      },
      candidates: [
        { id: 'candidate_result', resource_id: 'resource_a' },
        { id: 'candidate_result', resource_id: 'resource_b' },
      ],
    })],
    ['content_units/k41m/keyframes/c83x/keyframe.json', JSON.stringify({
      schema: 'movscript.keyframe.v1',
      kind: 'keyframe',
      id: 'c83x',
      candidates: [{ id: 'candidate_keyframe', resource_id: 'resource_keyframe_a' }],
      lock: { candidate_id: 'candidate_keyframe', resource_id: 'resource_keyframe_b' },
    })],
  ])
  const repository = memoryWorkspaceFileRepository(files)

  const review = await reviewMovScriptBuildWorkspace({
    fileRepository: repository,
    now: new Date('2026-06-07T00:00:00.000Z'),
  })

  assert.equal(review.readyToBuild, false)
  assert.equal(review.issues.some((issue) => issue.message.includes('candidate')), false)
  assert.equal(review.issues.some((issue) => issue.message.includes('lock')), false)
})

test('workspace build rejects invalid source JSON', async () => {
  const files = new Map([
    ['settings/1/setting.json', '{'],
  ])
  const repository = memoryWorkspaceFileRepository(files)

  const result = await buildMovScriptWorkspace({
    fileRepository: repository,
    now: new Date('2026-06-07T00:00:00.000Z'),
  })

  assert.equal(result.status, 'failed')
  assert.equal(result.review.readyToBuild, false)
  assert.match(result.review.issues[0]?.message ?? '', /invalid JSON/)
  assert.equal(files.has('.build/current/settings/1/setting.json'), false)
})

function sourceDocuments() {
  return sourceFileEntries().map(([path, content]) => ({
    path,
    data: path.endsWith('.json') ? JSON.parse(content) : content,
  }))
}

function sourceFileEntries() {
  return [
    ['project.json', JSON.stringify({ schema: 'movscript.project.v1', kind: 'project', project_id: 'project_demo', title: 'Demo' })],
    ['project_standards.json', JSON.stringify({ schema: 'movscript.project_standards.v1', kind: 'project_standards', id: 'project_standards', visual_style: 'Cold rainy suspense realism.' })],
    ['scripts/main/script.json', JSON.stringify({ schema: 'movscript.script.v1', kind: 'script', id: 'main', title: 'Main Script', source_ref: 'script.md' })],
    ['scripts/main/script.md', 'INT. APARTMENT - NIGHT\nRain hits the window.\n'],
    ['settings/hero/setting.json', JSON.stringify({ schema: 'movscript.setting.v1', kind: 'setting', id: 'hero', setting_kind: 'character', title: 'Hero' })],
    ['settings/hero/states/rain/setting_state.json', JSON.stringify({ schema: 'movscript.setting_state.v1', kind: 'setting_state', id: 'rain', title: 'Rain' })],
    ['settings/hero/states/rain/assets/wet_hair/asset.json', JSON.stringify({
      schema: 'movscript.asset.v1',
      kind: 'asset',
      id: 'wet_hair',
      slot: 'character_state_reference',
      lock: { resource_id: 'resource_1' },
    })],
    ['productions/p8f3/production.json', JSON.stringify({ schema: 'movscript.production.v1', kind: 'production', id: 'p8f3', title: 'Episode 1' })],
    ['productions/p8f3/segments/a19d/segment.json', JSON.stringify({ schema: 'movscript.segment.v1', kind: 'segment', id: 'a19d', title: 'Opening', order: 1 })],
    ['productions/p8f3/segments/a19d/scene_moments/r72k/scene_moment.json', JSON.stringify({
      schema: 'movscript.scene_moment.v1',
      kind: 'scene_moment',
      id: 'r72k',
      title: 'Phone call',
      order: 1,
      storyboard_timing: {
        items: [{ storyboard_id: 'main', order: 1 }],
        audio: { note: 'Rain low, phone vibration sharp.' },
        transition: { out: 'hold_then_cut' },
      },
    })],
    ['productions/p8f3/segments/a19d/scene_moments/r72k/keyframes/scene_anchor/keyframe.json', JSON.stringify({
      schema: 'movscript.keyframe.v1',
      kind: 'keyframe',
      id: 'scene_anchor',
      title: 'Scene anchor',
      visual_intent: 'Rainy apartment scene anchor.',
      reference_asset_refs: ['wet_hair'],
      lock: { resource_id: 'resource_scene_anchor' },
    })],
    ['productions/p8f3/segments/a19d/scene_moments/r72k/storyboards/main/storyboard.json', JSON.stringify({
      schema: 'movscript.storyboard.v1',
      kind: 'storyboard',
      id: 'main',
      setting_refs: [{ setting_id: 'hero', setting_state_id: 'rain', role: 'subject' }],
      shot_plans: [{ id: 'shot_plan_1', order: 1, shot_size: 'close_up' }],
    })],
    ['productions/p8f3/segments/a19d/scene_moments/r72k/storyboards/main/writing_expressions/caption_1/writing_expression.json', JSON.stringify({
      schema: 'movscript.writing_expression.v1',
      kind: 'writing_expression',
      id: 'caption_1',
      expression_kind: 'caption',
      text: 'Unknown number lights up again.',
    })],
    ['content_units/k41m/content_unit.json', JSON.stringify({
      schema: 'movscript.content_unit.v1',
      kind: 'content_unit',
      id: 'k41m',
      unit_kind: 'shot',
      title: 'Phone close-up',
      source_context: {
        scene_moment_ref: 'productions/p8f3/segments/a19d/scene_moments/r72k',
        storyboard_ref: 'productions/p8f3/segments/a19d/scene_moments/r72k/storyboards/main',
      },
      editable_prompt: {
        prompt: 'Cold phone light on frightened face.',
        negative_prompt: 'cartoon',
      },
      lock: { resource_id: 'resource_video_1' },
    })],
    ['content_units/k41m/keyframes/c83x/keyframe.json', JSON.stringify({
      schema: 'movscript.keyframe.v1',
      kind: 'keyframe',
      id: 'c83x',
      title: 'Phone light close-up',
      visual_intent: 'Phone blue light illuminates the hero face.',
      reference_asset_refs: ['wet_hair'],
      lock: { resource_id: 'resource_keyframe_1' },
    })],
  ]
}

function memoryWorkspaceFileRepository(files) {
  return {
    async list(input = {}) {
      const root = normalizeMemoryPath(input.path ?? '')
      const children = new Map()
      for (const path of files.keys()) {
        if (root && path !== root && !path.startsWith(`${root}/`)) continue
        const rest = root ? path.slice(root.length).replace(/^\//, '') : path
        if (!rest) continue
        const [name, ...tail] = rest.split('/')
        const childPath = root ? `${root}/${name}` : name
        children.set(childPath, {
          path: childPath,
          kind: tail.length > 0 ? 'directory' : 'file',
          size: tail.length > 0 ? undefined : files.get(path).length,
        })
      }
      return {
        path: root,
        entries: [...children.values()].sort((left, right) => {
          if (left.kind !== right.kind) return left.kind === 'directory' ? -1 : 1
          return left.path.localeCompare(right.path)
        }),
      }
    },
    async read(input) {
      const path = normalizeMemoryPath(input.path)
      const content = files.get(path)
      if (content === undefined) throw new Error(`missing file: ${path}`)
      return { path, content, size: content.length }
    },
    async write(input) {
      const path = normalizeMemoryPath(input.path)
      files.set(path, input.content)
      return { path, content: input.content, size: input.content.length }
    },
    async delete(input) {
      files.delete(normalizeMemoryPath(input.path))
    },
  }
}

function normalizeMemoryPath(path) {
  return String(path).replace(/\\/g, '/').replace(/^\.movscript\//, '').replace(/^\/+/, '').replace(/\/+$/, '')
}
