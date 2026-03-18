"use client";

import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Search, Power, KeyRound } from "lucide-react";
import {
  Button,
  Card,
  CardContent,
  Modal,
  Input,
  Badge,
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui";
import {
  useAdminUsers,
  useDisableUser,
  useResetUserPassword,
} from "./hooks/useAdminUsers";

type User = Record<string, unknown>;

export function AdminUsersPage() {
  const { t } = useTranslation("admin");
  const [search, setSearch] = useState("");
  const [resetPasswordUser, setResetPasswordUser] = useState<User | null>(null);
  const [newPassword, setNewPassword] = useState("");

  const { data: users, isLoading } = useAdminUsers();
  const disableUser = useDisableUser();
  const resetPassword = useResetUserPassword();

  const handleToggleActive = async (user: User) => {
    await disableUser.mutateAsync(String(user.id));
  };

  const handleOpenResetPassword = (user: User) => {
    setResetPasswordUser(user);
    setNewPassword("");
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resetPasswordUser) return;
    await resetPassword.mutateAsync({
      id: String(resetPasswordUser.id),
      input: { new_password: newPassword },
    });
    setResetPasswordUser(null);
    setNewPassword("");
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600" />
      </div>
    );
  }

  const allUsers = (users || []) as User[];
  const filteredUsers = search
    ? allUsers.filter((u) => {
        const username = String(u.username || "").toLowerCase();
        const displayName = String(u.display_name || "").toLowerCase();
        const q = search.toLowerCase();
        return username.includes(q) || displayName.includes(q);
      })
    : allUsers;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-gray-100">
            {t("users.title")}
          </h1>
          <p className="text-sm sm:text-base text-gray-500 dark:text-gray-400">
            {t("users.description")}
          </p>
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          <div className="px-4 py-3 sm:px-6 sm:py-4 border-b border-gray-200 dark:border-gray-700">
            <div className="relative max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <Input
                name="user-search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t("users.search_placeholder")}
                autoComplete="off"
                className="pl-9"
              />
            </div>
          </div>
          {/* Mobile card view */}
          <div className="md:hidden divide-y divide-gray-200 dark:divide-gray-700">
            {filteredUsers.map((user) => {
              const tenant = user.tenant as Record<string, unknown> | undefined;
              return (
                <div key={String(user.id)} className="p-4 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-gray-900 dark:text-gray-100">
                      {String(user.username || "-")}
                    </span>
                    <Badge variant={user.is_active ? "success" : "danger"}>
                      {user.is_active ? t("common.yes") : t("common.no")}
                    </Badge>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-gray-600 dark:text-gray-400">
                      {String(user.display_name || "-")}
                    </span>
                    <Badge variant={user.role === "admin" ? "info" : "default"}>
                      {String(user.role || "-")}
                    </Badge>
                  </div>
                  <div className="text-sm text-gray-500 dark:text-gray-400">
                    {tenant ? String(tenant.name || "-") : "-"}
                  </div>
                  <div className="flex gap-2 pt-1">
                    <Button
                      variant={user.is_active ? "danger" : "primary"}
                      size="sm"
                      onClick={() => handleToggleActive(user)}
                      isLoading={disableUser.isPending}
                    >
                      <Power className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => handleOpenResetPassword(user)}
                    >
                      <KeyRound className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              );
            })}
            {filteredUsers.length === 0 && (
              <div className="py-8 text-center text-gray-500 dark:text-gray-400">
                {t("users.empty")}
              </div>
            )}
          </div>
          <div className="hidden md:block overflow-x-auto">
            <Table className="min-w-[900px]">
              <TableHeader>
                <TableRow>
                  <TableHead>{t("users.username")}</TableHead>
                  <TableHead>{t("users.display_name")}</TableHead>
                  <TableHead>{t("users.tenant")}</TableHead>
                  <TableHead>{t("users.role")}</TableHead>
                  <TableHead>{t("users.active")}</TableHead>
                  <TableHead>{t("users.created")}</TableHead>
                  <TableHead className="text-right">{t("users.actions")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredUsers.map((user) => {
                  const tenant = user.tenant as Record<string, unknown> | undefined;
                  return (
                    <TableRow key={String(user.id)}>
                      <TableCell className="font-medium text-gray-900 dark:text-gray-100">
                        {String(user.username || "-")}
                      </TableCell>
                      <TableCell className="text-gray-600 dark:text-gray-400">
                        {String(user.display_name || "-")}
                      </TableCell>
                      <TableCell className="text-gray-600 dark:text-gray-400">
                        {tenant ? String(tenant.name || "-") : "-"}
                      </TableCell>
                      <TableCell>
                        <Badge variant={user.role === "admin" ? "info" : "default"}>
                          {String(user.role || "-")}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant={user.is_active ? "success" : "danger"}>
                          {user.is_active ? t("common.yes") : t("common.no")}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-gray-600 dark:text-gray-400">
                        {user.created_at
                          ? new Date(String(user.created_at)).toLocaleDateString()
                          : "-"}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          <Button
                            variant={user.is_active ? "danger" : "primary"}
                            size="sm"
                            onClick={() => handleToggleActive(user)}
                            isLoading={disableUser.isPending}
                          >
                            <Power className="h-4 w-4 mr-1" />
                            {user.is_active
                              ? t("users.disable")
                              : t("users.enable")}
                          </Button>
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => handleOpenResetPassword(user)}
                          >
                            <KeyRound className="h-4 w-4 mr-1" />
                            {t("users.reset_password")}
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
                {filteredUsers.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center text-gray-500 dark:text-gray-400 py-8">
                      {t("users.empty")}
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Reset Password Modal */}
      <Modal
        isOpen={!!resetPasswordUser}
        onClose={() => setResetPasswordUser(null)}
        title={t("users.reset_password_title")}
        size="sm"
      >
        <form onSubmit={handleResetPassword} className="space-y-4">
          <p className="text-sm text-gray-600 dark:text-gray-400">
            {t("users.reset_password_for", {
              username: resetPasswordUser
                ? String(resetPasswordUser.username)
                : "",
            })}
          </p>
          <Input
            name="new-password"
            label={t("users.new_password")}
            type="password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            required
            minLength={6}
            placeholder={t("users.new_password_placeholder")}
          />
          <div className="flex justify-end gap-3 pt-4 border-t border-gray-200 dark:border-gray-700">
            <Button
              variant="secondary"
              type="button"
              onClick={() => setResetPasswordUser(null)}
            >
              {t("common.cancel")}
            </Button>
            <Button type="submit" isLoading={resetPassword.isPending}>
              {t("users.reset_password")}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
