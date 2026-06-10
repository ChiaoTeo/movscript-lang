import type {
  MovScriptWorkspaceDomainIndex,
  MovScriptWorkspaceIndexedEntity,
} from '@movscript/workspace/indexer'
import { sameEntityRef } from '@movscript/workspace/layout'
import type { SemanticEntityKind } from '@movscript/language/domain'
import {
  buildContentUnitArtifacts,
  hasSpecializedContentUnitAdapter,
  type ContentUnitBuildArtifactBundle,
} from './contentProduction.js'

export type MovScriptDomainRelationType = 'owns' | 'contains' | 'references' | 'uses' | 'derives'

export interface MovScriptDomainEntityRef {
  entityKind: SemanticEntityKind | string
  id?: string | number
  path?: string
}

export interface MovScriptDomainRelation {
  type: MovScriptDomainRelationType
  from: MovScriptDomainEntityRef
  to: MovScriptDomainEntityRef
  field?: string
}

export interface MovScriptDomainTreeNode {
  entityKind: SemanticEntityKind | string
  id?: string | number
  path: string
  title?: string
  order?: number
  children: MovScriptDomainTreeNode[]
}

export interface MovScriptDomainTreeArtifact {
  schema: 'movscript.domain-tree.v1'
  roots: MovScriptDomainTreeNode[]
}

export interface MovScriptRelationGraphArtifact {
  schema: 'movscript.relation-graph.v1'
  relations: MovScriptDomainRelation[]
}

export interface MovScriptAssetIndexEntry {
  id?: string | number
  path: string
  owner: MovScriptDomainEntityRef
  slot?: string
}

export interface MovScriptAssetIndexArtifact {
  schema: 'movscript.asset-index.v1'
  assets: MovScriptAssetIndexEntry[]
}

export interface MovScriptImpactReportChangedEntity {
  entityKind: string
  id?: string | number
  path: string
  state: string
  editorImpacts: string[]
  affectedContentUnits: MovScriptDomainEntityRef[]
  staleMarkers: string[]
}

export interface MovScriptImpactReportArtifact {
  schema: 'movscript.impact-report.v1'
  buildId: string
  createdAt: string
  changedEntities: MovScriptImpactReportChangedEntity[]
}

export interface MovScriptPreviewTimelineItem {
  id: string
  itemType: 'segment' | 'scene_moment' | 'shot' | 'storyboard' | 'audio_cue' | 'content_unit'
  entity: MovScriptDomainEntityRef
  order: number
  parentId?: string
  title?: string
  caption?: string
  gapAfterSec?: number
  cueKind?: string
  timing?: Record<string, unknown>
  transition?: Record<string, unknown>
  contentUnitIds?: Array<string | number>
}

export interface MovScriptPreviewTimelineArtifact {
  schema: 'movscript.preview_timeline.v1'
  productionId: string | number
  productionPath: string
  items: MovScriptPreviewTimelineItem[]
}

export interface MovScriptWorkspaceArtifactsInput {
  index: MovScriptWorkspaceDomainIndex
  changedEntities: Array<{
    entityKind: string
    path: string
    id?: string | number
    state: string
  }>
  buildId: string
  createdAt: string
}

export interface MovScriptWorkspaceBuildArtifacts {
  domainTree: MovScriptDomainTreeArtifact
  relationGraph: MovScriptRelationGraphArtifact
  assetIndex: MovScriptAssetIndexArtifact
  impactReport: MovScriptImpactReportArtifact
  previewTimelines: MovScriptPreviewTimelineArtifact[]
  contentUnitArtifacts: ContentUnitBuildArtifactBundle[]
}

export function buildMovScriptWorkspaceBuildArtifacts(input: MovScriptWorkspaceArtifactsInput): MovScriptWorkspaceBuildArtifacts {
  const relationGraph = buildRelationGraph(input.index)
  return {
    domainTree: buildDomainTree(input.index),
    relationGraph,
    assetIndex: buildAssetIndex(input.index),
    impactReport: buildImpactReport(input.changedEntities, input.buildId, input.createdAt, input.index, relationGraph),
    previewTimelines: buildPreviewTimelines(input.index),
    contentUnitArtifacts: buildContentUnitArtifacts(input.index, { createdAt: input.createdAt }),
  }
}

