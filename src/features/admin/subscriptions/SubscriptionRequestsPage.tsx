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
} from "@/components/ui";
import { LoadMoreSentinel } from "@/components/shared/LoadMoreSentinel";
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

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-gray-100">{t("subscriptionRequests.title")}</h1>
          <p className="text-sm sm:text-base text-gray-500 dark:text-gray-400">{t("subscriptionRequests.subtitle")}</p>
        </div>
        <Button
          variant="secondary"
          size="sm"
          disabled={requestList.length === 0}
          onClick={() =>
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
            )
          }
        >
          <Download className="h-4 w-4 mr-2" />
          {t("subscriptionRequests.exportCsv")}
        </Button>
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <CardTitle>{t("subscriptionRequests.list")}</CardTitle>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
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
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                <Input
                  name="request-search"
                  placeholder={t("subscriptionRequests.searchPlaceholder")}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  autoComplete="off"
                  className="pl-9"
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
              <Check className="h-4 w-4 mr-1" />
              {t("bulk.approve")}
            </Button>
            <Button
              {...superOnly.button}
              variant="danger"
              size="sm"
              onClick={() => setBulkRejectOpen(true)}
              isLoading={bulkBusy}
            >
              <X className="h-4 w-4 mr-1" />
              {t("bulk.reject")}
            </Button>
          </BulkBar>
          {/* Mobile card view */}
          <div className="md:hidden divide-y divide-gray-200 dark:divide-gray-700">
            {requestList.length > 0 ? (
              requestList.map((req) => (
                <div key={String(req.id)} className="p-4 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    {req.status === "pending" && (
                      <RowCheckbox
                        checked={selection.isSelected(String(req.id))}
                        onChange={() => selection.toggle(String(req.id))}
                        label={t("bulk.selectRow")}
                        disabled={!superOnly.allowed}
                      />
                    )}
                    <span className="flex-1 font-medium text-gray-900 dark:text-gray-100">
                      {String(
                        (req.tenant as Record<string, unknown>)?.name ||
                        req.tenant_name ||
                        "-"
                      )}
                    </span>
                    {req.status === "pending" && (
                      <div className="flex items-center gap-2">
                        <button
                          {...superOnly.icon}
                          onClick={() => setApproveId(String(req.id))}
                          className="p-1 text-gray-500 hover:text-green-600 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                          title={t("subscriptionRequests.approve")}
                          aria-label={t("subscriptionRequests.approve")}
                        >
                          <Check className="h-4 w-4" />
                        </button>
                        <button
                          {...superOnly.icon}
                          onClick={() => setRejectId(String(req.id))}
                          className="p-1 text-gray-500 hover:text-red-600 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                          title={t("subscriptionRequests.reject")}
                          aria-label={t("subscriptionRequests.reject")}
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </div>
                    )}
                  </div>
                  <div className="text-sm text-gray-600 dark:text-gray-400">
                    {String(req.request_type || req.type || "-")} &middot; {String((req.target_plan as Record<string, unknown>)?.name || req.plan_name || "-")}
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant={getStatusVariant(String(req.status || ""))}>
                      {String(req.status || "-")}
                    </Badge>
                    {!!req.coupon_code && (
                      <Badge variant="info">{String(req.coupon_code)}</Badge>
                    )}
                  </div>
                  <div className="text-sm text-gray-500">
                    {req.created_at
                      ? new Date(String(req.created_at)).toLocaleDateString()
                      : "-"}
                  </div>
                </div>
              ))
            ) : (
              <div className="py-8 text-center text-gray-500 dark:text-gray-400">{t("subscriptionRequests.noRequests")}</div>
            )}
          </div>
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
                  <TableHead>{t("subscriptionRequests.requestType")}</TableHead>
                  <TableHead>{t("subscriptionRequests.targetPlan")}</TableHead>
                  <TableHead>{t("subscriptionRequests.status")}</TableHead>
                  <TableHead>{t("subscriptionRequests.coupon")}</TableHead>
                  <TableHead>{t("subscriptionRequests.created")}</TableHead>
                  <TableHead className="w-28">{t("subscriptionRequests.actions")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {requestList.length > 0 ? (
                  requestList.map((req) => (
                    <TableRow key={String(req.id)}>
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
                      <TableCell className="text-gray-600 dark:text-gray-400">
                        {String(req.request_type || req.type || "-")}
                      </TableCell>
                      <TableCell className="text-gray-600 dark:text-gray-400">
                        {String((req.target_plan as Record<string, unknown>)?.name || req.plan_name || "-")}
                      </TableCell>
                      <TableCell>
                        <Badge variant={getStatusVariant(String(req.status || ""))}>
                          {String(req.status || "-")}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-gray-600 dark:text-gray-400">
                        {req.coupon_code ? (
                          <Badge variant="info">{String(req.coupon_code)}</Badge>
                        ) : (
                          "-"
                        )}
                      </TableCell>
                      <TableCell className="text-gray-600 dark:text-gray-400">
                        {req.created_at
                          ? new Date(String(req.created_at)).toLocaleDateString()
                          : "-"}
                      </TableCell>
                      <TableCell>
                        {req.status === "pending" && (
                          <div className="flex items-center gap-2">
                            <button
                              {...superOnly.icon}
                              onClick={() => setApproveId(String(req.id))}
                              className="p-1 text-gray-500 hover:text-green-600 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                              title={t("subscriptionRequests.approve")}
                              aria-label={t("subscriptionRequests.approve")}
                            >
                              <Check className="h-4 w-4" />
                            </button>
                            <button
                              {...superOnly.icon}
                              onClick={() => setRejectId(String(req.id))}
                              className="p-1 text-gray-500 hover:text-red-600 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                              title={t("subscriptionRequests.reject")}
                              aria-label={t("subscriptionRequests.reject")}
                            >
                              <X className="h-4 w-4" />
                            </button>
                          </div>
                        )}
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center text-gray-500 dark:text-gray-400 py-8">
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
        <p className="text-gray-600 dark:text-gray-400 mb-6">
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
