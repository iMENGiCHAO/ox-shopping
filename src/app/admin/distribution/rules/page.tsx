"use client";

import * as React from "react";
import { Pencil, Plus, RefreshCw, Save, Settings2, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { apiFetch } from "@/lib/fetch-client";
import {
  DEFAULT_DISTRIBUTION_CONFIG,
  type CommissionScope,
  type DistributionConfig,
} from "@/lib/distribution/contract";
import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { DataTableActions } from "@/components/admin/data-table-actions";
import { useT } from "@/components/admin/lang-provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatDateTime, formatPercent } from "../_shared";
import { formatMoney } from "@/lib/utils";

const COL_COUNT = 8;

/**
 * 骨架行的"窄屏隐藏"要与表头一致 —— 否则加载态会出现「表头没有该列、单元格却有骨架条」的错位。
 * 索引对应列序：0 作用域 / 1 作用域 ID / 2 层级 / 3 佣金口径 / 4 生效期 / 5 启用 / 6 更新时间 / 7 操作。
 * 生效期与更新时间都在 `xl` 起显示（与 TableHead / TableCell 上的类保持一致）。
 */
const COL_HIDE: (string | undefined)[] = [
  undefined,
  undefined,
  undefined,
  undefined,
  "hidden xl:table-cell",
  undefined,
  "hidden xl:table-cell",
  undefined,
];

/** ISO ↔ datetime-local（`YYYY-MM-DDTHH:mm`，按浏览器本地时区）互转 */
function toLocalInput(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

const SCOPE_LABEL_KEYS: Record<CommissionScope, string> = {
  GLOBAL: "全局",
  CATEGORY: "Category",
  PRODUCT: "Products",
};

const SCOPE_VARIANTS: Record<CommissionScope, "primary" | "info" | "secondary"> = {
  GLOBAL: "primary",
  CATEGORY: "info",
  PRODUCT: "secondary",
};

interface RuleRow {
  id: string;
  scopeType: CommissionScope;
  scopeId: string | null;
  level: number;
  /** RATIO=按比例；FIXED=固定金额（订单币种） */
  mode: "RATIO" | "FIXED";
  ratio: number;
  fixedAmount: number | null;
  /** 仅对该等级的分销商生效（null=通用）；同作用域内等级专用优先 */
  tierLevel: number | null;
  enabled: boolean;
  effectiveAt: string | null;
  expireAt: string | null;
  updatedAt: string;
}

/** 配置表单用字符串存数字：number input 清空时是 ""，直接存 number 会变成 0 或 NaN */
interface ConfigForm {
  bindTrigger: "register" | "first_order";
  allowRebind: boolean;
  bindExpireDays: string;
  maxCommissionLevels: string;
  maxTotalRatio: string;
  selfPurchaseCommission: boolean;
  selfPurchaseCountForUpstream: boolean;
  settleHoldDays: string;
  minWithdrawAmount: string;
  /** 风控额度（P0-5）：0 = 不限 */
  dailyWithdrawLimit: string;
  monthlyWithdrawLimit: string;
  withdrawCooldownHours: string;
}

function toConfigForm(c: DistributionConfig): ConfigForm {
  return {
    bindTrigger: c.bindTrigger,
    allowRebind: c.allowRebind,
    bindExpireDays: String(c.bindExpireDays),
    maxCommissionLevels: String(c.maxCommissionLevels),
    maxTotalRatio: String(c.maxTotalRatio),
    selfPurchaseCommission: c.selfPurchaseCommission,
    selfPurchaseCountForUpstream: c.selfPurchaseCountForUpstream,
    settleHoldDays: String(c.settleHoldDays),
    minWithdrawAmount: String(c.minWithdrawAmount),
    dailyWithdrawLimit: String(c.dailyWithdrawLimit),
    monthlyWithdrawLimit: String(c.monthlyWithdrawLimit),
    withdrawCooldownHours: String(c.withdrawCooldownHours),
  };
}

const EMPTY_CONFIG_FORM = toConfigForm(DEFAULT_DISTRIBUTION_CONFIG);

interface RuleForm {
  scopeType: CommissionScope;
  scopeId: string;
  level: string;
  mode: "RATIO" | "FIXED";
  ratio: string;
  fixedAmount: string;
  tierLevel: string;
  effectiveAt: string;
  expireAt: string;
  enabled: boolean;
}

const EMPTY_RULE_FORM: RuleForm = {
  scopeType: "GLOBAL",
  scopeId: "",
  level: "1",
  mode: "RATIO",
  ratio: "10",
  fixedAmount: "",
  tierLevel: "",
  effectiveAt: "",
  expireAt: "",
  enabled: true,
};

/** 空串/非数字一律返回 null，让调用方给出精确的中文报错，而不是静默变 0 */
function parseNumber(raw: string): number | null {
  if (raw.trim() === "") return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

/**
 * 佣金规则 + 分销策略配置。
 *
 * 两个刻意的设计：
 *   1. 策略配置是**业务口径**（层级上限/持有期/提现门槛），佣金规则是**钱的比例**，
 *      它们的修改频率与风险完全不同，所以分成上下两块而不是一个长表单；
 *   2. 规则保存走 `POST`（同 scope+level 幂等 upsert），编辑走 `PUT` —— 后台不需要
 *      「先查重再创建」，同一层级配两次就是覆盖，避免出现两条 GLOBAL 同级规则。
 */
export default function AdminDistributionRulesPage() {
  const t = useT();
  const [loading, setLoading] = React.useState(true);
  const [config, setConfig] = React.useState<DistributionConfig | null>(null);
  const [configForm, setConfigForm] = React.useState<ConfigForm>(EMPTY_CONFIG_FORM);
  const [savingConfig, setSavingConfig] = React.useState(false);

  const [rules, setRules] = React.useState<RuleRow[]>([]);
  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<RuleRow | null>(null);
  const [ruleForm, setRuleForm] = React.useState<RuleForm>(EMPTY_RULE_FORM);
  const [savingRule, setSavingRule] = React.useState(false);
  const [busyId, setBusyId] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const [configRes, rulesRes] = await Promise.all([
        apiFetch<{ config: DistributionConfig; defaultRulesEnsured: boolean }>(
          "/api/admin/distribution/config",
        ),
        apiFetch<{ rules: RuleRow[] }>("/api/admin/distribution/rules"),
      ]);
      setConfig(configRes.config);
      setConfigForm(toConfigForm(configRes.config));
      setRules(rulesRes.rules ?? []);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("加载佣金规则失败"));
    } finally {
      setLoading(false);
    }
  }, [t]);

  React.useEffect(() => {
    void load();
  }, [load]);

  const saveConfig = async () => {
    const levels = parseNumber(configForm.maxCommissionLevels);
    const totalRatio = parseNumber(configForm.maxTotalRatio);
    const holdDays = parseNumber(configForm.settleHoldDays);
    const expireDays = parseNumber(configForm.bindExpireDays);
    const minWithdraw = parseNumber(configForm.minWithdrawAmount);
    const dailyLimit = parseNumber(configForm.dailyWithdrawLimit);
    const monthlyLimit = parseNumber(configForm.monthlyWithdrawLimit);
    const cooldownHours = parseNumber(configForm.withdrawCooldownHours);

    // 前端先拦一道：这几个字段配错的后果是「分佣算穿利润」或「提现门槛失效」，
    // 不值得让管理员等一次服务端 400 才知道
    if (levels === null || !Number.isInteger(levels) || levels < 1 || levels > 10) {
      toast.error(t("分佣层级上限需为 1 ~ 10 的整数"));
      return;
    }
    if (totalRatio === null || totalRatio < 0 || totalRatio > 100) {
      toast.error(t("总比例上限不能超过 100%"));
      return;
    }
    if (expireDays === null || !Number.isInteger(expireDays) || expireDays < 0) {
      toast.error(t("绑定有效期需为 0 或正整数（天）"));
      return;
    }
    if (holdDays === null || !Number.isInteger(holdDays) || holdDays < 0 || holdDays > 365) {
      toast.error(t("持有期天数需为 0 ~ 365 的整数"));
      return;
    }
    if (minWithdraw === null || minWithdraw < 0) {
      toast.error(t("最低提现额需为 0 或正数"));
      return;
    }
    // 风控额度（P0-5）：0 = 不限；非 0 时要求为正数，且月上限不小于日上限
    if (dailyLimit === null || dailyLimit < 0 || monthlyLimit === null || monthlyLimit < 0) {
      toast.error(t("提现日/月上限需为 0（不限）或正数"));
      return;
    }
    if (dailyLimit > 0 && monthlyLimit > 0 && monthlyLimit < dailyLimit) {
      toast.error(t("单月提现上限不应小于单日上限"));
      return;
    }
    if (cooldownHours === null || !Number.isInteger(cooldownHours) || cooldownHours < 0) {
      toast.error(t("提现冷却需为 0 或正整数（小时）"));
      return;
    }

    setSavingConfig(true);
    try {
      const res = await apiFetch<{ config: DistributionConfig }>("/api/admin/distribution/config", {
        method: "PUT",
        body: JSON.stringify({
          bindTrigger: configForm.bindTrigger,
          allowRebind: configForm.allowRebind,
          bindExpireDays: expireDays,
          maxCommissionLevels: levels,
          maxTotalRatio: totalRatio,
          selfPurchaseCommission: configForm.selfPurchaseCommission,
          selfPurchaseCountForUpstream: configForm.selfPurchaseCountForUpstream,
          settleHoldDays: holdDays,
          minWithdrawAmount: minWithdraw,
          dailyWithdrawLimit: dailyLimit,
          monthlyWithdrawLimit: monthlyLimit,
          withdrawCooldownHours: cooldownHours,
        }),
      });
      setConfig(res.config);
      setConfigForm(toConfigForm(res.config));
      toast.success(t("分销策略已保存"));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("保存分销策略失败"));
    } finally {
      setSavingConfig(false);
    }
  };

  const openCreate = () => {
    setEditing(null);
    setRuleForm(EMPTY_RULE_FORM);
    setDialogOpen(true);
  };

  const openEdit = (rule: RuleRow) => {
    setEditing(rule);
    setRuleForm({
      scopeType: rule.scopeType,
      scopeId: rule.scopeId ?? "",
      level: String(rule.level),
      mode: rule.mode,
      ratio: String(rule.ratio),
      fixedAmount: rule.fixedAmount == null ? "" : String(rule.fixedAmount),
      tierLevel: rule.tierLevel == null || rule.tierLevel === 0 ? "" : String(rule.tierLevel),
      effectiveAt: toLocalInput(rule.effectiveAt),
      expireAt: toLocalInput(rule.expireAt),
      enabled: rule.enabled,
    });
    setDialogOpen(true);
  };

  const saveRule = async () => {
    const level = parseNumber(ruleForm.level);
    const ratio = parseNumber(ruleForm.ratio);
    const fixedAmount = parseNumber(ruleForm.fixedAmount);

    if (level === null || !Number.isInteger(level) || level < 1 || level > 10) {
      toast.error(t("层级需为 1 ~ 10 的整数"));
      return;
    }
    if (ruleForm.scopeType !== "GLOBAL" && !ruleForm.scopeId.trim()) {
      toast.error(t("分类/商品规则必须填写作用域 ID"));
      return;
    }
    // 两种口径互斥校验（与服务端 zod 同口径，前端先拦一道给出精确提示）
    if (ruleForm.mode === "FIXED") {
      if (fixedAmount === null || fixedAmount <= 0) {
        toast.error(t("固定金额返佣需填写大于 0 的金额（订单币种）"));
        return;
      }
    } else if (ratio === null || ratio <= 0 || ratio > 100) {
      toast.error(t("比例返佣需填写 0 ~ 100 之间且大于 0 的比例"));
      return;
    }
    if (
      ruleForm.effectiveAt &&
      ruleForm.expireAt &&
      new Date(ruleForm.effectiveAt) >= new Date(ruleForm.expireAt)
    ) {
      toast.error(t("End time must be later than start time"));
      return;
    }

    const scopeId = ruleForm.scopeType === "GLOBAL" ? null : ruleForm.scopeId.trim();
    const body = {
      scopeType: ruleForm.scopeType,
      scopeId,
      level,
      mode: ruleForm.mode,
      ratio: ruleForm.mode === "FIXED" ? 0 : (ratio ?? 0),
      fixedAmount: ruleForm.mode === "FIXED" ? fixedAmount : null,
      // 留空=通用规则（对全部等级生效）；填了则只对该等级生效
      tierLevel: ruleForm.tierLevel.trim() === "" ? null : Number(ruleForm.tierLevel),
      effectiveAt: ruleForm.effectiveAt ? new Date(ruleForm.effectiveAt).toISOString() : null,
      expireAt: ruleForm.expireAt ? new Date(ruleForm.expireAt).toISOString() : null,
      enabled: ruleForm.enabled,
    };

    setSavingRule(true);
    try {
      if (editing) {
        await apiFetch(`/api/admin/distribution/rules/${editing.id}`, {
          method: "PUT",
          body: JSON.stringify(body),
        });
        toast.success(t("规则已更新"));
      } else {
        await apiFetch<{ ok: boolean; id: string }>("/api/admin/distribution/rules", {
          method: "POST",
          body: JSON.stringify(body),
        });
        toast.success(t("规则已保存（同作用域同层级为覆盖）"));
      }
      setDialogOpen(false);
      void load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("保存规则失败"));
    } finally {
      setSavingRule(false);
    }
  };

  const toggleRule = async (rule: RuleRow, enabled: boolean) => {
    setBusyId(rule.id);
    try {
      await apiFetch(`/api/admin/distribution/rules/${rule.id}`, {
        method: "PUT",
        body: JSON.stringify({
          scopeType: rule.scopeType,
          scopeId: rule.scopeId,
          level: rule.level,
          ratio: rule.ratio,
          enabled,
        }),
      });
      toast.success(enabled ? t("规则已启用") : t("规则已停用"));
      void load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("切换规则状态失败"));
    } finally {
      setBusyId(null);
    }
  };

  const deleteRule = async (rule: RuleRow) => {
    const where = t("确认删除规则「{rule} 第 {level} 级，{payout}」？")
      .replace(
        "{rule}",
        `${t(SCOPE_LABEL_KEYS[rule.scopeType])}${rule.scopeId ? ` / ${rule.scopeId}` : ""}`,
      )
      .replace("{level}", String(rule.level))
      .replace(
        "{payout}",
        rule.mode === "FIXED"
          ? `${t("每单固定")} ${formatMoney(rule.fixedAmount ?? 0)}`
          : formatPercent(rule.ratio),
      );
    if (
      !window.confirm(
        `${where}\n\n· ${t("只删规则，已产生的佣金流水不受影响")}\n· ${t("删除后该层级将按其它作用域规则或默认规则计算（可能变成 0）")}`,
      )
    ) {
      return;
    }
    setBusyId(rule.id);
    try {
      await apiFetch(`/api/admin/distribution/rules/${rule.id}`, { method: "DELETE" });
      toast.success(t("规则已删除"));
      void load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("删除规则失败"));
    } finally {
      setBusyId(null);
    }
  };

  const ratioTooHigh = (parseNumber(configForm.maxTotalRatio) ?? 0) > 60;

  if (loading && !config) {
    return (
      <div className="space-y-4">
        <AdminPageHeader title={t("佣金规则")} description={t("加载中…")} />
        <Skeleton className="h-64 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <AdminPageHeader
        title={t("佣金规则")}
        description={t("分销策略决定「怎么绑、几级返、何时可结算」，佣金规则决定「每一级返多少」")}
        actions={
          <>
            <Button variant="outline" onClick={() => void load()} disabled={loading}>
              <RefreshCw className="h-4 w-4" />
              {t("刷新")}
            </Button>
            <Button variant="outline" onClick={openCreate}>
              <Plus className="h-4 w-4" />
              {t("新增规则")}
            </Button>
            <Button onClick={() => void saveConfig()} disabled={savingConfig}>
              <Save className="h-4 w-4" />
              {t("保存配置")}
            </Button>
          </>
        }
      />

      {/* ── 策略配置 ─────────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Settings2 className="h-4 w-4 text-muted-foreground" />
            {t("分销策略配置")}
          </CardTitle>
          <CardDescription>
            {t("全局口径，影响所有分销商；保存后立即对新的绑定与佣金计算生效，历史流水不追溯")}
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <div className="space-y-2">
            <Label htmlFor="dist-levels">{t("分佣层级上限")}</Label>
            <Input
              id="dist-levels"
              inputMode="numeric"
              value={configForm.maxCommissionLevels}
              onChange={(e) =>
                setConfigForm((f) => ({ ...f, maxCommissionLevels: e.target.value }))
              }
            />
            <p className="text-xs text-muted-foreground">
              {t("1 ~ 10。关系链仍记录无限级，超出上限的层级只记关系、不返佣。")}
            </p>
            {/* 合规红线提示：>3 会被服务端夹回 3（除非显式开环境变量），
                不提示的话运营会以为"我配了 5 级怎么只返 3 级"是 bug */}
            <p className="text-xs text-warning">
              {t(
                "合规：国内「三级分销」为法律红线，**默认最多 3 级**；填 4 ~ 10 会被服务端夹回 3，",
              )}{" "}
              {t("需设环境变量")}{" "}
              <code className="font-mono">DISTRIBUTION_ALLOW_DEEP_LEVELS=true</code> {t("才生效。")}
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="dist-ratio">{t("总比例上限（%）")}</Label>
            <Input
              id="dist-ratio"
              inputMode="decimal"
              value={configForm.maxTotalRatio}
              onChange={(e) => setConfigForm((f) => ({ ...f, maxTotalRatio: e.target.value }))}
            />
            <p className={ratioTooHigh ? "text-xs text-warning" : "text-xs text-muted-foreground"}>
              {t("总比例建议不超过毛利率的 60%")}
              {ratioTooHigh ? t("（当前已超过 60%，请确认毛利撑得住）") : ""}
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="dist-min-withdraw">{t("最低提现额（¥）")}</Label>
            <Input
              id="dist-min-withdraw"
              inputMode="decimal"
              value={configForm.minWithdrawAmount}
              onChange={(e) => setConfigForm((f) => ({ ...f, minWithdrawAmount: e.target.value }))}
            />
            <p className="text-xs text-muted-foreground">{t("低于该金额前台不允许提交提现申请")}</p>
          </div>

          {/* 风控额度（P0-5）：账号被盗时避免一次性把余额提空。0 = 不限。 */}
          <div className="space-y-2">
            <Label htmlFor="dist-daily-limit">{t("单日提现上限（¥）")}</Label>
            <Input
              id="dist-daily-limit"
              inputMode="decimal"
              value={configForm.dailyWithdrawLimit}
              onChange={(e) => setConfigForm((f) => ({ ...f, dailyWithdrawLimit: e.target.value }))}
            />
            <p className="text-xs text-muted-foreground">
              {t("0 = 不限。按「已申请 + 已打款」累计，被驳回的不计入")}
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="dist-monthly-limit">{t("单月提现上限（¥）")}</Label>
            <Input
              id="dist-monthly-limit"
              inputMode="decimal"
              value={configForm.monthlyWithdrawLimit}
              onChange={(e) =>
                setConfigForm((f) => ({ ...f, monthlyWithdrawLimit: e.target.value }))
              }
            />
            <p className="text-xs text-muted-foreground">{t("0 = 不限；不应小于单日上限")}</p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="dist-cooldown">{t("提现冷却（小时）")}</Label>
            <Input
              id="dist-cooldown"
              inputMode="numeric"
              value={configForm.withdrawCooldownHours}
              onChange={(e) =>
                setConfigForm((f) => ({ ...f, withdrawCooldownHours: e.target.value }))
              }
            />
            <p className="text-xs text-muted-foreground">
              {t("0 = 无冷却；填 24 即「两次提现至少间隔一天」")}
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="dist-hold">{t("持有期天数")}</Label>
            <Input
              id="dist-hold"
              inputMode="numeric"
              value={configForm.settleHoldDays}
              onChange={(e) => setConfigForm((f) => ({ ...f, settleHoldDays: e.target.value }))}
            />
            <p className="text-xs text-muted-foreground">
              {t("支付成功后满 N 天自动转可结算；客户确认收货则立即结算，不受此限制")}
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="dist-trigger">{t("绑定触发点")}</Label>
            <Select
              value={configForm.bindTrigger}
              onValueChange={(v) =>
                setConfigForm((f) => ({ ...f, bindTrigger: v as "register" | "first_order" }))
              }
            >
              <SelectTrigger id="dist-trigger">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="register">{t("注册即绑定")}</SelectItem>
                <SelectItem value="first_order">{t("首次下单才绑定")}</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              {t("「首次下单才绑定」可减少只注册不消费的无效归属")}
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="dist-expire">{t("绑定有效期（天）")}</Label>
            <Input
              id="dist-expire"
              inputMode="numeric"
              value={configForm.bindExpireDays}
              onChange={(e) => setConfigForm((f) => ({ ...f, bindExpireDays: e.target.value }))}
            />
            <p className="text-xs text-muted-foreground">
              {t("0 = 永久有效；到期后客户可被重新归属")}
            </p>
          </div>

          <div className="flex items-start justify-between gap-3 rounded-md border p-3">
            <div className="space-y-1">
              <Label htmlFor="dist-rebind">{t("允许抢绑")}</Label>
              <p className="text-xs text-muted-foreground">
                {t("开启后后来的推广链接可以覆盖已有归属（默认关闭，首次绑定定终身）")}
              </p>
            </div>
            <Switch
              id="dist-rebind"
              checked={configForm.allowRebind}
              onCheckedChange={(v) => setConfigForm((f) => ({ ...f, allowRebind: v }))}
            />
          </div>

          <div className="flex items-start justify-between gap-3 rounded-md border p-3">
            <div className="space-y-1">
              <Label htmlFor="dist-self">{t("自购返自己")}</Label>
              <p className="text-xs text-muted-foreground">
                {t("开启后分销商自己下单也给自己算一级佣金（默认关闭，避免自买自返刷单）")}
              </p>
            </div>
            <Switch
              id="dist-self"
              checked={configForm.selfPurchaseCommission}
              onCheckedChange={(v) => setConfigForm((f) => ({ ...f, selfPurchaseCommission: v }))}
            />
          </div>

          <div className="flex items-start justify-between gap-3 rounded-md border p-3">
            <div className="space-y-1">
              <Label htmlFor="dist-self-up">{t("自购仍给上级分佣")}</Label>
              <p className="text-xs text-muted-foreground">
                {t("关闭后分销商自购不再给其上级产生佣金（与上一项独立）")}
              </p>
            </div>
            <Switch
              id="dist-self-up"
              checked={configForm.selfPurchaseCountForUpstream}
              onCheckedChange={(v) =>
                setConfigForm((f) => ({ ...f, selfPurchaseCountForUpstream: v }))
              }
            />
          </div>
        </CardContent>
      </Card>

      {/* ── 佣金规则 ─────────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle>{t("佣金规则")}</CardTitle>
          <CardDescription>
            {t("同「作用域 + 层级」只保留一条，新增即覆盖；作用域优先级：商品 > 分类 > 全局")}
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {/* 列宽策略：**每一列都显式定宽**，并把宽度之和写进 Table 的 `min-w`。
              原因：Table 是 `table-fixed` + `w-full` —— 若某列没定宽，它就成了"被挤压的那一列"；
              容器窄于定宽之和时它会被压到 **0 宽**，单元格内容竖排成单字并压到相邻列上。
              实测（1024px）：作用域 ID 列宽 = 0，`（全局，不限作用域）` 一字一行压住「层级」。
              定宽 + min-w ⇒ 容器不够时由组件的 `overflow-x-auto` 横向滚动，列永不被压。

              分档按**后台内容区实际宽度**（侧栏 256 + 内边距）而非视口：
                实测内容宽 = 654@1024 / 678@768 / 910@1280 / 1070@1440 / 1230@1600
                ⇒ 去掉两列后的核心 6 列共 620，1024 的 654 刚好放得下；
                  补上生效期(144)与更新时间(128)后共 892，1280 的 910 也放得下
                  ⇒ 两列统一在 `xl`(1280) 起显示，`xl` 以下隐藏。
              低优先列在窄屏隐藏，比让它们被 sticky 操作列盖住更好。 */}
          <Table className="min-w-[620px] xl:min-w-[892px]">
            <TableHeader>
              <TableRow>
                <TableHead className="w-[88px]">{t("作用域")}</TableHead>
                <TableHead className="w-[160px]">{t("作用域 ID")}</TableHead>
                <TableHead className="w-[64px]">{t("层级")}</TableHead>
                <TableHead className="w-[130px] text-right">{t("佣金口径")}</TableHead>
                <TableHead className="hidden w-[144px] xl:table-cell">{t("生效期")}</TableHead>
                <TableHead className="w-[72px]">{t("Enabled")}</TableHead>
                <TableHead className="hidden w-[140px] xl:table-cell">{t("Updated At")}</TableHead>
                <TableHead className="sticky-col-right w-[96px] text-right">
                  {t("Actions")}
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                Array.from({ length: 4 }, (_, i) => (
                  <TableRow key={`sk-${i}`}>
                    {Array.from({ length: COL_COUNT }, (_, j) => (
                      <TableCell key={j} className={COL_HIDE[j]}>
                        <Skeleton className="h-6 w-full" />
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              ) : rules.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={COL_COUNT} className="p-0">
                    <EmptyState
                      icon={<Settings2 className="h-6 w-6" />}
                      title={t("暂无佣金规则")}
                      description={t("没有规则时该层级不返佣；点右上角「新增规则」配置第一级比例")}
                    />
                  </TableCell>
                </TableRow>
              ) : (
                rules.map((rule) => (
                  <TableRow key={rule.id}>
                    <TableCell>
                      <Badge variant={SCOPE_VARIANTS[rule.scopeType]}>
                        {t(SCOPE_LABEL_KEYS[rule.scopeType])}
                      </Badge>
                    </TableCell>
                    <TableCell className="font-mono text-xs">
                      {rule.scopeId ? (
                        /* `block` 不能省：`truncate` 是 `overflow:hidden + text-overflow:ellipsis`，
                           对 **inline** 元素无效（span 默认 inline）⇒ 长 ID 会溢出到相邻列。
                           加 `block` 后才真正截断成省略号。 */
                        <span className="block truncate" title={rule.scopeId}>
                          {rule.scopeId}
                        </span>
                      ) : (
                        <span className="block truncate text-muted-foreground">
                          {t("（全局，不限作用域）")}
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-sm tabular-nums">{rule.level}</TableCell>
                    <TableCell className="text-right text-sm font-medium tabular-nums">
                      {rule.mode === "FIXED" ? (
                        <span className="text-foreground">
                          {t("每单固定")} {formatMoney(rule.fixedAmount ?? 0)}
                        </span>
                      ) : (
                        formatPercent(rule.ratio)
                      )}
                      {rule.tierLevel ? (
                        <span className="ml-1 text-xs font-normal text-muted-foreground">
                          {t("（VIP {level} 专用）").replace("{level}", String(rule.tierLevel))}
                        </span>
                      ) : null}
                    </TableCell>
                    <TableCell className="hidden text-xs text-muted-foreground xl:table-cell">
                      {rule.effectiveAt || rule.expireAt
                        ? `${rule.effectiveAt ? formatDateTime(rule.effectiveAt) : t("立即")} → ${
                            rule.expireAt ? formatDateTime(rule.expireAt) : t("长期")
                          }`
                        : t("长期有效")}
                    </TableCell>
                    <TableCell>
                      <Switch
                        checked={rule.enabled}
                        disabled={busyId === rule.id}
                        aria-label={t("启用第 {level} 级规则").replace(
                          "{level}",
                          String(rule.level),
                        )}
                        onCheckedChange={(v) => void toggleRule(rule, v)}
                      />
                    </TableCell>
                    <TableCell className="hidden text-xs tabular-nums text-muted-foreground xl:table-cell">
                      {formatDateTime(rule.updatedAt)}
                    </TableCell>
                    <TableCell className="sticky-col-right">
                      <DataTableActions
                        actions={[
                          {
                            label: t("Edit"),
                            icon: Pencil,
                            primary: true,
                            onClick: () => openEdit(rule),
                          },
                          {
                            label: t("Delete"),
                            icon: Trash2,
                            destructive: true,
                            divider: true,
                            onClick: () => void deleteRule(rule),
                          },
                        ]}
                      />
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* 新增 / 编辑规则 */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? t("编辑佣金规则") : t("新增佣金规则")}</DialogTitle>
            <DialogDescription>
              {editing
                ? t("比例与启停可改；作用域与层级只影响提交校验（服务端按 id 定位规则）")
                : t("同「作用域 + 层级」已存在时会直接覆盖，不会产生重复规则")}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="rule-scope">{t("作用域")}</Label>
                <Select
                  value={ruleForm.scopeType}
                  onValueChange={(v) =>
                    setRuleForm((f) => ({
                      ...f,
                      scopeType: v as CommissionScope,
                      scopeId: v === "GLOBAL" ? "" : f.scopeId,
                    }))
                  }
                >
                  <SelectTrigger id="rule-scope">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="GLOBAL">{t("全局")}</SelectItem>
                    <SelectItem value="CATEGORY">{t("Category")}</SelectItem>
                    <SelectItem value="PRODUCT">{t("Products")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="rule-level">{t("层级")}</Label>
                <Input
                  id="rule-level"
                  inputMode="numeric"
                  value={ruleForm.level}
                  onChange={(e) => setRuleForm((f) => ({ ...f, level: e.target.value }))}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="rule-scope-id">{t("作用域 ID")}</Label>
              <Input
                id="rule-scope-id"
                value={ruleForm.scopeId}
                disabled={ruleForm.scopeType === "GLOBAL"}
                placeholder={
                  ruleForm.scopeType === "GLOBAL"
                    ? t("全局规则无需填写")
                    : ruleForm.scopeType === "CATEGORY"
                      ? t("填分类 ID（后台分类页的 id）")
                      : t("填商品 ID（后台商品页的 id）")
                }
                onChange={(e) => setRuleForm((f) => ({ ...f, scopeId: e.target.value }))}
                className="font-mono"
              />
              <p className="text-xs text-muted-foreground">
                {t("留空或填错会导致佣金按更低优先级的作用域计算")}
              </p>
            </div>

            {/* 佣金口径：比例返佣 或 固定金额返佣（互斥；服务端 zod 同样校验） */}
            <div className="space-y-2">
              <Label htmlFor="rule-mode">{t("佣金口径")}</Label>
              <select
                id="rule-mode"
                className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
                value={ruleForm.mode}
                onChange={(e) =>
                  setRuleForm((f) => ({ ...f, mode: e.target.value as "RATIO" | "FIXED" }))
                }
              >
                <option value="RATIO">{t("按比例（订单商品实付 × 比例）")}</option>
                <option value="FIXED">{t("固定金额（每单固定返，订单币种）")}</option>
              </select>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="rule-ratio">{t("比例（%）")}</Label>
                <Input
                  id="rule-ratio"
                  inputMode="decimal"
                  disabled={ruleForm.mode === "FIXED"}
                  value={ruleForm.mode === "FIXED" ? "" : ruleForm.ratio}
                  onChange={(e) => setRuleForm((f) => ({ ...f, ratio: e.target.value }))}
                />
                {ruleForm.mode === "FIXED" ? (
                  <p className="text-xs text-muted-foreground">
                    {t("固定金额模式下比例不参与计算")}
                  </p>
                ) : null}
              </div>
              <div className="space-y-2">
                <Label htmlFor="rule-fixed">{t("固定金额（订单币种）")}</Label>
                <Input
                  id="rule-fixed"
                  inputMode="decimal"
                  disabled={ruleForm.mode !== "FIXED"}
                  value={ruleForm.mode === "FIXED" ? ruleForm.fixedAmount : ""}
                  onChange={(e) => setRuleForm((f) => ({ ...f, fixedAmount: e.target.value }))}
                />
                <p className="text-xs text-muted-foreground">
                  {t("固定金额仍受「总比例上限」约束（换算成等效比例），避免小额订单返穿毛利")}
                </p>
              </div>
            </div>

            {/* 等级专用：留空=通用；填了则只对该等级的分销商生效（同作用域内优先于通用） */}
            <div className="space-y-2">
              <Label htmlFor="rule-tier">{t("限定分销商等级（留空=通用）")}</Label>
              <Input
                id="rule-tier"
                inputMode="numeric"
                value={ruleForm.tierLevel}
                onChange={(e) => setRuleForm((f) => ({ ...f, tierLevel: e.target.value }))}
                placeholder={t("0 = 普通；留空表示对所有等级生效")}
              />
            </div>

            {/* 生效期：不填=立即生效、长期有效；到期后规则自动失效（无需人工停用） */}
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="rule-effective">{t("Valid From")}</Label>
                <Input
                  id="rule-effective"
                  type="datetime-local"
                  value={ruleForm.effectiveAt}
                  onChange={(e) => setRuleForm((f) => ({ ...f, effectiveAt: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="rule-expire">{t("Valid Until")}</Label>
                <Input
                  id="rule-expire"
                  type="datetime-local"
                  value={ruleForm.expireAt}
                  onChange={(e) => setRuleForm((f) => ({ ...f, expireAt: e.target.value }))}
                />
              </div>
            </div>

            <div className="flex items-start justify-between gap-3 rounded-md border p-3">
              <div className="space-y-1">
                <Label htmlFor="rule-enabled">{t("Enabled")}</Label>
                <p className="text-xs text-muted-foreground">{t("停用后该规则不参与佣金计算")}</p>
              </div>
              <Switch
                id="rule-enabled"
                checked={ruleForm.enabled}
                onCheckedChange={(v) => setRuleForm((f) => ({ ...f, enabled: v }))}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              {t("Cancel")}
            </Button>
            <Button onClick={() => void saveRule()} disabled={savingRule}>
              <Save className="h-4 w-4" />
              {editing ? t("Save changes") : t("保存规则")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
