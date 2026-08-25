/** 统一 API 响应类型 */

export interface ApiResponse<T> {
  data: T;
}

export interface Paginated<T> {
  data: T[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
}

export interface ApiErrorBody {
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}

export interface SessionUser {
  id: string;
  email: string;
  name: string;
  role: "ADMIN" | "CUSTOMER" | "SUPPORT";
  status: "ACTIVE" | "DISABLED";
  emailVerified: boolean;
}
