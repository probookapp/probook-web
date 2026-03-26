import { useState, useEffect, useMemo } from "react";
import { useRouter } from "@/lib/navigation";
import { useTranslation } from "react-i18next";
import {
  Plus,
  Eye,
  Pencil,
  Trash2,
  Search,
  Receipt,
  CheckCircle,
  FileDown,
  Copy,
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
  getInvoiceStatusVariantWithUrgency,
  getInvoiceStatusLabelWithUrgency,
} from "@/components/ui";
import { BulkActionBar } from "@/components/shared/BulkActionBar";
import { BulkDeleteModal } from "@/components/shared/BulkDeleteModal";
import { useSelection } from "@/hooks/useSelection";
import { useInvoices, useDeleteInvoice, useMarkInvoicePaid, useDuplicateInvoice, useBatchDeleteInvoices } from "./hooks/useInvoices";
import { useDemoMode } from "@/components/providers/DemoModeProvider";
import { formatCurrency, formatDate } from "@/lib/utils";

export function InvoicesPage() {
  const { t } = useTranslation(["invoices", "common"]);
  const router = useRouter();
  const { isDemoMode, showSubscribePrompt } = useDemoMode();
  const [searchQuery, setSearchQuery] = useState("");
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [markPaidId, setMarkPaidId] = useState<string | null>(null);
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);

  const { data: invoices, isLoading } = useInvoices();
  const deleteInvoice = useDeleteInvoice();
  const markPaid = useMarkInvoicePaid();
  const duplicateInvoice = useDuplicateInvoice();
  const batchDeleteInvoices = useBatchDeleteInvoices();

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
  useEffect(() => { selection.clear(); }, [searchQuery]);

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

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-(--color-text-primary)">{t("invoices:title")}</h1>
          <p className="text-sm sm:text-base text-(--color-text-secondary)">{t("invoices:subtitle")}</p>
        </div>
        <Button onClick={() => router.push("/invoices/new")} size="sm" className="self-start sm:self-auto">
          <Plus className="h-4 w-4 mr-2" />
          {t("invoices:newInvoice")}
        </Button>
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <CardTitle>{t("invoices:listTitle")}</CardTitle>
            <div className="relative w-full sm:w-56 md:w-64 lg:w-72">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
              <Input
                id="invoice-search"
                name="invoice-search"
                placeholder={t("invoices:searchPlaceholder")}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                autoComplete="off"
                className="pl-9"
              />
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {/* Mobile card view */}
          <div className="md:hidden divide-y divide-gray-200 dark:divide-gray-700">
            {filteredInvoices && filteredInvoices.length > 0 ? (
              filteredInvoices.map((invoice) => (
                <div key={invoice.id} className="p-4 flex items-start gap-3">
                  {invoice.status === "DRAFT" && (
                    <input
                      type="checkbox"
                      checked={selection.isSelected(invoice.id)}
                      onChange={() => selection.toggle(invoice.id)}
                      className="mt-1 h-4 w-4 text-primary-600 border-gray-300 rounded focus:ring-primary-500"
                    />
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono font-medium text-(--color-text-primary)">{invoice.invoice_number}</span>
                      <Badge variant={getInvoiceStatusVariantWithUrgency(invoice.status, invoice.due_date)}>
                        {getInvoiceStatusLabelWithUrgency(invoice.status, invoice.due_date)}
                      </Badge>
                    </div>
                    <p className="text-sm text-(--color-text-secondary) mt-0.5">{invoice.client?.name || "-"}</p>
                    <div className="flex items-center justify-between mt-1">
                      <span className="text-xs text-(--color-text-secondary)">{formatDate(invoice.issue_date)} → {formatDate(invoice.due_date)}</span>
                      <span className="font-medium text-(--color-text-primary)">{formatCurrency(invoice.total)}</span>
                    </div>
                    <div className="flex justify-end gap-1 mt-2">
                      <button onClick={() => router.push(`/invoices/${invoice.id}`)} className="p-1 text-gray-500 hover:text-primary-600" title={t("common:buttons.view")} aria-label={t("common:buttons.view")}><Eye className="h-4 w-4" /></button>
                      {invoice.status === "DRAFT" && (
                        <button onClick={() => router.push(`/invoices/${invoice.id}/edit`)} className="p-1 text-gray-500 hover:text-primary-600" title={t("common:buttons.edit")} aria-label={t("common:buttons.edit")}><Pencil className="h-4 w-4" /></button>
                      )}
                      {invoice.status === "ISSUED" && (
                        <button onClick={() => setMarkPaidId(invoice.id)} className="p-1 text-gray-500 hover:text-green-600" title={t("invoices:actions.markAsPaid")} aria-label={t("invoices:actions.markAsPaid")}><CheckCircle className="h-4 w-4" /></button>
                      )}
                      <button onClick={() => { if (isDemoMode) { showSubscribePrompt(); return; } duplicateInvoice.mutate(invoice.id); }} className="p-1 text-gray-500 hover:text-blue-600" title={t("invoices:actions.duplicate")} aria-label={t("invoices:actions.duplicate")} disabled={duplicateInvoice.isPending}><Copy className="h-4 w-4" /></button>
                      {invoice.status === "DRAFT" && (
                        <button onClick={() => setDeleteConfirmId(invoice.id)} className="p-1 text-gray-500 hover:text-red-600 disabled:opacity-50 disabled:cursor-not-allowed" title={t("common:buttons.delete")} aria-label={t("common:buttons.delete")}><Trash2 className="h-4 w-4" /></button>
                      )}
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <div className="py-8 text-center text-gray-500">
                <Receipt className="h-12 w-12 mx-auto mb-2 text-gray-300 dark:text-gray-600" />
                {t("invoices:noInvoices")}
              </div>
            )}
          </div>
          {/* Desktop table view */}
          <div className="hidden md:block overflow-x-auto">
          <Table className="min-w-175">
            <TableHeader>
              <TableRow>
                <TableHead className="w-10">
                  <input
                    type="checkbox"
                    checked={selection.isAllSelected}
                    ref={(el) => { if (el) el.indeterminate = selection.isIndeterminate; }}
                    onChange={() => selection.toggleAll(selectableInvoices)}
                    disabled={selectableInvoices.length === 0}
                    className="h-4 w-4 text-primary-600 border-gray-300 rounded focus:ring-primary-500"
                  />
                </TableHead>
                <TableHead>{t("invoices:fields.invoiceNumber")}</TableHead>
                <TableHead>{t("invoices:fields.client")}</TableHead>
                <TableHead>{t("invoices:fields.issueDate")}</TableHead>
                <TableHead>{t("invoices:fields.dueDate")}</TableHead>
                <TableHead>{t("invoices:fields.status")}</TableHead>
                <TableHead>{t("invoices:fields.totalTtc")}</TableHead>
                <TableHead className="w-32">{t("common:buttons.actions")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredInvoices && filteredInvoices.length > 0 ? (
                filteredInvoices.map((invoice) => (
                  <TableRow key={invoice.id}>
                    <TableCell>
                      {invoice.status === "DRAFT" ? (
                        <input
                          type="checkbox"
                          checked={selection.isSelected(invoice.id)}
                          onChange={() => selection.toggle(invoice.id)}
                          className="h-4 w-4 text-primary-600 border-gray-300 rounded focus:ring-primary-500"
                        />
                      ) : null}
                    </TableCell>
                    <TableCell className="font-mono font-medium">
                      {invoice.invoice_number}
                    </TableCell>
                    <TableCell>{invoice.client?.name || "-"}</TableCell>
                    <TableCell>{formatDate(invoice.issue_date)}</TableCell>
                    <TableCell>{formatDate(invoice.due_date)}</TableCell>
                    <TableCell>
                      <Badge variant={getInvoiceStatusVariantWithUrgency(invoice.status, invoice.due_date)}>
                        {getInvoiceStatusLabelWithUrgency(invoice.status, invoice.due_date)}
                      </Badge>
                    </TableCell>
                    <TableCell className="font-medium">
                      {formatCurrency(invoice.total)}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => router.push(`/invoices/${invoice.id}`)}
                          className="p-1 text-gray-500 hover:text-primary-600 transition-colors"
                          title={t("common:buttons.view")}
                          aria-label={t("common:buttons.view")}
                        >
                          <Eye className="h-4 w-4" />
                        </button>
                        {invoice.status === "DRAFT" && (
                          <button
                            onClick={() => router.push(`/invoices/${invoice.id}/edit`)}
                            className="p-1 text-gray-500 hover:text-primary-600 transition-colors"
                            title={t("common:buttons.edit")}
                            aria-label={t("common:buttons.edit")}
                          >
                            <Pencil className="h-4 w-4" />
                          </button>
                        )}
                        {invoice.status === "ISSUED" && (
                          <button
                            onClick={() => setMarkPaidId(invoice.id)}
                            className="p-1 text-gray-500 hover:text-green-600 transition-colors"
                            title={t("invoices:actions.markAsPaid")}
                            aria-label={t("invoices:actions.markAsPaid")}
                          >
                            <CheckCircle className="h-4 w-4" />
                          </button>
                        )}
                        <button
                          onClick={() => { if (isDemoMode) { showSubscribePrompt(); return; } duplicateInvoice.mutate(invoice.id); }}
                          className="p-1 text-gray-500 hover:text-blue-600 transition-colors"
                          title={t("invoices:actions.duplicate")}
                          aria-label={t("invoices:actions.duplicate")}
                          disabled={duplicateInvoice.isPending}
                        >
                          <Copy className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => router.push(`/invoices/${invoice.id}`)}
                          className="p-1 text-gray-500 hover:text-primary-600 transition-colors"
                          title={t("invoices:actions.downloadPdf")}
                          aria-label={t("invoices:actions.downloadPdf")}
                        >
                          <FileDown className="h-4 w-4" />
                        </button>
                        {invoice.status === "DRAFT" && (
                          <button
                            onClick={() => setDeleteConfirmId(invoice.id)}
                            className="p-1 text-gray-500 hover:text-red-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                            title={t("common:buttons.delete")}
                            aria-label={t("common:buttons.delete")}
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={8} className="text-center text-gray-500 py-8">
                    <Receipt className="h-12 w-12 mx-auto mb-2 text-gray-300 dark:text-gray-600" />
                    {t("invoices:noInvoices")}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
          </div>
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
    </div>
  );
}