export function buildDomainTree(index: MovScriptWorkspaceDomainIndex): MovScriptDomainTreeArtifact {
  const nodes = new Map<string, MovScriptDomainTreeNode>()
  const roots: MovScriptDomainTreeNode[] = []
  for (const entity of canonicalEntities(index)) {
    if (!isTreeEntity(entity)) continue
    nodes.set(entity.path, treeNode(entity))
  }
  for (const node of nodes.values()) {
    const parent = nearestParentNode(node.path, nodes)
    if (parent) parent.children.push(node)
    else roots.push(node)
  }
  sortTreeNodes(roots)
  return { schema: 'movscript.domain-tree.v1', roots }
}

export function buildRelationGraph(index: MovScriptWorkspaceDomainIndex): MovScriptRelationGraphArtifact {
  const relations: MovScriptDomainRelation[] = []
  const sourceEntities = canonicalEntities(index)
  const entities = sourceEntities.filter((entity) => entity.id !== undefined)
  const entityByPathDir = new Map(sourceEntities.map((entity) => [entityDir(entity.path), entity]))
  const entityById = new Map(entities.map((entity) => [entityKey(entity.entityKind, entity.id), entity]))

  for (const entity of sourceEntities) {
    const parent = nearestParentEntity(entity.path, entityByPathDir)
    if (parent) {
      relations.push({
        type: relationTypeForParent(parent.entityKind, entity.entityKind),
        from: entityRef(parent),
        to: entityRef(entity),
      })
    }

    if (entity.entityKind === 'content_unit' && hasSpecializedContentUnitAdapter(entity.record.content_unit_type)) {
      const sceneMoment = entityByPathDir.get(normalizedRefDir(entity.record.scene_moment_ref))
      const storyboard = entityByPathDir.get(normalizedRefDir(entity.record.storyboard_ref))
      const shot = storyboard ? parentShotForEntity(storyboard, entityByPathDir, entityById) : undefined
      const audioCue = entityByPathDir.get(normalizedRefDir(entity.record.audio_cue_ref))
      const asset = findEntityByRef(entities, 'asset', entity.record.asset_ref) ?? entityByPathDir.get(normalizedRefDir(entity.record.asset_ref))
      if (sceneMoment) relations.push({ type: 'references', from: entityRef(entity), to: entityRef(sceneMoment), field: 'scene_moment_ref' })
      if (shot) relations.push({ type: 'references', from: entityRef(entity), to: entityRef(shot), field: 'storyboard_ref.shot' })
      if (storyboard) relations.push({ type: 'references', from: entityRef(entity), to: entityRef(storyboard), field: 'storyboard_ref' })
      if (audioCue) relations.push({ type: 'references', from: entityRef(entity), to: entityRef(audioCue), field: 'audio_cue_ref' })
      if (asset) relations.push({ type: 'uses', from: entityRef(entity), to: entityRef(asset), field: 'asset_ref' })
      const keyframeRefs = [
        ...arrayField(entity.record.keyframe_refs),
        ...(idField(entity.record.keyframe_ref) !== undefined ? [entity.record.keyframe_ref] : []),
      ]
      for (const keyframeRef of keyframeRefs) {
        const keyframe = findEntityByRef(entities, 'keyframe', keyframeRef) ?? entityByPathDir.get(normalizedRefDir(keyframeRef))
        if (keyframe) relations.push({ type: 'uses', from: entityRef(entity), to: entityRef(keyframe), field: keyframeRef === entity.record.keyframe_ref ? 'keyframe_ref' : 'keyframe_refs' })
      }
    }

    if (entity.entityKind === 'audio_cue') {
      const scope = entityByPathDir.get(normalizedRefDir(entity.record.scope_ref))
      const storyboard = entityByPathDir.get(normalizedRefDir(entity.record.storyboard_ref))
      if (scope) relations.push({ type: 'references', from: entityRef(entity), to: entityRef(scope), field: 'scope_ref' })
      if (storyboard) relations.push({ type: 'references', from: entityRef(entity), to: entityRef(storyboard), field: 'storyboard_ref' })
      for (const assetRef of arrayField(entity.record.asset_refs)) {
        const asset = findEntityByRef(entities, 'asset', assetRef) ?? entityByPathDir.get(normalizedRefDir(assetRef))
        if (asset) relations.push({ type: 'uses', from: entityRef(entity), to: entityRef(asset), field: 'asset_refs' })
      }
    }

    if (entity.entityKind === 'storyboard') {
      const shot = parentShotForEntity(entity, entityByPathDir, entityById)
      if (shot) relations.push({ type: 'references', from: entityRef(entity), to: entityRef(shot), field: 'shot_ref' })
      for (const settingRef of arrayField(entity.record.setting_refs).filter(isRecord)) {
        const setting = findEntityByRef(entities, 'setting', settingRef.setting_id)
        const settingState = findEntityByRef(entities, 'setting_state', settingRef.setting_state_id)
        if (setting) relations.push({ type: 'uses', from: entityRef(entity), to: entityRef(setting), field: 'setting_refs.setting_id' })
        if (settingState) relations.push({ type: 'uses', from: entityRef(entity), to: entityRef(settingState), field: 'setting_refs.setting_state_id' })
      }
    }

    if (entity.entityKind === 'keyframe') {
      const shot = parentShotForEntity(entity, entityByPathDir, entityById)
      if (shot) relations.push({ type: 'references', from: entityRef(entity), to: entityRef(shot), field: 'shot_ref' })
      for (const assetRef of arrayField(entity.record.reference_asset_refs)) {
        const asset = findEntityByRef(entities, 'asset', assetRef) ?? entityByPathDir.get(normalizedRefDir(assetRef))
        if (asset) relations.push({ type: 'uses', from: entityRef(entity), to: entityRef(asset), field: 'reference_asset_refs' })
      }
    }
  }

  return { schema: 'movscript.relation-graph.v1', relations: dedupeRelations(relations) }
}

