/** Skills page copy, owned by the page. */
import type {} from '@deepseek-ai/dsh-client-ui-slots'

/** Locale namespace of the page. */
export const NS = 'mindeckSkills'

/** English page dictionary. */
export const en = {
  title: 'Skills',
  guideDescription: 'Browse the skills your company provides and use one in the conversation.',
  searchPlaceholder: 'Search skills',
  hint: 'Click a skill to put it in the message box, or type / in the message box.',
  provided: '{company} provides {count} skills for you',
  recommended: 'Recommended',
  other: 'Other',
  builtIn: 'Built into Mindeck',
  preview: 'View instructions',
  use: 'Use in the message box',
  used: 'Put in the message box',
  useFailed: 'Open a conversation first',
  signedOut: 'Sign in to Mindeck to use your company\'s skills.',
  noCompanySkills: 'Your company has not set up skills for you yet.',
  noResults: 'No skills match.',
  loading: 'Loading…',
  unavailable: 'The skill list cannot be read right now.',
}

/** Key of one page string. */
export type MindeckSkillsKey = keyof typeof en

/** Chinese page dictionary. */
export const zh: Record<MindeckSkillsKey, string> = {
  title: '技能',
  guideDescription: '查看公司为你配置的技能，单击即可在对话中使用。',
  searchPlaceholder: '搜索名称、分类或拼音',
  hint: '单击技能放入输入框，也可以在输入框输入“/”查找。',
  provided: '{company}为你提供 {count} 个技能',
  recommended: '推荐',
  other: '其他',
  builtIn: 'Mindeck 内置',
  preview: '查看说明',
  use: '在输入框中使用',
  used: '已放入输入框',
  useFailed: '请先打开一个对话',
  signedOut: '登录 Mindeck 后即可使用公司技能。',
  noCompanySkills: '公司还没有为你配置技能。',
  noResults: '没有匹配的技能。',
  loading: '正在加载…',
  unavailable: '技能列表暂时无法读取。',
}

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** The Mindeck skills page. */
    mindeckSkills: MindeckSkillsKey
  }
}
