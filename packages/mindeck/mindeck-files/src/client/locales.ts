/** File-library panel copy, owned by the panel. */
import type {} from '@deepseek-ai/dsh-client-ui-slots'

/** Locale namespace of the panel. */
export const NS = 'mindeckFiles'

/** English panel dictionary. */
export const en = {
  title: 'File library',
  guideDescription: 'Browse company and department files and add them to the conversation.',
  root: 'File library',
  personal: 'My files',
  shares: 'Shared with me',
  searchPlaceholder: 'Search file names',
  clearSearch: 'Clear search',
  back: 'Back',
  refresh: 'Refresh',
  openInBrowser: 'Open in browser',
  openInBrowserHint: 'Preview, versions, and sharing are in the browser.',
  addToConversation: 'Add to conversation',
  hint: 'Click a file to add it to the conversation. Drop files from your computer into a folder to upload them.',
  upload: 'Upload files',
  dropHere: 'Drop to upload to {folder}',
  uploading: 'Uploading files ({count})…',
  uploaded: 'Files uploaded: {count}',
  uploadFailed: '{name} was not uploaded. {reason}',
  uploadConflicts: 'Files not uploaded because the name is taken: {count}',
  replaceAll: 'Replace them',
  dismiss: 'Dismiss',
  exists: 'A file with this name already exists.',
  quota: 'The space is full.',
  tooLarge: 'The file is larger than the upload limit.',
  unreadable: 'The file could not be read from this computer.',
  added: 'Added to the message',
  addFailed: 'Open a conversation first',
  readOnly: 'Read-only',
  empty: 'This folder is empty.',
  noSpaces: 'No spaces are available to you yet.',
  noResults: 'No file names match.',
  searching: 'Searching…',
  loading: 'Loading…',
  retry: 'Try again',
  signedOut: 'Sign in to Mindeck to use the file library.',
  notConfigured: 'Your company has not enabled the file library.',
  notFound: 'This folder no longer exists.',
  denied: 'You do not have access to this folder.',
  unavailable: 'The file library is not responding. Try again later.',
  failed: 'Something went wrong. Try again.',
} as const

/** Panel locale keys. */
export type MindeckFilesKey = keyof typeof en

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap { mindeckFiles: MindeckFilesKey }
}

/** Chinese panel dictionary. */
export const zh: Record<MindeckFilesKey, string> = {
  title: '资源库',
  guideDescription: '浏览公司和部门的文件，并加入对话。',
  root: '资源库',
  personal: '我的文件',
  shares: '共享给我',
  searchPlaceholder: '搜索文件名',
  clearSearch: '清除搜索',
  back: '返回',
  refresh: '刷新',
  openInBrowser: '在浏览器中打开',
  openInBrowserHint: '预览、历史版本和分享请在浏览器中进行。',
  addToConversation: '加入对话',
  hint: '单击文件即可加入对话；把电脑上的文件拖进文件夹即可上传。',
  upload: '上传文件',
  dropHere: '松开即可上传到“{folder}”',
  uploading: '正在上传 {count} 个文件…',
  uploaded: '已上传 {count} 个文件',
  uploadFailed: '“{name}”未上传。{reason}',
  uploadConflicts: '有 {count} 个同名文件未上传。',
  replaceAll: '全部替换',
  dismiss: '关闭',
  exists: '已有同名文件。',
  quota: '空间容量不足。',
  tooLarge: '文件超过上传上限。',
  unreadable: '无法从这台电脑读取这个文件。',
  added: '已加入消息',
  addFailed: '请先打开一个对话',
  readOnly: '只读',
  empty: '这个文件夹是空的。',
  noSpaces: '暂时没有你可以使用的空间。',
  noResults: '没有匹配的文件名。',
  searching: '正在搜索…',
  loading: '正在加载…',
  retry: '重试',
  signedOut: '登录 Mindeck 后即可使用资源库。',
  notConfigured: '公司尚未启用资源库。',
  notFound: '这个文件夹已不存在。',
  denied: '你没有这个文件夹的访问权限。',
  unavailable: '资源库暂时无法访问，请稍后重试。',
  failed: '操作失败，请重试。',
}
