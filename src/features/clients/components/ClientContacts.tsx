import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Plus, Pencil, Trash2, Phone, Mail, Star } from "lucide-react";
import { toast } from "@/stores/useToastStore";
import {
  Button,
  Input,
  Modal,
} from "@/components/ui";
import {
  useClientContactsByClient,
  useCreateClientContact,
  useUpdateClientContact,
  useDeleteClientContact,
} from "../hooks/useClientContacts";
import type { ClientContact, CreateClientContactInput, UpdateClientContactInput } from "@/types";

interface ClientContactsProps {
  clientId: string;
}

interface ContactFormData {
  name: string;
  role: string;
  email: string;
  phone: string;
  is_primary: boolean;
}

const initialFormData: ContactFormData = {
  name: "",
  role: "",
  email: "",
  phone: "",
  is_primary: false,
};

export function ClientContacts({ clientId }: ClientContactsProps) {
  const { t } = useTranslation("clients");
  const { t: tCommon } = useTranslation("common");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingContact, setEditingContact] = useState<ClientContact | null>(null);
  const [formData, setFormData] = useState<ContactFormData>(initialFormData);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  const { data: contacts, isLoading } = useClientContactsByClient(clientId);
  const createContact = useCreateClientContact();
  const updateContact = useUpdateClientContact();
  const deleteContact = useDeleteClientContact();

  const handleOpenAdd = () => {
    setEditingContact(null);
    setFormData(initialFormData);
    setIsModalOpen(true);
  };

  const handleOpenEdit = (contact: ClientContact) => {
    setEditingContact(contact);
    setFormData({
      name: contact.name,
      role: contact.role || "",
      email: contact.email || "",
      phone: contact.phone || "",
      is_primary: contact.is_primary,
    });
    setIsModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editingContact) {
        const input: UpdateClientContactInput = {
          id: editingContact.id,
          name: formData.name,
          role: formData.role || null,
          email: formData.email || null,
          phone: formData.phone || null,
          is_primary: formData.is_primary,
        };
        await updateContact.mutateAsync(input);
      } else {
        const input: CreateClientContactInput = {
          client_id: clientId,
          name: formData.name,
          role: formData.role || null,
          email: formData.email || null,
          phone: formData.phone || null,
          is_primary: formData.is_primary,
        };
        await createContact.mutateAsync(input);
      }
      setIsModalOpen(false);
      setFormData(initialFormData);
      setEditingContact(null);
    } catch {
      toast.error(t("contacts.errorSaving"));
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteContact.mutateAsync(id);
      setDeleteConfirmId(null);
    } catch {
      toast.error(t("contacts.errorDeleting"));
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary-600" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-medium text-gray-900 dark:text-gray-100">{t("contacts.title")}</h3>
        <Button size="sm" variant="secondary" onClick={handleOpenAdd}>
          <Plus className="h-4 w-4 mr-1" />
          {tCommon("buttons.add")}
        </Button>
      </div>

      {contacts && contacts.length > 0 ? (
        <div className="space-y-3">
          {contacts.map((contact) => (
            <div
              key={contact.id}
              className="p-3 bg-gray-50 dark:bg-gray-800 rounded-lg flex items-start justify-between"
            >
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-gray-900 dark:text-gray-100">{contact.name}</span>
                  {contact.is_primary && (
                    <Star className="h-4 w-4 text-yellow-500 fill-current" />
                  )}
                </div>
                {contact.role && (
                  <p className="text-sm text-gray-500 dark:text-gray-400">{contact.role}</p>
                )}
                <div className="flex items-center gap-4 text-sm text-gray-600 dark:text-gray-400">
                  {contact.email && (
                    <a
                      href={`mailto:${contact.email}`}
                      className="flex items-center gap-1 hover:text-primary-600 dark:hover:text-primary-400"
                    >
                      <Mail className="h-4 w-4" />
                      {contact.email}
                    </a>
                  )}
                  {contact.phone && (
                    <a
                      href={`tel:${contact.phone}`}
                      className="flex items-center gap-1 hover:text-primary-600 dark:hover:text-primary-400"
                    >
                      <Phone className="h-4 w-4" />
                      {contact.phone}
                    </a>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => handleOpenEdit(contact)}
                  aria-label={tCommon("buttons.edit")}
                  className="p-1 text-gray-500 hover:text-primary-600 dark:hover:text-primary-400"
                >
                  <Pencil className="h-4 w-4" />
                </button>
                <button
                  onClick={() => setDeleteConfirmId(contact.id)}
                  aria-label={tCommon("buttons.delete")}
                  className="p-1 text-gray-500 hover:text-red-600 dark:hover:text-red-400"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-sm text-gray-500 dark:text-gray-400 text-center py-4">
          {t("contacts.noContacts")}
        </p>
      )}

      {/* Add/Edit Contact Modal */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={editingContact ? t("contacts.editContact") : t("contacts.addContact")}
        size="md"
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <Input
            label={t("contacts.fields.nameRequired")}
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            required
          />
          <Input
            label={t("contacts.fields.role")}
            value={formData.role}
            onChange={(e) => setFormData({ ...formData, role: e.target.value })}
            placeholder={t("contacts.fields.rolePlaceholder")}
          />
          <Input
            label={t("fields.email")}
            type="email"
            value={formData.email}
            onChange={(e) => setFormData({ ...formData, email: e.target.value })}
          />
          <Input
            label={t("fields.phone")}
            value={formData.phone}
            onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
          />
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="is_primary"
              checked={formData.is_primary}
              onChange={(e) =>
                setFormData({ ...formData, is_primary: e.target.checked })
              }
              className="h-4 w-4 rounded border-gray-300 dark:border-gray-600 text-primary-600 focus:ring-primary-500 dark:bg-gray-700"
            />
            <label htmlFor="is_primary" className="text-sm text-gray-700 dark:text-gray-300">
              {t("contacts.fields.primaryContact")}
            </label>
          </div>
          <div className="flex justify-end gap-3 pt-4">
            <Button
              type="button"
              variant="secondary"
              onClick={() => setIsModalOpen(false)}
            >
              {tCommon("buttons.cancel")}
            </Button>
            <Button
              type="submit"
              isLoading={createContact.isPending || updateContact.isPending}
            >
              {editingContact ? tCommon("buttons.save") : tCommon("buttons.add")}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Delete Confirmation Modal */}
      <Modal
        isOpen={!!deleteConfirmId}
        onClose={() => setDeleteConfirmId(null)}
        title={tCommon("messages.confirmDelete")}
        size="sm"
      >
        <p className="text-gray-600 dark:text-gray-400 mb-6">
          {t("contacts.deleteConfirmation")}
        </p>
        <div className="flex justify-end gap-3">
          <Button variant="secondary" onClick={() => setDeleteConfirmId(null)}>
            {tCommon("buttons.cancel")}
          </Button>
          <Button
            variant="danger"
            onClick={() => deleteConfirmId && handleDelete(deleteConfirmId)}
            isLoading={deleteContact.isPending}
          >
            {tCommon("buttons.delete")}
          </Button>
        </div>
      </Modal>
    </div>
  );
}
