import { useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { zodResolver } from "@hookform/resolvers/zod";
import { Users } from "lucide-react";
import { Button, Input, Textarea } from "@/components/ui";
import { createClientSchema, type ClientFormData } from "../schemas/clientSchema";
import type { Client } from "@/types";

interface ClientFormProps {
  client?: Client;
  onSubmit: (data: ClientFormData) => void;
  onCancel: () => void;
  onManageContacts?: () => void;
  isLoading?: boolean;
}

export function ClientForm({ client, onSubmit, onCancel, onManageContacts, isLoading }: ClientFormProps) {
  const { t } = useTranslation("clients");
  const { t: tCommon } = useTranslation("common");
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ClientFormData>({
    resolver: zodResolver(createClientSchema(t)),
    defaultValues: {
      name: client?.name ?? "",
      email: client?.email ?? "",
      phone: client?.phone ?? "",
      address: client?.address ?? "",
      city: client?.city ?? "",
      postal_code: client?.postal_code ?? "",
      country: client?.country ?? "",
      siret: client?.siret ?? "",
      vat_number: client?.vat_number ?? "",
      notes: client?.notes ?? "",
    },
  });

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Input
          label={t("fields.nameRequired")}
          autoComplete="off"
          {...register("name")}
          error={errors.name?.message}
        />
        <Input
          label={t("fields.email")}
          type="email"
          autoComplete="off"
          {...register("email")}
          error={errors.email?.message}
        />
        <Input
          label={t("fields.phone")}
          autoComplete="off"
          {...register("phone")}
          error={errors.phone?.message}
        />
        <Input
          label={t("fields.siret")}
          autoComplete="off"
          {...register("siret")}
          error={errors.siret?.message}
        />
        <Input
          label={t("fields.vatNumber")}
          autoComplete="off"
          {...register("vat_number")}
          error={errors.vat_number?.message}
        />
        <Input
          label={t("fields.country")}
          autoComplete="off"
          {...register("country")}
          error={errors.country?.message}
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="md:col-span-2">
          <Input
            label={t("fields.address")}
            autoComplete="off"
            {...register("address")}
            error={errors.address?.message}
          />
        </div>
        <Input
          label={t("fields.postalCode")}
          autoComplete="off"
          {...register("postal_code")}
          error={errors.postal_code?.message}
        />
      </div>

      <Input
        label={t("fields.city")}
        autoComplete="off"
        {...register("city")}
        error={errors.city?.message}
      />

      <Textarea
        label={t("fields.notes")}
        autoComplete="off"
        {...register("notes")}
        error={errors.notes?.message}
      />

      <div className="flex justify-end gap-3">
        {onManageContacts && (
          <Button type="button" variant="secondary" onClick={onManageContacts} className="mr-auto">
            <Users className="h-4 w-4 mr-2" />
            {t("contacts.title")}
          </Button>
        )}
        <Button type="button" variant="secondary" onClick={onCancel}>
          {tCommon("buttons.cancel")}
        </Button>
        <Button type="submit" isLoading={isLoading}>
          {client ? tCommon("buttons.save") : tCommon("buttons.create")}
        </Button>
      </div>
    </form>
  );
}