export function buildAssetIndex(index: MovScriptWorkspaceDomainIndex): MovScriptAssetIndexArtifact {
  return {
    schema: 'movscript.asset-index.v1',
    assets: canonicalEntities(index)
      .filter((entity) => entity.entityKind === 'asset')
      .map((entity) => ({
        ...(entity.id !== undefined ? { id: entity.id } : {}),
        path: entity.path,
        owner: assetOwnerRef(entity.path),
        slot: stringField(entity.record.slot),
      })),
  }
}

export function buildImpactReport(
  changedEntities: MovScriptWorkspaceArtifactsInput['changedEntities'],
  buildId: string,
  createdAt: string,
  index: MovScriptWorkspaceDomainIndex,
  relationGraph: MovScriptRelationGraphArtifact,
): MovScriptImpactReportArtifact {
  return {
    schema: 'movscript.impact-report.v1',
    buildId,
    createdAt,
    changedEntities: changedEntities.map((entity) => {
      const affectedContentUnits = affectedContentUnitsForChangedEntity(entity, index, relationGraph)
      return {
        entityKind: entity.entityKind,
        ...(entity.id !== undefined ? { id: entity.id } : {}),
        path: entity.path,
        state: entity.state,
        editorImpacts: editorImpactsForChangedEntity(entity, affectedContentUnits),
        affectedContentUnits,
        staleMarkers: staleMarkersForChangedEntity(entity, affectedContentUnits),
      }
    }),
  }
}

