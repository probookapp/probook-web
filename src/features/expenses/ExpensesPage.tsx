import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Pencil, Trash2, Search } from "lucide-react";
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
} from "@/components/ui";
import { ExpenseForm } from "./components/ExpenseForm";
import { BulkActionBar } from "@/components/shared/BulkActionBar";
import { BulkDeleteModal } from "@/components/shared/BulkDeleteModal";
import { useSelection } from "@/hooks/useSelection";
import { expenseApi } from "@/lib/api";
import { useToastStore } from "@/stores/useToastStore";
import { formatCurrency, formatDate } from "@/lib/utils";
import type { Expense, CreateExpenseInput, UpdateExpenseInput } from "@/types";
import type { ExpenseFormData } from "./schemas/expenseSchema";

export function ExpensesPage() {
  const { t } = useTranslation("expenses");
  const { t: tCommon } = useTranslation("common");
  const queryClient = useQueryClient();
  const addToast = useToastStore((state) => state.addToast);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedExpense, setSelectedExpense] = useState<Expense | undefined>();
  const [searchQuery, setSearchQuery] = useState("");
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);

  const { data: expenses, isLoading } = useQuery({
    queryKey: ["expenses"],
    queryFn: expenseApi.getAll,
  });

  const createExpense = useMutation({
    mutationFn: (input: CreateExpenseInput) => expenseApi.create(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["expenses"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-stats"] });
      addToast({ type: "success", message: t("messages.created") });
    },
    onError: () => {
      addToast({ type: "error", message: t("messages.createError") });
    },
  });

  const updateExpense = useMutation({
    mutationFn: (input: UpdateExpenseInput) => expenseApi.update(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["expenses"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-stats"] });
      addToast({ type: "success", message: t("messages.updated") });
    },
    onError: () => {
      addToast({ type: "error", message: t("messages.updateError") });
    },
  });

  const deleteExpense = useMutation({
    mutationFn: (id: string) => expenseApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["expenses"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-stats"] });
      addToast({ type: "success", message: t("messages.deleted") });
    },
    onError: () => {
      addToast({ type: "error", message: t("messages.deleteError") });
    },
  });

  const batchDeleteExpense = useMutation({
    mutationFn: (ids: string[]) => expenseApi.batchDelete(ids),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["expenses"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-stats"] });
      addToast({ type: "success", message: tCommon("bulk.deleted") });
    },
    onError: () => {
      addToast({ type: "error", message: tCommon("bulk.deleteError") });
    },
  });

  const filteredExpenses = expenses?.filter((expense) =>
    expense.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const selection = useSelection(filteredExpenses);

  useEffect(() => {
    selection.clear();
  }, [searchQuery]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleOpenModal = (expense?: Expense) => {
    setSelectedExpense(expense);
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setSelectedExpense(undefined);
    setIsModalOpen(false);
  };

  const handleSubmit = async (data: ExpenseFormData) => {
    const input = {
      ...data,
      notes: data.notes || null,
    };

    if (selectedExpense) {
      await updateExpense.mutateAsync({ ...input, id: selectedExpense.id });
    } else {
      await createExpense.mutateAsync(input);
    }
    handleCloseModal();
  };

  const handleDelete = async (id: string) => {
    await deleteExpense.mutateAsync(id);
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
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-gray-100">{t("title")}</h1>
          <p className="text-sm sm:text-base text-gray-500 dark:text-gray-400">{t("subtitle")}</p>
        </div>
        <Button onClick={() => handleOpenModal()} size="sm" className="self-start sm:self-auto">
          <Plus className="h-4 w-4 mr-2" />
          {t("newExpense")}
        </Button>
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <CardTitle>{t("expenseList")}</CardTitle>
            <div className="relative w-full sm:w-56 md:w-64 lg:w-72">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
              <Input
                id="expense-search"
                name="expense-search"
                placeholder={t("searchPlaceholder")}
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
            {filteredExpenses && filteredExpenses.length > 0 ? (
              filteredExpenses.map((expense) => (
                <div key={expense.id} className="p-4 flex items-start gap-3">
                  <input
                    type="checkbox"
                    checked={selection.isSelected(expense.id)}
                    onChange={() => selection.toggle(expense.id)}
                    className="mt-0.5 h-4 w-4 text-primary-600 border-gray-300 rounded focus:ring-primary-500"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <p className="font-medium text-gray-900 dark:text-gray-100 truncate">{expense.name}</p>
                      <p className="font-medium text-gray-900 dark:text-gray-100 shrink-0">{formatCurrency(expense.amount)}</p>
                    </div>
                    <p className="text-sm text-gray-500 dark:text-gray-400">{formatDate(expense.date)}</p>
                    {expense.notes && <p className="text-sm text-gray-400 dark:text-gray-500 truncate mt-0.5">{expense.notes}</p>}
                    <div className="flex justify-end gap-1 mt-2">
                      <button onClick={() => handleOpenModal(expense)} className="p-1 text-gray-500 hover:text-primary-600 dark:hover:text-primary-400" title={tCommon("buttons.edit")} aria-label={tCommon("buttons.edit")}><Pencil className="h-4 w-4" /></button>
                      <button onClick={() => setDeleteConfirmId(expense.id)} className="p-1 text-gray-500 hover:text-red-600 disabled:opacity-50 disabled:cursor-not-allowed" title={tCommon("buttons.delete")} aria-label={tCommon("buttons.delete")}><Trash2 className="h-4 w-4" /></button>
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <div className="py-8 text-center text-gray-500 dark:text-gray-400">{t("noExpenses")}</div>
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
                    ref={(el) => { if (el) el.indeterminate = selection.isIndeterminate; }}
                    onChange={() => selection.toggleAll()}
                    className="h-4 w-4 text-primary-600 border-gray-300 rounded focus:ring-primary-500"
                  />
                </TableHead>
                <TableHead>{t("fields.name")}</TableHead>
                <TableHead>{t("fields.amount")}</TableHead>
                <TableHead>{t("fields.date")}</TableHead>
                <TableHead>{t("fields.notes")}</TableHead>
                <TableHead className="w-24">{tCommon("buttons.actions")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredExpenses && filteredExpenses.length > 0 ? (
                filteredExpenses.map((expense) => (
                  <TableRow key={expense.id}>
                    <TableCell>
                      <input
                        type="checkbox"
                        checked={selection.isSelected(expense.id)}
                        onChange={() => selection.toggle(expense.id)}
                        className="h-4 w-4 text-primary-600 border-gray-300 rounded focus:ring-primary-500"
                      />
                    </TableCell>
                    <TableCell className="font-medium text-gray-900 dark:text-gray-100">{expense.name}</TableCell>
                    <TableCell className="text-gray-600 dark:text-gray-400">{formatCurrency(expense.amount)}</TableCell>
                    <TableCell className="text-gray-600 dark:text-gray-400">{formatDate(expense.date)}</TableCell>
                    <TableCell className="text-gray-600 dark:text-gray-400">{expense.notes || "-"}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => handleOpenModal(expense)}
                          className="p-1 text-gray-500 hover:text-primary-600 dark:hover:text-primary-400 transition-colors"
                          title={tCommon("buttons.edit")}
                          aria-label={tCommon("buttons.edit")}
                        >
                          <Pencil className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => setDeleteConfirmId(expense.id)}
                          className="p-1 text-gray-500 hover:text-red-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                          title={tCommon("buttons.delete")}
                          aria-label={tCommon("buttons.delete")}
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-gray-500 dark:text-gray-400 py-8">
                    {t("noExpenses")}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
          </div>
        </CardContent>
      </Card>

      <Modal
        isOpen={isModalOpen}
        onClose={handleCloseModal}
        title={selectedExpense ? t("editExpense") : t("newExpense")}
        size="lg"
      >
        <ExpenseForm
          expense={selectedExpense}
          onSubmit={handleSubmit}
          onCancel={handleCloseModal}
          isLoading={createExpense.isPending || updateExpense.isPending}
        />
      </Modal>

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
          <Button variant="secondary" onClick={() => setDeleteConfirmId(null)}>
            {tCommon("buttons.cancel")}
          </Button>
          <Button
            variant="danger"
            onClick={() => deleteConfirmId && handleDelete(deleteConfirmId)}
            isLoading={deleteExpense.isPending}
          >
            {tCommon("buttons.delete")}
          </Button>
        </div>
      </Modal>

      <BulkActionBar
        selectedCount={selection.selectedCount}
        onDelete={() => setBulkDeleteOpen(true)}
        onClear={selection.clear}
        isDeleting={batchDeleteExpense.isPending}
      />

      <BulkDeleteModal
        isOpen={bulkDeleteOpen}
        onClose={() => setBulkDeleteOpen(false)}
        onConfirm={async () => {
          await batchDeleteExpense.mutateAsync(Array.from(selection.selectedIds));
          selection.clear();
          setBulkDeleteOpen(false);
        }}
        count={selection.selectedCount}
        isLoading={batchDeleteExpense.isPending}
      />
    </div>
  );
}
