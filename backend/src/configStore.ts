import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'
import { readFileSync, renameSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

export interface DifyConfigStatus {
  configured: boolean
  masked: string | null
  adminProtected: boolean
}

const ENV_KEY = 'DIFY_API_KEY'

export function getDifyConfigStatus(): DifyConfigStatus {
  const configured = Boolean(process.env[ENV_KEY]?.trim())
  return {
    configured,
    masked: configured ? '••••••••' : null,
    adminProtected: Boolean(process.env.CONFIG_ADMIN_TOKEN),
  }
}

export function isAuthorizedAdmin(candidate: string | undefined): boolean {
  const expected = process.env.CONFIG_ADMIN_TOKEN
  if (!expected || !candidate) return false
  const digest = (value: string) => createHash('sha256').update(value).digest()
  return timingSafeEqual(digest(expected), digest(candidate))
}

export function validateDifyApiKey(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const key = value.trim()
  if (key.length < 8 || key.length > 512 || /\s|[\x00-\x1F\x7F]/.test(key)) return null
  return key
}

function serializeEnvValue(value: string) {
  return JSON.stringify(value)
}

export function persistDifyApiKey(key: string) {
  const envFile = resolve(process.env.CONFIG_ENV_FILE ?? '.env')
  let current = ''
  try { current = readFileSync(envFile, 'utf8') } catch (error) {
    if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) throw error
  }

  const replacement = `${ENV_KEY}=${serializeEnvValue(key)}`
  const lines = current.split(/\r?\n/)
  let replaced = false
  const nextLines = lines.map((line) => {
    if (!/^\s*DIFY_API_KEY\s*=/.test(line)) return line
    if (replaced) return null
    replaced = true
    return replacement
  }).filter((line): line is string => line !== null)
  if (!replaced) nextLines.push(replacement)

  const next = `${nextLines.join('\n').replace(/^\n+|\n+$/g, '')}\n`
  const temporary = `${envFile}.tmp-${process.pid}-${randomBytes(6).toString('hex')}`
  writeFileSync(temporary, next, { encoding: 'utf8', mode: 0o600 })
  renameSync(temporary, envFile)
  process.env[ENV_KEY] = key
}
