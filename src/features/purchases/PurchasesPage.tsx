import { useState, useEffect, useMemo } from "react";
import { useTranslation } from "react-i18next";
import {
  Plus,
  Pencil,
  Trash2,
  Search,
  CheckCircle,
  XCircle,
  Eye,
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
  TableNumericCell,
  Input,
  Badge,
  PageHeader,
  RowActions,
  ListCard,
  type RowAction,
  ColumnPicker,
} from "@/components/ui";
import { PurchaseForm } from "./components/PurchaseForm";
import { PurchaseConfirmModal } from "./components/PurchaseConfirmModal";
import { PurchaseDetailModal } from "./components/PurchaseDetailModal";
import { BulkActionBar } from "@/components/shared/BulkActionBar";
import { BulkDeleteModal } from "@/components/shared/BulkDeleteModal";
import { LoadMoreSentinel } from "@/components/shared/LoadMoreSentinel";
import { useSelection } from "@/hooks/useSelection";
import { useTableColumns } from "@/hooks/useTableColumns";
import { StatusFilterChips } from "@/components/shared/StatusFilterChips";
import { useDemoMode } from "@/components/providers/DemoModeProvider";
import { useAuthStore } from "@/stores/useAuthStore";
import { formatCurrency, formatDate } from "@/lib/utils";
import {
  useInfinitePurchases,
  usePurchase,
  useCreatePurchase,
  useUpdatePurchase,
  useDeletePurchase,
  useBatchDeletePurchases,
  useConfirmPurchase,
  useCancelPurchase,
} from "./hooks/usePurchases";
import type {
  PurchaseOrder,
  PurchaseOrderListItem,
  PurchaseOrderStatus,
  PurchasePaymentStatus,
  CreatePurchaseOrderInput,
  ConfirmPurchaseOrderInput,
} from "@/types";

type StatusFilter = "ALL" | PurchaseOrderStatus;

