import { useState, useRef } from "react";
import { useTranslation } from "react-i18next";
import { Download, Upload, Lock, FileDown } from "lucide-react";
import { Button, Card, CardContent, CardHeader, CardTitle, Input } from "@/components/ui";
import { toast } from "@/stores/useToastStore";
import { useDemoMode } from "@/components/providers/DemoModeProvider";
import { exportApi, backupApi } from "@/lib/api";
import { downloadEncryptedBackup, importEncryptedBackup } from "@/lib/crypto";

export function BackupSection() {
  const { t } = useTranslation("settings");
  const { isDemoMode, showSubscribePrompt } = useDemoMode();
  const [exportPassword, setExportPassword] = useState("");
  const [exportPasswordConfirm, setExportPasswordConfirm] = useState("");
  const [importPassword, setImportPassword] = useState("");
  const [isExporting, setIsExporting] = useState(false);
  const [isExportingEncrypted, setIsExportingEncrypted] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [pendingBackupData, setPendingBackupData] = useState<Record<string, unknown> | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleExportPlain = async () => {
    if (isDemoMode) { showSubscribePrompt(); return; }
    setIsExporting(true);
    try {
      await exportApi.download();
      toast.success(t("backup.exportSuccess"));
    } catch {
      toast.error(t("backup.exportFailed"));
    } finally {
      setIsExporting(false);
    }
  };

  const handleExportEncrypted = async () => {
    if (isDemoMode) { showSubscribePrompt(); return; }
    if (!exportPassword) {
      toast.error(t("backup.passwordRequired"));
      return;
    }
    if (exportPassword !== exportPasswordConfirm) {
      toast.error(t("backup.passwordMismatch"));
      return;
    }
    setIsExportingEncrypted(true);
    try {
      await downloadEncryptedBackup(exportPassword);
      setExportPassword("");
      setExportPasswordConfirm("");
      toast.success(t("backup.exportSuccess"));
    } catch {
      toast.error(t("backup.exportFailed"));
    } finally {
      setIsExportingEncrypted(false);
    }
  };

  const handleImportEncrypted = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (isDemoMode) { showSubscribePrompt(); return; }
    const file = e.target.files?.[0];
    if (!file) return;
    if (!importPassword) {
      toast.error(t("backup.passwordRequired"));
      return;
    }

    try {
      const json = await importEncryptedBackup(file, importPassword);
      const data = JSON.parse(json) as Record<string, unknown>;
      setPendingBackupData(data);
      setShowConfirmDialog(true);
    } catch {
      toast.error(t("backup.importFailed"));
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleConfirmImport = async () => {
    if (!pendingBackupData) return;
    setShowConfirmDialog(false);
    setIsImporting(true);
    try {
      const result = await backupApi.importBackup(pendingBackupData);
      if (result.success) {
        const counts = Object.entries(result.imported)
          .map(([key, count]) => `${key}: ${count}`)
          .join(", ");
        toast.success(`${t("backup.restoreSuccess")} (${counts})`);
        setImportPassword("");
      } else {
        toast.error(t("backup.restoreFailed"));
      }
    } catch {
      toast.error(t("backup.restoreFailed"));
    } finally {
      setIsImporting(false);
      setPendingBackupData(null);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Download className="h-5 w-5" />
          {t("backup.title")}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <p className="text-sm text-gray-500 dark:text-gray-400">
          {t("backup.exportDescription")}
        </p>

        {/* Plain export */}
        <div className="flex items-center gap-3">
          <Button
            type="button"
            variant="secondary"
            onClick={handleExportPlain}
            isLoading={isExporting}
          >
            <FileDown className="h-4 w-4 mr-2" />
            {t("backup.exportPlain")}
          </Button>
        </div>

        {/* Encrypted export */}
        <div className="border border-gray-200 dark:border-gray-700 rounded-lg p-4 space-y-3">
          <div className="flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-300">
            <Lock className="h-4 w-4" />
            {t("backup.exportEncrypted")}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Input
              type="password"
              label={t("backup.passwordLabel")}
              placeholder={t("backup.passwordPlaceholder")}
              value={exportPassword}
              onChange={(e) => setExportPassword(e.target.value)}
            />
            <Input
              type="password"
              label={t("backup.passwordConfirmLabel")}
              placeholder={t("backup.passwordPlaceholder")}
              value={exportPasswordConfirm}
              onChange={(e) => setExportPasswordConfirm(e.target.value)}
            />
          </div>
          <Button
            type="button"
            onClick={handleExportEncrypted}
            isLoading={isExportingEncrypted}
            disabled={!exportPassword || exportPassword !== exportPasswordConfirm}
          >
            <Lock className="h-4 w-4 mr-2" />
            {isExportingEncrypted ? t("backup.exporting") : t("backup.exportEncrypted")}
          </Button>
        </div>

        {/* Encrypted import */}
        <div className="border border-gray-200 dark:border-gray-700 rounded-lg p-4 space-y-3">
          <div className="flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-300">
            <Upload className="h-4 w-4" />
            {t("backup.importEncrypted")}
          </div>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            {t("backup.importDescription")}
          </p>
          <Input
            type="password"
            label={t("backup.passwordLabel")}
            placeholder={t("backup.passwordPlaceholder")}
            value={importPassword}
            onChange={(e) => setImportPassword(e.target.value)}
          />
          <div>
            <input
              ref={fileInputRef}
              type="file"
              accept=".enc"
              onChange={handleImportEncrypted}
              className="hidden"
            />
            <Button
              type="button"
              variant="secondary"
              onClick={() => fileInputRef.current?.click()}
              isLoading={isImporting}
              disabled={!importPassword}
            >
              <Upload className="h-4 w-4 mr-2" />
              {isImporting ? t("backup.importing") : t("backup.selectFile")}
            </Button>
          </div>
        </div>
      </CardContent>

      {/* Confirmation dialog */}
      {showConfirmDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl p-6 max-w-md w-full mx-4">
            <h3 className="text-lg font-semibold mb-2">
              {t("backup.importConfirmTitle")}
            </h3>
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-6">
              {t("backup.importConfirmMessage")}
            </p>
            <div className="flex justify-end gap-3">
              <Button
                type="button"
                variant="secondary"
                onClick={() => {
                  setShowConfirmDialog(false);
                  setPendingBackupData(null);
                }}
              >
                {t("backup.importCancel")}
              </Button>
              <Button
                type="button"
                variant="danger"
                onClick={handleConfirmImport}
                isLoading={isImporting}
              >
                {t("backup.importConfirm")}
              </Button>
            </div>
          </div>
        </div>
      )}
    </Card>
  );
}
