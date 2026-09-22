/**
 * 分销前台的接口出参形状。
 *
 * 为什么手抄而不 import server 文件：`report.service.ts` / `account.service.ts`
 * 都带 `server-only`，客户端组件一旦引用会把整包 Prisma 拖进浏览器构建并直接编译失败。
 * `contract.ts` 里已有的 DTO 直接复用，这里只补它没导出的两个列表行类型。
 */

/** 服务端 jsonPaginated 的信封（apiFetchRaw 直接拿到） */
export interface PaginationMeta {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface Paginated<T> {
  data: T[];
  pagination: PaginationMeta;
}

/** 对应 report.service.ts 的 MyCustomerRow（昵称/邮箱/手机号均已在服务端脱敏） */
export interface MyCustomerRow {
  customerId: string;
  name: string;
  email: string;
  phone: string;
  bindTime: string;
  source: string | null;
  orderCount: number;
  spentCny: number;
  myCommissionCny: number;
}

/** 对应 account.service.ts 的 WithdrawRow（本人视角，accountInfo 只回显尾号） */
export interface WithdrawRow {
  id: string;
  amount: number;
  status: string;
  accountInfo: string | null;
  remark: string | null;
  auditNote: string | null;
  payNote: string | null;
  createdAt: string;
  auditedAt: string | null;
  paidAt: string | null;
}

/** 对应 getMySubordinates 的 direct 项 */
export interface SubordinateRow {
  userId: string;
  name: string;
  email: string;
  joinedAt: string;
  level: number;
  bindCount: number;
  isDistributor: boolean;
}

export interface SubordinatesResponse {
  direct: SubordinateRow[];
  indirect: { count: number };
  teamCount: number;
}

/** 对应 getTeamStats 的出参 */
export interface TeamStatsResponse {
  days: number;
  totalOrders: number;
  totalSalesCny: number;
  myTotalCommissionCny: number;
  series: { date: string; orders: number; salesCny: number; commissionCny: number }[];
}
