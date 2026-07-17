import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Plus, Pencil, Trash2, Shield, Eye, EyeOff } from 'lucide-react';
import { toast } from '@/stores/useToastStore';
import { Button, Input, Select, Modal } from '@/components/ui';
import { useUsers, useCreateUser, useUpdateUser, useDeleteUser } from '../hooks/useUsers';
import { useAuthStore } from '@/stores/useAuthStore';
import { useDemoMode } from '@/components/providers/DemoModeProvider';
import type { UserInfo, PermissionKey, PermissionAction } from '@/types';
import { ALL_PERMISSIONS } from '@/types';

type PermFlags = {
  canView: boolean;
  canCreate: boolean;
  canEdit: boolean;
  canDelete: boolean;
};

const emptyFlags = (): PermFlags => ({
  canView: false,
  canCreate: false,
  canEdit: false,
  canDelete: false,
});

const PERM_ACTIONS: { action: PermissionAction; flag: keyof PermFlags; label: string }[] = [
  { action: 'view', flag: 'canView', label: 'permView' },
  { action: 'create', flag: 'canCreate', label: 'permCreate' },
  { action: 'edit', flag: 'canEdit', label: 'permEdit' },
  { action: 'delete', flag: 'canDelete', label: 'permDelete' },
];

export function UserManagement() {
  const { t } = useTranslation('auth');
  const { isDemoMode, showSubscribePrompt } = useDemoMode();
  const { data: users, isLoading } = useUsers();
  const createUser = useCreateUser();
  const updateUser = useUpdateUser();
  const deleteUser = useDeleteUser();
  const { currentUser, hasPermission } = useAuthStore();

  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<UserInfo | null>(null);
  const [deleteConfirmUser, setDeleteConfirmUser] = useState<UserInfo | null>(null);

  // Form state
  const [formUsername, setFormUsername] = useState('');
  const [formDisplayName, setFormDisplayName] = useState('');
  const [formPassword, setFormPassword] = useState('');
  const [formRole, setFormRole] = useState('employee');
  const [formIsActive, setFormIsActive] = useState(true);
  const [formPermissions, setFormPermissions] = useState<Record<string, PermFlags>>({});
  const [showPassword, setShowPassword] = useState(false);
  const [formError, setFormError] = useState('');

  const canCreateUser = hasPermission('settings', 'create');
  const canEditUser = hasPermission('settings', 'edit');
  const canDeleteUser = hasPermission('settings', 'delete');

  const resetForm = () => {
    setFormUsername('');
    setFormDisplayName('');
    setFormPassword('');
    setFormRole('employee');
    setFormIsActive(true);
    setFormPermissions({});
    setShowPassword(false);
    setFormError('');
  };

  const openCreate = () => {
    resetForm();
    setIsCreateOpen(true);
  };

  const openEdit = (user: UserInfo) => {
    setFormUsername(user.username);
    setFormDisplayName(user.display_name);
    setFormPassword('');
    setFormRole(user.role);
    setFormIsActive(user.is_active);
    // Prefill CRUD flags from the user's permission_details; fall back to the
    // legacy view-list (module on = full access) when details are absent.
    const map: Record<string, PermFlags> = {};
    ALL_PERMISSIONS.forEach((key) => {
      const detail = user.permission_details?.find((p) => p.key === key);
      if (detail) {
        map[key] = {
          canView: detail.can_view,
          canCreate: detail.can_create,
          canEdit: detail.can_edit,
          canDelete: detail.can_delete,
        };
      } else {
        const on = user.permissions.includes(key);
        map[key] = { canView: on, canCreate: on, canEdit: on, canDelete: on };
      }
    });
    setFormPermissions(map);
    setShowPassword(false);
    setFormError('');
    setEditingUser(user);
  };

  const buildPermissionDetails = () =>
    ALL_PERMISSIONS.map((key) => {
      const f = formPermissions[key] ?? emptyFlags();
      return {
        key,
        can_view: f.canView,
        can_create: f.canCreate,
        can_edit: f.canEdit,
        can_delete: f.canDelete,
      };
    });

  const derivedViewPermissions = () =>
    ALL_PERMISSIONS.filter((key) => formPermissions[key]?.canView);

  const handleCreate = async () => {
    if (isDemoMode) { showSubscribePrompt(); return; }
    setFormError('');
    if (!formUsername.trim() || !formDisplayName.trim() || !formPassword.trim()) {
      setFormError(t('userManagement.allFieldsRequired'));
      return;
    }
    try {
      await createUser.mutateAsync({
        username: formUsername,
        display_name: formDisplayName,
        password: formPassword,
        role: formRole,
        ...(formRole === 'admin'
          ? { permissions: ALL_PERMISSIONS as unknown as string[] }
          : {
              permissions: derivedViewPermissions() as unknown as string[],
              permission_details: buildPermissionDetails(),
            }),
      });
      setIsCreateOpen(false);
      resetForm();
    } catch (err) {
      setFormError(typeof err === 'string' ? err : t('userManagement.createError'));
    }
  };

  const handleUpdate = async () => {
    if (isDemoMode) { showSubscribePrompt(); return; }
    if (!editingUser) return;
    setFormError('');
    if (!formUsername.trim() || !formDisplayName.trim()) {
      setFormError(t('userManagement.allFieldsRequired'));
      return;
    }
    try {
      await updateUser.mutateAsync({
        id: editingUser.id,
        username: formUsername,
        display_name: formDisplayName,
        password: formPassword || undefined,
        role: formRole,
        is_active: formIsActive,
        ...(formRole === 'admin'
          ? { permissions: ALL_PERMISSIONS as unknown as string[] }
          : {
              permissions: derivedViewPermissions() as unknown as string[],
              permission_details: buildPermissionDetails(),
            }),
      });
      setEditingUser(null);
      resetForm();
    } catch (err) {
      setFormError(typeof err === 'string' ? err : t('userManagement.updateError'));
    }
  };

  const handleDelete = async () => {
    if (isDemoMode) { showSubscribePrompt(); return; }
    if (!deleteConfirmUser) return;
    try {
      await deleteUser.mutateAsync(deleteConfirmUser.id);
      setDeleteConfirmUser(null);
    } catch (err) {
      toast.error(typeof err === 'string' ? err : t('userManagement.deleteError'));
      setDeleteConfirmUser(null);
    }
  };

  const setPermFlag = (perm: PermissionKey, flag: keyof PermFlags, value: boolean) => {
    setFormPermissions((prev) => {
      const current = prev[perm] ?? emptyFlags();
      const next: PermFlags = { ...current, [flag]: value };
      if (flag === 'canView') {
        // Unchecking View removes every action for that module.
        if (!value) {
          next.canCreate = false;
          next.canEdit = false;
          next.canDelete = false;
        }
      } else if (value) {
        // Checking any action implies View.
        next.canView = true;
      }
      return { ...prev, [perm]: next };
    });
  };

  const roleOptions = [
    { value: 'admin', label: t('userManagement.roleAdmin') },
    { value: 'employee', label: t('userManagement.roleEmployee') },
  ];

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-32">
        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary-600" />
      </div>
    );
  }

  const userFormModal = (
    isOpen: boolean,
    onClose: () => void,
    title: string,
    onSubmit: () => void,
    submitLabel: string,
    isSubmitting: boolean,
    isEdit: boolean,
  ) => (
    <Modal isOpen={isOpen} onClose={onClose} title={title} size="lg">
      <div className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Input
            label={t('userManagement.username')}
            value={formUsername}
            onChange={(e) => setFormUsername(e.target.value)}
            autoComplete="off"
          />
          <Input
            label={t('userManagement.displayName')}
            value={formDisplayName}
            onChange={(e) => setFormDisplayName(e.target.value)}
            autoComplete="off"
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="relative">
            <Input
              label={isEdit ? t('userManagement.newPassword') : t('userManagement.password')}
              type={showPassword ? 'text' : 'password'}
              value={formPassword}
              onChange={(e) => setFormPassword(e.target.value)}
              placeholder={isEdit ? t('userManagement.leaveBlank') : ''}
              autoComplete="new-password"
              className="pr-10"
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-3 top-8.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
            >
              {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
            </button>
          </div>
          <Select
            label={t('userManagement.role')}
            options={roleOptions}
            value={formRole}
            onChange={(e) => setFormRole(e.target.value)}
          />
        </div>

        {isEdit && (
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
              {t('userManagement.active')}
            </span>
            <button
              type="button"
              role="switch"
              aria-checked={formIsActive}
              onClick={() => setFormIsActive(!formIsActive)}
              className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 dark:focus:ring-offset-gray-900 ${
                formIsActive ? 'bg-primary-600' : 'bg-gray-200 dark:bg-gray-700'
              }`}
            >
              <span
                className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                  formIsActive ? 'translate-x-5' : 'translate-x-0'
                }`}
              />
            </button>
          </div>
        )}

        {formRole === 'employee' && (
          <div>
            <span className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              {t('userManagement.permissions')}
            </span>
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">
              {t('userManagement.permissionsHint')}
            </p>
            <div className="overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-700">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
                    <th className="text-start py-2 px-3 font-medium text-gray-500 dark:text-gray-400">
                      {t('userManagement.module')}
                    </th>
                    {PERM_ACTIONS.map((a) => (
                      <th
                        key={a.action}
                        className="py-2 px-2 font-medium text-gray-500 dark:text-gray-400 text-center w-16"
                      >
                        {t(`userManagement.${a.label}`)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {ALL_PERMISSIONS.map((perm) => {
                    const flags = formPermissions[perm] ?? emptyFlags();
                    return (
                      <tr
                        key={perm}
                        className="border-b border-gray-100 dark:border-gray-800 last:border-0"
                      >
                        <td className="py-2 px-3 text-gray-700 dark:text-gray-300">
                          {t(`permissions.${perm}`)}
                        </td>
                        {PERM_ACTIONS.map((a) => {
                          const checked = flags[a.flag];
                          const disabled = a.action !== 'view' && !flags.canView;
                          return (
                            <td key={a.action} className="py-2 px-2 text-center">
                              <input
                                type="checkbox"
                                checked={checked}
                                disabled={disabled}
                                onChange={(e) => setPermFlag(perm, a.flag, e.target.checked)}
                                aria-label={`${t(`permissions.${perm}`)} - ${t(`userManagement.${a.label}`)}`}
                                className="rounded border-gray-300 text-primary-600 focus:ring-primary-500 disabled:opacity-40 disabled:cursor-not-allowed"
                              />
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {formError && (
          <p className="text-sm text-red-600 dark:text-red-400">{formError}</p>
        )}

        <div className="flex justify-end gap-3 pt-2">
          <Button variant="secondary" onClick={onClose}>
            {t('userManagement.cancel')}
          </Button>
          <Button onClick={onSubmit} isLoading={isSubmitting}>
            {submitLabel}
          </Button>
        </div>
      </div>
    </Modal>
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
          {t('userManagement.title')}
        </h3>
        {canCreateUser && (
          <Button onClick={openCreate} size="sm">
            <Plus className="h-4 w-4 mr-2" />
            {t('userManagement.addUser')}
          </Button>
        )}
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200 dark:border-gray-700">
              <th className="text-left py-3 px-4 font-medium text-gray-500 dark:text-gray-400">
                {t('userManagement.displayName')}
              </th>
              <th className="text-left py-3 px-4 font-medium text-gray-500 dark:text-gray-400">
                {t('userManagement.username')}
              </th>
              <th className="text-left py-3 px-4 font-medium text-gray-500 dark:text-gray-400">
                {t('userManagement.role')}
              </th>
              <th className="text-left py-3 px-4 font-medium text-gray-500 dark:text-gray-400">
                {t('userManagement.status')}
              </th>
              <th className="text-right py-3 px-4 font-medium text-gray-500 dark:text-gray-400">
                {t('userManagement.actions')}
              </th>
            </tr>
          </thead>
          <tbody>
            {users?.map((user) => (
              <tr key={user.id} className="border-b border-gray-100 dark:border-gray-800">
                <td className="py-3 px-4">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-gray-900 dark:text-gray-100">
                      {user.display_name}
                    </span>
                    {user.id === currentUser?.id && (
                      <span className="text-xs text-primary-600 dark:text-primary-400">
                        ({t('userManagement.you')})
                      </span>
                    )}
                  </div>
                </td>
                <td className="py-3 px-4 text-gray-600 dark:text-gray-400">
                  {user.username}
                </td>
                <td className="py-3 px-4">
                  <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${
                    user.role === 'admin'
                      ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400'
                      : 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400'
                  }`}>
                    {user.role === 'admin' && <Shield className="h-3 w-3" />}
                    {user.role === 'admin' ? t('userManagement.roleAdmin') : t('userManagement.roleEmployee')}
                  </span>
                </td>
                <td className="py-3 px-4">
                  <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${
                    user.is_active
                      ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400'
                      : 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400'
                  }`}>
                    {user.is_active ? t('userManagement.statusActive') : t('userManagement.statusInactive')}
                  </span>
                </td>
                <td className="py-3 px-4">
                  <div className="flex items-center justify-end gap-2">
                    {canEditUser && (
                      <button
                        onClick={() => openEdit(user)}
                        className="p-1.5 rounded-lg text-gray-400 hover:text-primary-600 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                    )}
                    {canDeleteUser && user.id !== currentUser?.id && (
                      <button
                        onClick={() => setDeleteConfirmUser(user)}
                        className="p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Create User Modal */}
      {userFormModal(
        isCreateOpen,
        () => { setIsCreateOpen(false); resetForm(); },
        t('userManagement.addUser'),
        handleCreate,
        t('userManagement.create'),
        createUser.isPending,
        false,
      )}

      {/* Edit User Modal */}
      {userFormModal(
        !!editingUser,
        () => { setEditingUser(null); resetForm(); },
        t('userManagement.editUser'),
        handleUpdate,
        t('userManagement.save'),
        updateUser.isPending,
        true,
      )}

      {/* Delete Confirmation Modal */}
      <Modal
        isOpen={!!deleteConfirmUser}
        onClose={() => setDeleteConfirmUser(null)}
        title={t('userManagement.deleteConfirmTitle')}
        size="sm"
      >
        <div className="space-y-4">
          <p className="text-sm text-gray-600 dark:text-gray-400">
            {t('userManagement.deleteConfirmMessage', { name: deleteConfirmUser?.display_name })}
          </p>
          <div className="flex justify-end gap-3">
            <Button variant="secondary" onClick={() => setDeleteConfirmUser(null)}>
              {t('userManagement.cancel')}
            </Button>
            <Button variant="danger" onClick={handleDelete} isLoading={deleteUser.isPending}>
              <Trash2 className="h-4 w-4 mr-2" />
              {t('userManagement.delete')}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
