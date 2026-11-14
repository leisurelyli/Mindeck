/** Agent preset definitions of the general assistant and the digital employees, built on a base preset's plugin rows. */
import type { PresetDefinition } from '@deepseek-ai/dsh-agent-preset-registry'
import type { CachedEmployee } from './cache.ts'
import type { CloudEmployee, EmployeeFolder } from './cloud.ts'

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
 * The library path the file-library tools use for a folder Mindeck Cloud names by its space and folder names.
 * @param path - space and folder names joined with ` / `, such as `企业空间 / 制度文件`.
 * @returns the library path, such as `/企业空间/制度文件`.
 */
export function libraryFolderPath(path: string): string {
  return `/${path.split(' / ').map(part => part.trim()).filter(part => part !== '').join('/')}`
}

/**
 * The paragraph that sends the model to an employee's library folders before it answers from memory.
 * @param folders - the employee's folders.
 * @returns the paragraph, or undefined without folders.
 */
function libraryParagraph(folders: readonly EmployeeFolder[]): string | undefined {
  if (folders.length === 0) return undefined
  return [
    'The company keeps the material for this role in these file library folders:',
    ...folders.map(folder => `- ${promptSafe(folder.label)}: folder "${promptSafe(libraryFolderPath(folder.path))}"`),
    'Before answering a question this material may cover, search it with library_search, setting folder to one of '
    + 'these folders, instead of answering from memory. Read the files you find with library_download, name the files '
    + 'your answer relies on, and say so when the material does not cover the question.',
  ].join('\n')
}

/**
 * The persona prefix of one digital employee, in the model's terms: who it is, what the role covers, the
 * company's instructions verbatim, the suggested skills, and the library folders to consult.
 * @param employee - the employee's name, tagline, instructions, suggested skills, and folders.
 * @returns the prefix template; `{{model}}` is its only variable.
 */
export function employeePersona(employee: Pick<CloudEmployee, 'name' | 'tagline' | 'instructions' | 'skills' | 'folders'>): string {
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
  const library = libraryParagraph(employee.folders)
  if (library !== undefined) paragraphs.push(library)
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
 * @returns the general assistant's preset, named and described in English and Chinese.
 */
export function generalDefinition(rows: PresetRows, persona: string): PresetDefinition {
  return {
    id: GENERAL_PRESET_ID,
    name: { en: 'General assistant', zh: '通用助手' },
    description: { en: 'Writing, analysis, research, files: ask anything.', zh: '写作、分析、整理资料、处理文件，什么都可以问。' },
    order: GENERAL_ORDER, plugins: withPersona(rows, persona),
  }
}

/**
 * Define one digital employee's preset, named and ordered by whether it is a draft or retired. The Cloud name and
 * tagline stay as written; the draft and retired suffixes and the retired description come in English and Chinese.
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
      id,
      name: { en: `${employee.name} (deactivated)`, zh: `${employee.name}（已停用）` },
      description: {
        en: 'An administrator deactivated this digital employee. Earlier conversations can continue.',
        zh: '管理员已停用这位数字员工，可以继续之前的对话。',
      },
      order: RETIRED_ORDER + index, listed: false, plugins,
    }
  }
  return {
    id, name: employee.draft ? { en: `${employee.name} (draft)`, zh: `${employee.name}（草稿）` } : employee.name,
    ...employee.tagline === '' ? {} : { description: employee.tagline },
    order: EMPLOYEE_ORDER + index, plugins,
  }
}
