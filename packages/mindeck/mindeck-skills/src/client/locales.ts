/** Skills page copy, owned by the page. */
import type {} from '@deepseek-ai/dsh-client-ui-slots'

/** Locale namespace of the page. */
export const NS = 'mindeckSkills'

/** English page dictionary. */
export const en = {
  title: 'Skills',
  intro: '{company} provides {count} skills for you. Use one to start a new conversation, or type / in any conversation.',
  introPending: 'Use a skill to start a new conversation, or type / in any conversation.',
  searchPlaceholder: 'Search names, categories, or pinyin',
  clearSearch: 'Clear search',
  recommended: 'Recommended by your company',
  other: 'Other',
  use: 'Use',
  useSkill: 'Use {name}',
  preview: 'View instructions',
  previewSkill: 'View instructions for {name}',
  close: 'Close',
  instructionsTitle: 'Instructions for {name}',
  instructionsLoading: 'Reading the instructions',
  instructionsMissing: 'This skill is no longer on this computer. Try again in a moment.',
  instructionsFailed: 'The instructions cannot be read right now.',
  instructionsEmpty: 'This skill has no written instructions.',
  retry: 'Try again',
  copy: 'Copy',
  copied: 'Copied',
  codeBlock: 'Code',
  wrap: 'Wrap lines',
  unwrap: 'Do not wrap lines',
  footnotes: 'Footnotes',
  signedOut: 'Sign in to Mindeck to use your company\'s skills.',
  noCompanySkills: 'Your company has not set up skills for you yet.',
  noCompanySkillsHint: 'Once an administrator adds skills in Mindeck Cloud, they appear here.',
  noResults: 'No skills match "{query}".',
  loading: 'Loading skills',
  unavailable: 'The skill list cannot be read right now. Try again later.',
}

/** Key of one page string. */
export type MindeckSkillsKey = keyof typeof en

/** Chinese page dictionary. */
export const zh: Record<MindeckSkillsKey, string> = {
  title: '技能',
  intro: '{company}为你配置了 {count} 个技能。点“使用”即可新开对话，在任意对话中输入“/”也能找到它们。',
  introPending: '点“使用”即可新开对话，在任意对话中输入“/”也能找到技能',
  searchPlaceholder: '搜索名称、分类或拼音',
  clearSearch: '清除搜索',
  recommended: '公司推荐',
  other: '其他',
  use: '使用',
  useSkill: '使用“{name}”',
  preview: '查看说明',
  previewSkill: '查看“{name}”的说明',
  close: '关闭',
  instructionsTitle: '“{name}”的说明',
  instructionsLoading: '正在读取说明',
  instructionsMissing: '这个技能已不在这台电脑上，请稍后再试',
  instructionsFailed: '说明暂时无法读取',
  instructionsEmpty: '这个技能没有写说明',
  retry: '重试',
  copy: '复制',
  copied: '已复制',
  codeBlock: '代码',
  wrap: '自动换行',
  unwrap: '取消自动换行',
  footnotes: '脚注',
  signedOut: '登录 Mindeck 后即可使用公司技能',
  noCompanySkills: '公司还没有为你配置技能',
  noCompanySkillsHint: '管理员在 Mindeck Cloud 添加技能后，会显示在这里',
  noResults: '没有与“{query}”匹配的技能',
  loading: '正在加载技能',
  unavailable: '技能列表暂时无法读取，请稍后再试',
}

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** The Mindeck skills page. */
    mindeckSkills: MindeckSkillsKey
  }
}
