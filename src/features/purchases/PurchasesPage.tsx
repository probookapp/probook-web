import { useState, useEffect, useMemo } from "react";
import { useTranslation } from "react-i18next";
import {
  Plus,
  Pencil,
  Trash2,
  Search,
  CheckCircle,
  XCircle,
} from "lucide-react";
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
  Input,
  Badge,
} from "@/components/ui";
import { PurchaseForm } from "./components/PurchaseForm";
import { PurchaseConfirmModal } from "./components/PurchaseConfirmModal";
import { BulkActionBar } from "@/components/shared/BulkActionBar";
import { BulkDeleteModal } from "@/components/shared/BulkDeleteModal";
import { useSelection } from "@/hooks/useSelection";
import { useDemoMode } from "@/components/providers/DemoModeProvider";
import { formatCurrency, formatDate } from "@/lib/utils";
import {
  usePurchases,
  useCreatePurchase,
  useUpdatePurchase,
  useDeletePurchase,
  useBatchDeletePurchases,
  useConfirmPurchase,
  useCancelPurchase,
} from "./hooks/usePurchases";
import type {
  PurchaseOrder,
  PurchaseOrderStatus,
  PurchasePaymentStatus,
  CreatePurchaseOrderInput,
  ConfirmPurchaseOrderInput,
} from "@/types";

type StatusFilter = "ALL" | PurchaseOrderStatus;

function getStatusBadgeVariant(
  status: PurchaseOrderStatus
): "warning" | "success" | "danger" {
  switch (status) {
    case "PENDING":
      return "warning";
    case "CONFIRMED":
      return "success";
    case "CANCELLED":
      return "danger";
  }
}

function getPaymentBadgeVariant(
  status: PurchasePaymentStatus
): "danger" | "warning" | "success" {
  switch (status) {
    case "UNPAID":
      return "danger";
    case "PARTIAL":
      return "warning";
    case "PAID":
      return "success";
  }
}

