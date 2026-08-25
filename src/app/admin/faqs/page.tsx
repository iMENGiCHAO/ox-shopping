"use client";

import * as React from "react";
import { toast } from "sonner";

import { apiFetch } from "@/lib/fetch-client";
import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useT } from "@/components/admin/lang-provider";

interface FaqRow {
  id: string;
  question: string;
  answer: string;
  sortOrder: number;
  published: boolean;
}

interface ContactContent {
  heading: string;
  body: string;
  email: string;
}

const EMPTY_FORM = { question: "", answer: "", sortOrder: 0, published: true };

/** 后台「FAQ 与联系我们」：FAQ 增删改 + 联系板块文案（前台 /pages/faqs 实时读取） */
export default function AdminFaqsPage() {
  const t = useT();
  const [loading, setLoading] = React.useState(true);
  const [rows, setRows] = React.useState<FaqRow[]>([]);
  const [editing, setEditing] = React.useState<FaqRow | null>(null);
  const [formOpen, setFormOpen] = React.useState(false);
  const [form, setForm] = React.useState(EMPTY_FORM);
  const [saving, setSaving] = React.useState(false);
  const [contact, setContact] = React.useState<ContactContent>({ heading: "", body: "", email: "" });
  const [contactSaving, setContactSaving] = React.useState(false);

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiFetch<{ data: FaqRow[] }>("/api/admin/faqs");
      setRows(res.data ?? []);
      const c = await apiFetch<{ data: ContactContent }>("/api/admin/contact-content");
      setContact(c.data);
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void load();
  }, [load]);

  const openCreate = () => {
    setEditing(null);
    setForm({ ...EMPTY_FORM, sortOrder: rows.length });
    setFormOpen(true);
  };

  const openEdit = (row: FaqRow) => {
    setEditing(row);
    setForm({ question: row.question, answer: row.answer, sortOrder: row.sortOrder, published: row.published });
    setFormOpen(true);
  };

  const submitForm = async () => {
    if (form.question.trim().length < 2 || form.answer.trim().length < 2) {
      toast.error(t("Please fill in question and answer"));
      return;
    }
    setSaving(true);
    try {
      if (editing) {
        await apiFetch(`/api/admin/faqs/${editing.id}`, { method: "PUT", body: JSON.stringify(form) });
        toast.success(t("FAQ updated"));
      } else {
        await apiFetch("/api/admin/faqs", { method: "POST", body: JSON.stringify(form) });
        toast.success(t("FAQ created"));
      }
      setFormOpen(false);
      void load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("Save failed, please retry"));
    } finally {
      setSaving(false);
    }
  };

  const remove = async (row: FaqRow) => {
    if (!window.confirm(t("Delete this FAQ?"))) return;
    await apiFetch(`/api/admin/faqs/${row.id}`, { method: "DELETE" });
    toast.success(t("FAQ deleted"));
    void load();
  };

  const togglePublished = async (row: FaqRow, published: boolean) => {
    await apiFetch(`/api/admin/faqs/${row.id}`, { method: "PUT", body: JSON.stringify({ published }) });
    setRows((prev) => prev.map((r) => (r.id === row.id ? { ...r, published } : r)));
  };

  const saveContact = async () => {
    setContactSaving(true);
    try {
      await apiFetch("/api/admin/contact-content", { method: "PUT", body: JSON.stringify(contact) });
      toast.success(t("Contact section saved"));
    } finally {
      setContactSaving(false);
    }
  };

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6 py-6">
      <AdminPageHeader
        title={t("FAQ Management")}
        description={t("Manage storefront FAQs and the contact block shown under them")}
        actions={
          <Button onClick={openCreate}>＋ {t("New FAQ")}</Button>
        }
      />

      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="space-y-3 p-5">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : rows.length === 0 ? (
            <EmptyState title={t("No FAQs yet")} description={t("Click New FAQ to add your first entry")} />
          ) : (
            <ul className="divide-y divide-border">
              {rows.map((row) => (
                <li key={row.id} className="flex items-start gap-4 px-5 py-4">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-foreground">{row.question}</p>
                    <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{row.answer}</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-3">
                    <Switch
                      checked={row.published}
                      onCheckedChange={(v) => void togglePublished(row, v)}
                      aria-label={t("Publish")}
                    />
                    <Button variant="ghost" size="sm" className="h-8 px-2" onClick={() => openEdit(row)}>
                      {t("Edit")}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 px-2 text-destructive hover:text-destructive"
                      onClick={() => void remove(row)}
                    >
                      {t("Delete")}
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {/* 联系我们板块 */}
      <Card>
        <CardContent className="space-y-4 p-5">
          <div>
            <p className="text-sm font-medium text-foreground">{t("Contact block (under FAQs)")}</p>
            <p className="text-xs text-muted-foreground">{t("Shown at the bottom of the storefront FAQs page")}</p>
          </div>
          <div className="space-y-2">
            <Label>{t("Heading")}</Label>
            <Input value={contact.heading} onChange={(e) => setContact((c) => ({ ...c, heading: e.target.value }))} />
          </div>
          <div className="space-y-2">
            <Label>{t("Body")}</Label>
            <Textarea rows={3} value={contact.body} onChange={(e) => setContact((c) => ({ ...c, body: e.target.value }))} />
          </div>
          <div className="space-y-2">
            <Label>{t("Email")}</Label>
            <Input type="email" value={contact.email} onChange={(e) => setContact((c) => ({ ...c, email: e.target.value }))} />
          </div>
          <Button onClick={() => void saveContact()} disabled={contactSaving}>
            {contactSaving ? t("Saving…") : t("Save changes")}
          </Button>
        </CardContent>
      </Card>

      {/* 新增/编辑对话框 */}
      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing ? t("Edit FAQ") : t("New FAQ")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>{t("Question")} *</Label>
              <Input
                value={form.question}
                onChange={(e) => setForm((f) => ({ ...f, question: e.target.value }))}
                maxLength={200}
              />
            </div>
            <div className="space-y-2">
              <Label>{t("Answer")} *</Label>
              <Textarea
                rows={5}
                value={form.answer}
                onChange={(e) => setForm((f) => ({ ...f, answer: e.target.value }))}
              />
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Label htmlFor="faq-sort">{t("Sort order")}</Label>
                <Input
                  id="faq-sort"
                  inputMode="numeric"
                  className="w-20"
                  value={String(form.sortOrder)}
                  onChange={(e) => setForm((f) => ({ ...f, sortOrder: Number(e.target.value.replace(/[^0-9]/g, "")) || 0 }))}
                />
              </div>
              <div className="flex items-center gap-2">
                <Label htmlFor="faq-pub">{t("Published")}</Label>
                <Switch
                  id="faq-pub"
                  checked={form.published}
                  onCheckedChange={(v) => setForm((f) => ({ ...f, published: v }))}
                />
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setFormOpen(false)}>
                {t("Cancel")}
              </Button>
              <Button onClick={() => void submitForm()} disabled={saving}>
                {saving ? t("Saving…") : t("Save")}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