export function buildPreviewTimelines(index: MovScriptWorkspaceDomainIndex): MovScriptPreviewTimelineArtifact[] {
  const sourceEntities = canonicalEntities(index)
  const contentUnitsByStoryboardRef = groupContentUnitsByStoryboardRef(index)
  return sourceEntities
    .filter(isProductionWithId)
    .map((production) => {
      const productionDir = entityDir(production.path)
      const segments = childEntities(index, productionDir, 'segment')
      const items: MovScriptPreviewTimelineItem[] = []
      let order = 0
      for (const segment of sortEntities(segments)) {
        const segmentItemId = timelineItemId(segment)
        items.push({
          ...timelineItem(segmentItemId, 'segment', segment, order++),
          transition: recordField(segment.record.transition),
        })
        const sceneMoments = childEntities(index, entityDir(segment.path), 'scene_moment')
        for (const sceneMoment of sortEntities(sceneMoments)) {
          const sceneMomentItemId = timelineItemId(sceneMoment)
          items.push({
            ...timelineItem(sceneMomentItemId, 'scene_moment', sceneMoment, order++),
            parentId: segmentItemId,
            transition: recordField(sceneMoment.record.transition),
          })
          const audioCues = childEntities(index, entityDir(sceneMoment.path), 'audio_cue')
          for (const audioCue of sortEntities(audioCues)) {
            items.push({
              ...timelineItem(timelineItemId(audioCue), 'audio_cue', audioCue, order++),
              parentId: sceneMomentItemId,
              cueKind: stringField(audioCue.record.cue_kind),
              timing: recordField(audioCue.record.timing),
            })
          }
          const shots = childEntities(index, entityDir(sceneMoment.path), 'shot')
          for (const shot of sortEntities(shots)) {
            const shotItemId = timelineItemId(shot)
            items.push({
              ...timelineItem(shotItemId, 'shot', shot, order++),
              parentId: sceneMomentItemId,
              timing: recordField(shot.record.timing),
              transition: recordField(shot.record.transition),
            })
            for (const storyboard of childEntities(index, entityDir(shot.path), 'storyboard')) {
              const storyboardItemId = timelineItemId(storyboard)
              const contentUnits = contentUnitsByStoryboardRef.get(entityDir(storyboard.path)) ?? []
              const timeline = recordField(storyboard.record.timeline)
              items.push({
                ...timelineItem(storyboardItemId, 'storyboard', storyboard, order++),
                parentId: shotItemId,
                caption: stringField(timeline?.caption),
                gapAfterSec: numberField(timeline?.gap_after_sec),
                timing: timeline,
                transition: recordField(storyboard.record.transition),
                contentUnitIds: contentUnits.map((contentUnit) => contentUnit.id).filter(isDefined),
              })
              for (const contentUnit of sortEntities(contentUnits)) {
                items.push({
                  ...timelineItem(timelineItemId(contentUnit), 'content_unit', contentUnit, order++),
                  parentId: storyboardItemId,
                })
              }
            }
          }
        }
      }
      return {
        schema: 'movscript.preview_timeline.v1',
        productionId: production.id,
        productionPath: productionDir,
        items,
      }
    })
}

function isTreeEntity(entity: MovScriptWorkspaceIndexedEntity): boolean {
  return true
}

function treeNode(entity: MovScriptWorkspaceIndexedEntity): MovScriptDomainTreeNode {
  return {
    entityKind: entity.entityKind,
    ...(entity.id !== undefined ? { id: entity.id } : {}),
    path: entity.path,
    title: stringField(entity.record.title) ?? String(entity.id ?? entity.path),
    order: numberField(entity.record.order),
    children: [],
  }
}

function nearestParentNode(path: string, nodes: Map<string, MovScriptDomainTreeNode>): MovScriptDomainTreeNode | undefined {
  const parent = nearestParentPath(path, new Set(nodes.keys()))
  return parent ? nodes.get(parent) : undefined
}

function nearestParentEntity(path: string, entitiesByDir: Map<string, MovScriptWorkspaceIndexedEntity>): MovScriptWorkspaceIndexedEntity | undefined {
  const parent = nearestParentPath(entityDir(path), new Set(entitiesByDir.keys()))
  return parent ? entitiesByDir.get(parent) : undefined
}

function nearestParentPath(path: string, candidates: Set<string>): string | undefined {
  const parts = path.split('/')
  for (let index = parts.length - 1; index > 0; index -= 1) {
    const candidate = parts.slice(0, index).join('/')
    if (candidates.has(candidate)) return candidate
  }
  return undefined
}

function relationTypeForParent(parentType: string, childType: string): MovScriptDomainRelationType {
  if (parentType === 'setting' && childType === 'asset') return 'owns'
  if (parentType === 'setting_state' && childType === 'asset') return 'owns'
  return 'contains'
}

function entityRef(entity: MovScriptWorkspaceIndexedEntity): MovScriptDomainEntityRef {
  return {
    entityKind: entity.entityKind,
    ...(entity.id !== undefined ? { id: entity.id } : {}),
    path: entity.path,
  }
}

function entityRefKey(ref: MovScriptDomainEntityRef): string {
  return `${ref.entityKind}:${String(ref.id ?? ref.path ?? '')}`
}

