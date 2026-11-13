/** Copy of the digital-employee cards and page. */
import type {} from '@deepseek-ai/dsh-client-ui-slots'

/** Locale namespace of the cards. */
export const NS = 'mindeckEmployees'

/** English dictionary. */
export const en = {
  title: 'Who can help?',
  generalName: 'General assistant',
  generalTagline: 'Writing, analysis, research, files: ask anything',
  draft: 'Draft',
  showAll: 'All digital employees',
  starters: 'Try asking',
  selectRefused: 'Could not switch to {name}: {reason}',
  panel: 'Digital employees',
  pageIntro: 'Pick a digital employee to start a new conversation. A suggested question goes into the message box without being sent.',
  startWith: 'Start a conversation with {name}',
  start: 'Start conversation',
  generalStarter1: 'Write a work email for me',
  generalStarter2: 'Make this text clearer and more formal',
  generalStarter3: 'Turn my meeting notes into a to-do list',
}

/** Key of one card string. */
export type MindeckEmployeesKey = keyof typeof en

/** Chinese dictionary. */
export const zh: Record<MindeckEmployeesKey, string> = {
  title: '找谁帮忙？',
  generalName: '通用助手',
  generalTagline: '写作、分析、整理资料、处理文件，什么都可以问',
  draft: '草稿',
  showAll: '全部数字员工',
  starters: '可以这样问',
  selectRefused: '无法切换到“{name}”：{reason}',
  panel: '数字员工',
  pageIntro: '选一位数字员工开始新对话。点开场问题会填进输入框，由你确认后再发送。',
  startWith: '与“{name}”开始新对话',
  start: '开始对话',
  generalStarter1: '帮我写一封工作邮件',
  generalStarter2: '把这段文字改得更通顺、更正式',
  generalStarter3: '把会议记录整理成待办清单',
}

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** The digital-employee cards on the new-conversation screen and the digital-employee page. */
    mindeckEmployees: MindeckEmployeesKey
  }
}
