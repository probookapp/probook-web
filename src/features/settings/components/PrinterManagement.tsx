import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Plus, Pencil, Trash2, Printer, Star } from "lucide-react";
import {
  Button,
  Input,
  Select,
  Modal,
  Badge,
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui";
import { toast } from "@/stores/useToastStore";
import { useDemoMode } from "@/components/providers/DemoModeProvider";
import type {
  PosPrinterConfig,
  CreatePrinterConfigInput,
  PrinterConnectionType,
} from "@/types";
import {
  usePrinterConfigs,
  usePosRegisters,
  useCreatePrinterConfig,
  useUpdatePrinterConfig,
  useDeletePrinterConfig,
} from "../hooks/usePrinters";

interface FormState {
  printer_name: string;
  connection_type: PrinterConnectionType;
  connection_address: string;
  paper_width: number;
  register_id: string;
  is_default: boolean;
  is_active: boolean;
}

const emptyForm: FormState = {
  printer_name: "",
  connection_type: "Network",
  connection_address: "",
  paper_width: 80,
  register_id: "",
  is_default: false,
  is_active: true,
};

export function PrinterManagement() {
  const { t } = useTranslation("settings");
  const { isDemoMode, showSubscribePrompt } = useDemoMode();
  const { data: printers, isLoading } = usePrinterConfigs();
  const { data: registers } = usePosRegisters();
  const createPrinter = useCreatePrinterConfig();
  const updatePrinter = useUpdatePrinterConfig();
  const deletePrinter = useDeletePrinterConfig();

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editing, setEditing] = useState<PosPrinterConfig | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);

  const connectionTypeOptions: { value: PrinterConnectionType; label: string }[] = [
    { value: "Network", label: t("printers.connectionTypes.network") },
  ];

  const paperWidthOptions = [
    { value: "58", label: "58 mm" },
    { value: "80", label: "80 mm" },
  ];

  const registerOptions = [
    { value: "", label: t("printers.allRegisters") },
    ...(registers || []).map((r) => ({ value: r.id, label: r.name })),
  ];

  const openCreate = () => {
    if (isDemoMode) return showSubscribePrompt();
    setEditing(null);
    setForm(emptyForm);
    setIsModalOpen(true);
  };

  const openEdit = (printer: PosPrinterConfig) => {
    if (isDemoMode) return showSubscribePrompt();
    setEditing(printer);
    setForm({
      printer_name: printer.printer_name,
      connection_type: printer.connection_type,
      connection_address: printer.connection_address,
      paper_width: printer.paper_width,
      register_id: printer.register_id ?? "",
      is_default: printer.is_default,
      is_active: printer.is_active,
    });
    setIsModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isDemoMode) return showSubscribePrompt();
    if (!form.printer_name.trim() || !form.connection_address.trim()) {
      toast.error(t("printers.validationRequired"));
      return;
    }
    const base: CreatePrinterConfigInput = {
      printer_name: form.printer_name.trim(),
      connection_type: form.connection_type,
      connection_address: form.connection_address.trim(),
      paper_width: form.paper_width,
      register_id: form.register_id || null,
      is_default: form.is_default,
    };
    try {
      if (editing) {
        await updatePrinter.mutateAsync({ ...base, id: editing.id, is_active: form.is_active });
      } else {
        await createPrinter.mutateAsync(base);
      }
      toast.success(t("printers.saveSuccess"));
      setIsModalOpen(false);
    } catch {
      toast.error(t("printers.saveFailed"));
    }
  };

  const handleSetDefault = async (printer: PosPrinterConfig) => {
    if (isDemoMode) return showSubscribePrompt();
    if (printer.is_default) return;
    try {
      await updatePrinter.mutateAsync({
        id: printer.id,
        printer_name: printer.printer_name,
        connection_type: printer.connection_type,
        connection_address: printer.connection_address,
        paper_width: printer.paper_width,
        register_id: printer.register_id,
        is_default: true,
        is_active: printer.is_active,
      });
      toast.success(t("printers.defaultUpdated"));
    } catch {
      toast.error(t("printers.saveFailed"));
    }
  };

  const handleDelete = async (printer: PosPrinterConfig) => {
    if (isDemoMode) return showSubscribePrompt();
    if (!confirm(t("printers.deleteConfirm", { name: printer.printer_name }))) return;
    try {
      await deletePrinter.mutateAsync(printer.id);
      toast.success(t("printers.deleteSuccess"));
    } catch {
      toast.error(t("printers.deleteFailed"));
    }
  };

  const registerName = (id: string | null) =>
    id ? registers?.find((r) => r.id === id)?.name ?? id : t("printers.allRegisters");

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button size="sm" onClick={openCreate}>
          <Plus className="h-4 w-4 mr-2" />
          {t("printers.addPrinter")}
        </Button>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center h-24">
          <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary-600" />
        </div>
      ) : printers && printers.length > 0 ? (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("printers.name")}</TableHead>
              <TableHead>{t("printers.connection")}</TableHead>
              <TableHead>{t("printers.register")}</TableHead>
              <TableHead>{t("printers.paperWidth")}</TableHead>
              <TableHead>{t("printers.status")}</TableHead>
              <TableHead className="text-right">{t("printers.actions")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {printers.map((printer) => (
              <TableRow key={printer.id}>
                <TableCell className="font-medium">
                  <span className="flex items-center gap-2">
                    <Printer className="h-4 w-4 text-(--color-text-secondary)" />
                    {printer.printer_name}
                    {printer.is_default && (
                      <Badge variant="success">{t("printers.default")}</Badge>
                    )}
                  </span>
                </TableCell>
                <TableCell>
                  {printer.connection_type} · {printer.connection_address}
                </TableCell>
                <TableCell>{registerName(printer.register_id)}</TableCell>
                <TableCell>{printer.paper_width} mm</TableCell>
                <TableCell>
                  {printer.is_active ? (
                    <Badge variant="success">{t("printers.active")}</Badge>
                  ) : (
                    <Badge variant="default">{t("printers.inactive")}</Badge>
                  )}
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-1">
                    {!printer.is_default && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleSetDefault(printer)}
                        title={t("printers.setDefault")}
                        aria-label={t("printers.setDefault")}
                      >
                        <Star className="h-4 w-4" />
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => openEdit(printer)}
                      title={t("printers.edit")}
                      aria-label={t("printers.edit")}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDelete(printer)}
                      title={t("printers.delete")}
                      aria-label={t("printers.delete")}
                    >
                      <Trash2 className="h-4 w-4 text-red-600 dark:text-red-400" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      ) : (
        <p className="text-center text-(--color-text-secondary) py-8">
          {t("printers.noPrinters")}
        </p>
      )}

      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={editing ? t("printers.editTitle") : t("printers.addTitle")}
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <Input
            label={t("printers.name")}
            value={form.printer_name}
            onChange={(e) => setForm({ ...form, printer_name: e.target.value })}
          />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Select
              label={t("printers.connectionType")}
              options={connectionTypeOptions}
              value={form.connection_type}
              onChange={(e) =>
                setForm({ ...form, connection_type: e.target.value as PrinterConnectionType })
              }
            />
            <Input
              label={t("printers.connectionAddress")}
              placeholder={t("printers.connectionAddressPlaceholder")}
              value={form.connection_address}
              onChange={(e) => setForm({ ...form, connection_address: e.target.value })}
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Select
              label={t("printers.paperWidth")}
              options={paperWidthOptions}
              value={String(form.paper_width)}
              onChange={(e) => setForm({ ...form, paper_width: Number(e.target.value) })}
            />
            <Select
              label={t("printers.register")}
              options={registerOptions}
              value={form.register_id}
              onChange={(e) => setForm({ ...form, register_id: e.target.value })}
            />
          </div>
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              className="h-4 w-4 text-primary-600 border-gray-300 rounded focus:ring-primary-500"
              checked={form.is_default}
              onChange={(e) => setForm({ ...form, is_default: e.target.checked })}
            />
            <span className="text-sm text-gray-700 dark:text-gray-300">
              {t("printers.setAsDefault")}
            </span>
          </label>
          {editing && (
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                className="h-4 w-4 text-primary-600 border-gray-300 rounded focus:ring-primary-500"
                checked={form.is_active}
                onChange={(e) => setForm({ ...form, is_active: e.target.checked })}
              />
              <span className="text-sm text-gray-700 dark:text-gray-300">
                {t("printers.activeLabel")}
              </span>
            </label>
          )}
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="secondary" onClick={() => setIsModalOpen(false)}>
              {t("printers.cancel")}
            </Button>
            <Button type="submit" isLoading={createPrinter.isPending || updatePrinter.isPending}>
              {t("printers.save")}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
