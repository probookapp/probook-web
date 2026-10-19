"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "@/lib/navigation";
import { useTranslation } from "react-i18next";
import { Check, X, Search, Download } from "lucide-react";
import { exportToCsv } from "@/lib/csv-export";
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Modal,
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
  Badge,
  Select,
  Input,
  Textarea,
  PageHeader,
  RowActions,
  type RowAction,
  ColumnPicker,
} from "@/components/ui";
import { LoadMoreSentinel } from "@/components/shared/LoadMoreSentinel";
import { useTableColumns } from "@/hooks/useTableColumns";
import {
  BulkBar,
  RowCheckbox,
  runBulk,
  useRowSelection,
} from "@/features/admin/components/BulkSelection";
import { toast } from "@/stores/useToastStore";
import {
  useAdminSubscriptionRequestsInfinite,
  useApproveSubscriptionRequest,
  useRejectSubscriptionRequest,
} from "./hooks/useSubscriptions";
import { useSuperAdminOnly } from "@/features/admin/hooks/useSuperAdmin";
import { MobileCard, MobileCardList } from "@/features/admin/components/MobileCard";

type SubRequest = Record<string, unknown>;

function getStatusVariant(status: string): "success" | "warning" | "danger" | "default" {
  switch (status) {
    case "approved":
      return "success";
    case "pending":
      return "warning";
    case "rejected":
      return "danger";
    default:
      return "default";
  }
}