function entityRefMatches(left: MovScriptDomainEntityRef, right: MovScriptDomainEntityRef): boolean {
  if (left.entityKind !== right.entityKind) return false
  if (left.id !== undefined && right.id !== undefined && String(left.id) === String(right.id)) return true
  if (left.path && right.path && left.path === right.path) return true
  return false
}

function assetOwnerRef(path: string): MovScriptDomainEntityRef {
  const parts = path.split('/')
  const statesIndex = parts.indexOf('states')
  if (statesIndex >= 0) return { entityKind: 'setting_state', id: parts[statesIndex + 1] }
  const settingsIndex = parts.indexOf('settings')
  if (settingsIndex >= 0) return { entityKind: 'setting', id: parts[settingsIndex + 1] }
  return { entityKind: 'unknown' }
}

function editorImpactsForChangedEntity(
  entity: MovScriptWorkspaceArtifactsInput['changedEntities'][number],
  affectedContentUnits: MovScriptDomainEntityRef[] = [],
): string[] {
  switch (entity.entityKind) {
    case 'project_standards':
      return ['Generation prompt bundles may need recompilation.']
    case 'setting':
    case 'setting_state':
    case 'asset':
      return [
        'Setting asset index should be refreshed.',
        affectedContentUnits.length > 0
          ? `${affectedContentUnits.length} content production context(s) using this setting may be stale.`
          : 'Generation contexts using this setting may be stale.',
      ]
    case 'production':
    case 'segment':
    case 'scene_moment':
    case 'shot':
    case 'storyboard':
    case 'audio_cue':
    case 'expression_unit':
      return [
        'Production planning tree should be refreshed.',
        'Preview timeline may need recompilation.',
        ...(affectedContentUnits.length > 0 ? [`${affectedContentUnits.length} content production prompt bundle(s) may need recompilation.`] : []),
      ]
    case 'content_unit':
      return ['Content production context should be refreshed.', 'Preview timeline items using this content unit may be stale.']
    case 'keyframe':
      return [
        'Visual anchors and generation reference bundles may need recompilation.',
        ...(affectedContentUnits.length > 0 ? [`${affectedContentUnits.length} content production prompt bundle(s) may need recompilation.`] : []),
      ]
    default:
      return ['Domain index should be refreshed.']
  }
}

function affectedContentUnitsForChangedEntity(
  changedEntity: MovScriptWorkspaceArtifactsInput['changedEntities'][number],
  index: MovScriptWorkspaceDomainIndex,
  relationGraph: MovScriptRelationGraphArtifact,
): MovScriptDomainEntityRef[] {
  if (changedEntity.entityKind === 'content_unit') {
    const sourceEntity = normalizeChangedEntityRef(changedEntity, index)
    const contentUnit = canonicalEntities(index).find((entity) => entity.entityKind === 'content_unit' && entityRefMatches(entityRef(entity), sourceEntity))
    return changedEntity.id !== undefined && hasSpecializedContentUnitAdapter(contentUnit?.record.content_unit_type)
      ? [{ entityKind: 'content_unit', id: changedEntity.id, path: changedEntity.path }]
      : []
  }

  const changedRef = normalizeChangedEntityRef(changedEntity, index)
  const affected = new Map<string, MovScriptDomainEntityRef>()
  for (const contentUnit of canonicalEntities(index).filter((entity) => entity.entityKind === 'content_unit')) {
    const contentUnitRef = entityRef(contentUnit)
    if (contentUnit.id !== undefined && contentUnitReferencesChangedEntity(contentUnit, changedRef, relationGraph)) {
      affected.set(entityRefKey(contentUnitRef), contentUnitRef)
    }
  }
  return [...affected.values()].sort((left, right) => String(left.id ?? left.path).localeCompare(String(right.id ?? right.path)))
}

function contentUnitReferencesChangedEntity(
  contentUnit: MovScriptWorkspaceIndexedEntity,
  changedRef: MovScriptDomainEntityRef,
  relationGraph: MovScriptRelationGraphArtifact,
): boolean {
  const visited = new Set<string>()
  const queue: MovScriptDomainEntityRef[] = [entityRef(contentUnit)]
  while (queue.length > 0) {
    const current = queue.shift()
    if (!current) continue
    const currentKey = entityRefKey(current)
    if (visited.has(currentKey)) continue
    visited.add(currentKey)
    if (entityRefMatches(current, changedRef)) return true
    for (const relation of relationGraph.relations) {
      if (!isRelevantDependencyRelation(relation, changedRef)) continue
      if (!entityRefMatches(relation.from, current)) continue
      queue.push(relation.to)
    }
  }
  return false
}

