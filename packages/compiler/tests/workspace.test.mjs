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
  createMovScriptContentCandidate,
  getMovScriptWorkspaceModel,
  lockMovScriptInlineCandidate,
  queryMovScriptCanonicalEntities,
  queryMovScriptWorkspaceAssets,
  queryMovScriptWorkspaceProductionContext,
  queryMovScriptWorkspaceSettings,
  selectMovScriptInlineCandidate,
  selectMovScriptContentUnitCandidate,
  unlockMovScriptInlineCandidate,
  updateMovScriptContentUnitEditPrompt,
} from '../../workspace/dist/index.js'
import {
  buildMovScriptWorkspaceBuildArtifacts,
} from '../dist/index.js'
import {
  buildMovScriptWorkspace,
  inspectMovScriptWorkspace,
  overviewMovScriptWorkspace,
  planMovScriptWorkspaceRegeneration,
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
  assert.equal(index.byKind.get('audio_cue')?.length, 1)
  assert.equal(index.byKind.get('content_unit')?.length, 2)
  assert.equal(index.byKind.get('expression_unit')?.length, 1)
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
  assert.equal(context.audio_cues.length, 1)
  assert.equal(context.expression_units.length, 1)
  assert.equal(context.content_units.length, 2)
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
  assert.ok(artifacts.relationGraph.relations.some((relation) => relation.type === 'uses' && relation.from.id === 'cu_wet_hair_ref' && relation.to.id === 'wet_hair'))
  assert.ok(artifacts.relationGraph.relations.some((relation) => relation.type === 'uses' && relation.from.id === 'k41m' && relation.to.id === 'scene_anchor'))
  assert.ok(artifacts.relationGraph.relations.some((relation) => relation.type === 'uses' && relation.from.id === 'scene_anchor' && relation.to.id === 'wet_hair'))
  assert.ok(artifacts.relationGraph.relations.some((relation) => relation.type === 'references' && relation.from.id === 'phone_vibration' && relation.to.id === 'r72k'))
  assert.ok(artifacts.previewTimelines[0].items.some((item) => item.itemType === 'scene_moment' && item.transition.out === 'hold_then_cut'))
  assert.ok(artifacts.previewTimelines[0].items.some((item) => item.itemType === 'audio_cue' && item.entity.id === 'phone_vibration' && item.cueKind === 'sound_effect'))
  assert.ok(artifacts.previewTimelines[0].items.some((item) => item.itemType === 'storyboard' && item.entity.id === 'main' && item.contentUnitIds.includes('k41m')))
  assert.ok(artifacts.impactReport.changedEntities[0].editorImpacts.some((impact) => impact.includes('Content production context')))
  assert.equal(artifacts.contentUnitArtifacts.length, 2)
  assert.equal(artifacts.contentUnitArtifacts.find((artifact) => artifact.contentUnitId === 'k41m')?.runtimePanel.content_unit_type, 'storyboard_video')
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
        id: 'scene_anchor',
        path: 'productions/p8f3/segments/a19d/scene_moments/r72k/keyframes/scene_anchor/keyframe.json',
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

test('content unit artifacts rebuild runtime panels from edit_prompt plus adapter context', () => {
  const index = buildMovScriptWorkspaceDomainIndex(sourceDocuments())

  const artifacts = buildMovScriptWorkspaceBuildArtifacts({
    index,
    changedEntities: [],
    buildId: 'build_test',
    createdAt: '2026-06-07T00:00:00.000Z',
  })
  const assetRef = artifacts.contentUnitArtifacts.find((artifact) => artifact.contentUnitId === 'cu_wet_hair_ref')
  const video = artifacts.contentUnitArtifacts.find((artifact) => artifact.contentUnitId === 'k41m')

  assert.equal(assetRef?.runtimePanel.output_kind, 'image')
  assert.match(assetRef?.runtimePanel.prompt?.text ?? '', /Cold phone light reference/)
  assert.equal(video?.runtimePanel.output_kind, 'video')
  assert.match(video?.runtimePanel.prompt?.text ?? '', /Cold phone light on frightened face/)
  assert.match(video?.runtimePanel.prompt?.text ?? '', /Unknown number lights up again/)
  assert.match(video?.runtimePanel.prompt?.text ?? '', /Rain low, phone vibration sharp/)
  assert.equal(video?.runtimePanel.prompt?.negative_text, 'cartoon')
  assert.equal(video?.runtimePanel.runtime_request?.inputs.length, 0)
  assert.equal(video?.runtimePanel.input_hash, video?.inputVersion.hash)
  assert.equal(video?.runtimePanel.input_version, undefined)
  assert.equal(video?.runtimePanel.dependency_hashes, undefined)
  assert.equal(video?.runtimePanel.hash_rule, undefined)
  assert.equal(video?.runtimePanel.upstream_selections, undefined)
  assert.ok(video?.dependencyReport.hash_inputs.some((input) => input.role === 'keyframe' && input.continuity_role === 'video_continuity'))
  assert.ok(video?.dependencyReport.hash_inputs.some((input) => input.role === 'expression_unit' && input.continuity_role === 'narrative_continuity'))
  assert.ok(video?.dependencyReport.hash_inputs.some((input) => input.role === 'audio_cue' && input.continuity_role === 'sound_continuity'))
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

test('workspace content candidate writer stores runtime candidates and selection outside content_unit source', async () => {
  const files = new Map()
  const repository = memoryWorkspaceFileRepository(files)

  const candidate = await createMovScriptContentCandidate({
    fileRepository: repository,
    contentUnitId: 'k41m',
    candidateId: 'candidate_video_2',
    inputVersion: { hash: 'hash_2' },
    outputs: [{ kind: 'video', resource_id: 'resource_video_2', duration_sec: 4 }],
    promptSnapshot: { text: 'runtime prompt' },
    createdAt: '2026-06-07T00:00:00.000Z',
  })
  const selected = await selectMovScriptContentUnitCandidate({
    fileRepository: repository,
    contentUnitId: 'k41m',
    candidateId: 'candidate_video_2',
    resourceId: 'resource_video_2',
    acceptedInputHash: 'hash_2',
    reason: 'approved_by_director',
    selectedAt: '2026-06-07T00:00:00.000Z',
  })

  assert.equal(candidate.path, 'content_units/k41m/candidates/candidate_video_2/content_candidate.json')
  assert.equal(candidate.record.outputs[0].resource_id, 'resource_video_2')
  assert.equal(selected.path, 'content_units/k41m/selection.json')
  assert.deepEqual(selected.record.target, { kind: 'content_unit', ref: 'content_units/k41m' })
  assert.equal(selected.record.accepted_input_hash, 'hash_2')
})

test('workspace content unit prompt updater only changes edit_prompt', async () => {
  const files = new Map([
    ['content_units/k41m/content_unit.json', JSON.stringify({
      schema: 'movscript.content_unit.v1',
      kind: 'content_unit',
      id: 'k41m',
      title: 'Phone close-up',
      content_unit_type: 'storyboard_video',
      output_kind: 'video',
      scene_moment_ref: 'productions/p8f3/segments/a19d/scene_moments/r72k',
      storyboard_ref: 'productions/p8f3/segments/a19d/scene_moments/r72k/storyboards/main',
      edit_prompt: { text: 'Old prompt' },
    })],
  ])
  const repository = memoryWorkspaceFileRepository(files)

  const result = await updateMovScriptContentUnitEditPrompt({
    fileRepository: repository,
    targetPath: 'content_units/k41m/content_unit.json',
    editPrompt: {
      text: 'New prompt',
      negative_text: 'distorted hands',
      notes: 'Keep camera movement restrained.',
    },
  })

  assert.deepEqual(result.record.edit_prompt, {
    text: 'New prompt',
    negative_text: 'distorted hands',
    notes: 'Keep camera movement restrained.',
  })
  assert.equal(result.record.scene_moment_ref, 'productions/p8f3/segments/a19d/scene_moments/r72k')
  assert.equal(result.record.storyboard_ref, 'productions/p8f3/segments/a19d/scene_moments/r72k/storyboards/main')
  const saved = JSON.parse(files.get(result.path))
  assert.equal(saved.edit_prompt.text, 'New prompt')
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
  assert.equal(productionContext.content_units.length, 2)

  await service.updateContentUnitEditPrompt({
    targetPath: 'content_units/k41m/content_unit.json',
    editPrompt: {
      text: 'Service prompt',
      negative_text: 'flat lighting',
    },
  })
  await service.updateEntityTransition({
    targetPath: 'productions/p8f3/segments/a19d/scene_moments/r72k/scene_moment.json',
    transition: { out: 'hard_cut' },
  })
  await service.updateStoryboardTimeline({
    targetPath: 'productions/p8f3/segments/a19d/scene_moments/r72k/storyboards/main/storyboard.json',
    timeline: {
      gap_after_sec: 0.4,
      caption: 'Phone glow returns.',
    },
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
  const firstArtifacts = buildMovScriptWorkspaceBuildArtifacts({
    index: await service.loadIndex(),
    changedEntities: [],
    buildId: 'service_build_1',
    createdAt: '2026-06-07T00:00:00.000Z',
  })
  const assetRefInput = firstArtifacts.contentUnitArtifacts.find((artifact) => artifact.contentUnitId === 'cu_wet_hair_ref')?.inputVersion
  assert.ok(assetRefInput)
  await service.createContentCandidate({
    contentUnitId: 'cu_wet_hair_ref',
    candidateId: 'candidate_asset_1',
    inputVersion: assetRefInput,
    outputs: [{ kind: 'image', resource_id: 'resource_asset_1' }],
    promptSnapshot: firstArtifacts.contentUnitArtifacts.find((artifact) => artifact.contentUnitId === 'cu_wet_hair_ref')?.runtimePanel.prompt,
    createdAt: '2026-06-07T00:00:00.000Z',
  })
  await service.selectContentUnitCandidate({
    contentUnitId: 'cu_wet_hair_ref',
    candidateId: 'candidate_asset_1',
    resourceId: 'resource_asset_1',
    acceptedInputHash: assetRefInput.hash,
    reason: 'selected_from_frontend',
    selectedAt: '2026-06-07T00:00:00.000Z',
  })
  const secondArtifacts = buildMovScriptWorkspaceBuildArtifacts({
    index: await service.loadIndex(),
    changedEntities: [],
    buildId: 'service_build_2',
    createdAt: '2026-06-07T00:00:00.000Z',
  })
  const videoPanel = secondArtifacts.contentUnitArtifacts.find((artifact) => artifact.contentUnitId === 'k41m')?.runtimePanel
  assert.match(videoPanel?.prompt?.text ?? '', /Service prompt/)
  assert.equal(videoPanel?.prompt?.negative_text, 'flat lighting')
  assert.equal(videoPanel?.runtime_request?.inputs[0]?.resource_id, 'resource_asset_1')

  const artifacts = buildMovScriptWorkspaceBuildArtifacts({
    index: await service.loadIndex(),
    changedEntities: [],
    buildId: 'service_build',
    createdAt: '2026-06-07T00:00:00.000Z',
  })
  assert.equal(artifacts.contentUnitArtifacts.find((artifact) => artifact.contentUnitId === 'k41m')?.runtimePanel.prompt?.negative_text, 'flat lighting')
  assert.ok(artifacts.previewTimelines[0].items.some((item) => item.itemType === 'scene_moment' && item.transition.out === 'hard_cut'))
  assert.ok(artifacts.previewTimelines[0].items.some((item) => item.itemType === 'storyboard' && item.caption === 'Phone glow returns.' && item.gapAfterSec === 0.4))
})

test('content unit integration flow writes, compiles, generates, impacts, and regenerates explicitly', async () => {
  const files = new Map(sourceFileEntries())
  const repository = memoryWorkspaceFileRepository(files)
  const service = createMovScriptWorkspaceService({
    fileRepository: repository,
    now: () => new Date('2026-06-07T00:00:00.000Z'),
  })

  const firstBuild = await buildMovScriptWorkspace({
    fileRepository: repository,
    now: new Date('2026-06-07T00:00:00.000Z'),
  })
  assert.equal(firstBuild.status, 'built')
  const firstAssetInput = await service.readContentUnitInputVersion('cu_wet_hair_ref')
  const firstAssetPanel = await service.readContentUnitRuntimePanel('cu_wet_hair_ref')
  const firstVideoInput = await service.readContentUnitInputVersion('k41m')
  assert.ok(firstAssetInput?.hash)
  assert.equal(firstAssetPanel?.output_kind, 'image')
  assert.ok(firstVideoInput?.hash)

  await service.createContentCandidate({
    contentUnitId: 'cu_wet_hair_ref',
    candidateId: 'candidate_asset_1',
    inputVersion: firstAssetInput,
    outputs: [{ kind: 'image', resource_id: 'resource_asset_1' }],
    promptSnapshot: firstAssetPanel?.prompt,
    createdAt: '2026-06-07T00:01:00.000Z',
  })
  await service.selectContentUnitCandidate({
    contentUnitId: 'cu_wet_hair_ref',
    candidateId: 'candidate_asset_1',
    resourceId: 'resource_asset_1',
    acceptedInputHash: String(firstAssetInput.hash),
    reason: 'initial_asset_reference',
    selectedAt: '2026-06-07T00:01:00.000Z',
  })

  const secondBuild = await buildMovScriptWorkspace({
    fileRepository: repository,
    now: new Date('2026-06-07T00:02:00.000Z'),
  })
  assert.equal(secondBuild.status, 'built')
  const secondVideoPanel = await service.readContentUnitRuntimePanel('k41m')
  const secondVideoInput = await service.readContentUnitInputVersion('k41m')
  assert.equal(secondVideoPanel?.runtime_request?.inputs[0]?.resource_id, 'resource_asset_1')
  assert.notEqual(secondVideoInput?.hash, firstVideoInput.hash)

  await service.createContentCandidate({
    contentUnitId: 'k41m',
    candidateId: 'candidate_video_1',
    inputVersion: secondVideoInput,
    outputs: [{ kind: 'video', resource_id: 'resource_video_1', duration_sec: 4 }],
    promptSnapshot: secondVideoPanel?.prompt,
    createdAt: '2026-06-07T00:03:00.000Z',
  })
  await service.selectContentUnitCandidate({
    contentUnitId: 'k41m',
    candidateId: 'candidate_video_1',
    resourceId: 'resource_video_1',
    acceptedInputHash: String(secondVideoInput?.hash),
    reason: 'initial_video_selection',
    selectedAt: '2026-06-07T00:03:00.000Z',
  })

  const keyframe = JSON.parse(files.get('productions/p8f3/segments/a19d/scene_moments/r72k/keyframes/scene_anchor/keyframe.json'))
  keyframe.continuity = { ...keyframe.continuity, hair: 'wet hair pushed across left cheek' }
  keyframe.visual_intent = 'Rainy apartment scene anchor with wet hair pushed across left cheek.'
  files.set('productions/p8f3/segments/a19d/scene_moments/r72k/keyframes/scene_anchor/keyframe.json', `${JSON.stringify(keyframe, null, 2)}\n`)

  const impactBuild = await buildMovScriptWorkspace({
    fileRepository: repository,
    now: new Date('2026-06-07T00:04:00.000Z'),
  })
  assert.equal(impactBuild.status, 'built')
  const impactReport = JSON.parse(files.get(impactBuild.manifest.output.impactReportPath))
  const changedKeyframe = impactReport.changedEntities.find((entity) => entity.entityKind === 'keyframe' && entity.id === 'scene_anchor')
  const staleVideo = await service.readContentUnitSelectionValidity('k41m')
  assert.ok(changedKeyframe?.affectedContentUnits.some((entity) => entity.id === 'k41m'))
  assert.ok(changedKeyframe?.staleMarkers.includes('content_unit:k41m:visual_anchor_changed'))
  assert.equal(staleVideo?.selected, true)
  assert.equal(staleVideo?.stale, true)

  const regenerationPlan = await planMovScriptWorkspaceRegeneration({
    fileRepository: repository,
    now: new Date('2026-06-07T00:04:30.000Z'),
  })
  assert.equal(regenerationPlan.schema, 'movscript.workspace-regeneration-plan.v1')
  assert.equal(regenerationPlan.status, 'ready')
  assert.equal(regenerationPlan.build?.buildId, impactBuild.manifest.buildId)
  assert.ok(regenerationPlan.affectedContentUnits.some((target) => target.contentUnitId === 'k41m' && target.stale === true))
  assert.ok(regenerationPlan.promptBundles.some((target) => target.contentUnitId === 'k41m'))
  assert.ok(regenerationPlan.previewTimelines.some((target) => target.productionId === 'p8f3'))

  const regeneratedVideoInput = await service.readContentUnitInputVersion('k41m')
  const regeneratedVideoPanel = await service.readContentUnitRuntimePanel('k41m')
  assert.notEqual(regeneratedVideoInput?.hash, secondVideoInput?.hash)
  await service.createContentCandidate({
    contentUnitId: 'k41m',
    candidateId: 'candidate_video_2',
    inputVersion: regeneratedVideoInput,
    outputs: [{ kind: 'video', resource_id: 'resource_video_2', duration_sec: 4 }],
    promptSnapshot: regeneratedVideoPanel?.prompt,
    createdAt: '2026-06-07T00:05:00.000Z',
  })
  await service.selectContentUnitCandidate({
    contentUnitId: 'k41m',
    candidateId: 'candidate_video_2',
    resourceId: 'resource_video_2',
    acceptedInputHash: String(regeneratedVideoInput?.hash),
    reason: 'regenerated_after_keyframe_change',
    selectedAt: '2026-06-07T00:05:00.000Z',
  })

  const finalBuild = await buildMovScriptWorkspace({
    fileRepository: repository,
    now: new Date('2026-06-07T00:06:00.000Z'),
  })
  assert.equal(finalBuild.status, 'built')
  const finalValidity = await service.readContentUnitSelectionValidity('k41m')
  const finalPanel = await service.readContentUnitRuntimePanel('k41m')
  assert.equal(finalValidity?.candidate_id, 'candidate_video_2')
  assert.equal(finalValidity?.resource_id, 'resource_video_2')
  assert.equal(finalValidity?.stale, false)
  assert.equal(finalPanel?.runtime_request?.inputs[0]?.resource_id, 'resource_asset_1')
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

    await service.updateContentUnitEditPrompt({
      targetPath: 'content_units/k41m/content_unit.json',
      editPrompt: { text: 'Node service prompt' },
    })

    const build = await buildMovScriptWorkspace({
      fileRepository,
      now: new Date('2026-06-07T00:00:00.000Z'),
    })
    assert.equal(build.status, 'built')
    assert.equal(build.manifest?.output.editorStatePath, '.build/current/editor-state.json')
    const editorState = await service.readEditorState()
    const previewTimeline = await service.readPreviewTimeline('p8f3')
    const runtimePanel = await service.readContentUnitRuntimePanel('k41m')
    const inputVersion = await service.readContentUnitInputVersion('k41m')
    const selectionValidity = await service.readContentUnitSelectionValidity('k41m')
    assert.equal(editorState?.schema, 'movscript.editor-state.v1')
    assert.equal(previewTimeline?.schema, 'movscript.preview_timeline.v1')
    assert.equal(runtimePanel?.schema, 'movscript.content_unit_runtime_panel.v1')
    assert.match(runtimePanel?.prompt?.text ?? '', /Node service prompt/)
    assert.equal(inputVersion?.schema, 'movscript.input_version.v1')
    assert.equal(selectionValidity?.schema, 'movscript.content_unit_selection_validity.v1')
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

test('planning schemas keep transition local and audio cues independent', () => {
  const sceneMomentSchema = getSemanticEntitySchemaEntry('movscript.scene_moment.v1')
  const storyboardSchema = getSemanticEntitySchemaEntry('movscript.storyboard.v1')
  const audioCueSchema = getSemanticEntitySchemaEntry('movscript.audio_cue.v1')

  assert.equal(sceneMomentSchema?.entityKind, 'scene_moment')
  assert.equal(sceneMomentSchema?.jsonSchema.properties.storyboard_timing, undefined)
  assert.ok(sceneMomentSchema?.jsonSchema.properties.transition)
  assert.ok(storyboardSchema?.jsonSchema.properties.transition)
  assert.ok(storyboardSchema?.jsonSchema.properties.timeline)
  assert.equal(audioCueSchema?.entityKind, 'audio_cue')
  assert.ok(audioCueSchema?.jsonSchema.properties.timing)
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
  assert.equal(files.has('.build/current/content_units/k41m/runtime_panel.json'), true)
  assert.equal(files.has('.build/current/content_units/k41m/input_version.json'), true)
  assert.equal(files.has('.build/current/content_units/k41m/dependency_report.json'), true)
  assert.equal(files.has('.build/current/content_units/k41m/selection_validity.json'), true)

  const domainIndex = JSON.parse(files.get('.build/indexes/domain-index.json'))
  const previewTimeline = JSON.parse(files.get('.build/current/productions/p8f3/preview_timeline.json'))
  const runtimePanel = JSON.parse(files.get('.build/current/content_units/k41m/runtime_panel.json'))
  const inputVersion = JSON.parse(files.get('.build/current/content_units/k41m/input_version.json'))
  const selectionValidity = JSON.parse(files.get('.build/current/content_units/k41m/selection_validity.json'))
  const editorState = JSON.parse(files.get('.build/current/editor-state.json'))
  const impactReport = JSON.parse(files.get(result.manifest.output.impactReportPath))
  assert.ok(domainIndex.entities.some((entity) => entity.entityKind === 'asset'))
  assert.ok(domainIndex.entities.some((entity) => entity.entityKind === 'storyboard'))
  assert.ok(domainIndex.entities.some((entity) => entity.entityKind === 'content_unit'))
  assert.equal(previewTimeline.schema, 'movscript.preview_timeline.v1')
  assert.equal(runtimePanel.schema, 'movscript.content_unit_runtime_panel.v1')
  assert.equal(runtimePanel.content_unit_type, 'storyboard_video')
  assert.equal(runtimePanel.input_hash, inputVersion.hash)
  assert.equal(runtimePanel.input_version, undefined)
  assert.equal(runtimePanel.dependency_hashes, undefined)
  assert.equal(runtimePanel.hash_rule, undefined)
  assert.equal(runtimePanel.upstream_selections, undefined)
  assert.match(runtimePanel.prompt.text, /Cold phone light on frightened face/)
  assert.match(runtimePanel.prompt.text, /Scene anchor/)
  assert.match(runtimePanel.prompt.text, /Unknown number lights up again/)
  assert.match(runtimePanel.prompt.text, /Rain low, phone vibration sharp/)
  assert.equal(inputVersion.schema, 'movscript.input_version.v1')
  assert.equal(inputVersion.dependency_hashes, undefined)
  assert.equal(inputVersion.hash_rule, undefined)
  assert.equal(inputVersion.upstream_selections, undefined)
  const dependencyReport = JSON.parse(files.get('.build/current/content_units/k41m/dependency_report.json'))
  assert.ok(dependencyReport.hash_inputs.some((input) => input.role === 'keyframe'))
  assert.ok(dependencyReport.hash_inputs.some((input) => input.role === 'expression_unit'))
  assert.ok(dependencyReport.hash_inputs.some((input) => input.role === 'audio_cue'))
  assert.equal(selectionValidity.schema, 'movscript.content_unit_selection_validity.v1')
  assert.equal(selectionValidity.selected, false)
  assert.equal(editorState.contentUnitRuntimePanels.some((panel) => panel.contentUnitId === 'k41m'), true)
  assert.ok(impactReport.changedEntities.some((entity) => entity.entityKind === 'content_unit' && entity.editorImpacts.some((impact) => impact.includes('Content production context'))))
})

test('workspace inspect exposes edit-impact semantics as the review-compatible read model', async () => {
  const files = new Map(sourceFileEntries())
  files.set('.build/current/project.json', JSON.stringify({ schema: 'movscript.project.v1', kind: 'project', project_id: 'project_demo', title: 'Old Demo' }))
  const repository = memoryWorkspaceFileRepository(files)

  const inspection = await inspectMovScriptWorkspace({
    fileRepository: repository,
    now: new Date('2026-06-07T00:00:00.000Z'),
  })

  assert.equal(inspection.schema, 'movscript.workspace-inspection.v1')
  assert.equal(inspection.operation, 'inspect')
  assert.equal(inspection.reviewAlias.operation, 'review')
  assert.equal(inspection.readyToBuild, true)
  assert.ok(inspection.changedFiles.some((file) => file.path === 'project.json' && file.state === 'modified'))
  assert.equal(inspection.summary.businessChanges, inspection.changedEntities.length)
  assert.ok(inspection.businessChanges.some((change) => {
    return change.entityKind === 'project'
      && change.title === 'Demo'
      && change.summary === 'Project changed: Demo'
      && change.impactAreas.includes('workspace_context')
  }))
})

test('workspace inspect separates source document changes from business changes', async () => {
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

  const inspection = await inspectMovScriptWorkspace({
    fileRepository: repository,
    now: new Date('2026-06-07T00:00:00.000Z'),
  })

  assert.equal(inspection.summary.total, 1)
  assert.equal(inspection.summary.businessChanges, 0)
  assert.equal(inspection.businessChanges.length, 0)
})

test('workspace overview summarizes pending edits, build state, regeneration, and next actions', async () => {
  const files = new Map(sourceFileEntries())
  const repository = memoryWorkspaceFileRepository(files)

  const beforeBuild = await overviewMovScriptWorkspace({
    fileRepository: repository,
    now: new Date('2026-06-07T00:00:00.000Z'),
  })

  assert.equal(beforeBuild.schema, 'movscript.workspace-overview.v1')
  assert.equal(beforeBuild.workspace.projectId, 'project_demo')
  assert.equal(beforeBuild.build.status, 'missing')
  assert.equal(beforeBuild.source.hasPendingEdits, true)
  assert.ok(beforeBuild.nextActions.includes('compile'))

  await buildMovScriptWorkspace({
    fileRepository: repository,
    now: new Date('2026-06-07T00:01:00.000Z'),
  })

  const afterBuild = await overviewMovScriptWorkspace({
    fileRepository: repository,
    now: new Date('2026-06-07T00:02:00.000Z'),
  })

  assert.equal(afterBuild.build.status, 'current')
  assert.equal(afterBuild.source.hasPendingEdits, false)
  assert.equal(afterBuild.build.lastBuildId, 'build_20260607000100000')
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
  assert.ok(review.businessChanges.some((change) => {
    return change.entityKind === 'setting'
      && change.id === 'removed'
      && change.title === 'Removed'
      && change.summary === 'Setting deleted: Removed'
      && change.impactAreas.includes('asset_index')
  }))

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

test('workspace build removes stale content unit artifacts for deleted content units', async () => {
  const files = new Map(sourceFileEntries())
  files.set('.build/current/content_units/old/runtime_panel.json', JSON.stringify({
    schema: 'movscript.content_unit_runtime_panel.v1',
    content_unit_id: 'old',
    content_unit_type: 'storyboard_video',
  }))
  const repository = memoryWorkspaceFileRepository(files)

  const result = await buildMovScriptWorkspace({
    fileRepository: repository,
    now: new Date('2026-06-07T00:00:00.000Z'),
  })

  assert.equal(result.status, 'built')
  assert.equal(files.has('.build/current/content_units/old/runtime_panel.json'), false)
  assert.equal(files.has('.build/current/content_units/k41m/runtime_panel.json'), true)
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
      title: 'Phone close-up',
      content_unit_type: 'storyboard_video',
      output_kind: 'video',
      scene_moment_ref: 'productions/missing/segments/missing/scene_moments/missing',
      storyboard_ref: 'productions/missing/segments/missing/scene_moments/missing/storyboards/missing',
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
      title: 'Phone close-up',
      content_unit_type: 'storyboard_video',
      output_kind: 'video',
      scene_moment_ref: 'productions/p8f3/segments/a19d/scene_moments/a',
      storyboard_ref: 'productions/p8f3/segments/a19d/scene_moments/b/storyboards/b',
    })],
  ])
  const repository = memoryWorkspaceFileRepository(files)

  const review = await reviewMovScriptBuildWorkspace({
    fileRepository: repository,
    now: new Date('2026-06-07T00:00:00.000Z'),
  })

  assert.equal(review.readyToBuild, false)
  assert.ok(review.issues.some((issue) => issue.message.includes('storyboard_ref is not under scene_moment_ref')))
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
      title: 'Phone close-up',
      content_unit_type: 'storyboard_video',
      output_kind: 'video',
      scene_moment_ref: '',
      storyboard_ref: '',
    })],
  ])
  const repository = memoryWorkspaceFileRepository(files)

  const review = await reviewMovScriptBuildWorkspace({
    fileRepository: repository,
    now: new Date('2026-06-07T00:00:00.000Z'),
  })

  assert.equal(review.readyToBuild, false)
  assert.ok(review.issues.some((issue) => issue.message.includes('$.scene_moment_ref must contain at least 1 character')))
  assert.ok(review.issues.some((issue) => issue.message.includes('$.storyboard_ref must contain at least 1 character')))
})

