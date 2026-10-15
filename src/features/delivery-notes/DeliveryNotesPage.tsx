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
  FileDown,
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
  Input,
  Badge,
  TagChip,
  PageHeader,
  RowActions,
  ListCard,
  type RowAction,
  ColumnPicker,
} from "@/components/ui";
import {
  useInfiniteDeliveryNotes,
  useDeleteDeliveryNote,
  useDuplicateDeliveryNote,
  useBatchDeleteDeliveryNotes,
} from "./hooks/useDeliveryNotes";
import { useCreateInvoiceFromDeliveryNotes } from "@/features/invoices/hooks/useInvoices";
import { useDemoMode } from "@/components/providers/DemoModeProvider";
import { BulkActionBar } from "@/components/shared/BulkActionBar";
import { BulkDeleteModal } from "@/components/shared/BulkDeleteModal";
import { LoadMoreSentinel } from "@/components/shared/LoadMoreSentinel";
import { StatusFilterChips, statusQuery } from "@/components/shared/StatusFilterChips";
import { ALL_STATUSES, DELIVERY_NOTE_STATUSES } from "@/lib/document-status";
import { useStatusFilter } from "@/hooks/useStatusFilter";
import { useTagListFilter } from "@/hooks/useTagListFilter";
import { TagsModal } from "@/components/documents/TagsModal";
import { useSelection } from "@/hooks/useSelection";
import { useTableColumns } from "@/hooks/useTableColumns";
import { useDocumentPdfDownload } from "@/features/pdf/useDocumentPdfDownload";
import type { DeliveryNoteListItem, DeliveryNoteStatus } from "@/types";
import { formatDate } from "@/lib/utils";
import { useAuthStore } from "@/stores/useAuthStore";

