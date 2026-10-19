import { useState, useEffect, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useInfiniteQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Pencil, Trash2, Search, Tags } from "lucide-react";
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
  PageHeader,
  RowActions,
  ListCard,
  type RowAction,
  ColumnPicker,
} from "@/components/ui";
import { ExpenseForm } from "./components/ExpenseForm";
import { ExpenseCategoriesModal } from "./components/ExpenseCategoriesModal";
import { BulkActionBar } from "@/components/shared/BulkActionBar";
import { BulkDeleteModal } from "@/components/shared/BulkDeleteModal";
import { LoadMoreSentinel } from "@/components/shared/LoadMoreSentinel";
import { useSelection } from "@/hooks/useSelection";
import { useTableColumns } from "@/hooks/useTableColumns";
import { expenseApi } from "@/lib/api";
import { useDemoMode } from "@/components/providers/DemoModeProvider";
import { DEMO_EXPENSES } from "@/lib/demo-data";
import { LIST_PAGE_SIZE } from "@/lib/pagination";
import { useToastStore } from "@/stores/useToastStore";
import { useAuthStore } from "@/stores/useAuthStore";
import { formatCurrency, formatDate } from "@/lib/utils";
import type { Expense, CreateExpenseInput, UpdateExpenseInput, CursorPage } from "@/types";
import type { ExpenseFormData } from "./schemas/expenseSchema";

