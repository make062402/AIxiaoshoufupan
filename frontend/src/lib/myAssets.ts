import type { ScriptRecord } from '../types/types.ts'

export const SCRIPT_STAGES = ['开场破冰', '需求确认', '方案呈现', '异议处理', '下一步锁定'] as const

export function groupScripts(scripts: ScriptRecord[]) {
  return SCRIPT_STAGES.map((stage) => ({
    stage,
    scripts: scripts.filter((script) => script.stage === stage).sort((left, right) => left.id - right.id),
  }))
}

export function invalidScripts(scripts: ScriptRecord[]) {
  return scripts.filter((script) => !SCRIPT_STAGES.includes(script.stage as typeof SCRIPT_STAGES[number]))
}