export function DeliveryNotesPage() {
  const { t } = useTranslation(["delivery", "common"]);
  const router = useRouter();
  const { isDemoMode, showSubscribePrompt } = useDemoMode();
  const canCreate = useAuthStore((s) => s.hasPermission("delivery_notes", "create"));
  const canEdit = useAuthStore((s) => s.hasPermission("delivery_notes", "edit"));
  const canDelete = useAuthStore((s) => s.hasPermission("delivery_notes", "delete"));
  const canCreateInvoice = useAuthStore((s) => s.hasPermission("invoices", "create"));
  const [searchQuery, setSearchQuery] = useState("");
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [statusFilter, setStatusFilter] = useStatusFilter(DELIVERY_NOTE_STATUSES);
  const tagList = useTagListFilter();

  const statusConfig: Record<
    DeliveryNoteStatus,
    { label: string; variant: "default" | "success" | "warning" | "danger" | "info" }
  > = {
    DRAFT: { label: t("delivery:status.DRAFT"), variant: "default" },
    DELIVERED: { label: t("delivery:status.DELIVERED"), variant: "success" },
    CANCELLED: { label: t("delivery:status.CANCELLED"), variant: "danger" },
  };

  const {
    data: deliveryNotePages,
    isLoading,
    hasNextPage,
    isFetchingNextPage,
    fetchNextPage,
  } = useInfiniteDeliveryNotes(statusQuery(statusFilter), tagList.tagQuery);
  const deliveryNotes = useMemo(
    () => deliveryNotePages?.pages.flatMap((page) => page.data),
    [deliveryNotePages]
  );
  const deleteDeliveryNote = useDeleteDeliveryNote();
  const duplicateDeliveryNote = useDuplicateDeliveryNote();
  const createInvoiceFromDNs = useCreateInvoiceFromDeliveryNotes();
  const batchDeleteDNs = useBatchDeleteDeliveryNotes();

  // Search filters client-side within the loaded pages (the route has no
  // server-side search filter).
  const filteredDeliveryNotes = deliveryNotes?.filter(
    (note) =>
      note.delivery_note_number.toLowerCase().includes(searchQuery.toLowerCase()) ||
      note.client?.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const selection = useSelection(filteredDeliveryNotes);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { selection.clear(); }, [searchQuery, statusFilter, tagList.tagFilter]);

  const pdfDownload = useDocumentPdfDownload();
  const columns = useTableColumns(
    "delivery-notes",
    [
      { key: "select", label: "", hideable: false },
      { key: "number", label: t("delivery:fields.deliveryNoteNumber"), hideable: false },
      { key: "client", label: t("delivery:fields.client") },
      { key: "issueDate", label: t("delivery:fields.issueDate") },
      { key: "deliveryDate", label: t("delivery:fields.deliveryDate"), isEmpty: (n) => !n.delivery_date },
      { key: "status", label: t("delivery:fields.status") },
      { key: "tags", label: t("common:tags.label"), isEmpty: (n) => !n.tags?.length },
      { key: "linkedQuote", label: t("delivery:fields.linkedQuote"), isEmpty: (n) => !n.quote_id },
      { key: "actions", label: "", hideable: false },
    ],
    filteredDeliveryNotes
  );

  const statusOptions = [
    { key: ALL_STATUSES, label: t("common:filters.all") },
    ...DELIVERY_NOTE_STATUSES.map((s) => ({
      key: s,
      label: t(`common:status.${s.toLowerCase()}`),
    })),
  ];

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

  const handleDuplicate = async (note: DeliveryNoteListItem) => {
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

  /** The row's actions, shared by the table row and the phone card. */
  const deliveryNoteActions = (note: DeliveryNoteListItem): RowAction[] => [
    {
      key: "edit",
      label: t("common:buttons.edit"),
      icon: Pencil,
      onSelect: () => router.push(`/delivery-notes/${note.id}/edit`),
      primary: true,
      hidden: !(note.status === "DRAFT" && canEdit),
    },
    {
      key: "view",
      label: t("common:buttons.view"),
      icon: Eye,
      onSelect: () => router.push(`/delivery-notes/${note.id}`),
    },
    {
      key: "pdf",
      label: t("delivery:actions.downloadPdf"),
      icon: FileDown,
      onSelect: () => pdfDownload.download("delivery_note", note.id),
      disabled: pdfDownload.pendingId === note.id,
    },
    {
      key: "duplicate",
      label: t("delivery:actions.duplicate", "Duplicate"),
      icon: Copy,
      onSelect: () => handleDuplicate(note),
      hidden: !canCreate,
    },
    {
      key: "delete",
      label: t("common:buttons.delete"),
      icon: Trash2,
      onSelect: () => setDeleteConfirmId(note.id),
      danger: true,
      hidden: !canDelete,
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title={t("delivery:title")}
        subtitle={t("delivery:subtitle", "Manage your delivery notes")}
        secondaryActions={[
          {
            key: "labels",
            label: tagList.manageLabel,
            icon: TagIcon,
            onSelect: tagList.openTagsModal,
            hidden: !canEdit,
          },
        ]}
        primaryAction={
          canCreate
            ? { label: t("delivery:newDeliveryNote"), icon: Plus, onClick: () => router.push("/delivery-notes/new") }
            : undefined
        }
      />

      <Card>
        <CardHeader>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <CardTitle>{t("delivery:listTitle", "Delivery Note List")}</CardTitle>
            <div className="flex items-center gap-2 w-full sm:w-auto">
              <ColumnPicker columns={columns} />
              <div className="relative w-full sm:w-56 md:w-64 lg:w-72">
                <Search className="absolute start-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                <Input
                  id="delivery-note-search"
                  name="delivery-note-search"
                  placeholder={t("delivery:searchPlaceholder")}
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
          {/* Labels narrow whatever state is selected — see the quotes list. */}
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
            {filteredDeliveryNotes && filteredDeliveryNotes.length > 0 ? (
              filteredDeliveryNotes.map((note) => (
                <ListCard
                  key={note.id}
                  onActivate={() => router.push(`/delivery-notes/${note.id}`)}
                  leading={
                    <>
                      <label className="-mx-3 -mb-3 -mt-2 p-3 shrink-0 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={selection.isSelected(note.id)}
                          onChange={() => selection.toggle(note.id)}
                          className="block h-4 w-4 text-primary-600 border-gray-300 rounded focus:ring-primary-500"
                        />
                      </label>
                    </>
                  }
                  title={note.client?.name || "-"}
                  badge={(
                    <Badge variant={statusConfig[note.status].variant}>
                      <Truck className="h-3 w-3 me-1" />
                      {statusConfig[note.status].label}
                    </Badge>
                  )}
                  meta={<>
                      <span className="font-mono">{note.delivery_note_number}</span> · {formatDate(note.issue_date)}
                      {note.delivery_date && ` → ${formatDate(note.delivery_date)}`}
                    </>}
                  actions={<RowActions actions={deliveryNoteActions(note)} />}
                >
                  {(note.tags?.length ?? 0) > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {note.tags?.map((tag) => (
                        <TagChip key={tag.id} name={tag.name} color={tag.color} />
                      ))}
                    </div>
                  )}
                  {note.quote_id && (
                    <Link href={`/quotes/${note.quote_id}`} className="mt-1 text-xs text-primary-600 hover:underline inline-flex items-center gap-1">
                      <FileText className="h-3 w-3" />
                      {t("common:buttons.view")}
                    </Link>
                  )}
                </ListCard>
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
                  <label className="-m-3 p-3 inline-flex align-middle cursor-pointer">
                    <input
                      type="checkbox"
                      checked={selection.isAllSelected}
                      ref={(el) => { if (el) el.indeterminate = selection.isIndeterminate; }}
                      onChange={() => selection.toggleAll()}
                      className="h-4 w-4 text-primary-600 border-gray-300 rounded focus:ring-primary-500"
                    />
                  </label>
                </TableHead>
                <TableHead>{t("delivery:fields.deliveryNoteNumber")}</TableHead>
                {columns.show("client") && <TableHead>{t("delivery:fields.client")}</TableHead>}
                {columns.show("issueDate") && <TableHead>{t("delivery:fields.issueDate")}</TableHead>}
                {columns.show("deliveryDate") && <TableHead>{t("delivery:fields.deliveryDate")}</TableHead>}
                {columns.show("status") && <TableHead>{t("delivery:fields.status")}</TableHead>}
                {columns.show("tags") && <TableHead>{t("common:tags.label")}</TableHead>}
                {columns.show("linkedQuote") && <TableHead>{t("delivery:fields.linkedQuote")}</TableHead>}
                <TableHead className="w-px text-end">{t("common:buttons.actions")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredDeliveryNotes && filteredDeliveryNotes.length > 0 ? (
                filteredDeliveryNotes.map((note) => (
                  <TableRow key={note.id} onActivate={() => router.push(`/delivery-notes/${note.id}`)}>
                    <TableCell>
                      <label className="-m-3 p-3 inline-flex align-middle cursor-pointer">
                        <input
                          type="checkbox"
                          checked={selection.isSelected(note.id)}
                          onChange={() => selection.toggle(note.id)}
                          className="h-4 w-4 text-primary-600 border-gray-300 rounded focus:ring-primary-500"
                        />
                      </label>
                    </TableCell>
                    <TableCell className="font-mono font-medium">
                      {note.delivery_note_number}
                    </TableCell>
                    {columns.show("client") && <TableCell>{note.client?.name || "-"}</TableCell>}
                    {columns.show("issueDate") && <TableCell>{formatDate(note.issue_date)}</TableCell>}
                    {columns.show("deliveryDate") && (
                      <TableCell>
                        {note.delivery_date ? formatDate(note.delivery_date) : "-"}
                      </TableCell>
                    )}
                    {columns.show("status") && (
                      <TableCell>
                        <Badge variant={statusConfig[note.status].variant}>
                          <Truck className="h-3 w-3 me-1" />
                          {statusConfig[note.status].label}
                        </Badge>
                      </TableCell>
                    )}
                    {columns.show("tags") && (
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          {note.tags?.map((tag) => (
                            <TagChip key={tag.id} name={tag.name} color={tag.color} />
                          ))}
                        </div>
                      </TableCell>
                    )}
                    {columns.show("linkedQuote") && (
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
                    )}
                    <TableCell>
                      <RowActions actions={deliveryNoteActions(note)} />
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={columns.visibleCount} className="text-center text-gray-500 py-8">
                    {t("delivery:noDeliveryNotes")}
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
            loadedCount={deliveryNotes?.length ?? 0}
          />
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

      {canDelete && (
        <BulkActionBar
          selectedCount={selection.selectedCount}
          onDelete={() => setBulkDeleteOpen(true)}
          onClear={selection.clear}
          isDeleting={batchDeleteDNs.isPending}
        >
          {canCreateInvoiceFromSelection && canCreateInvoice && (
            <Button
              variant="secondary"
              size="sm"
              onClick={handleCreateInvoiceFromSelection}
              isLoading={createInvoiceFromDNs.isPending}
            >
              <FileText className="h-4 w-4 me-2" />
              {t("delivery:createInvoiceFromSelection")}
            </Button>
          )}
        </BulkActionBar>
      )}
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

      <TagsModal
        isOpen={tagList.tagsModalOpen}
        onClose={tagList.closeTagsModal}
        canEdit={canEdit}
      />
    </div>
  );
}
