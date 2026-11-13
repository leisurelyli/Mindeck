/** Copy of the digital-employee cards, owned by the cards. */
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
  showFewer: 'Show fewer',
  starters: 'Try asking',
  selectRefused: 'Could not switch to {name}: {reason}',
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
  showFewer: '收起',
  starters: '可以这样问',
  selectRefused: '无法切换到“{name}”：{reason}',
}

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** The digital-employee cards on the new-conversation screen. */
    mindeckEmployees: MindeckEmployeesKey
  }
}
