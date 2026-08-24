/**
 * 日期快捷项工具（UX04）。
 *
 * 只做本地时区的纯计算，不修改任何数据。datetime-local 的值是本地时间字符串
 * （YYYY-MM-DDTHH:mm），date 的值是 YYYY-MM-DD，二者都不带时区，必须用本地
 * 时区的 getFullYear/getMonth/getDate 拼装，避免用 toISOString 造成日期偏移。
 */

function pad(value: number): string {
  return String(value).padStart(2, '0')
}

/** Date → 本地时区 YYYY-MM-DD */
export function toDateKey(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

/** Date → 本地时区 YYYY-MM-DDTHH:mm（datetime-local 的 value） */
export function toDateTimeLocalValue(date: Date): string {
  return `${toDateKey(date)}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

/** 明天 */
export function addDays(date: Date, days: number): Date {
  const next = new Date(date)
  next.setDate(next.getDate() + days)
  return next
}

/** 下周一（下周第一个工作日语义；若今天是周一，则返回 7 天后） */
export function nextMonday(date: Date): Date {
  const day = date.getDay() // 0 周日，1 周一
  const daysUntilMonday = day === 1 ? 7 : ((8 - day) % 7) || 7
  return addDays(date, daysUntilMonday)
}

/**
 * 新建拜访的默认时间：本地“当天的下一个整点”。
 * 若今天已经接近尾声（不足 1 小时到 24:00），则顺延到明天上午 9:00，
 * 保证默认值不会落在过去。
 */
export function defaultVisitTime(now = new Date()): Date {
  const candidate = new Date(now)
  candidate.setMinutes(0, 0, 0)
  candidate.setHours(candidate.getHours() + 1)
  if (candidate.getDate() !== now.getDate()) {
    // 跨到了明天，改为明天上午 9:00
    const tomorrow = addDays(now, 1)
    tomorrow.setHours(9, 0, 0, 0)
    return tomorrow
  }
  return candidate
}

export interface QuickDateOption {
  key: 'today' | 'tomorrow' | 'nextWeek'
  label: string
  value: Date
}

/** 今天 / 明天 / 下周 三个快捷项，保持与 now 同一时刻的时、分。 */
export function quickDateOptions(now = new Date()): QuickDateOption[] {
  const tomorrow = addDays(now, 1)
  return [
    { key: 'today', label: '今天', value: new Date(now) },
    { key: 'tomorrow', label: '明天', value: tomorrow },
    { key: 'nextWeek', label: '下周', value: nextMonday(now) },
  ]
}
