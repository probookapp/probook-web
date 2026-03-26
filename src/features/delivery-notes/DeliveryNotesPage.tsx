import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "@/lib/navigation";
import { useTranslation } from "react-i18next";
import { toast } from "@/stores/useToastStore";
import {
  Plus,
  Eye,
  Pencil,
  Trash2,
  Search,
  Copy,
  Truck,
  FileText,
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
import {
  useDeliveryNotes,
  useDeleteDeliveryNote,
  useDuplicateDeliveryNote,
  useBatchDeleteDeliveryNotes,
} from "./hooks/useDeliveryNotes";
import { useCreateInvoiceFromDeliveryNotes } from "@/features/invoices/hooks/useInvoices";
import { useDemoMode } from "@/components/providers/DemoModeProvider";
import { BulkActionBar } from "@/components/shared/BulkActionBar";
import { BulkDeleteModal } from "@/components/shared/BulkDeleteModal";
import { useSelection } from "@/hooks/useSelection";
import type { DeliveryNote, DeliveryNoteStatus } from "@/types";
import { formatDate } from "@/lib/utils";

export function DeliveryNotesPage() {
  const { t } = useTranslation(["delivery", "common"]);
  const router = useRouter();
  const { isDemoMode, showSubscribePrompt } = useDemoMode();
  const [searchQuery, setSearchQuery] = useState("");
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);

  const statusConfig: Record<
    DeliveryNoteStatus,
    { label: string; variant: "default" | "success" | "warning" | "danger" | "info" }
  > = {
    DRAFT: { label: t("delivery:status.DRAFT"), variant: "default" },
    DELIVERED: { label: t("delivery:status.DELIVERED"), variant: "success" },
    CANCELLED: { label: t("delivery:status.CANCELLED"), variant: "danger" },
  };

  const { data: deliveryNotes, isLoading } = useDeliveryNotes();
  const deleteDeliveryNote = useDeleteDeliveryNote();
  const duplicateDeliveryNote = useDuplicateDeliveryNote();
  const createInvoiceFromDNs = useCreateInvoiceFromDeliveryNotes();
  const batchDeleteDNs = useBatchDeleteDeliveryNotes();

  const filteredDeliveryNotes = deliveryNotes?.filter(
    (note) =>
      note.delivery_note_number.toLowerCase().includes(searchQuery.toLowerCase()) ||
      note.client?.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const selection = useSelection(filteredDeliveryNotes);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { selection.clear(); }, [searchQuery]);

  const canCreateInvoiceFromSelection = useMemo(() => {
    if (selection.selectedCount === 0) return false;
    const selectedNotes = deliveryNotes?.filter((n) => selection.selectedIds.has(n.id)) ?? [];
    const allDeliveredNoInvoice = selectedNotes.every((n) => n.status === "DELIVERED" && !n.invoice_id);
    if (!allDeliveredNoInvoice) return false;
    const clientIds = new Set(selectedNotes.map((n) => n.client_id));
    return clientIds.size === 1;
  }, [selection.selectedIds, selection.selectedCount, deliveryNotes]);

  const handleDelete = async (id: string) => {
    if (isDemoMode) { showSubscribePrompt(); return; }
    try {
      await deleteDeliveryNote.mutateAsync(id);
      setDeleteConfirmId(null);
    } catch {
      setDeleteConfirmId(null);
    }
  };

  const handleDuplicate = async (note: DeliveryNote) => {
    if (isDemoMode) { showSubscribePrompt(); return; }
    const newNote = await duplicateDeliveryNote.mutateAsync(note.id);
    router.push(`/delivery-notes/${newNote.id}/edit`);
  };

  const handleCreateInvoiceFromSelection = async () => {
    if (isDemoMode) { showSubscribePrompt(); return; }
    if (selection.selectedCount === 0) return;

    // Check if all selected delivery notes are for the same client
    const selectedNotes = deliveryNotes?.filter((n) => selection.selectedIds.has(n.id)) || [];
    const clientIds = new Set(selectedNotes.map((n) => n.client_id));

    if (clientIds.size > 1) {
      toast.error(t("delivery:sameClientRequired", "Please select delivery notes from the same client."));
      return;
    }

    const invoice = await createInvoiceFromDNs.mutateAsync(Array.from(selection.selectedIds));
    selection.clear();
    router.push(`/invoices/${invoice.id}`);
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
          <h1 className="text-xl sm:text-2xl font-bold text-(--color-text-primary)">{t("delivery:title")}</h1>
          <p className="text-sm sm:text-base text-(--color-text-secondary)">{t("delivery:subtitle", "Manage your delivery notes")}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
          <Button onClick={() => router.push("/delivery-notes/new")} size="sm">
            <Plus className="h-4 w-4 mr-2" />
            {t("delivery:newDeliveryNote")}
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <CardTitle>{t("delivery:listTitle", "Delivery Note List")}</CardTitle>
            <div className="relative w-full sm:w-56 md:w-64 lg:w-72">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
              <Input
                id="delivery-note-search"
                name="delivery-note-search"
                placeholder={t("delivery:searchPlaceholder")}
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
            {filteredDeliveryNotes && filteredDeliveryNotes.length > 0 ? (
              filteredDeliveryNotes.map((note) => (
                <div key={note.id} className="p-4 flex items-start gap-3">
                  <input
                    type="checkbox"
                    checked={selection.isSelected(note.id)}
                    onChange={() => selection.toggle(note.id)}
                    className="mt-1 h-4 w-4 text-primary-600 border-gray-300 rounded focus:ring-primary-500"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono font-medium text-(--color-text-primary)">{note.delivery_note_number}</span>
                      <Badge variant={statusConfig[note.status].variant}>
                        <Truck className="h-3 w-3 mr-1" />
                        {statusConfig[note.status].label}
                      </Badge>
                    </div>
                    <p className="text-sm text-(--color-text-secondary) mt-0.5">{note.client?.name || "-"}</p>
                    <div className="flex items-center justify-between mt-1">
                      <span className="text-xs text-(--color-text-secondary)">
                        {formatDate(note.issue_date)}
                        {note.delivery_date && ` → ${formatDate(note.delivery_date)}`}
                      </span>
                      {note.quote_id && (
                        <Link href={`/quotes/${note.quote_id}`} className="text-xs text-primary-600 hover:underline inline-flex items-center gap-1">
                          <FileText className="h-3 w-3" />
                          {t("common:buttons.view")}
                        </Link>
                      )}
                    </div>
                    <div className="flex justify-end gap-1 mt-2">
                      <Link href={`/delivery-notes/${note.id}`} className="p-1 text-gray-500 hover:text-primary-600" title={t("common:buttons.view")} aria-label={t("common:buttons.view")}><Eye className="h-4 w-4" /></Link>
                      {note.status === "DRAFT" && (
                        <Link href={`/delivery-notes/${note.id}/edit`} className="p-1 text-gray-500 hover:text-primary-600" title={t("common:buttons.edit")} aria-label={t("common:buttons.edit")}><Pencil className="h-4 w-4" /></Link>
                      )}
                      <button onClick={() => handleDuplicate(note)} className="p-1 text-gray-500 hover:text-primary-600" title={t("delivery:actions.duplicate", "Duplicate")} aria-label={t("delivery:actions.duplicate", "Duplicate")}><Copy className="h-4 w-4" /></button>
                      <button onClick={() => setDeleteConfirmId(note.id)} className="p-1 text-gray-500 hover:text-red-600 disabled:opacity-50 disabled:cursor-not-allowed" title={t("common:buttons.delete")} aria-label={t("common:buttons.delete")}><Trash2 className="h-4 w-4" /></button>
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <div className="py-8 text-center text-gray-500">{t("delivery:noDeliveryNotes")}</div>
            )}
          </div>
          {/* Desktop table view */}
          <div className="hidden md:block overflow-x-auto">
          <Table className="min-w-200">
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
                <TableHead>{t("delivery:fields.deliveryNoteNumber")}</TableHead>
                <TableHead>{t("delivery:fields.client")}</TableHead>
                <TableHead>{t("delivery:fields.issueDate")}</TableHead>
                <TableHead>{t("delivery:fields.deliveryDate")}</TableHead>
                <TableHead>{t("delivery:fields.status")}</TableHead>
                <TableHead>{t("delivery:fields.linkedQuote")}</TableHead>
                <TableHead className="w-32">{t("common:buttons.actions")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredDeliveryNotes && filteredDeliveryNotes.length > 0 ? (
                filteredDeliveryNotes.map((note) => (
                  <TableRow key={note.id}>
                    <TableCell>
                      <input
                        type="checkbox"
                        checked={selection.isSelected(note.id)}
                        onChange={() => selection.toggle(note.id)}
                        className="h-4 w-4 text-primary-600 border-gray-300 rounded focus:ring-primary-500"
                      />
                    </TableCell>
                    <TableCell className="font-mono font-medium">
                      {note.delivery_note_number}
                    </TableCell>
                    <TableCell>{note.client?.name || "-"}</TableCell>
                    <TableCell>{formatDate(note.issue_date)}</TableCell>
                    <TableCell>
                      {note.delivery_date ? formatDate(note.delivery_date) : "-"}
                    </TableCell>
                    <TableCell>
                      <Badge variant={statusConfig[note.status].variant}>
                        <Truck className="h-3 w-3 mr-1" />
                        {statusConfig[note.status].label}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {note.quote_id ? (
                        <Link
                          href={`/quotes/${note.quote_id}`}
                          className="text-primary-600 hover:underline inline-flex items-center gap-1"
                        >
                          <FileText className="h-3 w-3" />
                          {t("common:buttons.view")}
                        </Link>
                      ) : (
                        "-"
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Link
                          href={`/delivery-notes/${note.id}`}
                          className="p-1 text-gray-500 hover:text-primary-600 transition-colors"
                          title={t("common:buttons.view")}
                          aria-label={t("common:buttons.view")}
                        >
                          <Eye className="h-4 w-4" />
                        </Link>
                        {note.status === "DRAFT" && (
                          <Link
                            href={`/delivery-notes/${note.id}/edit`}
                            className="p-1 text-gray-500 hover:text-primary-600 transition-colors"
                            title={t("common:buttons.edit")}
                            aria-label={t("common:buttons.edit")}
                          >
                            <Pencil className="h-4 w-4" />
                          </Link>
                        )}
                        <button
                          onClick={() => handleDuplicate(note)}
                          className="p-1 text-gray-500 hover:text-primary-600 transition-colors"
                          title={t("delivery:actions.duplicate", "Duplicate")}
                          aria-label={t("delivery:actions.duplicate", "Duplicate")}
                        >
                          <Copy className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => setDeleteConfirmId(note.id)}
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
                    {t("delivery:noDeliveryNotes")}
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
        title={t("delivery:deleteDeliveryNote")}
        size="sm"
      >
        <p className="text-(--color-text-secondary) mb-6">
          {t("delivery:confirmDelete")}
        </p>
        <div className="flex justify-end gap-3">
          <Button variant="secondary" onClick={() => setDeleteConfirmId(null)}>
            {t("common:buttons.cancel")}
          </Button>
          <Button
            variant="danger"
            onClick={() => deleteConfirmId && handleDelete(deleteConfirmId)}
            isLoading={deleteDeliveryNote.isPending}
          >
            {t("common:buttons.delete")}
          </Button>
        </div>
      </Modal>

      <BulkActionBar
        selectedCount={selection.selectedCount}
        onDelete={() => setBulkDeleteOpen(true)}
        onClear={selection.clear}
        isDeleting={batchDeleteDNs.isPending}
      >
        {canCreateInvoiceFromSelection && (
          <Button
            variant="secondary"
            size="sm"
            onClick={handleCreateInvoiceFromSelection}
            isLoading={createInvoiceFromDNs.isPending}
          >
            <FileText className="h-4 w-4 mr-2" />
            {t("delivery:createInvoiceFromSelection")}
          </Button>
        )}
      </BulkActionBar>
      <BulkDeleteModal
        isOpen={bulkDeleteOpen}
        onClose={() => setBulkDeleteOpen(false)}
        onConfirm={async () => {
          if (isDemoMode) { showSubscribePrompt(); return; }
          await batchDeleteDNs.mutateAsync(Array.from(selection.selectedIds));
          selection.clear();
          setBulkDeleteOpen(false);
        }}
        count={selection.selectedCount}
        isLoading={batchDeleteDNs.isPending}
      />
    </div>
  );
}
