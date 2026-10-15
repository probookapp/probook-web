import { useState, useEffect, useMemo } from "react";
import { useRouter } from "@/lib/navigation";
import { useTranslation } from "react-i18next";
import {
  Plus,
  Eye,
  Pencil,
  Trash2,
  Search,
  CheckCircle,
  FileDown,
  Copy,
  Download,
  Undo2,
  Archive,
  ArchiveRestore,
  Tag as TagIcon,
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
  TagChip,
  PageHeader,
  RowActions,
  ListCard,
  type RowAction,
  ColumnPicker,
  getInvoiceStatusVariantWithUrgency,
  getInvoiceStatusLabelWithUrgency,
} from "@/components/ui";
import { BulkActionBar } from "@/components/shared/BulkActionBar";
import { BulkDeleteModal } from "@/components/shared/BulkDeleteModal";
import { LoadMoreSentinel } from "@/components/shared/LoadMoreSentinel";
import { StatusFilterChips } from "@/components/shared/StatusFilterChips";
import { ALL_STATUSES, ARCHIVED_FILTER, chipToQuery, INVOICE_STATUSES } from "@/lib/document-status";
import { useStatusFilter } from "@/hooks/useStatusFilter";
import { useTagListFilter } from "@/hooks/useTagListFilter";
import { TagsModal } from "@/components/documents/TagsModal";
import { useSelection } from "@/hooks/useSelection";
import { useTableColumns } from "@/hooks/useTableColumns";
import { useDocumentPdfDownload } from "@/features/pdf/useDocumentPdfDownload";
import { useInfiniteInvoices, useDeleteInvoice, useMarkInvoicePaid, useDuplicateInvoice, useBatchDeleteInvoices, useArchiveInvoice } from "./hooks/useInvoices";
import { useDemoMode } from "@/components/providers/DemoModeProvider";
import { useAuthStore } from "@/stores/useAuthStore";
import { formatCurrency, formatDate } from "@/lib/utils";
import { exportToCsv } from "@/lib/csv-export";
import type { InvoiceListItem } from "@/types";