export function ExpensesPage() {
  const { t } = useTranslation("expenses");
  const { t: tCommon } = useTranslation("common");
  const queryClient = useQueryClient();
  const { isDemoMode, showSubscribePrompt } = useDemoMode();
  const addToast = useToastStore((state) => state.addToast);
  const canCreate = useAuthStore((s) => s.hasPermission("expenses", "create"));
  const canEdit = useAuthStore((s) => s.hasPermission("expenses", "edit"));
  const canDelete = useAuthStore((s) => s.hasPermission("expenses", "delete"));
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedExpense, setSelectedExpense] = useState<Expense | undefined>();
  const [searchQuery, setSearchQuery] = useState("");
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [categoriesOpen, setCategoriesOpen] = useState(false);

  const {
    data: expensePages,
    isLoading,
    hasNextPage,
    isFetchingNextPage,
    fetchNextPage,
  } = useInfiniteQuery({
    // Shares the ["expenses"] prefix so existing invalidations refresh it too.
    queryKey: ["expenses", "infinite", { demo: isDemoMode }],
    queryFn: isDemoMode
      ? (): CursorPage<Expense> => ({ data: DEMO_EXPENSES, next_cursor: null })
      : ({ pageParam }) => expenseApi.getPage({ limit: LIST_PAGE_SIZE, cursor: pageParam }),
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) => lastPage.next_cursor,
    staleTime: isDemoMode ? Infinity : undefined,
  });
  const expenses = useMemo(
    () => expensePages?.pages.flatMap((page) => page.data),
    [expensePages]
  );

  const createExpense = useMutation({
    mutationFn: (input: CreateExpenseInput) => expenseApi.create(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["expenses"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-stats"] });
      // Filing under a brand-new heading creates it server-side.
      queryClient.invalidateQueries({ queryKey: ["expense-categories"] });
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
      queryClient.invalidateQueries({ queryKey: ["expense-categories"] });
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

  // Search filters client-side within the loaded pages (the route has no
  // server-side search filter). The heading is searchable too: "carburant"
  // should find the fuel expenses whatever each one is called.
  const filteredExpenses = expenses?.filter((expense) => {
    const needle = searchQuery.toLowerCase();
    return (
      expense.name.toLowerCase().includes(needle) ||
      (expense.category?.name.toLowerCase().includes(needle) ?? false)
    );
  });

  const selection = useSelection(filteredExpenses);

  useEffect(() => {
    selection.clear();
  }, [searchQuery]); // eslint-disable-line react-hooks/exhaustive-deps

  const columns = useTableColumns(
    "expenses",
    [
      { key: "select", label: "", hideable: false },
      { key: "name", label: t("fields.name"), hideable: false },
      { key: "category", label: t("fields.category"), isEmpty: (e) => !e.category },
      { key: "amount", label: t("fields.amount") },
      { key: "date", label: t("fields.date") },
      { key: "notes", label: t("fields.notes"), isEmpty: (e) => !e.notes },
      { key: "actions", label: "", hideable: false },
    ],
    filteredExpenses
  );

  const handleOpenModal = (expense?: Expense) => {
    if (isDemoMode) { showSubscribePrompt(); return; }
    setSelectedExpense(expense);
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setSelectedExpense(undefined);
    setIsModalOpen(false);
  };

  const handleSubmit = async (data: ExpenseFormData) => {
    if (isDemoMode) { showSubscribePrompt(); return; }
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
    if (isDemoMode) { showSubscribePrompt(); return; }
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

  /** The row's actions, shared by the table row and the phone card. */
  const expenseActions = (expense: Expense): RowAction[] => [
    {
      key: "edit",
      label: tCommon("buttons.edit"),
      icon: Pencil,
      onSelect: () => handleOpenModal(expense),
      primary: true,
      hidden: !canEdit,
    },
    {
      key: "delete",
      label: tCommon("buttons.delete"),
      icon: Trash2,
      onSelect: () => setDeleteConfirmId(expense.id),
      danger: true,
      hidden: !canDelete,
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title={t("title")}
        subtitle={t("subtitle")}
        secondaryActions={[
          { key: "categories", label: t("categories.manage"), icon: Tags, onSelect: () => setCategoriesOpen(true) },
        ]}
        primaryAction={canCreate ? { label: t("newExpense"), icon: Plus, onClick: () => handleOpenModal() } : undefined}
      />

      <Card>
        <CardHeader>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <CardTitle>{t("expenseList")}</CardTitle>
            <div className="flex items-center gap-2 w-full sm:w-auto">
              <ColumnPicker columns={columns} />
              <div className="relative w-full sm:w-56 md:w-64 lg:w-72">
                <Search className="absolute start-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                <Input
                  id="expense-search"
                  name="expense-search"
                  placeholder={t("searchPlaceholder")}
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
          {/* Mobile card view */}
          <div className="md:hidden divide-y divide-gray-200 dark:divide-gray-700">
            {filteredExpenses && filteredExpenses.length > 0 ? (
              filteredExpenses.map((expense) => (
                <ListCard
                  key={expense.id}
                  onActivate={canEdit ? () => handleOpenModal(expense) : undefined}
                  leading={
                    <label className="-mx-3 -mb-3 -mt-2 p-3 shrink-0 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={selection.isSelected(expense.id)}
                        onChange={() => selection.toggle(expense.id)}
                        className="block h-4 w-4 text-primary-600 border-gray-300 rounded focus:ring-primary-500"
                      />
                    </label>
                  }
                  title={expense.name}
                  badge={
                    expense.category && (
                      <span className="inline-flex items-center rounded-full bg-gray-100 dark:bg-gray-700 px-2 py-0.5 text-xs text-gray-600 dark:text-gray-300">
                        {expense.category.name}
                      </span>
                    )
                  }
                  meta={formatDate(expense.date)}
                  amount={formatCurrency(expense.amount)}
                  actions={<RowActions actions={expenseActions(expense)} />}
                >
                  {expense.notes && <p className="text-sm text-gray-400 dark:text-gray-500 truncate">{expense.notes}</p>}
                </ListCard>
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
                <TableHead>{t("fields.name")}</TableHead>
                {columns.show("category") && <TableHead>{t("fields.category")}</TableHead>}
                {columns.show("amount") && <TableHead className="text-end">{t("fields.amount")}</TableHead>}
                {columns.show("date") && <TableHead>{t("fields.date")}</TableHead>}
                {columns.show("notes") && <TableHead>{t("fields.notes")}</TableHead>}
                <TableHead className="w-px text-end">{/* Icons only below: the word would size the column. */}<span className="sr-only">{tCommon("buttons.actions")}</span></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredExpenses && filteredExpenses.length > 0 ? (
                filteredExpenses.map((expense) => (
                  <TableRow key={expense.id} onActivate={canEdit ? () => handleOpenModal(expense) : undefined}>
                    <TableCell>
                      <label className="-m-3 p-3 inline-flex align-middle cursor-pointer">
                        <input
                          type="checkbox"
                          checked={selection.isSelected(expense.id)}
                          onChange={() => selection.toggle(expense.id)}
                          className="h-4 w-4 text-primary-600 border-gray-300 rounded focus:ring-primary-500"
                        />
                      </label>
                    </TableCell>
                    <TableCell className="font-medium text-gray-900 dark:text-gray-100">{expense.name}</TableCell>
                    {columns.show("category") && (
                      <TableCell className="text-gray-600 dark:text-gray-400">
                        {expense.category ? (
                          <span className="inline-flex items-center rounded-full bg-gray-100 dark:bg-gray-700 px-2 py-0.5 text-xs">
                            {expense.category.name}
                          </span>
                        ) : (
                          "-"
                        )}
                      </TableCell>
                    )}
                    {columns.show("amount") && <TableNumericCell className="text-gray-600 dark:text-gray-400">{formatCurrency(expense.amount)}</TableNumericCell>}
                    {columns.show("date") && <TableCell className="text-gray-600 dark:text-gray-400">{formatDate(expense.date)}</TableCell>}
                    {columns.show("notes") && <TableCell className="text-gray-600 dark:text-gray-400">{expense.notes || "-"}</TableCell>}
                    <TableCell>
                      <RowActions actions={expenseActions(expense)} />
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={columns.visibleCount} className="text-center text-gray-500 dark:text-gray-400 py-8">
                    {t("noExpenses")}
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
            loadedCount={expenses?.length ?? 0}
          />
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
        <p className="text-gray-600 dark:text-gray-400 mb-6 wrap-anywhere">
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

      {canDelete && (
        <BulkActionBar
          selectedCount={selection.selectedCount}
          onDelete={() => setBulkDeleteOpen(true)}
          onClear={selection.clear}
          isDeleting={batchDeleteExpense.isPending}
        />
      )}

      <ExpenseCategoriesModal
        isOpen={categoriesOpen}
        onClose={() => setCategoriesOpen(false)}
        canEdit={canEdit}
        canDelete={canDelete}
      />

      <BulkDeleteModal
        isOpen={bulkDeleteOpen}
        onClose={() => setBulkDeleteOpen(false)}
        onConfirm={async () => {
          if (isDemoMode) { showSubscribePrompt(); return; }
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