export function PurchasesPage() {
  const { t } = useTranslation("purchases");
  const { t: tCommon } = useTranslation("common");
  const { isDemoMode, showSubscribePrompt } = useDemoMode();

  const [showForm, setShowForm] = useState(false);
  const [editingPurchase, setEditingPurchase] = useState<PurchaseOrder | undefined>();
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("ALL");
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [confirmingPurchase, setConfirmingPurchase] = useState<PurchaseOrder | null>(null);
  const [cancelConfirmId, setCancelConfirmId] = useState<string | null>(null);

  const { data: purchases, isLoading } = usePurchases();
  const createPurchase = useCreatePurchase();
  const updatePurchase = useUpdatePurchase();
  const deletePurchase = useDeletePurchase();
  const batchDeletePurchases = useBatchDeletePurchases();
  const confirmPurchase = useConfirmPurchase();
  const cancelPurchase = useCancelPurchase();

  const filteredPurchases = useMemo(() => {
    let result = purchases ?? [];

    // Status filter
    if (statusFilter !== "ALL") {
      result = result.filter((p) => p.status === statusFilter);
    }

    // Search filter
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      result = result.filter(
        (p) =>
          p.order_number.toLowerCase().includes(query) ||
          (p.supplier?.name ?? "").toLowerCase().includes(query)
      );
    }

    return result;
  }, [purchases, statusFilter, searchQuery]);

  // Only pending purchases can be selected for batch delete
  const selectablePurchases = useMemo(
    () => filteredPurchases.filter((p) => p.status === "PENDING"),
    [filteredPurchases]
  );

  const selection = useSelection(selectablePurchases);

  useEffect(() => {
    selection.clear();
  }, [searchQuery, statusFilter]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleOpenForm = (purchase?: PurchaseOrder) => {
    if (isDemoMode) {
      showSubscribePrompt();
      return;
    }
    setEditingPurchase(purchase);
    setShowForm(true);
  };

  const handleCloseForm = () => {
    setEditingPurchase(undefined);
    setShowForm(false);
  };

  const handleSubmit = async (input: CreatePurchaseOrderInput) => {
    if (editingPurchase) {
      await updatePurchase.mutateAsync({ ...input, id: editingPurchase.id });
    } else {
      await createPurchase.mutateAsync(input);
    }
    handleCloseForm();
  };

  const handleDelete = async (id: string) => {
    if (isDemoMode) {
      showSubscribePrompt();
      return;
    }
    await deletePurchase.mutateAsync(id);
    setDeleteConfirmId(null);
  };

  const handleConfirm = async (input: ConfirmPurchaseOrderInput) => {
    if (isDemoMode) { showSubscribePrompt(); return; }
    if (!confirmingPurchase) return;
    await confirmPurchase.mutateAsync({ id: confirmingPurchase.id, input });
    setConfirmingPurchase(null);
  };

  const handleCancel = async (id: string) => {
    if (isDemoMode) {
      showSubscribePrompt();
      return;
    }
    await cancelPurchase.mutateAsync(id);
    setCancelConfirmId(null);
  };

  const statusFilters: { key: StatusFilter; label: string }[] = [
    { key: "ALL", label: t("filters.all") },
    { key: "PENDING", label: t("filters.pending") },
    { key: "CONFIRMED", label: t("filters.confirmed") },
    { key: "CANCELLED", label: t("filters.cancelled") },
  ];

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-gray-100">
            {t("title")}
          </h1>
          <p className="text-sm sm:text-base text-gray-500 dark:text-gray-400">
            {t("subtitle")}
          </p>
        </div>
        <Button
          onClick={() => handleOpenForm()}
          size="sm"
          className="self-start sm:self-auto"
        >
          <Plus className="h-4 w-4 mr-2" />
          {t("newPurchase")}
        </Button>
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <CardTitle>{t("purchaseList")}</CardTitle>
            <div className="relative w-full sm:w-56 md:w-64 lg:w-72">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
              <Input
                id="purchase-search"
                name="purchase-search"
                placeholder={t("searchPlaceholder")}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                autoComplete="off"
                className="pl-9"
              />
            </div>
          </div>

          {/* Status filter chips */}
          <div className="flex flex-wrap gap-2 mt-3">
            {statusFilters.map((filter) => (
              <button
                key={filter.key}
                onClick={() => setStatusFilter(filter.key)}
                className={`px-3 py-1 rounded-full text-sm font-medium transition-colors ${
                  statusFilter === filter.key
                    ? "bg-primary-600 text-white"
                    : "bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600"
                }`}
              >
                {filter.label}
              </button>
            ))}
          </div>
        </CardHeader>

        <CardContent className="p-0">
          {/* Mobile card view */}
          <div className="md:hidden divide-y divide-gray-200 dark:divide-gray-700">
            {filteredPurchases.length > 0 ? (
              filteredPurchases.map((purchase) => {
                const isPending = purchase.status === "PENDING";
                return (
                  <div key={purchase.id} className="p-4 flex items-start gap-3">
                    {isPending && (
                      <input
                        type="checkbox"
                        checked={selection.isSelected(purchase.id)}
                        onChange={() => selection.toggle(purchase.id)}
                        className="mt-0.5 h-4 w-4 text-primary-600 border-gray-300 rounded focus:ring-primary-500"
                      />
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <p className="font-medium text-gray-900 dark:text-gray-100 truncate">
                          {purchase.order_number}
                        </p>
                        <p className="font-medium text-gray-900 dark:text-gray-100 shrink-0">
                          {formatCurrency(purchase.total)}
                        </p>
                      </div>
                      <p className="text-sm text-gray-500 dark:text-gray-400">
                        {purchase.supplier?.name ?? "-"}
                      </p>
                      <p className="text-sm text-gray-500 dark:text-gray-400">
                        {formatDate(purchase.order_date)}
                      </p>
                      <div className="flex gap-2 mt-1">
                        <Badge variant={getStatusBadgeVariant(purchase.status)}>
                          {t(`status.${purchase.status}`)}
                        </Badge>
                        <Badge
                          variant={getPaymentBadgeVariant(
                            purchase.payment_status
                          )}
                        >
                          {t(
                            `paymentStatus.${purchase.payment_status}`
                          )}
                        </Badge>
                      </div>
                      {isPending && (
                        <div className="flex justify-end gap-1 mt-2">
                          <button
                            onClick={() => handleOpenForm(purchase)}
                            className="p-1 text-gray-500 hover:text-primary-600 dark:hover:text-primary-400"
                            title={tCommon("buttons.edit")}
                            aria-label={tCommon("buttons.edit")}
                          >
                            <Pencil className="h-4 w-4" />
                          </button>
                          <button
                            onClick={() => setConfirmingPurchase(purchase)}
                            className="p-1 text-gray-500 hover:text-green-600 dark:hover:text-green-400"
                            title={t("actions.confirm")}
                            aria-label={t("actions.confirm")}
                          >
                            <CheckCircle className="h-4 w-4" />
                          </button>
                          <button
                            onClick={() => setCancelConfirmId(purchase.id)}
                            className="p-1 text-gray-500 hover:text-yellow-600 dark:hover:text-yellow-400"
                            title={t("actions.cancel")}
                            aria-label={t("actions.cancel")}
                          >
                            <XCircle className="h-4 w-4" />
                          </button>
                          <button
                            onClick={() => setDeleteConfirmId(purchase.id)}
                            className="p-1 text-gray-500 hover:text-red-600"
                            title={tCommon("buttons.delete")}
                            aria-label={tCommon("buttons.delete")}
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })
            ) : (
              <div className="py-8 text-center text-gray-500 dark:text-gray-400">
                {t("noPurchases")}
              </div>
            )}
          </div>

          {/* Desktop table view */}
          <div className="hidden md:block overflow-x-auto">
            <Table className="min-w-150">
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10">
                    <input
                      type="checkbox"
                      checked={selection.isAllSelected}
                      ref={(el) => {
                        if (el) el.indeterminate = selection.isIndeterminate;
                      }}
                      onChange={() => selection.toggleAll(selectablePurchases)}
                      className="h-4 w-4 text-primary-600 border-gray-300 rounded focus:ring-primary-500"
                    />
                  </TableHead>
                  <TableHead>{t("fields.orderNumber")}</TableHead>
                  <TableHead>{t("fields.supplier")}</TableHead>
                  <TableHead>{t("fields.date")}</TableHead>
                  <TableHead>{t("fields.status")}</TableHead>
                  <TableHead>{t("fields.paymentStatus")}</TableHead>
                  <TableHead>{t("fields.total")}</TableHead>
                  <TableHead className="w-32">
                    {tCommon("buttons.actions")}
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredPurchases.length > 0 ? (
                  filteredPurchases.map((purchase) => {
                    const isPending = purchase.status === "PENDING";
                    return (
                      <TableRow key={purchase.id}>
                        <TableCell>
                          {isPending ? (
                            <input
                              type="checkbox"
                              checked={selection.isSelected(purchase.id)}
                              onChange={() => selection.toggle(purchase.id)}
                              className="h-4 w-4 text-primary-600 border-gray-300 rounded focus:ring-primary-500"
                            />
                          ) : (
                            <span />
                          )}
                        </TableCell>
                        <TableCell className="font-medium text-gray-900 dark:text-gray-100">
                          {purchase.order_number}
                        </TableCell>
                        <TableCell className="text-gray-600 dark:text-gray-400">
                          {purchase.supplier?.name ?? "-"}
                        </TableCell>
                        <TableCell className="text-gray-600 dark:text-gray-400">
                          {formatDate(purchase.order_date)}
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant={getStatusBadgeVariant(purchase.status)}
                          >
                            {t(`status.${purchase.status}`)}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant={getPaymentBadgeVariant(
                              purchase.payment_status
                            )}
                          >
                            {t(
                              `paymentStatus.${purchase.payment_status}`
                            )}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-gray-600 dark:text-gray-400">
                          {formatCurrency(purchase.total)}
                        </TableCell>
                        <TableCell>
                          {isPending && (
                            <div className="flex items-center gap-1">
                              <button
                                onClick={() => handleOpenForm(purchase)}
                                className="p-1 text-gray-500 hover:text-primary-600 dark:hover:text-primary-400 transition-colors"
                                title={tCommon("buttons.edit")}
                                aria-label={tCommon("buttons.edit")}
                              >
                                <Pencil className="h-4 w-4" />
                              </button>
                              <button
                                onClick={() =>
                                  setConfirmingPurchase(purchase)
                                }
                                className="p-1 text-gray-500 hover:text-green-600 dark:hover:text-green-400 transition-colors"
                                title={t("actions.confirm")}
                                aria-label={t("actions.confirm")}
                              >
                                <CheckCircle className="h-4 w-4" />
                              </button>
                              <button
                                onClick={() =>
                                  setCancelConfirmId(purchase.id)
                                }
                                className="p-1 text-gray-500 hover:text-yellow-600 dark:hover:text-yellow-400 transition-colors"
                                title={t("actions.cancel")}
                                aria-label={t("actions.cancel")}
                              >
                                <XCircle className="h-4 w-4" />
                              </button>
                              <button
                                onClick={() =>
                                  setDeleteConfirmId(purchase.id)
                                }
                                className="p-1 text-gray-500 hover:text-red-600 transition-colors"
                                title={tCommon("buttons.delete")}
                                aria-label={tCommon("buttons.delete")}
                              >
                                <Trash2 className="h-4 w-4" />
                              </button>
                            </div>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })
                ) : (
                  <TableRow>
                    <TableCell
                      colSpan={8}
                      className="text-center text-gray-500 dark:text-gray-400 py-8"
                    >
                      {t("noPurchases")}
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Purchase Form Modal */}
      <Modal
        isOpen={showForm}
        onClose={handleCloseForm}
        title={editingPurchase ? t("editPurchase") : t("newPurchase")}
        size="lg"
      >
        <PurchaseForm
          purchase={editingPurchase}
          onSubmit={handleSubmit}
          onCancel={handleCloseForm}
          isLoading={createPurchase.isPending || updatePurchase.isPending}
        />
      </Modal>

      {/* Delete confirm modal */}
      <Modal
        isOpen={!!deleteConfirmId}
        onClose={() => setDeleteConfirmId(null)}
        title={tCommon("messages.confirmDelete")}
        size="sm"
      >
        <p className="text-gray-600 dark:text-gray-400 mb-6">
          {t("deleteConfirmation")}
        </p>
        <div className="flex justify-end gap-3">
          <Button
            variant="secondary"
            onClick={() => setDeleteConfirmId(null)}
          >
            {tCommon("buttons.cancel")}
          </Button>
          <Button
            variant="danger"
            onClick={() => deleteConfirmId && handleDelete(deleteConfirmId)}
            isLoading={deletePurchase.isPending}
          >
            {tCommon("buttons.delete")}
          </Button>
        </div>
      </Modal>

      {/* Cancel confirm modal */}
      <Modal
        isOpen={!!cancelConfirmId}
        onClose={() => setCancelConfirmId(null)}
        title={t("cancelModal.title")}
        size="sm"
      >
        <p className="text-gray-600 dark:text-gray-400 mb-6">
          {t("cancelModal.description")}
        </p>
        <div className="flex justify-end gap-3">
          <Button
            variant="secondary"
            onClick={() => setCancelConfirmId(null)}
          >
            {tCommon("buttons.cancel")}
          </Button>
          <Button
            variant="danger"
            onClick={() => cancelConfirmId && handleCancel(cancelConfirmId)}
            isLoading={cancelPurchase.isPending}
          >
            {t("actions.cancel")}
          </Button>
        </div>
      </Modal>

      {/* Confirm purchase modal */}
      <PurchaseConfirmModal
        open={!!confirmingPurchase}
        onClose={() => setConfirmingPurchase(null)}
        purchaseOrder={confirmingPurchase}
        onConfirm={handleConfirm}
        isLoading={confirmPurchase.isPending}
      />

      {/* Bulk action bar */}
      <BulkActionBar
        selectedCount={selection.selectedCount}
        onDelete={() => setBulkDeleteOpen(true)}
        onClear={selection.clear}
        isDeleting={batchDeletePurchases.isPending}
      />

      {/* Bulk delete modal */}
      <BulkDeleteModal
        isOpen={bulkDeleteOpen}
        onClose={() => setBulkDeleteOpen(false)}
        onConfirm={async () => {
          if (isDemoMode) {
            showSubscribePrompt();
            return;
          }
          await batchDeletePurchases.mutateAsync(
            Array.from(selection.selectedIds)
          );
          selection.clear();
          setBulkDeleteOpen(false);
        }}
        count={selection.selectedCount}
        isLoading={batchDeletePurchases.isPending}
      />
    </div>
  );
}
