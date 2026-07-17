import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Plus, Pencil, Trash2, Store, Warehouse } from "lucide-react";
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
  Badge,
} from "@/components/ui";
import { cn } from "@/lib/utils";
import { isApiError } from "@/lib/api-adapter";
import { useDemoMode } from "@/components/providers/DemoModeProvider";
import { useToastStore } from "@/stores/useToastStore";
import { LocationForm } from "./components/LocationForm";
import { StockTransferForm } from "./components/StockTransferForm";
import {
  useLocations,
  useCreateLocation,
  useUpdateLocation,
  useDeleteLocation,
  type LocationInput,
} from "./hooks/useLocations";
import {
  useStockTransfers,
  useCreateStockTransfer,
  type CreateStockTransferInput,
} from "./hooks/useStockTransfers";
import type { Location } from "@/lib/api";

type Tab = "locations" | "transfers";

/** Extract the server-provided error message from an ApiError body ({"error": "..."}). */
function serverErrorMessage(err: unknown): string | null {
  if (!isApiError(err)) return null;
  try {
    const parsed = JSON.parse(err.body) as { error?: string };
    return parsed.error ?? null;
  } catch {
    return err.body || null;
  }
}

export function LocationsPage() {
  const { t } = useTranslation("locations");
  const { t: tCommon } = useTranslation("common");
  const { isDemoMode, showSubscribePrompt } = useDemoMode();
  const addToast = useToastStore((state) => state.addToast);

  const [tab, setTab] = useState<Tab>("locations");

  // Locations state
  const [isLocationModalOpen, setIsLocationModalOpen] = useState(false);
  const [selectedLocation, setSelectedLocation] = useState<Location | undefined>();
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  // Transfers state
  const [isTransferModalOpen, setIsTransferModalOpen] = useState(false);

  const { data: locations, isLoading: locationsLoading } = useLocations();
  const { data: transfers, isLoading: transfersLoading } = useStockTransfers();
  const createLocation = useCreateLocation();
  const updateLocation = useUpdateLocation();
  const deleteLocation = useDeleteLocation();
  const createTransfer = useCreateStockTransfer();

  const handleOpenLocationModal = (location?: Location) => {
    if (isDemoMode) { showSubscribePrompt(); return; }
    setSelectedLocation(location);
    setIsLocationModalOpen(true);
  };

  const handleCloseLocationModal = () => {
    setSelectedLocation(undefined);
    setIsLocationModalOpen(false);
  };

  const handleLocationSubmit = async (data: LocationInput) => {
    if (isDemoMode) { showSubscribePrompt(); return; }
    try {
      if (selectedLocation) {
        await updateLocation.mutateAsync({
          id: selectedLocation.id,
          name: data.name,
          type: data.type,
          address: data.address ?? null,
          is_default: data.is_default,
        });
        addToast({ type: "success", message: t("messages.updated") });
      } else {
        await createLocation.mutateAsync(data);
        addToast({ type: "success", message: t("messages.created") });
      }
      handleCloseLocationModal();
    } catch {
      addToast({
        type: "error",
        message: selectedLocation ? t("messages.updateError") : t("messages.createError"),
      });
    }
  };

  const handleDeleteLocation = async (id: string) => {
    if (isDemoMode) { showSubscribePrompt(); return; }
    try {
      await deleteLocation.mutateAsync(id);
      addToast({ type: "success", message: t("messages.deleted") });
      setDeleteConfirmId(null);
    } catch (err) {
      addToast({ type: "error", message: serverErrorMessage(err) ?? t("messages.deleteError") });
      setDeleteConfirmId(null);
    }
  };

  const handleTransferSubmit = async (input: CreateStockTransferInput) => {
    if (isDemoMode) { showSubscribePrompt(); return; }
    try {
      await createTransfer.mutateAsync(input);
      addToast({ type: "success", message: t("transfers.messages.created") });
      setIsTransferModalOpen(false);
    } catch (err) {
      addToast({ type: "error", message: serverErrorMessage(err) ?? t("transfers.messages.createError") });
    }
  };

  const tabs: { key: Tab; label: string }[] = [
    { key: "locations", label: t("tabs.locations") },
    { key: "transfers", label: t("tabs.transfers") },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-gray-100">{t("title")}</h1>
          <p className="text-sm sm:text-base text-gray-500 dark:text-gray-400">{t("subtitle")}</p>
        </div>
        <div className="flex gap-2 self-start sm:self-auto">
          {tab === "locations" ? (
            <Button onClick={() => handleOpenLocationModal()} size="sm">
              <Plus className="h-4 w-4 mr-2" />
              {t("newLocation")}
            </Button>
          ) : (
            <Button
              onClick={() => (isDemoMode ? showSubscribePrompt() : setIsTransferModalOpen(true))}
              size="sm"
              disabled={(locations?.length ?? 0) < 2}
            >
              <Plus className="h-4 w-4 mr-2" />
              {t("transfers.newTransfer")}
            </Button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200 dark:border-gray-700">
        <nav className="-mb-px flex gap-6">
          {tabs.map((tabItem) => (
            <button
              key={tabItem.key}
              onClick={() => setTab(tabItem.key)}
              className={cn(
                "py-3 border-b-2 text-sm font-medium transition-colors",
                tab === tabItem.key
                  ? "border-primary-600 text-primary-600 dark:text-primary-400"
                  : "border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
              )}
            >
              {tabItem.label}
            </button>
          ))}
        </nav>
      </div>

      {tab === "locations" ? (
        <Card>
          <CardHeader>
            <CardTitle>{t("locationList")}</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {locationsLoading ? (
              <div className="py-8 flex justify-center">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600" />
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table className="min-w-150">
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t("fields.name")}</TableHead>
                      <TableHead>{t("fields.type")}</TableHead>
                      <TableHead>{t("fields.address")}</TableHead>
                      <TableHead>{t("fields.default")}</TableHead>
                      <TableHead className="w-24">{tCommon("buttons.actions")}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {locations && locations.length > 0 ? (
                      locations.map((location) => (
                        <TableRow key={location.id}>
                          <TableCell className="font-medium text-gray-900 dark:text-gray-100">
                            <span className="flex items-center gap-2">
                              {location.type === "warehouse" ? (
                                <Warehouse className="h-4 w-4 text-gray-400" />
                              ) : (
                                <Store className="h-4 w-4 text-gray-400" />
                              )}
                              {location.name}
                            </span>
                          </TableCell>
                          <TableCell className="text-gray-600 dark:text-gray-400">
                            {t(`types.${location.type === "warehouse" ? "warehouse" : "store"}`)}
                          </TableCell>
                          <TableCell className="text-gray-600 dark:text-gray-400">{location.address || "-"}</TableCell>
                          <TableCell>
                            {location.is_default && <Badge variant="success">{t("fields.default")}</Badge>}
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <button
                                onClick={() => handleOpenLocationModal(location)}
                                className="p-1 text-gray-500 hover:text-primary-600 dark:hover:text-primary-400 transition-colors"
                                title={tCommon("buttons.edit")}
                                aria-label={tCommon("buttons.edit")}
                              >
                                <Pencil className="h-4 w-4" />
                              </button>
                              <button
                                onClick={() => setDeleteConfirmId(location.id)}
                                disabled={location.is_default}
                                className="p-1 text-gray-500 hover:text-red-600 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
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
                        <TableCell colSpan={5} className="text-center text-gray-500 dark:text-gray-400 py-8">
                          {t("noLocations")}
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>{t("transfers.transferList")}</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {transfersLoading ? (
              <div className="py-8 flex justify-center">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600" />
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table className="min-w-150">
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t("transfers.fields.number")}</TableHead>
                      <TableHead>{t("transfers.fields.from")}</TableHead>
                      <TableHead>{t("transfers.fields.to")}</TableHead>
                      <TableHead>{t("transfers.fields.date")}</TableHead>
                      <TableHead>{t("transfers.fields.items")}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {transfers && transfers.length > 0 ? (
                      transfers.map((transfer) => (
                        <TableRow key={transfer.id}>
                          <TableCell className="font-medium text-gray-900 dark:text-gray-100">
                            {transfer.transfer_number}
                          </TableCell>
                          <TableCell className="text-gray-600 dark:text-gray-400">
                            {transfer.from_location?.name ?? "-"}
                          </TableCell>
                          <TableCell className="text-gray-600 dark:text-gray-400">
                            {transfer.to_location?.name ?? "-"}
                          </TableCell>
                          <TableCell className="text-gray-600 dark:text-gray-400">
                            {transfer.created_at
                              ? new Date(transfer.created_at).toLocaleDateString()
                              : "-"}
                          </TableCell>
                          <TableCell className="text-gray-600 dark:text-gray-400">
                            {transfer.lines?.length ?? 0}
                          </TableCell>
                        </TableRow>
                      ))
                    ) : (
                      <TableRow>
                        <TableCell colSpan={5} className="text-center text-gray-500 dark:text-gray-400 py-8">
                          {t("transfers.noTransfers")}
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Location create/edit modal */}
      <Modal
        isOpen={isLocationModalOpen}
        onClose={handleCloseLocationModal}
        title={selectedLocation ? t("editLocation") : t("newLocation")}
        size="lg"
      >
        <LocationForm
          location={selectedLocation}
          onSubmit={handleLocationSubmit}
          onCancel={handleCloseLocationModal}
          isLoading={createLocation.isPending || updateLocation.isPending}
        />
      </Modal>

      {/* Delete confirmation modal */}
      <Modal
        isOpen={!!deleteConfirmId}
        onClose={() => setDeleteConfirmId(null)}
        title={tCommon("messages.confirmDelete")}
        size="sm"
      >
        <p className="text-gray-600 dark:text-gray-400 mb-6">{t("deleteConfirmation")}</p>
        <div className="flex justify-end gap-3">
          <Button variant="secondary" onClick={() => setDeleteConfirmId(null)}>
            {tCommon("buttons.cancel")}
          </Button>
          <Button
            variant="danger"
            onClick={() => deleteConfirmId && handleDeleteLocation(deleteConfirmId)}
            isLoading={deleteLocation.isPending}
          >
            {tCommon("buttons.delete")}
          </Button>
        </div>
      </Modal>

      {/* New transfer modal */}
      <Modal
        isOpen={isTransferModalOpen}
        onClose={() => setIsTransferModalOpen(false)}
        title={t("transfers.newTransfer")}
        size="lg"
      >
        <StockTransferForm
          locations={locations ?? []}
          onSubmit={handleTransferSubmit}
          onCancel={() => setIsTransferModalOpen(false)}
          isLoading={createTransfer.isPending}
        />
      </Modal>
    </div>
  );
}