export function SubscriptionRequestsPage() {
  const { t } = useTranslation("admin");
  const superOnly = useSuperAdminOnly();
  const [statusFilter, setStatusFilter] = useState("pending");
  const [approveId, setApproveId] = useState<string | null>(null);
  const [rejectId, setRejectId] = useState<string | null>(null);
  const [rejectNotes, setRejectNotes] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const router = useRouter();

  // Debounce before hitting the route's server-side tenant search.
  const [debouncedSearch, setDebouncedSearch] = useState("");
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(searchQuery), 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const {
    data: requestPages,
    isLoading,
    hasNextPage,
    isFetchingNextPage,
    fetchNextPage,
  } = useAdminSubscriptionRequestsInfinite({
    status: statusFilter || undefined,
    search: debouncedSearch || undefined,
  });
  const requests = useMemo(
    () => requestPages?.pages.flatMap((page) => page.data),
    [requestPages]
  );
  const selection = useRowSelection();
  const [bulkRejectOpen, setBulkRejectOpen] = useState(false);
  const [bulkBusy, setBulkBusy] = useState(false);
  const approveRequest = useApproveSubscriptionRequest();
  const rejectRequest = useRejectSubscriptionRequest();

  const handleApprove = async (id: string) => {
    await approveRequest.mutateAsync(id);
    setApproveId(null);
  };

  const handleReject = async (id: string) => {
    await rejectRequest.mutateAsync({
      id,
      input: { admin_notes: rejectNotes },
    });
    setRejectId(null);
    setRejectNotes("");
  };

  const reportBulk = ({ ok, failed }: { ok: number; failed: number }) => {
    // One summary rather than a toast per row: the global error toast would
    // otherwise fire once for every failure in the batch.
    if (failed === 0) toast.success(t("bulk.done", { count: ok }));
    else toast.warning(t("bulk.partial", { ok, failed }));
    selection.clear();
  };

  const handleBulkApprove = async () => {
    setBulkBusy(true);
    try {
      reportBulk(await runBulk(selection.selected, (id) => approveRequest.mutateAsync(id)));
    } finally {
      setBulkBusy(false);
    }
  };

  const handleBulkReject = async () => {
    setBulkBusy(true);
    try {
      reportBulk(
        await runBulk(selection.selected, (id) =>
          rejectRequest.mutateAsync({ id, input: { admin_notes: rejectNotes } })
        )
      );
      setBulkRejectOpen(false);
      setRejectNotes("");
    } finally {
      setBulkBusy(false);
    }
  };

  const columns = useTableColumns(
    "admin-subscription-requests",
    [
      { key: "select", label: "", hideable: false },
      { key: "tenant", label: t("subscriptionRequests.tenant"), hideable: false },
      { key: "requestType", label: t("subscriptionRequests.requestType") },
      { key: "targetPlan", label: t("subscriptionRequests.targetPlan") },
      { key: "status", label: t("subscriptionRequests.status") },
      { key: "coupon", label: t("subscriptionRequests.coupon"), isEmpty: (r: SubRequest) => !r.coupon_code },
      { key: "created", label: t("subscriptionRequests.created") },
      { key: "actions", label: "", hideable: false },
    ],
    requests as SubRequest[] | undefined
  );

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600" />
      </div>
    );
  }

  const requestList = (requests || []) as SubRequest[];
  const pendingIds = requestList
    .filter((req) => req.status === "pending")
    .map((req) => String(req.id));

  /**
   * The row's actions, shared by the table row and the phone card. Approve and
   * reject are the whole job of this page: both stay inline.
   */
  const requestActions = (req: SubRequest): RowAction[] => [
    {
      key: "approve",
      label: t("subscriptionRequests.approve"),
      icon: Check,
      onSelect: () => setApproveId(String(req.id)),
      primary: true,
      tone: "success",
      disabled: !superOnly.allowed,
      disabledReason: superOnly.icon.title,
      hidden: req.status !== "pending",
    },
    {
      key: "reject",
      label: t("subscriptionRequests.reject"),
      icon: X,
      onSelect: () => setRejectId(String(req.id)),
      primary: true,
      danger: true,
      disabled: !superOnly.allowed,
      disabledReason: superOnly.icon.title,
      hidden: req.status !== "pending",
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title={t("subscriptionRequests.title")}
        subtitle={t("subscriptionRequests.subtitle")}
        secondaryActions={[
          {
            key: "export",
            label: t("subscriptionRequests.exportCsv"),
            icon: Download,
            disabled: requestList.length === 0,
            onSelect: () =>
              exportToCsv(
                requestList,
                [
                  {
                    header: t("subscriptionRequests.tenant"),
                    accessor: (r) => String((r.tenant as Record<string, unknown>)?.name ?? ""),
                  },
                  { header: t("subscriptionRequests.requestType"), accessor: (r) => String(r.request_type ?? "") },
                  {
                    header: t("subscriptionRequests.targetPlan"),
                    accessor: (r) => String((r.target_plan as Record<string, unknown>)?.name ?? ""),
                  },
                  { header: t("subscriptionRequests.status"), accessor: (r) => String(r.status ?? "") },
                  { header: t("subscriptionRequests.coupon"), accessor: (r) => String(r.coupon_code ?? "") },
                  {
                    header: t("subscriptionRequests.created"),
                    accessor: (r) => (r.created_at ? String(r.created_at).slice(0, 10) : ""),
                  },
                ],
                "subscription-requests"
              ),
          },
        ]}
      />

      <Card>
        <CardHeader>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <CardTitle>{t("subscriptionRequests.list")}</CardTitle>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <ColumnPicker columns={columns} />
              <Select
                name="status-filter"
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="w-full sm:w-40"
                options={[
                  { value: "", label: t("subscriptionRequests.allStatuses") },
                  { value: "pending", label: t("subscriptionRequests.pending") },
                  { value: "approved", label: t("subscriptionRequests.approved") },
                  { value: "rejected", label: t("subscriptionRequests.rejected") },
                ]}
              />
              <div className="relative w-full sm:w-56">
                <Search className="absolute start-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                <Input
                  name="request-search"
                  placeholder={t("subscriptionRequests.searchPlaceholder")}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  autoComplete="off"
                  className="ps-9"
                />
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <BulkBar count={selection.selected.length} onClear={selection.clear}>
            <Button
              {...superOnly.button}
              size="sm"
              onClick={handleBulkApprove}
              isLoading={bulkBusy}
            >
              <Check className="h-4 w-4 me-1" />
              {t("bulk.approve")}
            </Button>
            <Button
              {...superOnly.button}
              variant="danger"
              size="sm"
              onClick={() => setBulkRejectOpen(true)}
              isLoading={bulkBusy}
            >
              <X className="h-4 w-4 me-1" />
              {t("bulk.reject")}
            </Button>
          </BulkBar>
          {/* Mobile card view */}
          <MobileCardList isEmpty={requestList.length === 0} emptyLabel={t("subscriptionRequests.noRequests")}>
            {requestList.map((req) => (
              <MobileCard
                key={String(req.id)}
                title={String((req.tenant as Record<string, unknown>)?.name || req.tenant_name || "-")}
                subtitle={`${String(req.request_type || req.type || "-")} · ${String(
                  (req.target_plan as Record<string, unknown>)?.name || req.plan_name || "-"
                )}`}
                badges={
                  <>
                    <Badge variant={getStatusVariant(String(req.status || ""))}>
                      {String(req.status || "-")}
                    </Badge>
                    {!!req.coupon_code && <Badge variant="info">{String(req.coupon_code)}</Badge>}
                  </>
                }
                fields={[
                  {
                    label: t("subscriptionRequests.created"),
                    value: req.created_at ? new Date(String(req.created_at)).toLocaleDateString() : "-",
                  },
                ]}
                onActivate={req.tenant_id ? () => router.push(`/admin/tenants/${req.tenant_id}`) : undefined}
                actions={
                  <>
                    {req.status === "pending" && (
                      <RowCheckbox
                        checked={selection.isSelected(String(req.id))}
                        onChange={() => selection.toggle(String(req.id))}
                        label={t("bulk.selectRow")}
                        disabled={!superOnly.allowed}
                      />
                    )}
                    <RowActions actions={requestActions(req)} />
                  </>
                }
              />
            ))}
          </MobileCardList>
          {/* Desktop table view */}
          <div className="hidden md:block overflow-x-auto">
            <Table className="min-w-200">
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10">
                    <RowCheckbox
                      checked={pendingIds.length > 0 && selection.selected.length === pendingIds.length}
                      onChange={() => selection.toggleAll(pendingIds)}
                      label={t("bulk.selectAll")}
                      disabled={!superOnly.allowed || pendingIds.length === 0}
                    />
                  </TableHead>
                  <TableHead>{t("subscriptionRequests.tenant")}</TableHead>
                  {columns.show("requestType") && <TableHead>{t("subscriptionRequests.requestType")}</TableHead>}
                  {columns.show("targetPlan") && <TableHead>{t("subscriptionRequests.targetPlan")}</TableHead>}
                  {columns.show("status") && <TableHead>{t("subscriptionRequests.status")}</TableHead>}
                  {columns.show("coupon") && <TableHead>{t("subscriptionRequests.coupon")}</TableHead>}
                  {columns.show("created") && <TableHead>{t("subscriptionRequests.created")}</TableHead>}
                  <TableHead className="w-px text-end">{t("subscriptionRequests.actions")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {requestList.length > 0 ? (
                  requestList.map((req) => (
                    <TableRow
                      key={String(req.id)}
                      onActivate={req.tenant_id ? () => router.push(`/admin/tenants/${req.tenant_id}`) : undefined}
                    >
                      <TableCell>
                        {req.status === "pending" && (
                          <RowCheckbox
                            checked={selection.isSelected(String(req.id))}
                            onChange={() => selection.toggle(String(req.id))}
                            label={t("bulk.selectRow")}
                            disabled={!superOnly.allowed}
                          />
                        )}
                      </TableCell>
                      <TableCell className="font-medium text-gray-900 dark:text-gray-100">
                        {req.tenant_id ? (
                          <button
                            onClick={() => router.push(`/admin/tenants/${req.tenant_id}`)}
                            className="text-primary-600 dark:text-primary-400 hover:underline"
                          >
                            {String((req.tenant as Record<string, unknown>)?.name || req.tenant_name || "-")}
                          </button>
                        ) : (
                          String((req.tenant as Record<string, unknown>)?.name || req.tenant_name || "-")
                        )}
                      </TableCell>
                      {columns.show("requestType") && (
                        <TableCell className="text-gray-600 dark:text-gray-400">
                          {String(req.request_type || req.type || "-")}
                        </TableCell>
                      )}
                      {columns.show("targetPlan") && (
                        <TableCell className="text-gray-600 dark:text-gray-400">
                          {String((req.target_plan as Record<string, unknown>)?.name || req.plan_name || "-")}
                        </TableCell>
                      )}
                      {columns.show("status") && (
                        <TableCell>
                          <Badge variant={getStatusVariant(String(req.status || ""))}>
                            {String(req.status || "-")}
                          </Badge>
                        </TableCell>
                      )}
                      {columns.show("coupon") && (
                        <TableCell className="text-gray-600 dark:text-gray-400">
                          {req.coupon_code ? (
                            <Badge variant="info">{String(req.coupon_code)}</Badge>
                          ) : (
                            "-"
                          )}
                        </TableCell>
                      )}
                      {columns.show("created") && (
                        <TableCell className="text-gray-600 dark:text-gray-400">
                          {req.created_at
                            ? new Date(String(req.created_at)).toLocaleDateString()
                            : "-"}
                        </TableCell>
                      )}
                      <TableCell>
                        <RowActions actions={requestActions(req)} />
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={columns.visibleCount} className="text-center text-gray-500 dark:text-gray-400 py-8">
                      {t("subscriptionRequests.noRequests")}
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
          <LoadMoreSentinel
            hasNextPage={!!hasNextPage}
            isFetchingNextPage={isFetchingNextPage}
            fetchNextPage={fetchNextPage}
            loadedCount={requestList.length}
          />
        </CardContent>
      </Card>

      {/* Approve Confirmation */}
      <Modal
        isOpen={!!approveId}
        onClose={() => setApproveId(null)}
        title={t("subscriptionRequests.approveTitle")}
        size="sm"
      >
        <p className="text-gray-600 dark:text-gray-400 mb-6 wrap-anywhere">
          {t("subscriptionRequests.approveMessage")}
        </p>
        <div className="flex justify-end gap-3">
          <Button variant="secondary" onClick={() => setApproveId(null)}>
            {t("subscriptionRequests.cancel")}
          </Button>
          <Button
            {...superOnly.button}
            onClick={() => approveId && handleApprove(approveId)}
            isLoading={approveRequest.isPending}
          >
            {t("subscriptionRequests.approve")}
          </Button>
        </div>
      </Modal>

      {/* Bulk reject: one reason applied to the whole selection */}
      <Modal
        isOpen={bulkRejectOpen}
        onClose={() => setBulkRejectOpen(false)}
        title={t("bulk.rejectTitle", { count: selection.selected.length })}
        size="md"
      >
        <div className="space-y-4">
          <p className="text-gray-600 dark:text-gray-400">{t("subscriptionRequests.rejectMessage")}</p>
          <Textarea
            name="bulk-reject-notes"
            label={t("subscriptionRequests.adminNotes")}
            value={rejectNotes}
            onChange={(e) => setRejectNotes(e.target.value)}
            rows={3}
            placeholder={t("subscriptionRequests.rejectNotesPlaceholder")}
          />
          <div className="flex justify-end gap-3">
            <Button variant="secondary" onClick={() => setBulkRejectOpen(false)}>
              {t("subscriptionRequests.cancel")}
            </Button>
            <Button
              {...superOnly.button}
              variant="danger"
              onClick={handleBulkReject}
              isLoading={bulkBusy}
            >
              {t("bulk.reject")}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Reject Modal */}
      <Modal
        isOpen={!!rejectId}
        onClose={() => {
          setRejectId(null);
          setRejectNotes("");
        }}
        title={t("subscriptionRequests.rejectTitle")}
        size="md"
      >
        <div className="space-y-4">
          <p className="text-gray-600 dark:text-gray-400">
            {t("subscriptionRequests.rejectMessage")}
          </p>
          <Textarea
            name="reject-notes"
            label={t("subscriptionRequests.adminNotes")}
            value={rejectNotes}
            onChange={(e) => setRejectNotes(e.target.value)}
            rows={3}
            placeholder={t("subscriptionRequests.rejectNotesPlaceholder")}
          />
          <div className="flex justify-end gap-3">
            <Button
              variant="secondary"
              onClick={() => {
                setRejectId(null);
                setRejectNotes("");
              }}
            >
              {t("subscriptionRequests.cancel")}
            </Button>
            <Button
              {...superOnly.button}
              variant="danger"
              onClick={() => rejectId && handleReject(rejectId)}
              isLoading={rejectRequest.isPending}
            >
              {t("subscriptionRequests.reject")}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
