export interface MovScriptServiceRuntime {
  readonly name: 'movscript-service'
  readonly version: string
}

export function createMovScriptServiceRuntime(version = '0.1.0'): MovScriptServiceRuntime {
  return {
    name: 'movscript-service',
    version,
  }
}
