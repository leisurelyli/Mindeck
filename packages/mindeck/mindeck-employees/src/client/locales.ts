/** Copy of the digital-employee page. */
import type {} from '@deepseek-ai/dsh-client-ui-slots'

/** Locale namespace of the page. */
export const NS = 'mindeckEmployees'

/** English dictionary. */
export const en = {
  generalName: 'General assistant',
  generalTagline: 'Writing, analysis, research, files: ask anything',
  draft: 'Draft',
  starters: 'Try asking',
  panel: 'Digital employees',
  pageIntro: 'Pick a digital employee to start a new conversation. A suggested question goes into the message box without being sent.',
  startWith: 'Start a conversation with {name}',
  start: 'Start conversation',
  generalStarter1: 'Write a work email for me',
  generalStarter2: 'Make this text clearer and more formal',
  generalStarter3: 'Turn my meeting notes into a to-do list',
  details: 'About {name}',
  folders: 'Files',
  folderSeparator: ', ',
  folderNoAccess: '{label} (no access for you)',
  folderTitle: '{label}: {path}',
  model: 'Model',
}

/** Key of one page string. */
export type MindeckEmployeesKey = keyof typeof en

/** Chinese dictionary. */
export const zh: Record<MindeckEmployeesKey, string> = {
  generalName: '通用助手',
  generalTagline: '写作、分析、整理资料、处理文件，什么都可以问',
  draft: '草稿',
  starters: '可以这样问',
  panel: '数字员工',
  pageIntro: '选一位数字员工开始新对话。点开场问题会填进输入框，由你确认后再发送。',
  startWith: '与“{name}”开始新对话',
  start: '开始对话',
  generalStarter1: '帮我写一封工作邮件',
  generalStarter2: '把这段文字改得更通顺、更正式',
  generalStarter3: '把会议记录整理成待办清单',
  details: '“{name}”的资料和模型',
  folders: '资料',
  folderSeparator: '、',
  folderNoAccess: '{label}（你暂无权限）',
  folderTitle: '{label}：{path}',
  model: '模型',
}

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** The digital-employee page. */
    mindeckEmployees: MindeckEmployeesKey
  }
}
