/** Agent preset definitions of the general assistant and the digital employees, built on a base preset's plugin rows. */
import type { PresetDefinition } from '@deepseek-ai/dsh-agent-preset-registry'
import type { CachedEmployee } from './cache.ts'
import type { CloudEmployee } from './cloud.ts'

/** Preset id of the built-in general assistant. */
export const GENERAL_PRESET_ID = 'mindeck-general'

/** Prefix of a digital employee's preset id; the Cloud employee id follows it. */
export const EMPLOYEE_PRESET_PREFIX = 'mindeck-employee-'

/** Plugin name of the row whose config carries a preset's persona. */
export const PERSONA_PLUGIN = '@deepseek-ai/dsh-persona'

/** Plugin rows of one preset, as the registry accepts them. */
export type PresetRows = PresetDefinition['plugins']

/** Roster order of the general assistant, before the base presets (`standard` is 1). */
const GENERAL_ORDER = 0
/** Roster order of the first current employee; the others follow in Cloud order. */
const EMPLOYEE_ORDER = 10
/** Roster order of the first retired employee, after every current one. */
const RETIRED_ORDER = 100_000

/**
 * Name a digital employee's agent preset.
 * @param employeeId - Mindeck Cloud employee id.
 * @returns the employee's agent preset id.
 */
export function employeePresetId(employeeId: string): string {
  return `${EMPLOYEE_PRESET_PREFIX}${employeeId}`
}

/**
 * Break every `{{` and `}}` in text from Mindeck Cloud. A persona is a prompt template whose `{{…}}` groups
 * resolve strictly and which has no escape syntax, so Cloud text must not form a group.
 * @param text - text the company wrote.
 * @returns the text with a space between adjacent braces.
 */
export function promptSafe(text: string): string {
  return text.replace(/\{(?=\{)/gu, '{ ').replace(/\}(?=\})/gu, '} ')
}

/**
 * The persona prefix of one digital employee, in the model's terms: who it is, what the role covers, the
 * company's instructions verbatim, and the suggested skills.
 * @param employee - the employee's name, tagline, instructions, and suggested skills.
 * @returns the prefix template; `{{model}}` is its only variable.
 */
export function employeePersona(employee: Pick<CloudEmployee, 'name' | 'tagline' | 'instructions' | 'skills'>): string {
  const tagline = employee.tagline === '' ? '' : ` Your role: ${promptSafe(employee.tagline)}`
  const paragraphs = [
    `You are "${promptSafe(employee.name)}", a digital employee of the user's company, powered by the {{model}} model.${tagline}`,
  ]
  if (employee.instructions !== '') {
    paragraphs.push('The company\'s instructions for this role:', promptSafe(employee.instructions))
  }
  if (employee.skills.length > 0) {
    const skills = employee.skills.map(skill => `/${skill}`).join(', ')
    paragraphs.push(`The company suggests these skills for this role: ${skills}. Use them when they fit the task.`)
  }
  return paragraphs.join('\n\n')
}

/**
 * Replace the persona of a plugin list: every top-level persona row gets `{ prefix }` as its whole config, and a
 * list without one gets a persona row first. Other rows stay as they are.
 * @param rows - the base preset's rows.
 * @param prefix - the persona prefix template.
 * @returns the rows with the persona.
 */
export function withPersona(rows: PresetRows, prefix: string): PresetRows {
  const config = { prefix }
  if (!rows.some(row => row.name === PERSONA_PLUGIN)) return [{ id: 'persona', name: PERSONA_PLUGIN, config }, ...rows]
  return rows.map(row => row.name === PERSONA_PLUGIN ? { ...row, config } : row)
}

/**
 * Define the general assistant's preset.
 * @param rows - the base preset's rows.
 * @param persona - the deployment's general persona prefix.
 * @returns the general assistant's preset.
 */
export function generalDefinition(rows: PresetRows, persona: string): PresetDefinition {
  return {
    id: GENERAL_PRESET_ID, name: '通用助手', description: '写作、分析、整理资料、处理文件，什么都可以问。',
    order: GENERAL_ORDER, plugins: withPersona(rows, persona),
  }
}

/**
 * Define one digital employee's preset, named and ordered by whether it is a draft or retired.
 * @param rows - the base preset's rows.
 * @param employee - the cached employee.
 * @param index - its position among the member's employees, current ones first.
 * @returns the employee's preset; a retired employee keeps its persona so earlier conversations continue unchanged, and
 * is unlisted so the preset picker no longer offers it for new conversations.
 */
export function employeeDefinition(rows: PresetRows, employee: CachedEmployee, index: number): PresetDefinition {
  const plugins = withPersona(rows, employeePersona(employee))
  const id = employeePresetId(employee.id)
  if (employee.retired) {
    return {
      id, name: `${employee.name}（已停用）`, description: '管理员已停用这位数字员工，可以继续之前的对话。',
      order: RETIRED_ORDER + index, listed: false, plugins,
    }
  }
  return {
    id, name: employee.draft ? `${employee.name}（草稿）` : employee.name,
    ...employee.tagline === '' ? {} : { description: employee.tagline },
    order: EMPLOYEE_ORDER + index, plugins,
  }
}
