import { useState, useMemo } from "react";
import { useForm, type Resolver } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { zodResolver } from "@hookform/resolvers/zod";
import { Plus, Pencil, Trash2, Folder, ChevronRight } from "lucide-react";
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Modal,
  Input,
  Textarea,
  Select,
} from "@/components/ui";
import {
  useProductCategories,
  useCreateProductCategory,
  useUpdateProductCategory,
  useDeleteProductCategory,
} from "../hooks/useProductCategories";
import { useDemoMode } from "@/components/providers/DemoModeProvider";
import { createProductCategorySchema, type ProductCategoryFormData } from "../schemas/productSchema";
import type { ProductCategory } from "@/types";

export function CategoryManager() {
  const { t } = useTranslation(["products", "common"]);
  const { isDemoMode, showSubscribePrompt } = useDemoMode();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<ProductCategory | undefined>();
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  const { data: categories, isLoading } = useProductCategories();
  const createCategory = useCreateProductCategory();
  const updateCategory = useUpdateProductCategory();
  const deleteCategory = useDeleteProductCategory();

  const handleOpenModal = (category?: ProductCategory) => {
    setSelectedCategory(category);
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setSelectedCategory(undefined);
    setIsModalOpen(false);
  };

  const handleSubmit = async (data: ProductCategoryFormData) => {
    if (isDemoMode) { showSubscribePrompt(); return; }
    const input = {
      ...data,
      description: data.description || null,
      parent_id: data.parent_id || null,
    };

    try {
      if (selectedCategory) {
        await updateCategory.mutateAsync({ ...input, id: selectedCategory.id });
      } else {
        await createCategory.mutateAsync(input);
      }
      handleCloseModal();
    } catch (error) {
      console.error("Failed to save category:", error);
    }
  };

  const handleDelete = async (id: string) => {
    if (isDemoMode) { showSubscribePrompt(); return; }
    await deleteCategory.mutateAsync(id);
    setDeleteConfirmId(null);
  };

  // Build a tree of categories
  const rootCategories = categories?.filter((c) => !c.parent_id) || [];
  const getChildCategories = (parentId: string) =>
    categories?.filter((c) => c.parent_id === parentId) || [];

  const toggleExpand = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const renderCategory = (category: ProductCategory, level: number = 0) => {
    const children = getChildCategories(category.id);
    const hasChildren = children.length > 0;
    const isExpanded = expandedIds.has(category.id);
    return (
      <div key={category.id}>
        <div
          className={`flex items-center justify-between py-3 px-4 hover:bg-gray-50 dark:hover:bg-gray-800 border-b border-gray-100 dark:border-gray-700`}
          style={{ paddingLeft: `${level * 24 + 16}px` }}
        >
          <div className="flex items-center gap-2">
            {hasChildren ? (
              <button
                onClick={() => toggleExpand(category.id)}
                className="p-0.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-transform"
              >
                <ChevronRight className={`h-4 w-4 transition-transform ${isExpanded ? "rotate-90" : ""}`} />
              </button>
            ) : (
              <span className="w-5" />
            )}
            <Folder className="h-4 w-4 text-amber-500" />
            <span className="font-medium text-gray-900 dark:text-gray-100">{category.name}</span>
            {category.description && (
              <span className="text-sm text-gray-500 dark:text-gray-400">- {category.description}</span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => handleOpenModal(category)}
              className="p-1 text-gray-500 hover:text-primary-600 transition-colors"
              title={t("common:buttons.edit")}
              aria-label={t("common:buttons.edit")}
            >
              <Pencil className="h-4 w-4" />
            </button>
            <button
              onClick={() => setDeleteConfirmId(category.id)}
              className="p-1 text-gray-500 hover:text-red-600 transition-colors"
              title={t("common:buttons.delete")}
              aria-label={t("common:buttons.delete")}
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        </div>
        {hasChildren && isExpanded && children.map((child) => renderCategory(child, level + 1))}
      </div>
    );
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
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">{t("categories.title")}</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400">{t("categories.subtitle")}</p>
        </div>
        <Button onClick={() => handleOpenModal()} size="sm">
          <Plus className="h-4 w-4 mr-2" />
          {t("categories.newCategory")}
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("categories.treeTitle")}</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {rootCategories.length > 0 ? (
            <div className="divide-y divide-gray-100 dark:divide-gray-700">
              {rootCategories.map((category) => renderCategory(category))}
            </div>
          ) : (
            <div className="text-center text-gray-500 dark:text-gray-400 py-8">
              {t("categories.noCategories")}
            </div>
          )}
        </CardContent>
      </Card>

      <Modal
        isOpen={isModalOpen}
        onClose={handleCloseModal}
        title={selectedCategory ? t("categories.editCategory") : t("categories.newCategory")}
        size="md"
      >
        <CategoryForm
          category={selectedCategory}
          categories={categories || []}
          onSubmit={handleSubmit}
          onCancel={handleCloseModal}
          isLoading={createCategory.isPending || updateCategory.isPending}
        />
      </Modal>

      <Modal
        isOpen={!!deleteConfirmId}
        onClose={() => setDeleteConfirmId(null)}
        title={t("categories.deleteCategory")}
        size="sm"
      >
        <p className="text-gray-600 dark:text-gray-400 mb-4">
          {t("categories.confirmDelete")}
        </p>
        <p className="text-sm text-amber-600 dark:text-amber-500 mb-6">
          {t("categories.deleteWarning")}
        </p>
        <div className="flex justify-end gap-3">
          <Button variant="secondary" onClick={() => setDeleteConfirmId(null)}>
            {t("common:buttons.cancel")}
          </Button>
          <Button
            variant="danger"
            onClick={() => deleteConfirmId && handleDelete(deleteConfirmId)}
            isLoading={deleteCategory.isPending}
          >
            {t("common:buttons.delete")}
          </Button>
        </div>
      </Modal>
    </div>
  );
}

