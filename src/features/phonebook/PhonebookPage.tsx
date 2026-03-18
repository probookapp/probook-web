import { useState } from "react";
import Link from "next/link";
import { useTranslation } from "react-i18next";
import { Search, Phone, Mail, User, Building2 } from "lucide-react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Input,
} from "@/components/ui";
import { useClientContacts, useSearchContacts } from "@/features/clients/hooks/useClientContacts";
import { useClients } from "@/features/clients/hooks/useClients";
import type { ClientContact, Client } from "@/types";

interface ContactWithClient extends ClientContact {
  client?: Client;
}

export function PhonebookPage() {
  const { t } = useTranslation("common");
  const [searchQuery, setSearchQuery] = useState("");

  const { data: allContacts, isLoading: isLoadingAll } = useClientContacts();
  const { data: searchResults, isLoading: isSearching } = useSearchContacts(searchQuery);
  const { data: clients } = useClients();

  const contacts = searchQuery.length >= 2 ? searchResults : allContacts;
  const isLoading = searchQuery.length >= 2 ? isSearching : isLoadingAll;

  // Map clients to contacts
  const clientMap = new Map(clients?.map((c) => [c.id, c]) || []);
  const contactsWithClients: ContactWithClient[] = (contacts || []).map((contact) => ({
    ...contact,
    client: clientMap.get(contact.client_id),
  }));

  // Group contacts by first letter of name
  const groupedContacts = contactsWithClients.reduce((acc, contact) => {
    const firstLetter = contact.name[0]?.toUpperCase() || "#";
    if (!acc[firstLetter]) {
      acc[firstLetter] = [];
    }
    acc[firstLetter].push(contact);
    return acc;
  }, {} as Record<string, ContactWithClient[]>);

  const sortedLetters = Object.keys(groupedContacts).sort();

  if (isLoading && !contacts) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-gray-100">{t("phonebook.title")}</h1>
        <p className="text-sm sm:text-base text-gray-500 dark:text-gray-400">{t("phonebook.subtitle")}</p>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>{t("phonebook.contacts")}</CardTitle>
            <div className="relative w-full sm:w-56 md:w-64 lg:w-80">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
              <Input
                id="phonebook-search"
                name="phonebook-search"
                placeholder={t("phonebook.searchPlaceholder")}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                autoComplete="off"
                className="pl-9"
              />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {contactsWithClients.length === 0 ? (
            <div className="text-center py-12 text-gray-500 dark:text-gray-400">
              {searchQuery
                ? t("phonebook.noResultsSearch")
                : t("phonebook.noContacts")}
            </div>
          ) : (
            <div className="space-y-6">
              {sortedLetters.map((letter) => (
                <div key={letter}>
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 border-b border-gray-200 dark:border-gray-700 pb-2 mb-3">
                    {letter}
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {groupedContacts[letter].map((contact) => (
                      <div
                        key={contact.id}
                        className="p-4 bg-gray-50 dark:bg-gray-800 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                      >
                        <div className="flex items-start gap-3">
                          <div className="p-2 bg-primary-100 dark:bg-primary-900/30 rounded-full">
                            <User className="h-5 w-5 text-primary-600 dark:text-primary-400" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <h4 className="font-medium text-gray-900 dark:text-gray-100 truncate">
                                {contact.name}
                              </h4>
                              {contact.is_primary && (
                                <span className="px-1.5 py-0.5 text-xs bg-primary-100 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300 rounded">
                                  {t("phonebook.primary")}
                                </span>
                              )}
                            </div>
                            {contact.role && (
                              <p className="text-sm text-gray-500 dark:text-gray-400">{contact.role}</p>
                            )}
                            {contact.client && (
                              <Link
                                href={`/clients`}
                                className="flex items-center gap-1 text-sm text-primary-600 dark:text-primary-400 hover:underline mt-1"
                              >
                                <Building2 className="h-3 w-3" />
                                {contact.client.name}
                              </Link>
                            )}
                            <div className="mt-2 space-y-1">
                              {contact.email && (
                                <a
                                  href={`mailto:${contact.email}`}
                                  className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400 hover:text-primary-600 dark:hover:text-primary-400"
                                >
                                  <Mail className="h-4 w-4" />
                                  <span className="truncate">{contact.email}</span>
                                </a>
                              )}
                              {contact.phone && (
                                <a
                                  href={`tel:${contact.phone}`}
                                  className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400 hover:text-primary-600 dark:hover:text-primary-400"
                                >
                                  <Phone className="h-4 w-4" />
                                  {contact.phone}
                                </a>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
