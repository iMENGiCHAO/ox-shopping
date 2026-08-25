"use client";

import { useCallback, useEffect, useState } from "react";
import { MapPin, Pencil, Star, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { apiFetch } from "@/lib/fetch-client";
import { toast } from "sonner";
import { AddressForm } from "@/components/shop/address-form";
import type { ShopAddress } from "@/components/shop/types";
import { useT } from "@/components/shop/lang-provider";

/** Shipping address management (client) */
export default function AddressesPage() {
  const t = useT();
  const [addresses, setAddresses] = useState<ShopAddress[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<ShopAddress | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await apiFetch<{ addresses: ShopAddress[] }>("/api/user/addresses");
      setAddresses(res?.addresses ?? []);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("Failed to load addresses"));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleSetDefault = async (addr: ShopAddress) => {
    setPendingId(addr.id);
    try {
      await apiFetch(`/api/user/addresses/${addr.id}`, {
        method: "PUT",
        body: JSON.stringify({ isDefault: true }),
      });
      toast.success(t("Default address set"));
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("Failed to set default, please try again later"));
    } finally {
      setPendingId(null);
    }
  };

  const handleDelete = async (addr: ShopAddress) => {
    setPendingId(addr.id);
    try {
      await apiFetch(`/api/user/addresses/${addr.id}`, { method: "DELETE" });
      toast.success(t("Address deleted"));
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("Failed to delete, please try again later"));
    } finally {
      setPendingId(null);
    }
  };

  const openCreate = () => {
    setEditing(null);
    setDialogOpen(true);
  };
  const openEdit = (addr: ShopAddress) => {
    setEditing(addr);
    setDialogOpen(true);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">{t("Shipping Address")}</h2>
        <Button size="sm" onClick={openCreate}>
          {t("Add Address")}
        </Button>
      </div>

      {loading ? (
        <div className="space-y-3">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
      ) : addresses.length === 0 ? (
        <EmptyState
          icon={<MapPin className="h-5 w-5" />}
          title={t("No shipping address yet")}
          description={t("Add an address for fast checkout.")}
          action={
            <Button size="sm" onClick={openCreate}>
              {t("Add Address")}
            </Button>
          }
        />
      ) : (
        <div className="space-y-3">
          {addresses.map((addr) => (
            <Card key={addr.id}>
              <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{addr.recipientName}</span>
                    <span className="text-sm text-muted-foreground">{addr.phone}</span>
                    {addr.isDefault ? (
                      <Badge variant="outline" className="gap-1 text-xs">
                        <Star className="h-3 w-3 fill-warning text-warning" />
                        {t("Default")}
                      </Badge>
                    ) : null}
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {addr.province} {addr.city} {addr.district} {addr.detail}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-1.5">
                  {!addr.isDefault ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      disabled={pendingId === addr.id}
                      onClick={() => void handleSetDefault(addr)}
                    >
                      {t("Set as default")}
                    </Button>
                  ) : null}
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label={t("Edit address")}
                    onClick={() => openEdit(addr)}
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        aria-label={t("Delete address")}
                        disabled={pendingId === addr.id}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>{t("Delete this shipping address?")}</AlertDialogTitle>
                        <AlertDialogDescription>
                          {t("This cannot be undone. Delete the address for {name}?", { name: addr.recipientName })}
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>{t("Cancel")}</AlertDialogCancel>
                        <AlertDialogAction onClick={() => void handleDelete(addr)}>
                          {t("Confirm delete")}
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <AddressForm
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        initial={editing}
        onSaved={() => void load()}
      />
    </div>
  );
}
