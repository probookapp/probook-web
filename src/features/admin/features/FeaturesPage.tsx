"use client";

import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Plus, Pencil, Globe } from "lucide-react";
import {
  Button,
  Card,
  CardContent,
  Modal,
  Input,
  Badge,
  Textarea,
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui";
import {
  useAdminFeatures,
  useCreateFeature,
  useUpdateFeature,
} from "./hooks/useFeatureFlags";

type Feature = Record<string, unknown>;
type Translations = Record<string, string>;

interface FeatureFormState {
  key: string;
  name: string;
  name_fr: string;
  name_ar: string;
  description: string;
  description_fr: string;
  description_ar: string;
  is_global: boolean;
  plan_ids: string[];
}

const emptyForm: FeatureFormState = {
  key: "",
  name: "",
  name_fr: "",
  name_ar: "",
  description: "",
  description_fr: "",
  description_ar: "",
  is_global: true,
  plan_ids: [],
};

function getTr(obj: unknown, key: string): string {
  if (obj && typeof obj === "object" && key in (obj as Translations)) {
    return (obj as Translations)[key] || "";
  }
  return "";
}

export function FeaturesPage() {
  const { t } = useTranslation("admin");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingFeature, setEditingFeature] = useState<Feature | null>(null);
  const [formData, setFormData] = useState<FeatureFormState>(emptyForm);

  const { data: features, isLoading } = useAdminFeatures();
  const createFeature = useCreateFeature();
  const updateFeature = useUpdateFeature();

  const handleOpenCreate = () => {
    setEditingFeature(null);
    setFormData(emptyForm);
    setIsModalOpen(true);
  };

  const handleOpenEdit = (feature: Feature) => {
    setEditingFeature(feature);
    const planFeatures = (feature.plan_features || []) as Record<string, unknown>[];
    setFormData({
      key: String(feature.key || ""),
      name: String(feature.name || ""),
      name_fr: getTr(feature.name_translations, "fr"),
      name_ar: getTr(feature.name_translations, "ar"),
      description: String(feature.description || ""),
      description_fr: getTr(feature.description_translations, "fr"),
      description_ar: getTr(feature.description_translations, "ar"),
      is_global: Boolean(feature.is_global),
      plan_ids: planFeatures.map((pf) => String(pf.plan_id || "")),
    });
    setIsModalOpen(true);
  };

  const handleClose = () => {
    setIsModalOpen(false);
    setEditingFeature(null);
    setFormData(emptyForm);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const nameTranslations: Translations = {};
    if (formData.name_fr) nameTranslations.fr = formData.name_fr;
    if (formData.name_ar) nameTranslations.ar = formData.name_ar;

    const descriptionTranslations: Translations = {};
    if (formData.description_fr) descriptionTranslations.fr = formData.description_fr;
    if (formData.description_ar) descriptionTranslations.ar = formData.description_ar;

    const input: Record<string, unknown> = {
      key: formData.key,
      name: formData.name,
      description: formData.description,
      name_translations: Object.keys(nameTranslations).length > 0 ? nameTranslations : null,
      description_translations: Object.keys(descriptionTranslations).length > 0 ? descriptionTranslations : null,
      is_global: formData.is_global,
      plan_ids: formData.plan_ids,
    };

    if (editingFeature) {
      input.id = editingFeature.id;
      await updateFeature.mutateAsync(input);
    } else {
      await createFeature.mutateAsync(input);
    }
    handleClose();
  };

  const handleToggleGlobal = async (feature: Feature) => {
    await updateFeature.mutateAsync({
      id: feature.id,
      is_global: !feature.is_global,
    });
  };

  const updateField = <K extends keyof FeatureFormState>(
    field: K,
    value: FeatureFormState[K]
  ) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600" />
      </div>
    );
  }

  const featureList = (features || []) as Feature[];

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-gray-100">
            {t("features.title")}
          </h1>
          <p className="text-sm sm:text-base text-gray-500 dark:text-gray-400">
            {t("features.subtitle")}
          </p>
        </div>
        <Button onClick={handleOpenCreate} size="sm">
          <Plus className="h-4 w-4 mr-2" />
          {t("features.create")}
        </Button>
      </div>

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("features.key")}</TableHead>
                  <TableHead>{t("features.name")}</TableHead>
                  <TableHead className="hidden md:table-cell">{t("features.description")}</TableHead>
                  <TableHead>{t("features.global")}</TableHead>
                  <TableHead className="hidden lg:table-cell">{t("features.plans")}</TableHead>
                  <TableHead className="text-right">{t("features.actions")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {featureList.map((feature) => {
                  const planFeatures = (feature.plan_features || []) as Record<string, unknown>[];
                  return (
                    <TableRow key={String(feature.id)}>
                      <TableCell className="font-mono text-xs text-gray-900 dark:text-gray-100">
                        {String(feature.key || "")}
                      </TableCell>
                      <TableCell className="text-gray-900 dark:text-gray-100">
                        {t(`features.name_${feature.key}`, String(feature.name || ""))}
                      </TableCell>
                      <TableCell className="text-gray-500 dark:text-gray-400 hidden md:table-cell max-w-xs">
                        <span
                          className="block truncate cursor-help"
                          title={t(`features.desc_${feature.key}`, String(feature.description || ""))}
                        >
                          {t(`features.desc_${feature.key}`, String(feature.description || "-"))}
                        </span>
                      </TableCell>
                      <TableCell>
                        <button
                          onClick={() => handleToggleGlobal(feature)}
                          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${
                            feature.is_global
                              ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                              : "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400"
                          }`}
                        >
                          <Globe className="h-3 w-3" />
                          {feature.is_global
                            ? t("features.enabled")
                            : t("features.disabled")}
                        </button>
                      </TableCell>
                      <TableCell className="hidden lg:table-cell">
                        <div className="flex flex-wrap gap-1">
                          {planFeatures.length > 0
                            ? planFeatures.map((pf) => {
                                const plan = pf.plan as Record<string, unknown> | undefined;
                                return (
                                  <Badge key={String(pf.id)} variant="default">
                                    {String(plan?.name || plan?.slug || "?")}
                                  </Badge>
                                );
                              })
                            : <span className="text-gray-400 dark:text-gray-500">-</span>}
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => handleOpenEdit(feature)}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
                {featureList.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-gray-500 dark:text-gray-400 py-8">
                      {t("features.empty")}
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Create/Edit Modal */}
      <Modal
        isOpen={isModalOpen}
        onClose={handleClose}
        title={
          editingFeature
            ? t("features.edit_title")
            : t("features.create_title")
        }
        size="lg"
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input
              name="feature-key"
              label={t("features.key")}
              value={formData.key}
              onChange={(e) => updateField("key", e.target.value)}
              required
              disabled={!!editingFeature}
              placeholder="e.g., pos_module"
            />
            <Input
              name="feature-name"
              label={`${t("features.name")} (EN)`}
              value={formData.name}
              onChange={(e) => updateField("name", e.target.value)}
              required
              placeholder="e.g., POS Module"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input
              name="feature-name-fr"
              label={`${t("features.name")} (FR)`}
              value={formData.name_fr}
              onChange={(e) => updateField("name_fr", e.target.value)}
              placeholder="ex: Module Caisse"
            />
            <Input
              name="feature-name-ar"
              label={`${t("features.name")} (AR)`}
              value={formData.name_ar}
              onChange={(e) => updateField("name_ar", e.target.value)}
              placeholder="مثال: وحدة نقطة البيع"
              dir="rtl"
            />
          </div>

          <Textarea
            name="feature-description"
            label={`${t("features.description")} (EN)`}
            value={formData.description}
            onChange={(e) => updateField("description", e.target.value)}
            rows={2}
            placeholder={t("features.description_placeholder")}
          />

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Textarea
              name="feature-description-fr"
              label={`${t("features.description")} (FR)`}
              value={formData.description_fr}
              onChange={(e) => updateField("description_fr", e.target.value)}
              rows={2}
              placeholder="Description de la fonctionnalité"
            />
            <Textarea
              name="feature-description-ar"
              label={`${t("features.description")} (AR)`}
              value={formData.description_ar}
              onChange={(e) => updateField("description_ar", e.target.value)}
              rows={2}
              placeholder="وصف الميزة"
              dir="rtl"
            />
          </div>

          <div className="flex items-center gap-3">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={formData.is_global}
                onChange={(e) => updateField("is_global", e.target.checked)}
                className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
              />
              <span className="text-sm text-gray-700 dark:text-gray-300">
                {t("features.global_toggle")}
              </span>
            </label>
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t border-gray-200 dark:border-gray-700">
            <Button variant="secondary" type="button" onClick={handleClose}>
              {t("features.cancel")}
            </Button>
            <Button
              type="submit"
              isLoading={createFeature.isPending || updateFeature.isPending}
            >
              {editingFeature
                ? t("features.update")
                : t("features.create")}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
