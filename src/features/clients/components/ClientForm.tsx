import { useForm, useWatch } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { zodResolver } from "@hookform/resolvers/zod";
import { Users } from "lucide-react";
import { Button, Input, Select, Textarea, ModalFooter, useModalDirty } from "@/components/ui";
import { useFiscalProfile, useIdentifierFields } from "@/hooks/useFiscalProfile";
import { LEGAL_FORMS } from "@/lib/legal-mentions";
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
  // Which company identifiers exist depends on the tenant's fiscal regime:
  // NIF / RC / NIS / article d'imposition in Algeria, SIRET + VAT in France.
  const identifiers = useIdentifierFields();
  const profile = useFiscalProfile();
  const {
    register,
    handleSubmit,
    control,
    formState: { errors, isDirty },
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
      nis: client?.nis ?? "",
      art: client?.art ?? "",
      is_consumer: client?.is_consumer ?? false,
      legal_form: client?.legal_form ?? "",
      activity: client?.activity ?? "",
      notes: client?.notes ?? "",
    },
  });
  // A private individual has no legal form, activity or company identifiers
  // to print, so those inputs step aside.
  const isConsumer = useWatch({ control, name: "is_consumer" });
  const legalFormOptions = [
    { value: "", label: tCommon("legalForms.none") },
    ...LEGAL_FORMS[profile.id].map((code) => ({ value: code, label: tCommon(`legalForms.${code}`) })),
  ];

  // Inside a modal, a stray click on the backdrop must not throw the input away.
  useModalDirty(isDirty);

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
      <div>
        <label className="flex items-center gap-3 cursor-pointer">
          <input
            type="checkbox"
            className="h-4 w-4 shrink-0 text-primary-600 border-gray-300 rounded focus:ring-primary-500"
            {...register("is_consumer")}
          />
          <span className="text-sm text-gray-700 dark:text-gray-300">{t("fields.isConsumer")}</span>
        </label>
        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{t("fields.isConsumerHint")}</p>
      </div>
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
        {!isConsumer && (
          <>
            {identifiers.map((field) => (
              <Input
                key={field.key}
                label={field.label}
                autoComplete="off"
                {...register(field.key)}
                error={errors[field.key]?.message}
              />
            ))}
            <Select
              label={t("fields.legalForm")}
              options={legalFormOptions}
              {...register("legal_form")}
              error={errors.legal_form?.message}
            />
            <Input
              label={t("fields.activity")}
              autoComplete="off"
              {...register("activity")}
              error={errors.activity?.message}
            />
          </>
        )}
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

      <ModalFooter>
        {onManageContacts && (
          <Button type="button" variant="secondary" onClick={onManageContacts} className="me-auto">
            <Users className="h-4 w-4 me-2" />
            {t("contacts.title")}
          </Button>
        )}
        <Button type="button" variant="secondary" onClick={onCancel}>
          {tCommon("buttons.cancel")}
        </Button>
        <Button type="submit" isLoading={isLoading}>
          {client ? tCommon("buttons.save") : tCommon("buttons.create")}
        </Button>
      </ModalFooter>
    </form>
  );
}
