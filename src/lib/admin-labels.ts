/**
 * 后台管理 - 状态/枚举文案中文映射
 *
 * 设计原则：
 *   - 后台统一中文，运营人员是中国团队
 *   - 不走 i18n 表（admin-i18n 表保留给需要切换英文的场景，但默认 lang=zh 时永远命中 zh 分支）
 *   - 集中维护：新增枚举/状态时在这里加一行，全站统一
 */

export const PRODUCT_STATUS_LABELS = {
  DRAFT: "草稿",
  ACTIVE: "已上架",
  ARCHIVED: "已归档",
} as const;

export const ORDER_STATUS_LABELS = {
  PENDING_PAYMENT: "待支付",
  PAID: "已支付",
  PROCESSING: "处理中",
  SHIPPED: "已发货",
  DELIVERED: "已送达",
  CANCELLED: "已取消",
  REFUNDED: "已退款",
} as const;

export const ORDER_STATUS_COLORS = {
  PENDING_PAYMENT: "warning",
  PAID: "info",
  PROCESSING: "info",
  SHIPPED: "primary",
  DELIVERED: "success",
  CANCELLED: "muted",
  REFUNDED: "destructive",
} as const;

export const REFUND_STATUS_LABELS = {
  REQUESTED: "待审核",
  APPROVED: "已批准",
  REJECTED: "已拒绝",
  REFUNDED: "已退款",
} as const;

export const COUPON_TYPE_LABELS = {
  PERCENTAGE: "百分比折扣",
  FIXED: "固定金额",
  FREE_SHIPPING: "免运费",
} as const;

export const USER_STATUS_LABELS = {
  ACTIVE: "正常",
  DISABLED: "已停用",
} as const;

export const USER_ROLE_LABELS = {
  ADMIN: "管理员",
  SUPPORT: "客服",
  CUSTOMER: "顾客",
} as const;

export const PAYMENT_GATEWAY_STATUS_LABELS = {
  ACTIVE: "已启用",
  DISABLED: "已停用",
} as const;

export const NOTIFY_ME_STATUS_LABELS = {
  PENDING: "待通知",
  NOTIFIED: "已通知",
  CONVERTED: "已转化",
} as const;

/** 后台操作类型的友好中文（审计日志/事件流用） */
export const AUDIT_ACTION_LABELS: Record<string, string> = {
  CREATE: "创建",
  UPDATE: "更新",
  DELETE: "删除",
  LOGIN: "登录",
  LOGOUT: "登出",
  REFUND: "退款",
  SHIP: "发货",
  CANCEL: "取消",
  ACTIVATE: "启用",
  DEACTIVATE: "停用",
};

/** 通用 UI 文案（按钮 / 状态 / 提示） */
export const COMMON_LABELS = {
  // 操作
  save: "保存",
  cancel: "取消",
  confirm: "确认",
  delete: "删除",
  edit: "编辑",
  create: "新建",
  update: "更新",
  submit: "提交",
  back: "返回",
  next: "下一步",
  previous: "上一步",
  search: "搜索",
  filter: "筛选",
  reset: "重置",
  export: "导出",
  import: "导入",
  refresh: "刷新",
  view: "查看",
  close: "关闭",
  open: "打开",
  upload: "上传",
  download: "下载",
  copy: "复制",
  paste: "粘贴",
  selectAll: "全选",
  deselectAll: "取消全选",
  // 状态
  loading: "加载中…",
  saving: "保存中…",
  deleting: "删除中…",
  submitting: "提交中…",
  success: "操作成功",
  failed: "操作失败",
  noData: "暂无数据",
  noResults: "未找到匹配结果",
  // 提示
  confirmDelete: "确认删除？此操作不可撤销。",
  unsavedChanges: "有未保存的修改，确定离开？",
  networkError: "网络异常，请稍后重试",
  serverError: "服务器异常，请稍后重试",
  forbidden: "无权访问此页面",
  notFound: "页面不存在",
} as const;

export type CommonLabelKey = keyof typeof COMMON_LABELS;