function getStatusBadgeVariant(
  status: PurchaseOrderStatus
): "warning" | "success" | "danger" | "info" {
  switch (status) {
    case "PENDING":
      return "warning";
    case "PARTIALLY_RECEIVED":
      return "info";
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
  const canCreate = useAuthStore((s) => s.hasPermission("purchases", "create"));
  const canEdit = useAuthStore((s) => s.hasPermission("purchases", "edit"));
  const canDelete = useAuthStore((s) => s.hasPermission("purchases", "delete"));

  const [showForm, setShowForm] = useState(false);
  const [editingPurchase, setEditingPurchase] = useState<PurchaseOrderListItem | undefined>();
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("ALL");
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [confirmingPurchase, setConfirmingPurchase] = useState<PurchaseOrderListItem | null>(null);
  const [cancelConfirmId, setCancelConfirmId] = useState<string | null>(null);
  const [viewingPurchase, setViewingPurchase] = useState<PurchaseOrderListItem | null>(null);

  const {
    data: purchasePages,
    isLoading,
    hasNextPage,
    isFetchingNextPage,
    fetchNextPage,
  } = useInfinitePurchases();
  const purchases = useMemo(
    () => purchasePages?.pages.flatMap((page) => page.data),
    [purchasePages]
  );
  // Lean list rows have no lines: edit/confirm fetch the full order by id.
  // Demo mode skips the fetch — DEMO_PURCHASES rows already carry their lines.
  const { data: editingFullData } = usePurchase(!isDemoMode ? editingPurchase?.id ?? "" : "");
  const editingFull = isDemoMode
    ? (editingPurchase as PurchaseOrder | undefined)
    : editingFullData;
  const { data: confirmingFullData } = usePurchase(!isDemoMode ? confirmingPurchase?.id ?? "" : "");
  const confirmingFull = isDemoMode
    ? (confirmingPurchase as PurchaseOrder | null)
    : confirmingFullData ?? null;
  const { data: viewingFullData } = usePurchase(!isDemoMode ? viewingPurchase?.id ?? "" : "");
  const viewingFull = isDemoMode
    ? (viewingPurchase as PurchaseOrder | null)
    : viewingFullData ?? null;
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

  const columns = useTableColumns(
    "purchases",
    [
      { key: "select", label: "", hideable: false },
      { key: "number", label: t("fields.orderNumber"), hideable: false },
      { key: "supplier", label: t("fields.supplier") },
      { key: "date", label: t("fields.date") },
      { key: "status", label: t("fields.status") },
      { key: "paymentStatus", label: t("fields.paymentStatus") },
      { key: "total", label: t("fields.total") },
      { key: "actions", label: "", hideable: false },
    ],
    filteredPurchases
  );

  const handleOpenForm = (purchase?: PurchaseOrderListItem) => {
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
    { key: "PARTIALLY_RECEIVED", label: t("filters.partiallyReceived") },
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

  /** Opening a purchase: the form while it is still pending and editable, its detail otherwise. */
  const openPurchase = (purchase: PurchaseOrderListItem) =>
    purchase.status === "PENDING" && canEdit ? handleOpenForm(purchase) : setViewingPurchase(purchase);

  /** The row's actions, shared by the table row and the phone card. */
  const purchaseActions = (purchase: PurchaseOrderListItem): RowAction[] => {
    const isPending = purchase.status === "PENDING";
    const isReceivable = isPending || purchase.status === "PARTIALLY_RECEIVED";
    return [
      {
        key: "confirm",
        label: t("actions.confirm"),
        icon: CheckCircle,
        onSelect: () => setConfirmingPurchase(purchase),
        primary: true,
        tone: "success",
        hidden: !(isReceivable && canEdit),
      },
      {
        key: "view",
        label: tCommon("buttons.view"),
        icon: Eye,
        onSelect: () => setViewingPurchase(purchase),
      },
      {
        key: "edit",
        label: tCommon("buttons.edit"),
        icon: Pencil,
        onSelect: () => handleOpenForm(purchase),
        hidden: !(isPending && canEdit),
      },
      {
        key: "cancel",
        label: t("actions.cancel"),
        icon: XCircle,
        onSelect: () => setCancelConfirmId(purchase.id),
        danger: true,
        hidden: !(isPending && canEdit),
      },
      {
        key: "delete",
        label: tCommon("buttons.delete"),
        icon: Trash2,
        onSelect: () => setDeleteConfirmId(purchase.id),
        danger: true,
        hidden: !(isPending && canDelete),
      },
    ];
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title={t("title")}
        subtitle={t("subtitle")}
        primaryAction={canCreate ? { label: t("newPurchase"), icon: Plus, onClick: () => handleOpenForm() } : undefined}
      />

      <Card>
        <CardHeader>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <CardTitle>{t("purchaseList")}</CardTitle>
            <div className="flex items-center gap-2 w-full sm:w-auto">
              <ColumnPicker columns={columns} />
              <div className="relative w-full sm:w-56 md:w-64 lg:w-72">
                <Search className="absolute start-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                <Input
                  id="purchase-search"
                  name="purchase-search"
                  placeholder={t("searchPlaceholder")}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  autoComplete="off"
                  className="ps-9"
                />
              </div>
            </div>
          </div>

          <StatusFilterChips
            options={statusFilters}
            value={statusFilter}
            onChange={(v) => setStatusFilter(v as StatusFilter)}
            label={tCommon("filters.filterByStatus")}
          />
        </CardHeader>

        <CardContent className="p-0">
          {/* Mobile card view */}
          <div className="md:hidden divide-y divide-gray-200 dark:divide-gray-700">
            {filteredPurchases.length > 0 ? (
              filteredPurchases.map((purchase) => (
                <ListCard
                  key={purchase.id}
                  onActivate={() => openPurchase(purchase)}
                  leading={
                    purchase.status === "PENDING" && (
                      <label className="-mx-3 -mb-3 -mt-2 p-3 shrink-0 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={selection.isSelected(purchase.id)}
                          onChange={() => selection.toggle(purchase.id)}
                          className="block h-4 w-4 text-primary-600 border-gray-300 rounded focus:ring-primary-500"
                        />
                      </label>
                    )
                  }
                  title={purchase.supplier?.name ?? "-"}
                  badge={
                    <Badge variant={getStatusBadgeVariant(purchase.status)}>
                      {t(`status.${purchase.status}`)}
                    </Badge>
                  }
                  meta={<><span className="font-mono">{purchase.order_number}</span> · {formatDate(purchase.order_date)}</>}
                  amount={formatCurrency(purchase.total)}
                  actions={<RowActions actions={purchaseActions(purchase)} />}
                >
                  <Badge variant={getPaymentBadgeVariant(purchase.payment_status)}>
                    {t(`paymentStatus.${purchase.payment_status}`)}
                  </Badge>
                </ListCard>
              ))
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
                    <label className="-m-3 p-3 inline-flex align-middle cursor-pointer">
                      <input
                        type="checkbox"
                        checked={selection.isAllSelected}
                        ref={(el) => {
                          if (el) el.indeterminate = selection.isIndeterminate;
                        }}
                        onChange={() => selection.toggleAll(selectablePurchases)}
                        className="h-4 w-4 text-primary-600 border-gray-300 rounded focus:ring-primary-500"
                      />
                    </label>
                  </TableHead>
                  <TableHead>{t("fields.orderNumber")}</TableHead>
                  {columns.show("supplier") && <TableHead>{t("fields.supplier")}</TableHead>}
                  {columns.show("date") && <TableHead>{t("fields.date")}</TableHead>}
                  {columns.show("status") && <TableHead>{t("fields.status")}</TableHead>}
                  {columns.show("paymentStatus") && <TableHead>{t("fields.paymentStatus")}</TableHead>}
                  {columns.show("total") && <TableHead className="text-end">{t("fields.total")}</TableHead>}
                  <TableHead className="w-px text-end">
                    {tCommon("buttons.actions")}
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredPurchases.length > 0 ? (
                  filteredPurchases.map((purchase) => {
                    const isPending = purchase.status === "PENDING";
                    return (
                      <TableRow
                        key={purchase.id}
                        onActivate={() => openPurchase(purchase)}
                      >
                        <TableCell>
                          {isPending ? (
                            <label className="-m-3 p-3 inline-flex align-middle cursor-pointer">
                              <input
                                type="checkbox"
                                checked={selection.isSelected(purchase.id)}
                                onChange={() => selection.toggle(purchase.id)}
                                className="h-4 w-4 text-primary-600 border-gray-300 rounded focus:ring-primary-500"
                              />
                            </label>
                          ) : (
                            <span />
                          )}
                        </TableCell>
                        <TableCell className="font-medium text-gray-900 dark:text-gray-100">
                          {purchase.order_number}
                        </TableCell>
                        {columns.show("supplier") && (
                          <TableCell className="text-gray-600 dark:text-gray-400">
                            {purchase.supplier?.name ?? "-"}
                          </TableCell>
                        )}
                        {columns.show("date") && (
                          <TableCell className="text-gray-600 dark:text-gray-400">
                            {formatDate(purchase.order_date)}
                          </TableCell>
                        )}
                        {columns.show("status") && (
                          <TableCell>
                            <Badge
                              variant={getStatusBadgeVariant(purchase.status)}
                            >
                              {t(`status.${purchase.status}`)}
                            </Badge>
                          </TableCell>
                        )}
                        {columns.show("paymentStatus") && (
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
                        )}
                        {columns.show("total") && (
                          <TableNumericCell className="text-gray-600 dark:text-gray-400">
                            {formatCurrency(purchase.total)}
                          </TableNumericCell>
                        )}
                        <TableCell>
                          <RowActions actions={purchaseActions(purchase)} />
                        </TableCell>
                      </TableRow>
                    );
                  })
                ) : (
                  <TableRow>
                    <TableCell
                      colSpan={columns.visibleCount}
                      className="text-center text-gray-500 dark:text-gray-400 py-8"
                    >
                      {t("noPurchases")}
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
            loadedCount={purchases?.length ?? 0}
          />
        </CardContent>
      </Card>

      {/* Purchase Form Modal */}
      <Modal
        isOpen={showForm}
        onClose={handleCloseForm}
        title={editingPurchase ? t("editPurchase") : t("newPurchase")}
        size="lg"
      >
        {editingPurchase && !editingFull ? (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600" />
          </div>
        ) : (
          <PurchaseForm
            key={editingPurchase?.id ?? "new"}
            purchase={editingPurchase ? editingFull : undefined}
            onSubmit={handleSubmit}
            onCancel={handleCloseForm}
            isLoading={createPurchase.isPending || updatePurchase.isPending}
          />
        )}
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

      {/* Read-only view, available whatever the status */}
      <PurchaseDetailModal
        open={!!viewingPurchase}
        onClose={() => setViewingPurchase(null)}
        purchaseOrder={viewingFull}
        isLoading={!viewingFull}
        statusVariant={getStatusBadgeVariant(viewingPurchase?.status ?? "PENDING")}
        paymentVariant={getPaymentBadgeVariant(viewingPurchase?.payment_status ?? "UNPAID")}
      />

      {/* Confirm purchase modal (opens once the full order — with lines — is loaded) */}
      <PurchaseConfirmModal
        key={confirmingFull?.id ?? "none"}
        open={!!confirmingPurchase && !!confirmingFull}
        onClose={() => setConfirmingPurchase(null)}
        purchaseOrder={confirmingFull}
        onConfirm={handleConfirm}
        isLoading={confirmPurchase.isPending}
      />

      {/* Bulk action bar */}
      {canDelete && (
        <BulkActionBar
          selectedCount={selection.selectedCount}
          onDelete={() => setBulkDeleteOpen(true)}
          onClear={selection.clear}
          isDeleting={batchDeletePurchases.isPending}
        />
      )}

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
