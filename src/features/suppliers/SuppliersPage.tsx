import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Plus, Pencil, Trash2, Search, Package, Upload } from "lucide-react";
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
import { BulkActionBar } from "@/components/shared/BulkActionBar";
import { BulkDeleteModal } from "@/components/shared/BulkDeleteModal";
import { useSelection } from "@/hooks/useSelection";
import { SupplierForm } from "./components/SupplierForm";
import { SupplierProducts } from "./components/SupplierProducts";
import { ImportDialog } from "@/components/shared/ImportDialog";
import {
  useSuppliers,
  useCreateSupplier,
  useUpdateSupplier,
  useDeleteSupplier,
  useBatchDeleteSuppliers,
} from "./hooks/useSuppliers";
import { useToastStore } from "@/stores/useToastStore";
import type { Supplier, CreateSupplierInput, UpdateSupplierInput } from "@/types";
import type { SupplierFormData } from "./schemas/supplierSchema";

export function SuppliersPage() {
  const { t } = useTranslation("suppliers");
  const { t: tCommon } = useTranslation("common");
  const addToast = useToastStore((state) => state.addToast);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedSupplier, setSelectedSupplier] = useState<Supplier | undefined>();
  const [searchQuery, setSearchQuery] = useState("");
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [productsSupplier, setProductsSupplier] = useState<Supplier | null>(null);
  const [isImportOpen, setIsImportOpen] = useState(false);
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);

  const { data: suppliers, isLoading } = useSuppliers();
  const createSupplier = useCreateSupplier();
  const updateSupplier = useUpdateSupplier();
  const deleteSupplier = useDeleteSupplier();
  const batchDeleteSuppliers = useBatchDeleteSuppliers();

  const filteredSuppliers = suppliers?.filter((supplier) => {
    const query = searchQuery.toLowerCase();
    return (
      supplier.name.toLowerCase().includes(query) ||
      (supplier.email && supplier.email.toLowerCase().includes(query)) ||
      (supplier.phone && supplier.phone.toLowerCase().includes(query))
    );
  });

  const selection = useSelection(filteredSuppliers);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { selection.clear(); }, [searchQuery]);

  const handleOpenModal = (supplier?: Supplier) => {
    setSelectedSupplier(supplier);
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setSelectedSupplier(undefined);
    setIsModalOpen(false);
  };

  const handleSubmit = async (data: SupplierFormData) => {
    const input: CreateSupplierInput = {
      name: data.name,
      email: data.email || null,
      phone: data.phone || null,
      address: data.address || null,
      notes: data.notes || null,
    };

    try {
      if (selectedSupplier) {
        const updateInput: UpdateSupplierInput = { ...input, id: selectedSupplier.id };
        await updateSupplier.mutateAsync(updateInput);
        addToast({ type: "success", message: t("messages.updated") });
      } else {
        await createSupplier.mutateAsync(input);
        addToast({ type: "success", message: t("messages.created") });
      }
      handleCloseModal();
    } catch {
      addToast({
        type: "error",
        message: selectedSupplier ? t("messages.updateError") : t("messages.createError"),
      });
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteSupplier.mutateAsync(id);
      addToast({ type: "success", message: t("messages.deleted") });
      setDeleteConfirmId(null);
    } catch {
      addToast({ type: "error", message: t("messages.deleteError") });
    }
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
        <div className="flex gap-2 self-start sm:self-auto">
          <Button variant="secondary" onClick={() => setIsImportOpen(true)} size="sm">
            <Upload className="h-4 w-4 mr-2" />
            {tCommon("buttons.import")}
          </Button>
          <Button onClick={() => handleOpenModal()} size="sm">
            <Plus className="h-4 w-4 mr-2" />
            {t("newSupplier")}
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <CardTitle>{t("supplierList")}</CardTitle>
            <div className="relative w-full sm:w-56 md:w-64 lg:w-72">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
              <Input
                id="supplier-search"
                name="supplier-search"
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
            {filteredSuppliers && filteredSuppliers.length > 0 ? (
              filteredSuppliers.map((supplier) => (
                <div key={supplier.id} className="p-4 flex items-start gap-3">
                  <input
                    type="checkbox"
                    checked={selection.isSelected(supplier.id)}
                    onChange={() => selection.toggle(supplier.id)}
                    className="mt-0.5 h-4 w-4 text-primary-600 border-gray-300 rounded focus:ring-primary-500"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <p className="font-medium text-gray-900 dark:text-gray-100 truncate">{supplier.name}</p>
                      <div className="flex items-center gap-1 shrink-0">
                        <button onClick={() => setProductsSupplier(supplier)} className="p-1 text-gray-500 hover:text-primary-600 dark:hover:text-primary-400" title={t("products.title")} aria-label={t("products.title")}><Package className="h-4 w-4" /></button>
                        <button onClick={() => handleOpenModal(supplier)} className="p-1 text-gray-500 hover:text-primary-600 dark:hover:text-primary-400" title={tCommon("buttons.edit")} aria-label={tCommon("buttons.edit")}><Pencil className="h-4 w-4" /></button>
                        <button onClick={() => setDeleteConfirmId(supplier.id)} className="p-1 text-gray-500 hover:text-red-600 disabled:opacity-50 disabled:cursor-not-allowed" title={tCommon("buttons.delete")} aria-label={tCommon("buttons.delete")}><Trash2 className="h-4 w-4" /></button>
                      </div>
                    </div>
                    {supplier.email && <p className="text-sm text-gray-500 dark:text-gray-400 truncate">{supplier.email}</p>}
                    <div className="flex items-center gap-3 mt-0.5 text-sm text-gray-500 dark:text-gray-400">
                      {supplier.phone && <span>{supplier.phone}</span>}
                      {supplier.address && <span className="truncate">{supplier.address}</span>}
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <div className="py-8 text-center text-gray-500 dark:text-gray-400">{t("noSuppliers")}</div>
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
                <TableHead>{t("fields.email")}</TableHead>
                <TableHead>{t("fields.phone")}</TableHead>
                <TableHead>{t("fields.address")}</TableHead>
                <TableHead className="w-32">{tCommon("buttons.actions")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredSuppliers && filteredSuppliers.length > 0 ? (
                filteredSuppliers.map((supplier) => (
                  <TableRow key={supplier.id}>
                    <TableCell>
                      <input
                        type="checkbox"
                        checked={selection.isSelected(supplier.id)}
                        onChange={() => selection.toggle(supplier.id)}
                        className="h-4 w-4 text-primary-600 border-gray-300 rounded focus:ring-primary-500"
                      />
                    </TableCell>
                    <TableCell className="font-medium text-gray-900 dark:text-gray-100">{supplier.name}</TableCell>
                    <TableCell className="text-gray-600 dark:text-gray-400">{supplier.email || "-"}</TableCell>
                    <TableCell className="text-gray-600 dark:text-gray-400">{supplier.phone || "-"}</TableCell>
                    <TableCell className="text-gray-600 dark:text-gray-400">{supplier.address || "-"}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => setProductsSupplier(supplier)}
                          className="p-1 text-gray-500 hover:text-primary-600 dark:hover:text-primary-400 transition-colors"
                          title={t("products.title")}
                          aria-label={t("products.title")}
                        >
                          <Package className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => handleOpenModal(supplier)}
                          className="p-1 text-gray-500 hover:text-primary-600 dark:hover:text-primary-400 transition-colors"
                          title={tCommon("buttons.edit")}
                          aria-label={tCommon("buttons.edit")}
                        >
                          <Pencil className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => setDeleteConfirmId(supplier.id)}
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
                    {t("noSuppliers")}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
          </div>
        </CardContent>
      </Card>

      <ImportDialog
        isOpen={isImportOpen}
        onClose={() => setIsImportOpen(false)}
        title={tCommon("import.title", { entity: t("title") })}
        entityType="suppliers"
        requiredColumns={["name"]}
        optionalColumns={["email", "phone", "address", "notes"]}
      />

      {/* Create/Edit Modal */}
      <Modal
        isOpen={isModalOpen}
        onClose={handleCloseModal}
        title={selectedSupplier ? t("editSupplier") : t("newSupplier")}
        size="lg"
      >
        <SupplierForm
          supplier={selectedSupplier}
          onSubmit={handleSubmit}
          onCancel={handleCloseModal}
          isLoading={createSupplier.isPending || updateSupplier.isPending}
        />
      </Modal>

      {/* Delete Confirmation Modal */}
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
            isLoading={deleteSupplier.isPending}
          >
            {tCommon("buttons.delete")}
          </Button>
        </div>
      </Modal>

      {/* Products Modal */}
      <Modal
        isOpen={!!productsSupplier}
        onClose={() => setProductsSupplier(null)}
        title={productsSupplier ? `${t("products.title")} - ${productsSupplier.name}` : t("products.title")}
        size="lg"
      >
        {productsSupplier && <SupplierProducts supplierId={productsSupplier.id} />}
      </Modal>

      <BulkActionBar
        selectedCount={selection.selectedCount}
        onDelete={() => setBulkDeleteOpen(true)}
        onClear={selection.clear}
        isDeleting={batchDeleteSuppliers.isPending}
      />
      <BulkDeleteModal
        isOpen={bulkDeleteOpen}
        onClose={() => setBulkDeleteOpen(false)}
        onConfirm={async () => {
          await batchDeleteSuppliers.mutateAsync(Array.from(selection.selectedIds));
          selection.clear();
          setBulkDeleteOpen(false);
        }}
        count={selection.selectedCount}
        isLoading={batchDeleteSuppliers.isPending}
      />
    </div>
  );
}
