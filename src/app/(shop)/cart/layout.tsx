import type { Metadata } from "next";

/** 官方 /cart 页面 title（实测） */
export const metadata: Metadata = {
  title: "Your Shopping Cart",
};

export default function CartLayout({ children }: { children: React.ReactNode }) {
  return children;
}
