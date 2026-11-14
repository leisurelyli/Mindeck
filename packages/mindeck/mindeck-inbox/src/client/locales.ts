/** Company messages copy, owned by the page and its sidebar row. */
import type {} from '@deepseek-ai/dsh-client-ui-slots'

/** Locale namespace of the company messages UI. */
export const NS = 'mindeckInbox'

/** English dictionary. */
export const en = {
  /** BCP 47 tag that formats times and month names on the page. */
  timeLocale: 'en-US',
  title: 'Company messages',
  intro: 'Announcements from your company, and notices about your own requests such as quota requests and feedback.',
  unreadBadge: '{count} unread',
  unreadVersionBadge: '{count} unread, new version available',
  versionBadge: 'New version available',
  markAllRead: 'Mark all as read',
  loading: 'Loading messages',
  emptyTitle: 'No messages yet',
  emptyHint: 'Company announcements and the results of your requests appear here.',
  unreachableTitle: 'Can\'t reach your company\'s server',
  unreachableHint: 'Messages refresh on their own once the connection is back.',
  failedTitle: 'Messages didn\'t load',
  failedHint: 'Try again in a moment.',
  requestId: 'Request ID: {id}',
  staleUnreachable: 'Can\'t reach your company\'s server. These are the messages loaded last time.',
  staleFailed: 'The latest messages didn\'t load. These are the messages loaded last time.',
  retry: 'Try again',
  loadMore: 'Show earlier messages',
  loadingMore: 'Loading…',
  important: 'Important',
  unread: 'Unread',
  openLink: 'View details',
  kindAnnouncement: 'Announcement',
  kindQuota: 'Quota request',
  kindFeedback: 'Feedback',
  kindHandover: 'Handover',
  kindOther: 'Notice',
  today: 'Today {time}',
  yesterday: 'Yesterday {time}',
  thisYear: '{monthName} {day}',
  otherYear: '{monthName} {day}, {year}',
  versionTitle: 'Mindeck {version} is available',
  versionCurrent: 'Your company recommends this version. You have {current}.',
  versionDownload: 'Download {version}',
  versionNoDownload: 'Ask an administrator for the installer for this computer: {contact}.',
  versionNoDownloadFallback: 'Ask the administrator who set up your account for the installer for this computer.',
}

/** Key domain of the dictionary. */
export type MindeckInboxKey = keyof typeof en

/** Chinese dictionary. */
export const zh: Record<MindeckInboxKey, string> = {
  timeLocale: 'zh-CN',
  title: '企业消息',
  intro: '企业发布的公告，以及提额申请、反馈处理等与你有关的通知。',
  unreadBadge: '{count} 条未读',
  unreadVersionBadge: '{count} 条未读，有新版本',
  versionBadge: '有新版本',
  markAllRead: '全部标为已读',
  loading: '正在加载消息',
  emptyTitle: '暂时没有消息',
  emptyHint: '企业发布公告，或你的申请有结果时，会显示在这里',
  unreachableTitle: '暂时连不上企业服务器',
  unreachableHint: '网络恢复后会自动刷新',
  failedTitle: '消息没有加载出来',
  failedHint: '请稍后重试',
  requestId: '请求编号：{id}',
  staleUnreachable: '暂时连不上企业服务器，下面是上次加载的消息',
  staleFailed: '最新消息没有加载出来，下面是上次加载的消息',
  retry: '重试',
  loadMore: '查看更早的消息',
  loadingMore: '正在加载…',
  important: '重要',
  unread: '未读',
  openLink: '查看详情',
  kindAnnouncement: '公告',
  kindQuota: '提额申请',
  kindFeedback: '反馈',
  kindHandover: '交接',
  kindOther: '通知',
  today: '今天 {time}',
  yesterday: '昨天 {time}',
  thisYear: '{month} 月 {day} 日',
  otherYear: '{year} 年 {month} 月 {day} 日',
  versionTitle: 'Mindeck {version} 已发布',
  versionCurrent: '企业推荐使用这个版本，你现在用的是 {current}。',
  versionDownload: '下载 {version}',
  versionNoDownload: '这台电脑的安装包请联系管理员索取：{contact}。',
  versionNoDownloadFallback: '这台电脑的安装包请联系给你开通账号的管理员索取。',
}

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** The Mindeck company messages page and its sidebar row. */
    mindeckInbox: MindeckInboxKey
  }
}
