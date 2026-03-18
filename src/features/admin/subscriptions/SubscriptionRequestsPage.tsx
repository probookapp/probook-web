"use client";

import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Check, X } from "lucide-react";
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
  Textarea,
} from "@/components/ui";
import {
  useAdminSubscriptionRequests,
  useApproveSubscriptionRequest,
  useRejectSubscriptionRequest,
} from "./hooks/useSubscriptions";

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
  const [statusFilter, setStatusFilter] = useState("pending");
  const [approveId, setApproveId] = useState<string | null>(null);
  const [rejectId, setRejectId] = useState<string | null>(null);
  const [rejectNotes, setRejectNotes] = useState("");

  const { data: requests, isLoading } = useAdminSubscriptionRequests({
    status: statusFilter || undefined,
  });
  const approveRequest = useApproveSubscriptionRequest();
  const rejectRequest = useRejectSubscriptionRequest();

  const handleApprove = async (id: string) => {
    await approveRequest.mutateAsync(id);
    setApproveId(null);
  };

  const handleReject = async (id: string) => {
    await rejectRequest.mutateAsync({
      id,
      input: { notes: rejectNotes },
    });
    setRejectId(null);
    setRejectNotes("");
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600" />
      </div>
    );
  }

  const requestList = (requests || []) as SubRequest[];

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-gray-100">{t("subscriptionRequests.title")}</h1>
          <p className="text-sm sm:text-base text-gray-500 dark:text-gray-400">{t("subscriptionRequests.subtitle")}</p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <CardTitle>{t("subscriptionRequests.list")}</CardTitle>
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
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {/* Mobile card view */}
          <div className="md:hidden divide-y divide-gray-200 dark:divide-gray-700">
            {requestList.length > 0 ? (
              requestList.map((req) => (
                <div key={String(req.id)} className="p-4 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-gray-900 dark:text-gray-100">
                      {String(
                        (req.tenant as Record<string, unknown>)?.name ||
                        req.tenant_name ||
                        "-"
                      )}
                    </span>
                    {req.status === "pending" && (
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => setApproveId(String(req.id))}
                          className="p-1 text-gray-500 hover:text-green-600 transition-colors"
                          title={t("subscriptionRequests.approve")}
                          aria-label={t("subscriptionRequests.approve")}
                        >
                          <Check className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => setRejectId(String(req.id))}
                          className="p-1 text-gray-500 hover:text-red-600 transition-colors"
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
            <Table className="min-w-[800px]">
              <TableHeader>
                <TableRow>
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
                      <TableCell className="font-medium text-gray-900 dark:text-gray-100">
                        {String(
                          (req.tenant as Record<string, unknown>)?.name ||
                          req.tenant_name ||
                          "-"
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
                              onClick={() => setApproveId(String(req.id))}
                              className="p-1 text-gray-500 hover:text-green-600 transition-colors"
                              title={t("subscriptionRequests.approve")}
                              aria-label={t("subscriptionRequests.approve")}
                            >
                              <Check className="h-4 w-4" />
                            </button>
                            <button
                              onClick={() => setRejectId(String(req.id))}
                              className="p-1 text-gray-500 hover:text-red-600 transition-colors"
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
                    <TableCell colSpan={7} className="text-center text-gray-500 dark:text-gray-400 py-8">
                      {t("subscriptionRequests.noRequests")}
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
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
            onClick={() => approveId && handleApprove(approveId)}
            isLoading={approveRequest.isPending}
          >
            {t("subscriptionRequests.approve")}
          </Button>
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
