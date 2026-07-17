import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button, Input, Select, Textarea } from "@/components/ui";
import type { Location } from "@/lib/api";
import type { LocationInput } from "../hooks/useLocations";

interface LocationFormProps {
  location?: Location;
  onSubmit: (data: LocationInput) => void;
  onCancel: () => void;
  isLoading?: boolean;
}

export function LocationForm({ location, onSubmit, onCancel, isLoading }: LocationFormProps) {
  const { t } = useTranslation("locations");
  const { t: tCommon } = useTranslation("common");

  const [name, setName] = useState(location?.name ?? "");
  const [type, setType] = useState(location?.type ?? "store");
  const [address, setAddress] = useState(location?.address ?? "");
  const [isDefault, setIsDefault] = useState(location?.is_default ?? false);
  const [error, setError] = useState<string | undefined>();

  const typeOptions = [
    { value: "store", label: t("types.store") },
    { value: "warehouse", label: t("types.warehouse") },
  ];

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError(t("validation.nameRequired"));
      return;
    }
    onSubmit({
      name: name.trim(),
      type,
      address: address.trim() || undefined,
      is_default: isDefault,
    });
  };

  // A location that is already the default cannot be un-defaulted from here
  // (the business must always have exactly one default).
  const defaultLocked = location?.is_default ?? false;

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <Input
        label={t("fields.nameRequired")}
        autoComplete="off"
        value={name}
        onChange={(e) => {
          setName(e.target.value);
          if (error) setError(undefined);
        }}
        error={error}
      />

      <Select
        label={t("fields.type")}
        name="location-type"
        options={typeOptions}
        value={type}
        onChange={(e) => setType(e.target.value)}
      />

      <Textarea
        label={t("fields.address")}
        autoComplete="off"
        value={address}
        onChange={(e) => setAddress(e.target.value)}
      />

      <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
        <input
          type="checkbox"
          checked={isDefault}
          disabled={defaultLocked}
          onChange={(e) => setIsDefault(e.target.checked)}
          className="h-4 w-4 text-primary-600 border-gray-300 rounded focus:ring-primary-500 disabled:opacity-50"
        />
        {t("fields.isDefault")}
      </label>
      {defaultLocked && (
        <p className="-mt-4 text-xs text-gray-500 dark:text-gray-400">{t("fields.isDefaultLocked")}</p>
      )}

      <div className="flex justify-end gap-3">
        <Button type="button" variant="secondary" onClick={onCancel}>
          {tCommon("buttons.cancel")}
        </Button>
        <Button type="submit" isLoading={isLoading}>
          {location ? tCommon("buttons.save") : tCommon("buttons.create")}
        </Button>
      </div>
    </form>
  );
}