test('workspace source review rejects unresolved content unit keyframe refs', async () => {
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
    ['content_units/sound_1/content_unit.json', JSON.stringify({
      schema: 'movscript.content_unit.v1',
      kind: 'content_unit',
      id: 'sound_1',
      title: 'Phone vibration sound',
      content_unit_type: 'storyboard_video',
      output_kind: 'video',
      scene_moment_ref: 'productions/p8f3/segments/a19d/scene_moments/r72k',
      storyboard_ref: 'productions/p8f3/segments/a19d/scene_moments/r72k/storyboards/main',
      keyframe_refs: ['missing_keyframe'],
    })],
  ])
  const repository = memoryWorkspaceFileRepository(files)

  const review = await reviewMovScriptBuildWorkspace({
    fileRepository: repository,
    now: new Date('2026-06-07T00:00:00.000Z'),
  })

  assert.equal(review.readyToBuild, false)
  assert.ok(review.issues.some((issue) => issue.message.includes('keyframe_refs[0] does not resolve')))
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
      title: 'Phone close-up',
      content_unit_type: 'storyboard_video',
      output_kind: 'video',
      scene_moment_ref: 'productions/p8f3/segments/a19d/scene_moments/r72k',
      storyboard_ref: 'productions/p8f3/segments/a19d/scene_moments/r72k/storyboards/main',
      keyframe_refs: ['c83x'],
    })],
    ['productions/p8f3/segments/a19d/scene_moments/r72k/keyframes/c83x/keyframe.json', JSON.stringify({
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

test('workspace source review accepts runtime content candidate and selection documents outside content_unit source', async () => {
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
      title: 'Phone close-up',
      content_unit_type: 'asset_ref',
      output_kind: 'image',
      asset_ref: 'portrait',
    })],
    ['content_units/k41m/candidates/candidate_result/content_candidate.json', JSON.stringify({
      schema: 'movscript.content_candidate.v1',
      id: 'candidate_result',
      content_unit_ref: 'content_units/k41m',
      outputs: [{ kind: 'image', resource_id: 'resource_a' }],
    })],
    ['content_units/k41m/selection.json', JSON.stringify({
      schema: 'movscript.selection.v1',
      target: { kind: 'content_unit', ref: 'content_units/k41m' },
      candidate_id: 'candidate_result',
      resource_id: 'resource_a',
    })],
  ])
  const repository = memoryWorkspaceFileRepository(files)

  const review = await reviewMovScriptBuildWorkspace({
    fileRepository: repository,
    now: new Date('2026-06-07T00:00:00.000Z'),
  })

  assert.equal(review.readyToBuild, true)
  assert.equal(review.issues.some((issue) => issue.message.includes('candidate')), false)
  assert.equal(review.issues.some((issue) => issue.message.includes('selection')), false)
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
      prompt_hint: 'Wet hair and rain on the hero face.',
    })],
    ['productions/p8f3/production.json', JSON.stringify({ schema: 'movscript.production.v1', kind: 'production', id: 'p8f3', title: 'Episode 1' })],
    ['productions/p8f3/segments/a19d/segment.json', JSON.stringify({ schema: 'movscript.segment.v1', kind: 'segment', id: 'a19d', title: 'Opening', order: 1 })],
    ['productions/p8f3/segments/a19d/scene_moments/r72k/scene_moment.json', JSON.stringify({
      schema: 'movscript.scene_moment.v1',
      kind: 'scene_moment',
      id: 'r72k',
      title: 'Phone call',
      order: 1,
      transition: { out: 'hold_then_cut' },
    })],
    ['productions/p8f3/segments/a19d/scene_moments/r72k/keyframes/scene_anchor/keyframe.json', JSON.stringify({
      schema: 'movscript.keyframe.v1',
      kind: 'keyframe',
      id: 'scene_anchor',
      title: 'Scene anchor',
      visual_intent: 'Rainy apartment scene anchor.',
      reference_asset_refs: ['wet_hair'],
      continuity: { hair: 'wet and stuck to forehead', lighting: 'cold phone glow' },
    })],
    ['productions/p8f3/segments/a19d/scene_moments/r72k/storyboards/main/storyboard.json', JSON.stringify({
      schema: 'movscript.storyboard.v1',
      kind: 'storyboard',
      id: 'main',
      order: 1,
      timeline: { caption: 'Phone glow returns.', gap_after_sec: 0.4 },
      setting_refs: [{ setting_id: 'hero', setting_state_id: 'rain', role: 'subject' }],
      shot_plans: [{ id: 'shot_plan_1', order: 1, shot_size: 'close_up' }],
    })],
    ['productions/p8f3/segments/a19d/scene_moments/r72k/audio_cues/phone_vibration/audio_cue.json', JSON.stringify({
      schema: 'movscript.audio_cue.v1',
      kind: 'audio_cue',
      id: 'phone_vibration',
      title: 'Phone vibration',
      cue_kind: 'sound_effect',
      order: 1,
      scope_ref: 'productions/p8f3/segments/a19d/scene_moments/r72k',
      storyboard_ref: 'productions/p8f3/segments/a19d/scene_moments/r72k/storyboards/main',
      timing: { start: 'after_action', duration_sec: 1.2 },
      prompt_hint: 'Rain low, phone vibration sharp.',
    })],
    ['productions/p8f3/segments/a19d/scene_moments/r72k/expression_units/caption_1/expression_unit.json', JSON.stringify({
      schema: 'movscript.expression_unit.v1',
      kind: 'expression_unit',
      id: 'caption_1',
      expression_kind: 'caption',
      text: 'Unknown number lights up again.',
    })],
    ['content_units/k41m/content_unit.json', JSON.stringify({
      schema: 'movscript.content_unit.v1',
      kind: 'content_unit',
      id: 'k41m',
      title: 'Phone close-up',
      content_unit_type: 'storyboard_video',
      output_kind: 'video',
      scene_moment_ref: 'productions/p8f3/segments/a19d/scene_moments/r72k',
      storyboard_ref: 'productions/p8f3/segments/a19d/scene_moments/r72k/storyboards/main',
      keyframe_refs: ['scene_anchor'],
      edit_prompt: {
        text: 'Cold phone light on frightened face.',
        negative_text: 'cartoon',
      },
      model_intent: { capability: 'video', duration_sec: 4 },
    })],
    ['content_units/cu_wet_hair_ref/content_unit.json', JSON.stringify({
      schema: 'movscript.content_unit.v1',
      kind: 'content_unit',
      id: 'cu_wet_hair_ref',
      title: 'Wet hair visual reference',
      content_unit_type: 'asset_ref',
      output_kind: 'image',
      asset_ref: 'wet_hair',
      edit_prompt: {
        text: 'Cold phone light reference for wet hair continuity.',
        negative_text: 'cartoon',
      },
      model_intent: { capability: 'image', aspect_ratio: '1:1' },
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
