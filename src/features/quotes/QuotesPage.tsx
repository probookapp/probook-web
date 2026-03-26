import { useState, useEffect } from "react";
import { useRouter } from "@/lib/navigation";
import { useTranslation } from "react-i18next";
import { Plus, Eye, Pencil, Trash2, Search, FileText, ArrowRight, Copy } from "lucide-react";
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
  getQuoteStatusVariant,
  getStatusLabel,
} from "@/components/ui";
import { BulkActionBar } from "@/components/shared/BulkActionBar";
import { BulkDeleteModal } from "@/components/shared/BulkDeleteModal";
import { useSelection } from "@/hooks/useSelection";
import { useQuotes, useDeleteQuote, useConvertQuoteToInvoice, useDuplicateQuote, useBatchDeleteQuotes } from "./hooks/useQuotes";
import { useDemoMode } from "@/components/providers/DemoModeProvider";
import { formatCurrency, formatDate } from "@/lib/utils";
import type { Quote } from "@/types";

export function QuotesPage() {
  const { t } = useTranslation(["quotes", "common"]);
  const router = useRouter();
  const { isDemoMode, showSubscribePrompt } = useDemoMode();
  const [searchQuery, setSearchQuery] = useState("");
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [convertConfirm, setConvertConfirm] = useState<Quote | null>(null);
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);

  const { data: quotes, isLoading } = useQuotes();
  const deleteQuote = useDeleteQuote();
  const convertToInvoice = useConvertQuoteToInvoice();
  const duplicateQuote = useDuplicateQuote();
  const batchDeleteQuotes = useBatchDeleteQuotes();

  const filteredQuotes = quotes?.filter(
    (quote) =>
      quote.quote_number.toLowerCase().includes(searchQuery.toLowerCase()) ||
      quote.client?.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const selection = useSelection(filteredQuotes);

  useEffect(() => {
    selection.clear();
  }, [searchQuery]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleDelete = async (id: string) => {
    if (isDemoMode) { showSubscribePrompt(); return; }
    await deleteQuote.mutateAsync(id);
    setDeleteConfirmId(null);
  };

  const handleConvert = async (quote: Quote) => {
    if (isDemoMode) { showSubscribePrompt(); return; }
    await convertToInvoice.mutateAsync(quote.id);
    setConvertConfirm(null);
    router.push("/invoices");
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
          <h1 className="text-xl sm:text-2xl font-bold text-(--color-text-primary)">{t("quotes:title")}</h1>
          <p className="text-sm sm:text-base text-(--color-text-secondary)">{t("quotes:subtitle")}</p>
        </div>
        <Button onClick={() => router.push("/quotes/new")} size="sm" className="self-start sm:self-auto">
          <Plus className="h-4 w-4 mr-2" />
          {t("quotes:newQuote")}
        </Button>
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <CardTitle>{t("quotes:listTitle")}</CardTitle>
            <div className="relative w-full sm:w-56 md:w-64 lg:w-72">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
              <Input
                id="quote-search"
                name="quote-search"
                placeholder={t("quotes:searchPlaceholder")}
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
            {filteredQuotes && filteredQuotes.length > 0 ? (
              filteredQuotes.map((quote) => (
                <div key={quote.id} className="p-4 flex items-start gap-3">
                  <input
                    type="checkbox"
                    checked={selection.isSelected(quote.id)}
                    onChange={() => selection.toggle(quote.id)}
                    className="mt-1 h-4 w-4 text-primary-600 border-gray-300 rounded focus:ring-primary-500"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono font-medium text-(--color-text-primary)">{quote.quote_number}</span>
                      <Badge variant={getQuoteStatusVariant(quote.status)}>
                        {getStatusLabel(quote.status)}
                      </Badge>
                    </div>
                    <p className="text-sm text-(--color-text-secondary) mt-0.5">{quote.client?.name || "-"}</p>
                    <div className="flex items-center justify-between mt-1">
                      <span className="text-xs text-(--color-text-secondary)">{formatDate(quote.issue_date)} → {formatDate(quote.validity_date)}</span>
                      <span className="font-medium text-(--color-text-primary)">{formatCurrency(quote.total)}</span>
                    </div>
                    <div className="flex justify-end gap-1 mt-2">
                      <button onClick={() => router.push(`/quotes/${quote.id}`)} className="p-1 text-gray-500 hover:text-primary-600" title={t("common:buttons.view")} aria-label={t("common:buttons.view")}><Eye className="h-4 w-4" /></button>
                      <button onClick={() => router.push(`/quotes/${quote.id}/edit`)} className="p-1 text-gray-500 hover:text-primary-600" title={t("common:buttons.edit")} aria-label={t("common:buttons.edit")}><Pencil className="h-4 w-4" /></button>
                      <button onClick={() => { if (isDemoMode) { showSubscribePrompt(); return; } duplicateQuote.mutate(quote.id); }} className="p-1 text-gray-500 hover:text-blue-600" title={t("quotes:actions.duplicate")} aria-label={t("quotes:actions.duplicate")} disabled={duplicateQuote.isPending}><Copy className="h-4 w-4" /></button>
                      {quote.status === "ACCEPTED" && (
                        <button onClick={() => setConvertConfirm(quote)} className="p-1 text-gray-500 hover:text-green-600" title={t("quotes:actions.convertToInvoice")} aria-label={t("quotes:actions.convertToInvoice")}><ArrowRight className="h-4 w-4" /></button>
                      )}
                      <button onClick={() => setDeleteConfirmId(quote.id)} className="p-1 text-gray-500 hover:text-red-600 disabled:opacity-50 disabled:cursor-not-allowed" title={t("common:buttons.delete")} aria-label={t("common:buttons.delete")}><Trash2 className="h-4 w-4" /></button>
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <div className="py-8 text-center text-gray-500">
                <FileText className="h-12 w-12 mx-auto mb-2 text-gray-300" />
                {t("quotes:noQuotes")}
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
                    onChange={() => selection.toggleAll()}
                    className="h-4 w-4 text-primary-600 border-gray-300 rounded focus:ring-primary-500"
                  />
                </TableHead>
                <TableHead>{t("quotes:fields.quoteNumber")}</TableHead>
                <TableHead>{t("quotes:fields.client")}</TableHead>
                <TableHead>{t("quotes:fields.issueDate")}</TableHead>
                <TableHead>{t("quotes:fields.validityDate")}</TableHead>
                <TableHead>{t("quotes:fields.status")}</TableHead>
                <TableHead>{t("quotes:fields.totalTtc")}</TableHead>
                <TableHead className="w-32">{t("common:buttons.actions")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredQuotes && filteredQuotes.length > 0 ? (
                filteredQuotes.map((quote) => (
                  <TableRow key={quote.id}>
                    <TableCell>
                      <input
                        type="checkbox"
                        checked={selection.isSelected(quote.id)}
                        onChange={() => selection.toggle(quote.id)}
                        className="h-4 w-4 text-primary-600 border-gray-300 rounded focus:ring-primary-500"
                      />
                    </TableCell>
                    <TableCell className="font-mono font-medium">
                      {quote.quote_number}
                    </TableCell>
                    <TableCell>{quote.client?.name || "-"}</TableCell>
                    <TableCell>{formatDate(quote.issue_date)}</TableCell>
                    <TableCell>{formatDate(quote.validity_date)}</TableCell>
                    <TableCell>
                      <Badge variant={getQuoteStatusVariant(quote.status)}>
                        {getStatusLabel(quote.status)}
                      </Badge>
                    </TableCell>
                    <TableCell className="font-medium">
                      {formatCurrency(quote.total)}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => router.push(`/quotes/${quote.id}`)}
                          className="p-1 text-gray-500 hover:text-primary-600 transition-colors"
                          title={t("common:buttons.view")}
                          aria-label={t("common:buttons.view")}
                        >
                          <Eye className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => router.push(`/quotes/${quote.id}/edit`)}
                          className="p-1 text-gray-500 hover:text-primary-600 transition-colors"
                          title={t("common:buttons.edit")}
                          aria-label={t("common:buttons.edit")}
                        >
                          <Pencil className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => { if (isDemoMode) { showSubscribePrompt(); return; } duplicateQuote.mutate(quote.id); }}
                          className="p-1 text-gray-500 hover:text-blue-600 transition-colors"
                          title={t("quotes:actions.duplicate")}
                          aria-label={t("quotes:actions.duplicate")}
                          disabled={duplicateQuote.isPending}
                        >
                          <Copy className="h-4 w-4" />
                        </button>
                        {quote.status === "ACCEPTED" && (
                          <button
                            onClick={() => setConvertConfirm(quote)}
                            className="p-1 text-gray-500 hover:text-green-600 transition-colors"
                            title={t("quotes:actions.convertToInvoice")}
                            aria-label={t("quotes:actions.convertToInvoice")}
                          >
                            <ArrowRight className="h-4 w-4" />
                          </button>
                        )}
                        <button
                          onClick={() => setDeleteConfirmId(quote.id)}
                          className="p-1 text-gray-500 hover:text-red-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                          title={t("common:buttons.delete")}
                          aria-label={t("common:buttons.delete")}
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={8} className="text-center text-gray-500 py-8">
                    <FileText className="h-12 w-12 mx-auto mb-2 text-gray-300" />
                    {t("quotes:noQuotes")}
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
        title={t("quotes:deleteQuote")}
        size="sm"
      >
        <p className="text-gray-600 dark:text-gray-400 mb-6">
          {t("quotes:confirmDelete")}
        </p>
        <div className="flex justify-end gap-3">
          <Button variant="secondary" onClick={() => setDeleteConfirmId(null)}>
            {t("common:buttons.cancel")}
          </Button>
          <Button
            variant="danger"
            onClick={() => deleteConfirmId && handleDelete(deleteConfirmId)}
            isLoading={deleteQuote.isPending}
          >
            {t("common:buttons.delete")}
          </Button>
        </div>
      </Modal>

      <Modal
        isOpen={!!convertConfirm}
        onClose={() => setConvertConfirm(null)}
        title={t("quotes:actions.convertToInvoice")}
        size="sm"
      >
        <p className="text-gray-600 dark:text-gray-400 mb-6">
          {t("quotes:confirmConvert")} <strong>{convertConfirm?.quote_number}</strong>
        </p>
        <div className="flex justify-end gap-3">
          <Button variant="secondary" onClick={() => setConvertConfirm(null)}>
            {t("common:buttons.cancel")}
          </Button>
          <Button
            onClick={() => convertConfirm && handleConvert(convertConfirm)}
            isLoading={convertToInvoice.isPending}
          >
            {t("common:buttons.confirm")}
          </Button>
        </div>
      </Modal>

      <BulkActionBar
        selectedCount={selection.selectedCount}
        onDelete={() => setBulkDeleteOpen(true)}
        onClear={selection.clear}
        isDeleting={batchDeleteQuotes.isPending}
      />

      <BulkDeleteModal
        isOpen={bulkDeleteOpen}
        onClose={() => setBulkDeleteOpen(false)}
        onConfirm={async () => {
          if (isDemoMode) { showSubscribePrompt(); return; }
          await batchDeleteQuotes.mutateAsync(Array.from(selection.selectedIds));
          selection.clear();
          setBulkDeleteOpen(false);
        }}
        count={selection.selectedCount}
        isLoading={batchDeleteQuotes.isPending}
      />
    </div>
  );
}
