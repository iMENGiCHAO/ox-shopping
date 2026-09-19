/**
 * next/* 模块类型声明 shim（typecheck 专用）
 *
 * 背景：本项目内置的 Next.js 16 产物（内部版）未为公共入口（next/server、
 * next/headers、next/link 等）附带 .d.ts 声明文件，package.json exports 亦为空，
 * tsc（bundler 解析）因此整批报错 TS7016，CI 交付阶段整体失败。
 *
 * 本文件按代码库实际用到的公开 API 逐一生成宽松声明：
 * - 只影响 typecheck，不改运行时与 bundle 内容
 * - 具名与默认导出齐备（Link/Image 默认导出；NextRequest/NextResponse/redirect 等具名导出）
 * - 若未来换用带完整类型的官方 next 发行版，删除本文件即可
 */
declare module "next" {
  export type Metadata = Record<string, unknown>;

  // 供 sitemap.ts / robots.ts 以 MetadataRoute.Sitemap / MetadataRoute.Robots 形式使用
  export namespace MetadataRoute {
    type Sitemap = Array<Record<string, unknown>>;
    type Robots = Record<string, unknown>;
  }

  export type Viewport = Record<string, unknown>;
}

declare module "next/server" {
  // NextRequest 用 class 声明：既能 new（tests 构造请求），
  // 又是 Request 子类型（handler 参数逆变兼容），nextUrl/cookies 必填。
   
  export class NextRequest extends Request {
    nextUrl: URL;
    cookies: {
      get: (name: string) => { name: string; value: string } | undefined;
      set: (name: string, value: string, opts?: Record<string, unknown>) => void;
      delete: (name: string) => void;
      getAll: (name: string) => { name: string; value: string }[];
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    constructor(input: string | URL | Request, init?: any);
  }

  // 同时作值（静态方法）与类型（实例含 cookies/headers）使用
  export interface NextResponse extends Response {
    cookies: {
      get: (name: string) => { name: string; value: string } | undefined;
      set: (name: string, value: string, opts?: Record<string, unknown>) => void;
      delete: (name: string) => void;
    };
    headers: Headers;
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  export const NextResponse: any & {
    next: (init?: { request?: { headers: Headers } }) => NextResponse;
    json: (body: unknown, init?: ResponseInit) => NextResponse;
    redirect: (url: string, init?: ResponseInit) => NextResponse;
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  export type NextFetchEvent = any;
}

declare module "next/headers" {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  export function cookies(): any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  export function headers(): any;
}

declare module "next/navigation" {
  export function redirect(path: string): never;
  export function permanentRedirect(path: string): never;
  export function notFound(): never;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  export function useRouter(): any;
  export function usePathname(): string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  export function useSearchParams(): any;
  export function useParams(): Record<string, string | string[] | undefined>;
}

declare module "next/link" {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const Link: any;
  export default Link;
}

declare module "next/image" {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  export type ImageProps = Record<string, any>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const Image: any;
  export default Image;
}
