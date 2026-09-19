"use client";

import { useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { apiFetch } from "@/lib/fetch-client";
import { useT } from "@/components/shop/lang-provider";

/**
 * 联系表单 —— 对齐原站 `/pages/contact`：
 *   `Contact Us` 标题 + **Name / E-mail / Message** 三个字段 + `Send message` 按钮。
 *
 * 与原站字段名逐字一致（`E-mail` 带连字符、`Send message` 小写 m），
 * 文案全部走 shop-i18n 字典，schema 用 `t()` 构造以便中英切换时校验提示同步。
 *
 * 蜜罐字段 `company` 对真人不可见（绝对定位到视口外 + aria-hidden + tabIndex=-1），
 * 服务端非空即静默丢弃。
 */
export function ContactForm() {
  const t = useT();
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);

  const schema = z.object({
    name: z.string().trim().min(1, t("Please enter your name")).max(80),
    email: z.string().trim().toLowerCase().email(t("Invalid email format")).max(254),
    message: z.string().trim().min(1, t("Please enter your message")).max(5000),
    company: z.string().max(200).optional(),
  });

  type ContactValues = z.infer<typeof schema>;

  const form = useForm<ContactValues>({
    resolver: zodResolver(schema),
    defaultValues: { name: "", email: "", message: "", company: "" },
  });

  const onSubmit = async (values: ContactValues) => {
    setSubmitting(true);
    try {
      await apiFetch("/api/contact", {
        method: "POST",
        body: JSON.stringify(values),
      });
      setSent(true);
      toast.success(t("Message sent — we'll get back to you soon."));
      form.reset();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("Failed to send, please try again"));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col gap-4" noValidate>
        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel className="text-[13px] text-foreground">{t("Name")}</FormLabel>
              <FormControl>
                <Input
                  {...field}
                  autoComplete="name"
                  className="h-[46px] text-[15px] placeholder:text-foreground"
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="email"
          render={({ field }) => (
            <FormItem>
              <FormLabel className="text-[13px] text-foreground">{t("E-mail")}</FormLabel>
              <FormControl>
                <Input
                  {...field}
                  type="email"
                  inputMode="email"
                  autoComplete="email"
                  className="h-[46px] text-[15px] placeholder:text-foreground"
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="message"
          render={({ field }) => (
            <FormItem>
              <FormLabel className="text-[13px] text-foreground">{t("Message")}</FormLabel>
              <FormControl>
                <Textarea {...field} rows={6} className="min-h-[140px] text-[15px]" />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* 蜜罐：真人不可见（移出视口 + 不参与 tab 序 + 读屏忽略） */}
        <div aria-hidden className="pointer-events-none absolute -left-[9999px] top-0 h-0 w-0 overflow-hidden">
          <label htmlFor="contact-company">Company</label>
          <input
            id="contact-company"
            tabIndex={-1}
            autoComplete="off"
            {...form.register("company")}
          />
        </div>

        <Button
          type="submit"
          className="auth-submit h-[46px] w-full text-[15px]"
          disabled={submitting}
        >
          {submitting ? t("Sending…") : t("Send message")}
        </Button>

        {sent ? (
          <p className="text-center text-[13px] text-foreground/70" role="status">
            {t("Message sent — we'll get back to you soon.")}
          </p>
        ) : null}
      </form>
    </Form>
  );
}
