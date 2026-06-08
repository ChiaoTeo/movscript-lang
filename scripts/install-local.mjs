#!/usr/bin/env node
import { constants } from 'node:fs'
import { access, chmod, lstat, mkdir, readlink, rm, symlink, writeFile } from 'node:fs/promises'
import { spawn } from 'node:child_process'
import { dirname, delimiter, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { homedir } from 'node:os'

const commandName = 'movscript-lang'
const scriptDir = dirname(fileURLToPath(import.meta.url))
const rootDir = resolve(scriptDir, '..')
const cliEntry = resolve(rootDir, 'packages/cli/dist/index.js')
const options = parseArgs(process.argv.slice(2))
const binDir = resolve(options.binDir ?? defaultBinDir())
const executablePath = process.platform === 'win32'
  ? resolve(binDir, `${commandName}.cmd`)
  : resolve(binDir, commandName)

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
})

async function main() {
  if (options.help) {
    printHelp()
    return
  }

  if (options.uninstall) {
    await uninstall()
    return
  }

  if (!options.skipDeps) {
    await run('pnpm', ['install'], rootDir)
  }

  if (!options.skipBuild) {
    await run('pnpm', ['build'], rootDir)
  }

  await ensureBuiltCli()
  if (!options.dryRun && process.platform !== 'win32') await chmod(cliEntry, 0o755)
  if (!options.dryRun) await mkdir(binDir, { recursive: true })
  await installExecutable()

  if (!options.dryRun) console.log(`Installed ${commandName} -> ${executablePath}`)
  if (!isOnPath(binDir)) {
    console.log(`Add ${binDir} to PATH before running ${commandName} from a new shell.`)
  }
}

async function uninstall() {
  if (options.dryRun) {
    console.log(`[dry-run] remove ${executablePath}`)
    return
  }

  try {
    await rm(executablePath)
    console.log(`Removed ${executablePath}`)
  } catch (error) {
    if (isNodeError(error) && error.code === 'ENOENT') {
      console.log(`${commandName} is not installed at ${executablePath}`)
      return
    }
    throw error
  }
}

async function installExecutable() {
  if (options.dryRun) {
    console.log(`[dry-run] install ${commandName} -> ${executablePath}`)
    return
  }

  await removeExistingInstall()

  if (process.platform === 'win32') {
    await writeFile(
      executablePath,
      `@echo off\r\nnode "${escapeCmdPath(cliEntry)}" %*\r\n`,
      'utf8',
    )
    return
  }

  await symlink(cliEntry, executablePath)
}

async function removeExistingInstall() {
  try {
    const stat = await lstat(executablePath)
    if (stat.isSymbolicLink()) {
      const target = resolve(dirname(executablePath), await readlink(executablePath))
      if (target === cliEntry || options.force) {
        await rm(executablePath)
        return
      }
    }

    if (options.force) {
      await rm(executablePath, { recursive: true, force: true })
      return
    }

    throw new Error(`${executablePath} already exists. Re-run with --force to replace it.`)
  } catch (error) {
    if (isNodeError(error) && error.code === 'ENOENT') return
    throw error
  }
}

async function ensureBuiltCli() {
  if (options.dryRun) return

  try {
    await access(cliEntry, constants.R_OK)
  } catch (error) {
    if (isNodeError(error) && error.code === 'ENOENT') {
      throw new Error(`Missing ${cliEntry}. Run pnpm build before installing, or omit --skip-build.`)
    }
    throw error
  }
}

function defaultBinDir() {
  if (process.env.MOVSCRIPT_INSTALL_DIR) return process.env.MOVSCRIPT_INSTALL_DIR
  if (process.env.PNPM_HOME) return process.env.PNPM_HOME
  if (process.platform === 'win32' && process.env.APPDATA) return resolve(process.env.APPDATA, 'npm')
  return resolve(homedir(), '.local/bin')
}

function isOnPath(path) {
  const entries = (process.env.PATH ?? '').split(delimiter).filter(Boolean)
  return entries.some((entry) => resolve(entry) === path)
}

function run(command, args, cwd) {
  const display = `${command} ${args.join(' ')}`
  if (options.dryRun) {
    console.log(`[dry-run] ${display}`)
    return Promise.resolve()
  }

  return new Promise((resolveRun, rejectRun) => {
    const child = spawn(commandForPlatform(command), args, {
      cwd,
      stdio: 'inherit',
      shell: false,
    })
    child.on('error', rejectRun)
    child.on('exit', (code, signal) => {
      if (code === 0) {
        resolveRun()
        return
      }
      rejectRun(new Error(`${display} failed with ${signal ?? `exit code ${code}`}`))
    })
  })
}

function commandForPlatform(command) {
  return process.platform === 'win32' ? `${command}.cmd` : command
}

function escapeCmdPath(path) {
  return path.replace(/"/g, '""')
}

function parseArgs(args) {
  const parsed = {
    binDir: undefined,
    dryRun: false,
    force: false,
    help: false,
    skipBuild: false,
    skipDeps: false,
    uninstall: false,
  }

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index]
    if (arg === '--') {
      continue
    }
    if (arg === '--bin-dir') {
      const value = args[index + 1]
      if (!value) throw new Error('--bin-dir requires a path')
      parsed.binDir = value
      index += 1
    } else if (arg === '--dry-run') {
      parsed.dryRun = true
    } else if (arg === '--force') {
      parsed.force = true
    } else if (arg === '--help' || arg === '-h') {
      parsed.help = true
    } else if (arg === '--skip-build') {
      parsed.skipBuild = true
    } else if (arg === '--skip-deps') {
      parsed.skipDeps = true
    } else if (arg === '--uninstall') {
      parsed.uninstall = true
    } else {
      throw new Error(`Unknown option: ${arg}`)
    }
  }

  return parsed
}

function printHelp() {
  console.log(`Usage: node scripts/install-local.mjs [options]

Options:
  --bin-dir <path>  Install the ${commandName} command into a specific directory
  --dry-run         Print the work without changing files
  --force           Replace an existing command at the install path
  --skip-build      Link the existing dist output without running pnpm build
  --skip-deps       Skip pnpm install before building
  --uninstall       Remove the installed command
  -h, --help        Show this help
`)
}

function isNodeError(error) {
  return typeof error === 'object' && error !== null && 'code' in error
}
