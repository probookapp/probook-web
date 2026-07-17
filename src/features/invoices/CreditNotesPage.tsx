import { useState } from "react";
import { useRouter } from "@/lib/navigation";
import { useTranslation } from "react-i18next";
import { ArrowLeft, Eye, Trash2, Search, Undo2 } from "lucide-react";
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
import { useCreditNotes, useDeleteCreditNote } from "./hooks/useCreditNotes";
import { useDemoMode } from "@/components/providers/DemoModeProvider";
import { formatCurrency, formatDate } from "@/lib/utils";

export function CreditNotesPage() {
  const { t } = useTranslation(["invoices", "common"]);
  const router = useRouter();
  const { isDemoMode, showSubscribePrompt } = useDemoMode();
  const [searchQuery, setSearchQuery] = useState("");
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  const { data: creditNotes, isLoading } = useCreditNotes();
  const deleteCreditNote = useDeleteCreditNote();

  const filtered = creditNotes?.filter(
    (cn) =>
      cn.credit_note_number.toLowerCase().includes(searchQuery.toLowerCase()) ||
      cn.client?.name.toLowerCase().includes(searchQuery.toLowerCase())
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

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="sm" onClick={() => router.push("/invoices")}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            {t("common:buttons.back")}
          </Button>
          <div>
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
            <div className="relative w-full sm:w-56 md:w-64 lg:w-72">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
              <Input
                id="credit-note-search"
                name="credit-note-search"
                placeholder={t("invoices:creditNotes.searchPlaceholder")}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                autoComplete="off"
                className="pl-9"
              />
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table className="min-w-150">
              <TableHeader>
                <TableRow>
                  <TableHead>{t("invoices:creditNotes.number")}</TableHead>
                  <TableHead>{t("invoices:fields.client")}</TableHead>
                  <TableHead>{t("invoices:fields.issueDate")}</TableHead>
                  <TableHead>{t("invoices:creditNotes.restocked")}</TableHead>
                  <TableHead>{t("invoices:fields.totalTtc")}</TableHead>
                  <TableHead className="w-24">{t("common:buttons.actions")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered && filtered.length > 0 ? (
                  filtered.map((cn) => (
                    <TableRow key={cn.id}>
                      <TableCell className="font-mono font-medium">{cn.credit_note_number}</TableCell>
                      <TableCell>{cn.client?.name || "-"}</TableCell>
                      <TableCell>{formatDate(cn.issue_date)}</TableCell>
                      <TableCell>
                        {cn.restocked ? (
                          <Badge variant="success">{t("common:labels.yes")}</Badge>
                        ) : (
                          <Badge variant="default">{t("common:labels.no")}</Badge>
                        )}
                      </TableCell>
                      <TableCell className="font-medium">{formatCurrency(cn.total)}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => router.push(`/invoices/credit-notes/${cn.id}`)}
                            className="p-1 text-gray-500 hover:text-primary-600 transition-colors"
                            title={t("common:buttons.view")}
                            aria-label={t("common:buttons.view")}
                          >
                            <Eye className="h-4 w-4" />
                          </button>
                          <button
                            onClick={() => setDeleteConfirmId(cn.id)}
                            className="p-1 text-gray-500 hover:text-red-600 transition-colors"
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
                    <TableCell colSpan={6} className="text-center text-gray-500 py-8">
                      <Undo2 className="h-12 w-12 mx-auto mb-2 text-gray-300 dark:text-gray-600" />
                      {t("invoices:creditNotes.noCreditNotes")}
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