function isRelevantDependencyRelation(
  relation: MovScriptDomainRelation,
  changedRef: MovScriptDomainEntityRef,
): boolean {
  if (relation.type === 'references' || relation.type === 'uses') return true
  if (relation.type === 'owns') return changedRef.entityKind === 'asset'
  if (relation.type === 'contains') {
    return changedRef.entityKind === 'keyframe'
      || changedRef.entityKind === 'expression_unit'
      || changedRef.entityKind === 'audio_cue'
      || changedRef.entityKind === 'storyboard'
      || changedRef.entityKind === 'shot'
      || changedRef.entityKind === 'scene_moment'
  }
  return false
}

function normalizeChangedEntityRef(
  changedEntity: MovScriptWorkspaceArtifactsInput['changedEntities'][number],
  index: MovScriptWorkspaceDomainIndex,
): MovScriptDomainEntityRef {
  const existing = canonicalEntities(index).find((entity) => {
    return entity.entityKind === changedEntity.entityKind
      && (entity.path === changedEntity.path || entity.id !== undefined && changedEntity.id !== undefined && String(entity.id) === String(changedEntity.id))
  })
  return existing ? entityRef(existing) : {
    entityKind: changedEntity.entityKind,
    ...(changedEntity.id !== undefined ? { id: changedEntity.id } : {}),
    path: changedEntity.path,
  }
}

function staleMarkersForChangedEntity(
  entity: MovScriptWorkspaceArtifactsInput['changedEntities'][number],
  affectedContentUnits: MovScriptDomainEntityRef[],
): string[] {
  if (affectedContentUnits.length === 0) return []
  if (entity.entityKind === 'content_unit') {
    return affectedContentUnits.map((contentUnit) => `content_unit:${String(contentUnit.id ?? contentUnit.path)}:self_changed`)
  }
  const reason = entity.entityKind === 'asset' || entity.entityKind === 'setting' || entity.entityKind === 'setting_state'
    ? 'setting_context_changed'
    : entity.entityKind === 'keyframe'
      ? 'visual_anchor_changed'
      : 'planning_context_changed'
  return affectedContentUnits.map((contentUnit) => `content_unit:${String(contentUnit.id ?? contentUnit.path)}:${reason}`)
}

function childEntities(
  index: MovScriptWorkspaceDomainIndex,
  parentDir: string,
  entityKind: SemanticEntityKind,
): MovScriptWorkspaceIndexedEntity[] {
  const collectionName = collectionDirForEntityKind(entityKind)
  if (!collectionName) return []
  return canonicalEntities(index).filter((entity) => entity.entityKind === entityKind
    && entity.path.startsWith(`${parentDir}/${collectionName}/`)
    && entityDir(entity.path).replace(`${parentDir}/${collectionName}/`, '').split('/').length === 1)
}

function collectionDirForEntityKind(entityKind: SemanticEntityKind): string | undefined {
  if (entityKind === 'segment') return 'segments'
  if (entityKind === 'scene_moment') return 'scene_moments'
  if (entityKind === 'shot') return 'shots'
  if (entityKind === 'storyboard') return 'storyboards'
  if (entityKind === 'audio_cue') return 'audio_cues'
  if (entityKind === 'expression_unit') return 'expression_units'
  return undefined
}

function groupContentUnitsByStoryboardRef(index: MovScriptWorkspaceDomainIndex): Map<string, MovScriptWorkspaceIndexedEntity[]> {
  const out = new Map<string, MovScriptWorkspaceIndexedEntity[]>()
  for (const entity of canonicalEntities(index)) {
    if (entity.entityKind !== 'content_unit') continue
    if (!hasSpecializedContentUnitAdapter(entity.record.content_unit_type)) continue
    const storyboardRef = normalizedRefDir(entity.record.storyboard_ref)
    if (!storyboardRef) continue
    out.set(storyboardRef, [...(out.get(storyboardRef) ?? []), entity])
  }
  return out
}

