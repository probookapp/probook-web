import { useState, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { ArrowLeft, Eye, Plus, Search, Trash2 } from "lucide-react";
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
  RowActions,
  ListCard,
  type RowAction,
  ColumnPicker,
} from "@/components/ui";
import { useRouter } from "@/lib/navigation";
import { useTableColumns } from "@/hooks/useTableColumns";
import { useDemoMode } from "@/components/providers/DemoModeProvider";
import { useAuthStore } from "@/stores/useAuthStore";
import { LoadMoreSentinel } from "@/components/shared/LoadMoreSentinel";
import { formatCurrency, formatDate } from "@/lib/utils";
import { useInfiniteSupplierReturns, useDeleteSupplierReturn } from "./hooks/useSupplierReturns";

/** Goods sent back to suppliers and kept by them as credit. */
export function SupplierReturnsPage() {
  const { t } = useTranslation("purchases");
  const { t: tCommon } = useTranslation("common");
  const router = useRouter();
  const { isDemoMode, showSubscribePrompt } = useDemoMode();
  const canCreate = useAuthStore((s) => s.hasPermission("purchases", "create"));
  const canDelete = useAuthStore((s) => s.hasPermission("purchases", "delete"));
  const [searchQuery, setSearchQuery] = useState("");
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  const { data: pages, isLoading, hasNextPage, isFetchingNextPage, fetchNextPage } =
    useInfiniteSupplierReturns();
  const returns = useMemo(() => pages?.pages.flatMap((page) => page.data), [pages]);
  const deleteReturn = useDeleteSupplierReturn();

  // Search filters client-side within the loaded pages.
  const query = searchQuery.toLowerCase();
  const filtered = returns?.filter(
    (r) =>
      r.return_number.toLowerCase().includes(query) ||
      (r.supplier?.name ?? "").toLowerCase().includes(query) ||
      (r.purchase_order?.order_number ?? "").toLowerCase().includes(query)
  );

  const columns = useTableColumns(
    "supplier-returns",
    [
      { key: "number", label: t("returns.number"), hideable: false },
      { key: "supplier", label: t("fields.supplier") },
      { key: "date", label: t("returns.date") },
      { key: "order", label: t("returns.fromOrder"), isEmpty: (r) => !r.purchase_order },
      { key: "reason", label: t("returns.reason"), isEmpty: (r) => !r.reason },
      { key: "total", label: t("fields.total") },
      { key: "actions", label: "", hideable: false },
    ],
    filtered
  );

  const open = (id: string) => router.push(`/purchases/returns/${id}`);

  const handleDelete = async () => {
    if (!deleteConfirmId) return;
    if (isDemoMode) { showSubscribePrompt(); return; }
    try {
      await deleteReturn.mutateAsync(deleteConfirmId);
      setDeleteConfirmId(null);
    } catch {
      // Toasted by the mutation.
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600" />
      </div>
    );
  }

  const returnActions = (id: string): RowAction[] => [
    { key: "view", label: tCommon("buttons.view"), icon: Eye, onSelect: () => open(id), primary: true },
    {
      key: "delete",
      label: t("returns.deleteTitle"),
      icon: Trash2,
      onSelect: () => setDeleteConfirmId(id),
      danger: true,
      hidden: !canDelete,
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        {/* Phone: the back button shrinks to its arrow, so the title keeps the width. */}
        <div className="flex items-start gap-2 sm:items-center sm:gap-4">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => router.push("/purchases")}
            aria-label={tCommon("buttons.back")}
            className="max-sm:-ms-2 max-sm:px-2"
          >
            <ArrowLeft className="h-4 w-4 sm:me-2" />
            <span className="max-sm:hidden">{tCommon("buttons.back")}</span>
          </Button>
          <div className="min-w-0">
            <h1 className="text-xl sm:text-2xl font-bold text-(--color-text-primary)">{t("returns.title")}</h1>
            <p className="text-sm sm:text-base text-(--color-text-secondary)">{t("returns.subtitle")}</p>
          </div>
        </div>
        {canCreate && (
          <Button onClick={() => (isDemoMode ? showSubscribePrompt() : router.push("/purchases/returns/new"))}>
            <Plus className="h-4 w-4 me-2" />
            {t("returns.newReturn")}
          </Button>
        )}
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <CardTitle>{t("returns.listTitle")}</CardTitle>
            <div className="flex items-center gap-2 w-full sm:w-auto">
              <ColumnPicker columns={columns} />
              <div className="relative w-full sm:w-56 md:w-64 lg:w-72">
                <Search className="absolute start-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                <Input
                  id="supplier-return-search"
                  name="supplier-return-search"
                  placeholder={t("returns.searchPlaceholder")}
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
          <ul className="md:hidden divide-y divide-(--color-border-primary)">
            {filtered && filtered.length > 0 ? (
              filtered.map((r) => (
                <li key={r.id}>
                  <ListCard
                    onActivate={() => open(r.id)}
                    title={r.supplier?.name || "-"}
                    meta={<><span className="font-mono">{r.return_number}</span> · {formatDate(r.return_date)}</>}
                    amount={formatCurrency(r.total)}
                    actions={<RowActions actions={returnActions(r.id)} />}
                  />
                </li>
              ))
            ) : (
              <li className="px-4 py-8 text-center text-gray-500 dark:text-gray-400">{t("returns.noReturns")}</li>
            )}
          </ul>
          <div className="hidden md:block overflow-x-auto">
            <Table className="min-w-150">
              <TableHeader>
                <TableRow>
                  <TableHead>{t("returns.number")}</TableHead>
                  {columns.show("supplier") && <TableHead>{t("fields.supplier")}</TableHead>}
                  {columns.show("date") && <TableHead>{t("returns.date")}</TableHead>}
                  {columns.show("order") && <TableHead>{t("returns.fromOrder")}</TableHead>}
                  {columns.show("reason") && <TableHead>{t("returns.reason")}</TableHead>}
                  {columns.show("total") && <TableHead className="text-end">{t("fields.total")}</TableHead>}
                  <TableHead className="w-px text-end">{tCommon("buttons.actions")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered && filtered.length > 0 ? (
                  filtered.map((r) => (
                    <TableRow key={r.id} onActivate={() => open(r.id)}>
                      <TableCell className="font-mono font-medium">{r.return_number}</TableCell>
                      {columns.show("supplier") && <TableCell>{r.supplier?.name || "-"}</TableCell>}
                      {columns.show("date") && <TableCell>{formatDate(r.return_date)}</TableCell>}
                      {columns.show("order") && <TableCell>{r.purchase_order?.order_number || "-"}</TableCell>}
                      {columns.show("reason") && (
                        <TableCell className="max-w-64 truncate" title={r.reason ?? undefined}>
                          {r.reason || "-"}
                        </TableCell>
                      )}
                      {columns.show("total") && (
                        <TableNumericCell className="font-medium">{formatCurrency(r.total)}</TableNumericCell>
                      )}
                      <TableCell>
                        <RowActions actions={returnActions(r.id)} />
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={columns.visibleCount} className="text-center text-gray-500 py-8">
                      {t("returns.noReturns")}
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
            loadedCount={returns?.length ?? 0}
          />
        </CardContent>
      </Card>

      <Modal
        isOpen={!!deleteConfirmId}
        onClose={() => setDeleteConfirmId(null)}
        title={t("returns.deleteTitle")}
        size="sm"
      >
        <p className="text-(--color-text-secondary) mb-6 wrap-anywhere">{t("returns.confirmDelete")}</p>
        <div className="flex justify-end gap-3">
          <Button variant="secondary" onClick={() => setDeleteConfirmId(null)}>
            {tCommon("buttons.cancel")}
          </Button>
          <Button variant="danger" onClick={handleDelete} isLoading={deleteReturn.isPending}>
            {t("returns.deleteTitle")}
          </Button>
        </div>
      </Modal>
    </div>
  );
}
