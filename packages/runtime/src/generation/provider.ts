export type MovScriptGenerationCapability =
  | 'image'
  | 'image_edit'
  | 'video'
  | 'video_i2v'
  | 'video_v2v'
  | 'audio_tts'
  | 'audio_transcribe'
  | 'subtitle_align'
  | 'render_video'

export type MovScriptGenerationInputKind =
  | 'text'
  | 'image'
  | 'video'
  | 'audio'
  | 'mask'
  | 'metadata'

export type MovScriptGenerationJobStatus =
  | 'queued'
  | 'running'
  | 'succeeded'
  | 'failed'
  | 'canceled'

export interface MovScriptGenerationProviderDescriptor {
  id: string
  name: string
  version?: string
  capabilities: MovScriptGenerationCapability[]
  models: MovScriptGenerationModelDescriptor[]
}

export interface MovScriptGenerationModelDescriptor {
  id: string
  providerId: string
  capability: MovScriptGenerationCapability
  displayName?: string
  inputRequirements?: MovScriptGenerationInputRequirement[]
  supportedParams?: Record<string, MovScriptGenerationParamSchema>
}

export interface MovScriptGenerationInputRequirement {
  kind: MovScriptGenerationInputKind
  required: boolean
  min?: number
  max?: number
  mimeTypes?: string[]
}

export interface MovScriptGenerationParamSchema {
  type: 'string' | 'number' | 'integer' | 'boolean' | 'object' | 'array'
  required?: boolean
  enum?: Array<string | number | boolean>
  min?: number
  max?: number
  description?: string
}

export interface MovScriptGenerationInputRef {
  kind: MovScriptGenerationInputKind
  ref: string
  mimeType?: string
  metadata?: Record<string, unknown>
}

export interface MovScriptGenerationRequest {
  id: string
  capability: MovScriptGenerationCapability
  modelId: string
  prompt?: string
  negativePrompt?: string
  inputs?: MovScriptGenerationInputRef[]
  params?: Record<string, unknown>
  metadata?: Record<string, unknown>
}

export interface MovScriptGenerationSubmittedJob {
  id: string
  providerId: string
  requestId: string
  status: MovScriptGenerationJobStatus
  createdAt?: string
  updatedAt?: string
}

export interface MovScriptGenerationJobResult {
  id: string
  providerId: string
  requestId: string
  status: MovScriptGenerationJobStatus
  outputs: MovScriptGenerationOutputRef[]
  error?: {
    code: string
    message: string
    retryable?: boolean
  }
  createdAt?: string
  updatedAt?: string
}

export interface MovScriptGenerationOutputRef {
  kind: MovScriptGenerationInputKind
  ref: string
  mimeType?: string
  width?: number
  height?: number
  durationSeconds?: number
  metadata?: Record<string, unknown>
}

export interface MovScriptGenerationProvider {
  descriptor: MovScriptGenerationProviderDescriptor
  submit(request: MovScriptGenerationRequest): Promise<MovScriptGenerationSubmittedJob>
  getJob(jobId: string): Promise<MovScriptGenerationJobResult>
  cancelJob?(jobId: string): Promise<void>
}
