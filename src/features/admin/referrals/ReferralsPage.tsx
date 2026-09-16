"use client";

import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Plus, Download } from "lucide-react";
import {
  Button,
  Card,
  CardContent,
  Modal,
  Input,
  Select,
  Badge,
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui";
import { useAdminReferrals, useToggleReferralCode, useCreateReferralCode } from "./hooks/useReferrals";
import { useAdminTenants } from "@/features/admin/tenants/hooks/useTenants";
import { useSuperAdminOnly } from "@/features/admin/hooks/useSuperAdmin";
import { MobileCard, MobileCardList } from "@/features/admin/components/MobileCard";
import { ListSearch, matchesQuery } from "@/features/admin/components/ListSearch";
import { exportToCsv } from "@/lib/csv-export";

type ReferralCode = Record<string, unknown>;
type TenantOption = { id: string; name: string };

export function ReferralsPage() {
  const { t } = useTranslation("admin");
  const superOnly = useSuperAdminOnly();
  const { data: referrals, isLoading } = useAdminReferrals();
  const toggleCode = useToggleReferralCode();
  const createCode = useCreateReferralCode();

  const { data: tenantsData } = useAdminTenants();
  const tenants = (tenantsData || []) as unknown as TenantOption[];

  const [createOpen, setCreateOpen] = useState(false);
  const [newTenantId, setNewTenantId] = useState("");
  const [newCode, setNewCode] = useState("");
  const [search, setSearch] = useState("");

  // Tenants that already have a code can't get a second one (1 per tenant).
  const usedTenantIds = new Set(
    ((referrals || []) as ReferralCode[]).map((rc) => String(rc.tenant_id))
  );
  const availableTenants = tenants.filter((tn) => !usedTenantIds.has(tn.id));

  const handleCreate = async () => {
    if (!newTenantId) return;
    await createCode.mutateAsync({ tenant_id: newTenantId, code: newCode.trim() || undefined });
    setCreateOpen(false);
    setNewTenantId("");
    setNewCode("");
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600" />
      </div>
    );
  }

  const allReferrals = (referrals || []) as ReferralCode[];
  const list = allReferrals.filter((rc) =>
    matchesQuery(search, rc.code, (rc.tenant as Record<string, unknown>)?.name)
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-gray-100">
            {t("referrals.title")}
          </h1>
          <p className="text-sm sm:text-base text-gray-500 dark:text-gray-400">
            {t("referrals.description")}
          </p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center self-start sm:self-auto">
          <ListSearch
            name="referral-search"
            value={search}
            onChange={setSearch}
            placeholder={t("referrals.searchPlaceholder")}
          />
          <Button
            variant="secondary"
            size="sm"
            disabled={list.length === 0}
            onClick={() =>
              exportToCsv(
                list as unknown as Record<string, unknown>[],
                [
                  {
                    header: t("referrals.tenant"),
                    accessor: (r) => String((r.tenant as Record<string, unknown>)?.name ?? ""),
                  },
                  { header: t("referrals.code"), accessor: (r) => String(r.code ?? "") },
                  { header: t("referrals.active"), accessor: (r) => (r.is_active ? "yes" : "no") },
                  { header: t("referrals.referrals_count"), accessor: (r) => Number(r.referrals_count ?? 0) },
                  { header: t("referrals.converted_count"), accessor: (r) => Number(r.converted_count ?? 0) },
                ],
                "referrals"
              )
            }
          >
            <Download className="h-4 w-4 me-2" />
            {t("referrals.exportCsv")}
          </Button>
          <Button {...superOnly.button} size="sm" onClick={() => setCreateOpen(true)}>
            <Plus className="h-4 w-4 me-2" />
            {t("referrals.newCode")}
          </Button>
        </div>
      </div>

      <Modal isOpen={createOpen} onClose={() => setCreateOpen(false)} title={t("referrals.newCode")} size="sm">
        <div className="space-y-4">
          <Select
            name="referral-tenant"
            label={t("referrals.tenant")}
            value={newTenantId}
            onChange={(e) => setNewTenantId(e.target.value)}
            required
            options={[
              { value: "", label: t("referrals.selectTenant") },
              ...availableTenants.map((tn) => ({ value: tn.id, label: tn.name })),
            ]}
          />
          <Input
            name="referral-code"
            label={t("referrals.codeOptional")}
            value={newCode}
            onChange={(e) => setNewCode(e.target.value)}
            placeholder={t("referrals.codePlaceholder")}
          />
          <div className="flex justify-end gap-3 pt-2">
            <Button variant="secondary" onClick={() => setCreateOpen(false)}>
              {t("referrals.cancel")}
            </Button>
            <Button
  {...superOnly.button} onClick={handleCreate} isLoading={createCode.isPending} disabled={!newTenantId}>
              {t("referrals.create")}
            </Button>
          </div>
        </div>
      </Modal>

      <Card>
        <CardContent className="p-0">
          <MobileCardList isEmpty={list.length === 0} emptyLabel={t("referrals.empty")}>
            {list.map((rc) => {
              const tenant = rc.tenant as Record<string, unknown> | undefined;
              return (
                <MobileCard
                  key={String(rc.id)}
                  title={tenant ? String(tenant.name || "-") : "-"}
                  subtitle={<span className="font-mono">{String(rc.code || "-")}</span>}
                  badges={
                    <Badge variant={rc.is_active ? "success" : "default"}>
                      {rc.is_active ? t("common.yes") : t("common.no")}
                    </Badge>
                  }
                  fields={[
                    { label: t("referrals.referrals_count"), value: String(rc.referrals_count ?? 0) },
                    { label: t("referrals.converted_count"), value: String(rc.converted_count ?? 0) },
                  ]}
                  actions={
                    <Button
                      {...superOnly.button}
                      variant={rc.is_active ? "ghost" : "secondary"}
                      size="sm"
                      onClick={() =>
                        toggleCode.mutate({ id: String(rc.id), isActive: !rc.is_active })
                      }
                      isLoading={toggleCode.isPending && toggleCode.variables?.id === rc.id}
                    >
                      {rc.is_active ? t("referrals.deactivate") : t("referrals.activate")}
                    </Button>
                  }
                />
              );
            })}
          </MobileCardList>
          <div className="hidden md:block overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("referrals.tenant")}</TableHead>
                  <TableHead>{t("referrals.code")}</TableHead>
                  <TableHead>{t("referrals.active")}</TableHead>
                  <TableHead>{t("referrals.referrals_count")}</TableHead>
                  <TableHead>{t("referrals.converted_count")}</TableHead>
                  <TableHead className="text-end">{t("referrals.actions")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {list.map((rc) => {
                  const tenant = rc.tenant as Record<string, unknown> | undefined;
                  return (
                    <TableRow key={String(rc.id)}>
                      <TableCell className="font-medium text-gray-900 dark:text-gray-100">
                        {tenant ? String(tenant.name || "-") : "-"}
                      </TableCell>
                      <TableCell className="font-mono text-gray-600 dark:text-gray-400">
                        {String(rc.code || "-")}
                      </TableCell>
                      <TableCell>
                        <Badge variant={rc.is_active ? "success" : "default"}>
                          {rc.is_active ? t("common.yes") : t("common.no")}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-gray-900 dark:text-gray-100">
                        {String(rc.referrals_count ?? 0)}
                      </TableCell>
                      <TableCell className="text-gray-900 dark:text-gray-100">
                        {String(rc.converted_count ?? 0)}
                      </TableCell>
                      <TableCell className="text-end">
                        <Button
                          variant={rc.is_active ? "ghost" : "secondary"}
                          size="sm"
                          onClick={() =>
                            toggleCode.mutate({ id: String(rc.id), isActive: !rc.is_active })
                          }
                          isLoading={toggleCode.isPending && toggleCode.variables?.id === rc.id}
                        >
                          {rc.is_active ? t("referrals.deactivate") : t("referrals.activate")}
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
                {list.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-gray-500 dark:text-gray-400 py-8">
                      {t("referrals.empty")}
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
