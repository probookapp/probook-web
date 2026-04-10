import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useQueryClient } from "@tanstack/react-query";
import { Upload, FileDown, CheckCircle2, AlertCircle, FileSpreadsheet } from "lucide-react";
import { Button, Modal } from "@/components/ui";
import { importApi } from "@/lib/api";
import { getColumnsForEntity } from "@/lib/import-columns";
import type { ImportResult } from "@/types";

interface ImportDialogProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  entityType: "clients" | "products" | "suppliers";
}

export function ImportDialog({
  isOpen,
  onClose,
  title,
  entityType,
}: ImportDialogProps) {
  const { t, i18n } = useTranslation("common");
  const queryClient = useQueryClient();
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const columns = getColumnsForEntity(entityType);
  const lang = (i18n.language.startsWith("ar") ? "ar" : i18n.language.startsWith("fr") ? "fr" : "en") as "en" | "fr" | "ar";
  const requiredColumns = columns.filter((c) => c.required).map((c) => c.labels[lang]);
  const optionalColumns = columns.filter((c) => !c.required).map((c) => c.labels[lang]);

  const handleSelectFile = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setSelectedFile(file);
      setResult(null);
    }
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleDownloadTemplate = () => {
    const allHeaders = columns.map((c) => c.labels[lang]);
    const csvContent = allHeaders.join(",") + "\n";

    const blob = new Blob(["\uFEFF" + csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${entityType}_template.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleImport = async () => {
    if (!selectedFile) return;

    setIsImporting(true);
    try {
      let importResult: ImportResult;

      switch (entityType) {
        case "clients":
          importResult = await importApi.importClients(selectedFile);
          break;
        case "products":
          importResult = await importApi.importProducts(selectedFile);
          break;
        case "suppliers":
          importResult = await importApi.importSuppliers(selectedFile);
          break;
      }

      setResult(importResult);

      // Invalidate relevant caches so list pages refresh
      await queryClient.invalidateQueries({ queryKey: [entityType] });
      await queryClient.invalidateQueries({ queryKey: ["dashboard-stats"] });
    } catch (error) {
      setResult({
        added: 0,
        updated: 0,
        skipped: 0,
        errors: [String(error)],
      });
    } finally {
      setIsImporting(false);
    }
  };

  const handleClose = () => {
    setSelectedFile(null);
    setResult(null);
    setIsImporting(false);
    onClose();
  };

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title={title} size="lg">
      <div className="space-y-6">
        {/* Hidden file input */}
        <input
          ref={fileInputRef}
          type="file"
          accept=".csv,.xlsx"
          onChange={handleFileChange}
          className="hidden"
        />

        {/* Supported formats */}
        <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
          <FileSpreadsheet className="h-4 w-4" />
          {t("import.supportedFormats")}
        </div>

        {/* Column info */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <h4 className="text-sm font-medium text-gray-900 dark:text-gray-100 mb-2">
              {t("import.requiredColumns")}
            </h4>
            <div className="flex flex-wrap gap-1.5">
              {requiredColumns.map((col) => (
                <span
                  key={col}
                  className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400"
                >
                  {col}
                </span>
              ))}
            </div>
          </div>
          <div>
            <h4 className="text-sm font-medium text-gray-900 dark:text-gray-100 mb-2">
              {t("import.optionalColumns")}
            </h4>
            <div className="flex flex-wrap gap-1.5">
              {optionalColumns.map((col) => (
                <span
                  key={col}
                  className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300"
                >
                  {col}
                </span>
              ))}
            </div>
          </div>
        </div>

        {/* Download template */}
        <div>
          <Button variant="secondary" size="sm" onClick={handleDownloadTemplate}>
            <FileDown className="h-4 w-4 mr-2" />
            {t("import.downloadTemplate")}
          </Button>
        </div>

        {/* File selection */}
        <div className="border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg p-6 text-center">
          {selectedFile ? (
            <div className="space-y-2">
              <FileSpreadsheet className="h-8 w-8 mx-auto text-primary-500" />
              <p className="text-sm text-gray-900 dark:text-gray-100 font-medium">
                {t("import.selectedFile", { name: selectedFile.name })}
              </p>
              <Button variant="secondary" size="sm" onClick={handleSelectFile}>
                {t("import.selectFile")}
              </Button>
            </div>
          ) : (
            <div className="space-y-2">
              <Upload className="h-8 w-8 mx-auto text-gray-400" />
              <p className="text-sm text-gray-500 dark:text-gray-400">
                {t("import.noFileSelected")}
              </p>
              <Button variant="secondary" size="sm" onClick={handleSelectFile}>
                <Upload className="h-4 w-4 mr-2" />
                {t("import.selectFile")}
              </Button>
            </div>
          )}
        </div>

        {/* Result display */}
        {result && (
          <div className="rounded-lg border border-gray-200 dark:border-gray-700 p-4 space-y-3">
            <h4 className="text-sm font-medium text-gray-900 dark:text-gray-100">
              {t("import.result")}
            </h4>
            <div className="grid grid-cols-3 gap-3">
              <div className="text-center p-2 bg-green-50 dark:bg-green-900/20 rounded-lg">
                <div className="text-lg font-semibold text-green-700 dark:text-green-400">
                  {result.added}
                </div>
                <div className="text-xs text-green-600 dark:text-green-500">
                  {t("import.added", { count: result.added })}
                </div>
              </div>
              <div className="text-center p-2 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                <div className="text-lg font-semibold text-blue-700 dark:text-blue-400">
                  {result.updated}
                </div>
                <div className="text-xs text-blue-600 dark:text-blue-500">
                  {t("import.updated", { count: result.updated })}
                </div>
              </div>
              <div className="text-center p-2 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg">
                <div className="text-lg font-semibold text-yellow-700 dark:text-yellow-400">
                  {result.skipped}
                </div>
                <div className="text-xs text-yellow-600 dark:text-yellow-500">
                  {t("import.skipped", { count: result.skipped })}
                </div>
              </div>
            </div>

            {/* Errors */}
            {result.errors.length > 0 ? (
              <div className="mt-3">
                <div className="flex items-center gap-1.5 text-sm font-medium text-red-700 dark:text-red-400 mb-1.5">
                  <AlertCircle className="h-4 w-4" />
                  {t("import.errors")}
                </div>
                <div className="max-h-32 overflow-y-auto space-y-1">
                  {result.errors.map((error, index) => (
                    <p
                      key={index}
                      className="text-xs text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 rounded px-2 py-1"
                    >
                      {error}
                    </p>
                  ))}
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-1.5 text-sm text-green-700 dark:text-green-400">
                <CheckCircle2 className="h-4 w-4" />
                {t("import.noErrors")}
              </div>
            )}
          </div>
        )}

        {/* Actions */}
        <div className="flex justify-end gap-3 pt-2">
          <Button variant="secondary" onClick={handleClose}>
            {t("buttons.close")}
          </Button>
          {!result && (
            <Button
              onClick={handleImport}
              disabled={!selectedFile}
              isLoading={isImporting}
            >
              <Upload className="h-4 w-4 mr-2" />
              {t("import.importButton")}
            </Button>
          )}
        </div>
      </div>
    </Modal>
  );
}