interface CategoryFormProps {
  category?: ProductCategory;
  categories: ProductCategory[];
  onSubmit: (data: ProductCategoryFormData) => void;
  onCancel: () => void;
  isLoading?: boolean;
}

function CategoryForm({ category, categories, onSubmit, onCancel, isLoading }: CategoryFormProps) {
  const { t } = useTranslation(["products", "common"]);

  const productCategorySchema = useMemo(() => createProductCategorySchema(t), [t]);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ProductCategoryFormData>({
    resolver: zodResolver(productCategorySchema) as Resolver<ProductCategoryFormData>,
    defaultValues: {
      name: category?.name ?? "",
      description: category?.description ?? "",
      parent_id: category?.parent_id ?? "",
    },
  });

  // Filter out current category and its children from parent options
  const availableParents = categories.filter((c) => {
    if (!category) return true;
    if (c.id === category.id) return false;
    // Check if c is a descendant of the current category
    let parent = c;
    while (parent.parent_id) {
      if (parent.parent_id === category.id) return false;
      parent = categories.find((p) => p.id === parent.parent_id) || parent;
      if (!parent.parent_id) break;
    }
    return true;
  });

  const parentOptions = [
    { value: "", label: t("categories.noParent") },
    ...availableParents.map((c) => ({ value: c.id, label: c.name })),
  ];

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <Input
        label={t("categories.nameRequired")}
        {...register("name")}
        error={errors.name?.message}
      />

      <Textarea
        label={t("fields.description")}
        {...register("description")}
        error={errors.description?.message}
        rows={2}
      />

      <Select
        label={t("categories.parentCategory")}
        options={parentOptions}
        {...register("parent_id")}
        error={errors.parent_id?.message}
      />

      <div className="flex justify-end gap-3 pt-4">
        <Button type="button" variant="secondary" onClick={onCancel}>
          {t("common:buttons.cancel")}
        </Button>
        <Button type="submit" isLoading={isLoading}>
          {category ? t("updateProduct") : t("createProduct")}
        </Button>
      </div>
    </form>
  );
}