export function InvoicesPage() {
  const { t } = useTranslation(["invoices", "common"]);
  const router = useRouter();
  const { isDemoMode, showSubscribePrompt } = useDemoMode();
  const { hasPermission } = useAuthStore();
  const canCreate = hasPermission("invoices", "create");
  const canEdit = hasPermission("invoices", "edit");
  const canDelete = hasPermission("invoices", "delete");
  const [searchQuery, setSearchQuery] = useState("");
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [markPaidId, setMarkPaidId] = useState<string | null>(null);
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [statusFilter, setStatusFilter] = useStatusFilter(INVOICE_STATUSES);
  const tagList = useTagListFilter();

  const {
    data: invoicePages,
    isLoading,
    hasNextPage,
    isFetchingNextPage,
    fetchNextPage,
  } = useInfiniteInvoices(
    chipToQuery(statusFilter).status,
    chipToQuery(statusFilter).archived,
    tagList.tagQuery
  );
  const invoices = useMemo(
    () => invoicePages?.pages.flatMap((page) => page.data),
    [invoicePages]
  );
  const deleteInvoice = useDeleteInvoice();
  const markPaid = useMarkInvoicePaid();
  const duplicateInvoice = useDuplicateInvoice();
  const batchDeleteInvoices = useBatchDeleteInvoices();
  const archiveInvoice = useArchiveInvoice();

  // Search filters client-side within the loaded pages (the route has no
  // server-side search filter).
  const filteredInvoices = invoices?.filter(
    (invoice) =>
      invoice.invoice_number.toLowerCase().includes(searchQuery.toLowerCase()) ||
      invoice.client?.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const selectableInvoices = useMemo(() =>
    filteredInvoices?.filter((inv) => inv.status === "DRAFT") ?? [],
    [filteredInvoices]
  );
  const selection = useSelection(selectableInvoices);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { selection.clear(); }, [searchQuery, statusFilter, tagList.tagFilter]);

  const pdfDownload = useDocumentPdfDownload();
  const columns = useTableColumns(
    "invoices",
    [
      { key: "select", label: "", hideable: false },
      { key: "number", label: t("invoices:fields.invoiceNumber"), hideable: false },
      { key: "client", label: t("invoices:fields.client") },
      { key: "issueDate", label: t("invoices:fields.issueDate") },
      { key: "dueDate", label: t("invoices:fields.dueDate") },
      { key: "status", label: t("invoices:fields.status") },
      { key: "tags", label: t("common:tags.label"), isEmpty: (i) => !i.tags?.length },
      { key: "total", label: t("invoices:fields.totalTtc") },
      { key: "actions", label: "", hideable: false },
    ],
    filteredInvoices
  );

  const statusOptions = [
    { key: ALL_STATUSES, label: t("common:filters.all") },
    ...INVOICE_STATUSES.map((s) => ({
      key: s,
      label: t(`common:status.${s.toLowerCase()}`),
    })),
    // Archiving is a different axis from status: an archived invoice keeps
    // its own state, it just leaves the working list.
    { key: ARCHIVED_FILTER, label: t("common:filters.archived") },
  ];

  const handleExportCsv = () => {
    exportToCsv(
      filteredInvoices ?? [],
      [
        { header: t("invoices:fields.invoiceNumber"), accessor: (i) => i.invoice_number },
        { header: t("invoices:fields.client"), accessor: (i) => i.client?.name ?? "" },
        { header: t("invoices:fields.issueDate"), accessor: (i) => formatDate(i.issue_date) },
        { header: t("invoices:fields.status"), accessor: (i) => i.status },
        {
          header: t("common:tags.label"),
          accessor: (i) => (i.tags ?? []).map((tag) => tag.name).join(", "),
        },
        { header: t("invoices:fields.totalTtc"), accessor: (i) => i.total },
      ],
      `invoices_${new Date().toISOString().split("T")[0]}.csv`
    );
  };

  const handleDelete = async (id: string) => {
    if (isDemoMode) { showSubscribePrompt(); return; }
    await deleteInvoice.mutateAsync(id);
    setDeleteConfirmId(null);
  };

  const handleMarkPaid = async (id: string) => {
    if (isDemoMode) { showSubscribePrompt(); return; }
    await markPaid.mutateAsync(id);
    setMarkPaidId(null);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600" />
      </div>
    );
  }

  /** The row's actions, shared by the table row and the phone card. */
  const invoiceActions = (invoice: InvoiceListItem): RowAction[] => [
    {
      key: "edit",
      label: t("common:buttons.edit"),
      icon: Pencil,
      onSelect: () => router.push(`/invoices/${invoice.id}/edit`),
      primary: true,
      hidden: !(canEdit && invoice.status === "DRAFT"),
    },
    {
      key: "markPaid",
      label: t("invoices:actions.markAsPaid"),
      icon: CheckCircle,
      onSelect: () => setMarkPaidId(invoice.id),
      primary: true,
      tone: "success",
      hidden: !(canEdit && invoice.status === "ISSUED"),
    },
    {
      key: "view",
      label: t("common:buttons.view"),
      icon: Eye,
      onSelect: () => router.push(`/invoices/${invoice.id}`),
    },
    {
      key: "pdf",
      label: t("invoices:actions.downloadPdf"),
      icon: FileDown,
      onSelect: () => pdfDownload.download("invoice", invoice.id),
      disabled: pdfDownload.pendingId === invoice.id,
    },
    {
      key: "duplicate",
      label: t("invoices:actions.duplicate"),
      icon: Copy,
      onSelect: () => { if (isDemoMode) { showSubscribePrompt(); return; } duplicateInvoice.mutate(invoice.id); },
      disabled: duplicateInvoice.isPending,
      hidden: !canCreate,
    },
    {
      key: "archive",
      label: t(invoice.archived_at ? "common:buttons.unarchive" : "common:buttons.archive"),
      icon: invoice.archived_at ? ArchiveRestore : Archive,
      onSelect: () => {
        if (isDemoMode) { showSubscribePrompt(); return; }
        archiveInvoice.mutate({ id: invoice.id, archived: !invoice.archived_at });
      },
      disabled: archiveInvoice.isPending,
      hidden: !canEdit,
    },
    {
      key: "delete",
      label: t("common:buttons.delete"),
      icon: Trash2,
      onSelect: () => setDeleteConfirmId(invoice.id),
      danger: true,
      hidden: !(canDelete && invoice.status === "DRAFT"),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title={t("invoices:title")}
        subtitle={t("invoices:subtitle")}
        actions={
          <>
            <Button variant="secondary" onClick={() => router.push("/invoices/credit-notes")} size="sm">
              <Undo2 className="h-4 w-4 me-2" />
              {t("invoices:creditNotes.title")}
            </Button>
            {canEdit && (
              <Button variant="secondary" onClick={tagList.openTagsModal} size="sm">
                <TagIcon className="h-4 w-4 me-2" />
                {tagList.manageLabel}
              </Button>
            )}
            <Button variant="secondary" onClick={handleExportCsv} size="sm" disabled={!filteredInvoices?.length}>
              <Download className="h-4 w-4 me-2" />
              {t("common:buttons.exportCsv")}
            </Button>
            {canCreate && (
              <Button onClick={() => router.push("/invoices/new")} size="sm">
                <Plus className="h-4 w-4 me-2" />
                {t("invoices:newInvoice")}
              </Button>
            )}
          </>
        }
      />

      <Card>
        <CardHeader>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <CardTitle>{t("invoices:listTitle")}</CardTitle>
            <div className="flex items-center gap-2 w-full sm:w-auto">
              <ColumnPicker columns={columns} />
              <div className="relative w-full sm:w-56 md:w-64 lg:w-72">
                <Search className="absolute start-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                <Input
                  id="invoice-search"
                  name="invoice-search"
                  placeholder={t("invoices:searchPlaceholder")}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  autoComplete="off"
                  className="ps-9"
                />
              </div>
            </div>
          </div>
          <StatusFilterChips
            options={statusOptions}
            value={statusFilter}
            onChange={setStatusFilter}
            label={t("common:filters.filterByStatus")}
          />
          {/* Labels narrow whatever state is selected: "the unpaid ones on the
              Hydra site" is one question, not two. */}
          {tagList.hasTags && (
            <StatusFilterChips
              options={tagList.tagOptions}
              value={tagList.tagFilter}
              onChange={tagList.setTagFilter}
              label={tagList.filterLabel}
            />
          )}
        </CardHeader>
        <CardContent className="p-0">
          {/* Mobile card view */}
          <div className="md:hidden divide-y divide-gray-200 dark:divide-gray-700">
            {filteredInvoices && filteredInvoices.length > 0 ? (
              filteredInvoices.map((invoice) => (
                <ListCard
                  key={invoice.id}
                  onActivate={() => router.push(`/invoices/${invoice.id}`)}
                  leading={
                    <>
                      {canDelete && invoice.status === "DRAFT" && (
                        <label className="-mx-3 -mb-3 -mt-2 p-3 shrink-0 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={selection.isSelected(invoice.id)}
                            onChange={() => selection.toggle(invoice.id)}
                            className="block h-4 w-4 text-primary-600 border-gray-300 rounded focus:ring-primary-500"
                          />
                        </label>
                      )}
                    </>
                  }
                  title={invoice.client?.name || "-"}
                  badge={(
                    <Badge variant={getInvoiceStatusVariantWithUrgency(invoice.status, invoice.due_date)}>
                      {getInvoiceStatusLabelWithUrgency(invoice.status, invoice.due_date)}
                    </Badge>
                  )}
                  meta={<><span className="font-mono">{invoice.invoice_number}</span> · {formatDate(invoice.issue_date)} → {formatDate(invoice.due_date)}</>}
                  amount={formatCurrency(invoice.total)}
                  actions={<RowActions actions={invoiceActions(invoice)} />}
                >
                  {(invoice.tags?.length ?? 0) > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {invoice.tags?.map((tag) => (
                        <TagChip key={tag.id} name={tag.name} color={tag.color} />
                      ))}
                    </div>
                  )}
                </ListCard>
              ))
            ) : (
              <div className="py-8 text-center text-gray-500">
                {t("invoices:noInvoices")}
                <div className="mt-3">
                  <Button size="sm" onClick={() => router.push("/invoices/new")}>
                    {t("invoices:newInvoice")}
                  </Button>
                </div>
              </div>
            )}
          </div>
          {/* Desktop table view */}
          <div className="hidden md:block overflow-x-auto">
          <Table className="min-w-175">
            <TableHeader>
              <TableRow>
                <TableHead className="w-10">
                  {canDelete && (
                    <label className="-m-3 p-3 inline-flex align-middle cursor-pointer">
                      <input
                        type="checkbox"
                        checked={selection.isAllSelected}
                        ref={(el) => { if (el) el.indeterminate = selection.isIndeterminate; }}
                        onChange={() => selection.toggleAll(selectableInvoices)}
                        disabled={selectableInvoices.length === 0}
                        className="h-4 w-4 text-primary-600 border-gray-300 rounded focus:ring-primary-500"
                      />
                    </label>
                  )}
                </TableHead>
                <TableHead>{t("invoices:fields.invoiceNumber")}</TableHead>
                {columns.show("client") && <TableHead>{t("invoices:fields.client")}</TableHead>}
                {columns.show("issueDate") && <TableHead>{t("invoices:fields.issueDate")}</TableHead>}
                {columns.show("dueDate") && <TableHead>{t("invoices:fields.dueDate")}</TableHead>}
                {columns.show("status") && <TableHead>{t("invoices:fields.status")}</TableHead>}
                {columns.show("tags") && <TableHead>{t("common:tags.label")}</TableHead>}
                {columns.show("total") && <TableHead className="text-end">{t("invoices:fields.totalTtc")}</TableHead>}
                <TableHead className="w-px text-end">{t("common:buttons.actions")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredInvoices && filteredInvoices.length > 0 ? (
                filteredInvoices.map((invoice) => (
                  <TableRow key={invoice.id} onActivate={() => router.push(`/invoices/${invoice.id}`)}>
                    <TableCell>
                      {canDelete && invoice.status === "DRAFT" ? (
                        <label className="-m-3 p-3 inline-flex align-middle cursor-pointer">
                          <input
                            type="checkbox"
                            checked={selection.isSelected(invoice.id)}
                            onChange={() => selection.toggle(invoice.id)}
                            className="h-4 w-4 text-primary-600 border-gray-300 rounded focus:ring-primary-500"
                          />
                        </label>
                      ) : null}
                    </TableCell>
                    <TableCell className="font-mono font-medium">
                      {invoice.invoice_number}
                    </TableCell>
                    {columns.show("client") && <TableCell>{invoice.client?.name || "-"}</TableCell>}
                    {columns.show("issueDate") && <TableCell>{formatDate(invoice.issue_date)}</TableCell>}
                    {columns.show("dueDate") && <TableCell>{formatDate(invoice.due_date)}</TableCell>}
                    {columns.show("status") && (
                      <TableCell>
                        <Badge variant={getInvoiceStatusVariantWithUrgency(invoice.status, invoice.due_date)}>
                          {getInvoiceStatusLabelWithUrgency(invoice.status, invoice.due_date)}
                        </Badge>
                      </TableCell>
                    )}
                    {columns.show("tags") && (
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          {invoice.tags?.map((tag) => (
                            <TagChip key={tag.id} name={tag.name} color={tag.color} />
                          ))}
                        </div>
                      </TableCell>
                    )}
                    {columns.show("total") && (
                      <TableNumericCell className="font-medium">
                        {formatCurrency(invoice.total)}
                      </TableNumericCell>
                    )}
                    <TableCell>
                      <RowActions actions={invoiceActions(invoice)} />
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={columns.visibleCount} className="text-center text-gray-500 py-8">
                    {t("invoices:noInvoices")}
                    <div className="mt-3">
                      <Button size="sm" onClick={() => router.push("/invoices/new")}>
                        {t("invoices:newInvoice")}
                      </Button>
                    </div>
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
            loadedCount={invoices?.length ?? 0}
          />
        </CardContent>
      </Card>

      <Modal
        isOpen={!!deleteConfirmId}
        onClose={() => setDeleteConfirmId(null)}
        title={t("invoices:deleteInvoice")}
        size="sm"
      >
        <p className="text-(--color-text-secondary) mb-6">
          {t("invoices:confirmDelete")}
        </p>
        <div className="flex justify-end gap-3">
          <Button variant="secondary" onClick={() => setDeleteConfirmId(null)}>
            {t("common:buttons.cancel")}
          </Button>
          <Button
            variant="danger"
            onClick={() => deleteConfirmId && handleDelete(deleteConfirmId)}
            isLoading={deleteInvoice.isPending}
          >
            {t("common:buttons.delete")}
          </Button>
        </div>
      </Modal>

      <Modal
        isOpen={!!markPaidId}
        onClose={() => setMarkPaidId(null)}
        title={t("invoices:actions.markAsPaid")}
        size="sm"
      >
        <p className="text-(--color-text-secondary) mb-6">
          {t("invoices:confirmMarkPaid")}
        </p>
        <div className="flex justify-end gap-3">
          <Button variant="secondary" onClick={() => setMarkPaidId(null)}>
            {t("common:buttons.cancel")}
          </Button>
          <Button
            onClick={() => markPaidId && handleMarkPaid(markPaidId)}
            isLoading={markPaid.isPending}
          >
            {t("common:buttons.confirm")}
          </Button>
        </div>
      </Modal>

      {canDelete && (
        <>
          <BulkActionBar
            selectedCount={selection.selectedCount}
            onDelete={() => setBulkDeleteOpen(true)}
            onClear={selection.clear}
            isDeleting={batchDeleteInvoices.isPending}
          />
          <BulkDeleteModal
            isOpen={bulkDeleteOpen}
            onClose={() => setBulkDeleteOpen(false)}
            onConfirm={async () => {
              if (isDemoMode) { showSubscribePrompt(); return; }
              await batchDeleteInvoices.mutateAsync(Array.from(selection.selectedIds));
              selection.clear();
              setBulkDeleteOpen(false);
            }}
            count={selection.selectedCount}
            isLoading={batchDeleteInvoices.isPending}
          />
        </>
      )}

      <TagsModal
        isOpen={tagList.tagsModalOpen}
        onClose={tagList.closeTagsModal}
        canEdit={canEdit}
      />
    </div>
  );
}