function timelineItem(
  id: string,
  itemType: MovScriptPreviewTimelineItem['itemType'],
  entity: MovScriptWorkspaceIndexedEntity,
  order: number,
): MovScriptPreviewTimelineItem {
  return {
    id,
    itemType,
    entity: entityRef(entity),
    order,
    title: stringField(entity.record.title) ?? String(entity.id ?? entity.path),
  }
}

function timelineItemId(entity: MovScriptWorkspaceIndexedEntity): string {
  return `${entity.entityKind}:${String(entity.id ?? entity.path)}`
}

function sortEntities(entities: MovScriptWorkspaceIndexedEntity[]): MovScriptWorkspaceIndexedEntity[] {
  return [...entities].sort((left, right) => {
    const leftOrder = numberField(left.record.order) ?? Number.MAX_SAFE_INTEGER
    const rightOrder = numberField(right.record.order) ?? Number.MAX_SAFE_INTEGER
    if (leftOrder !== rightOrder) return leftOrder - rightOrder
    return left.path.localeCompare(right.path)
  })
}

function sortTreeNodes(nodes: MovScriptDomainTreeNode[]): void {
  nodes.sort((left, right) => {
    const leftOrder = left.order ?? Number.MAX_SAFE_INTEGER
    const rightOrder = right.order ?? Number.MAX_SAFE_INTEGER
    if (leftOrder !== rightOrder) return leftOrder - rightOrder
    return left.path.localeCompare(right.path)
  })
  for (const node of nodes) sortTreeNodes(node.children)
}

function dedupeRelations(relations: MovScriptDomainRelation[]): MovScriptDomainRelation[] {
  const seen = new Set<string>()
  const out: MovScriptDomainRelation[] = []
  for (const relation of relations) {
    const key = JSON.stringify(relation)
    if (seen.has(key)) continue
    seen.add(key)
    out.push(relation)
  }
  return out
}

function entityDir(path: string): string {
  return path.replace(/\/[^/]+$/, '')
}

function normalizedRefDir(value: unknown): string {
  return typeof value === 'string' ? value.replace(/\/+$/, '') : ''
}

function entityKey(entityKind: string, id: unknown): string {
  return `${entityKind}:${String(id ?? '')}`
}

function findEntityByRef(
  entities: MovScriptWorkspaceIndexedEntity[],
  entityKind: string,
  ref: unknown,
): MovScriptWorkspaceIndexedEntity | undefined {
  if (ref === undefined || ref === null || String(ref).trim() === '') return undefined
  return entities.find((entity) => entity.entityKind === entityKind && sameEntityRef(entity.id, ref, entityKind))
}

function parentShotForEntity(
  entity: MovScriptWorkspaceIndexedEntity,
  entityByPathDir: Map<string, MovScriptWorkspaceIndexedEntity>,
  entityById: Map<string, MovScriptWorkspaceIndexedEntity>,
): MovScriptWorkspaceIndexedEntity | undefined {
  const shotRef = normalizedRefDir(entity.record.shot_ref)
  if (shotRef) return entityByPathDir.get(shotRef) ?? entityById.get(entityKey('shot', shotRef))
  const shotId = pathSegmentAfter(entity.path, 'shots')
  return shotId ? entityById.get(entityKey('shot', shotId)) : undefined
}

function pathSegmentAfter(path: string, segment: string): string | undefined {
  const parts = path.split('/')
  const index = parts.indexOf(segment)
  return index >= 0 ? parts[index + 1] : undefined
}

function recordField(value: unknown): Record<string, unknown> | undefined {
  return isRecord(value) ? value : undefined
}

function arrayField(value: unknown): unknown[] {
  return Array.isArray(value) ? value : []
}

function stringField(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function numberField(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

function idField(value: unknown): string | number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim()) return value.trim()
  return undefined
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isDefined<T>(value: T | undefined): value is T {
  return value !== undefined
}

function isProductionWithId(entity: MovScriptWorkspaceIndexedEntity): entity is MovScriptWorkspaceIndexedEntity & { id: string | number } {
  return entity.entityKind === 'production' && entity.id !== undefined
}

function canonicalEntities(index: MovScriptWorkspaceDomainIndex): MovScriptWorkspaceIndexedEntity[] {
  return index.entities
}
