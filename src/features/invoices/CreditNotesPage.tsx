import { useState, useMemo } from "react";
import { useRouter } from "@/lib/navigation";
import { useTranslation } from "react-i18next";
import { ArrowLeft, Eye, Trash2, Search } from "lucide-react";
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
  RowActions,
  ListCard,
  type RowAction,
  ColumnPicker,
} from "@/components/ui";
import { useTableColumns } from "@/hooks/useTableColumns";
import { useInfiniteCreditNotes, useDeleteCreditNote } from "./hooks/useCreditNotes";
import { useDemoMode } from "@/components/providers/DemoModeProvider";
import { LoadMoreSentinel } from "@/components/shared/LoadMoreSentinel";
import { formatCurrency, formatDate } from "@/lib/utils";

export function CreditNotesPage() {
  const { t } = useTranslation(["invoices", "common"]);
  const router = useRouter();
  const { isDemoMode, showSubscribePrompt } = useDemoMode();
  const [searchQuery, setSearchQuery] = useState("");
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  const {
    data: creditNotePages,
    isLoading,
    hasNextPage,
    isFetchingNextPage,
    fetchNextPage,
  } = useInfiniteCreditNotes();
  const creditNotes = useMemo(
    () => creditNotePages?.pages.flatMap((page) => page.data),
    [creditNotePages]
  );
  const deleteCreditNote = useDeleteCreditNote();

  // Search filters client-side within the loaded pages (the route has no
  // server-side search filter).
  const filtered = creditNotes?.filter(
    (cn) =>
      cn.credit_note_number.toLowerCase().includes(searchQuery.toLowerCase()) ||
      cn.client?.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const columns = useTableColumns(
    "credit-notes",
    [
      { key: "number", label: t("invoices:creditNotes.number"), hideable: false },
      { key: "client", label: t("invoices:fields.client") },
      { key: "issueDate", label: t("invoices:fields.issueDate") },
      { key: "restocked", label: t("invoices:creditNotes.restocked") },
      { key: "total", label: t("invoices:fields.totalTtc") },
      { key: "actions", label: "", hideable: false },
    ],
    filtered
  );

  const handleDelete = async (id: string) => {
    if (isDemoMode) {
      showSubscribePrompt();
      return;
    }
    await deleteCreditNote.mutateAsync(id);
    setDeleteConfirmId(null);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600" />
      </div>
    );
  }

  /** The row's actions, shared by the table row and the phone card. */
  const creditNoteActions = (id: string): RowAction[] => [
    {
      key: "view",
      label: t("common:buttons.view"),
      icon: Eye,
      onSelect: () => router.push(`/invoices/credit-notes/${id}`),
    },
    {
      key: "delete",
      label: t("common:buttons.delete"),
      icon: Trash2,
      onSelect: () => setDeleteConfirmId(id),
      danger: true,
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4">
        {/* Phone: the back button shrinks to its arrow, so the title keeps the width. */}
        <div className="flex items-start gap-2 sm:items-center sm:gap-4">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => router.push("/invoices")}
            aria-label={t("common:buttons.back")}
            className="max-sm:-ms-2 max-sm:px-2"
          >
            <ArrowLeft className="h-4 w-4 sm:me-2" />
            <span className="max-sm:hidden">{t("common:buttons.back")}</span>
          </Button>
          <div className="min-w-0">
            <h1 className="text-xl sm:text-2xl font-bold text-(--color-text-primary)">
              {t("invoices:creditNotes.title")}
            </h1>
            <p className="text-sm sm:text-base text-(--color-text-secondary)">
              {t("invoices:creditNotes.subtitle")}
            </p>
          </div>
        </div>
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <CardTitle>{t("invoices:creditNotes.listTitle")}</CardTitle>
            <div className="flex items-center gap-2 w-full sm:w-auto">
              <ColumnPicker columns={columns} />
              <div className="relative w-full sm:w-56 md:w-64 lg:w-72">
                <Search className="absolute start-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                <Input
                  id="credit-note-search"
                  name="credit-note-search"
                  placeholder={t("invoices:creditNotes.searchPlaceholder")}
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
          {/* Phones: one card per credit note instead of a table to scroll sideways. */}
          <ul className="md:hidden divide-y divide-(--color-border-primary)">
            {filtered && filtered.length > 0 ? (
              filtered.map((cn) => (
                <li key={cn.id}>
                  <ListCard
                    onActivate={() => router.push(`/invoices/credit-notes/${cn.id}`)}
                    title={cn.client?.name || "-"}
                    badge={cn.restocked && <Badge variant="success">{t("invoices:creditNotes.restocked")}</Badge>}
                    meta={<><span className="font-mono">{cn.credit_note_number}</span> · {formatDate(cn.issue_date)}</>}
                    amount={formatCurrency(cn.total)}
                    actions={<RowActions actions={creditNoteActions(cn.id)} />}
                  />
                </li>
              ))
            ) : (
              <li className="px-4 py-8 text-center text-gray-500 dark:text-gray-400">
                {t("invoices:creditNotes.noCreditNotes")}
              </li>
            )}
          </ul>
          <div className="hidden md:block overflow-x-auto">
            <Table className="min-w-150">
              <TableHeader>
                <TableRow>
                  <TableHead>{t("invoices:creditNotes.number")}</TableHead>
                  {columns.show("client") && <TableHead>{t("invoices:fields.client")}</TableHead>}
                  {columns.show("issueDate") && <TableHead>{t("invoices:fields.issueDate")}</TableHead>}
                  {columns.show("restocked") && <TableHead>{t("invoices:creditNotes.restocked")}</TableHead>}
                  {columns.show("total") && <TableHead className="text-end">{t("invoices:fields.totalTtc")}</TableHead>}
                  <TableHead className="w-px text-end">{t("common:buttons.actions")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered && filtered.length > 0 ? (
                  filtered.map((cn) => (
                    <TableRow key={cn.id} onActivate={() => router.push(`/invoices/credit-notes/${cn.id}`)}>
                      <TableCell className="font-mono font-medium">{cn.credit_note_number}</TableCell>
                      {columns.show("client") && <TableCell>{cn.client?.name || "-"}</TableCell>}
                      {columns.show("issueDate") && <TableCell>{formatDate(cn.issue_date)}</TableCell>}
                      {columns.show("restocked") && (
                        <TableCell>
                          {cn.restocked ? (
                            <Badge variant="success">{t("common:labels.yes")}</Badge>
                          ) : (
                            <Badge variant="default">{t("common:labels.no")}</Badge>
                          )}
                        </TableCell>
                      )}
                      {columns.show("total") && (
                        <TableNumericCell className="font-medium">{formatCurrency(cn.total)}</TableNumericCell>
                      )}
                      <TableCell>
                        <RowActions actions={creditNoteActions(cn.id)} />
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={columns.visibleCount} className="text-center text-gray-500 py-8">
                      {t("invoices:creditNotes.noCreditNotes")}
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
            loadedCount={creditNotes?.length ?? 0}
          />
        </CardContent>
      </Card>

      <Modal
        isOpen={!!deleteConfirmId}
        onClose={() => setDeleteConfirmId(null)}
        title={t("invoices:creditNotes.deleteTitle")}
        size="sm"
      >
        <p className="text-(--color-text-secondary) mb-6">{t("invoices:creditNotes.confirmDelete")}</p>
        <div className="flex justify-end gap-3">
          <Button variant="secondary" onClick={() => setDeleteConfirmId(null)}>
            {t("common:buttons.cancel")}
          </Button>
          <Button
            variant="danger"
            onClick={() => deleteConfirmId && handleDelete(deleteConfirmId)}
            isLoading={deleteCreditNote.isPending}
          >
            {t("common:buttons.delete")}
          </Button>
        </div>
      </Modal>
    </div>
  );
}
