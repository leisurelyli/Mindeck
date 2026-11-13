/** Typed product text for Mindeck brand presentation. */

/** Chinese dictionary defining the brand key set. */
export const zh = {
  'brand.name': '{productName}',
} satisfies Record<string, string>

/** Product text keys accepted by the Mindeck namespace. */
export type MindeckKey = keyof typeof zh

/** English dictionary with the same product name. */
export const en = {
  'brand.name': '{productName}',
} satisfies Record<MindeckKey, string>

/**
 * Shared conversation copy that Mindeck words for office work: the empty-conversation headline, its badge, and the
 * composer hints, with full-width punctuation in Chinese.
 */
export const conversation = {
  zh: {
    'hero.headline': '开始今天的工作',
    'hero.preview': '企业版',
    'placeholder.hero': '描述要完成的工作，输入 / 调用技能与指令，@ 引用文件或对话',
    'placeholder.default': '发消息或布置任务，输入 / 调用技能与指令，@ 引用文件或对话',
  },
  en: {
    'hero.headline': "Start today's work",
    'hero.preview': 'Enterprise',
    'placeholder.hero': 'Describe the work to get done, / for skills and commands, @ to reference files or sessions',
    'placeholder.default': 'Message or assign a task, / for skills and commands, @ to reference files or sessions',
  },
} as const

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** Mindeck brand text and accessible image names. */
    mindeck: MindeckKey
  }
}
