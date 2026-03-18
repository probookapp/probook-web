import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Plus, Pencil, Trash2, Shield, Eye, EyeOff } from 'lucide-react';
import { toast } from '@/stores/useToastStore';
import { Button, Input, Select, Modal } from '@/components/ui';
import { useUsers, useCreateUser, useUpdateUser, useDeleteUser } from '../hooks/useUsers';
import { useAuthStore } from '@/stores/useAuthStore';
import type { UserInfo, PermissionKey } from '@/types';
import { ALL_PERMISSIONS } from '@/types';

export function UserManagement() {
  const { t } = useTranslation('auth');
  const { data: users, isLoading } = useUsers();
  const createUser = useCreateUser();
  const updateUser = useUpdateUser();
  const deleteUser = useDeleteUser();
  const { currentUser } = useAuthStore();

  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<UserInfo | null>(null);
  const [deleteConfirmUser, setDeleteConfirmUser] = useState<UserInfo | null>(null);

  // Form state
  const [formUsername, setFormUsername] = useState('');
  const [formDisplayName, setFormDisplayName] = useState('');
  const [formPassword, setFormPassword] = useState('');
  const [formRole, setFormRole] = useState('employee');
  const [formIsActive, setFormIsActive] = useState(true);
  const [formPermissions, setFormPermissions] = useState<string[]>([]);
  const [showPassword, setShowPassword] = useState(false);
  const [formError, setFormError] = useState('');

  const resetForm = () => {
    setFormUsername('');
    setFormDisplayName('');
    setFormPassword('');
    setFormRole('employee');
    setFormIsActive(true);
    setFormPermissions([]);
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
    setFormPermissions([...user.permissions]);
    setShowPassword(false);
    setFormError('');
    setEditingUser(user);
  };

  const handleCreate = async () => {
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
        permissions: formRole === 'admin' ? ALL_PERMISSIONS as unknown as string[] : formPermissions,
      });
      setIsCreateOpen(false);
      resetForm();
    } catch (err) {
      setFormError(typeof err === 'string' ? err : t('userManagement.createError'));
    }
  };

  const handleUpdate = async () => {
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
        permissions: formRole === 'admin' ? ALL_PERMISSIONS as unknown as string[] : formPermissions,
      });
      setEditingUser(null);
      resetForm();
    } catch (err) {
      setFormError(typeof err === 'string' ? err : t('userManagement.updateError'));
    }
  };

  const handleDelete = async () => {
    if (!deleteConfirmUser) return;
    try {
      await deleteUser.mutateAsync(deleteConfirmUser.id);
      setDeleteConfirmUser(null);
    } catch (err) {
      toast.error(typeof err === 'string' ? err : t('userManagement.deleteError'));
      setDeleteConfirmUser(null);
    }
  };

  const togglePermission = (perm: PermissionKey) => {
    setFormPermissions((prev) =>
      prev.includes(perm) ? prev.filter((p) => p !== perm) : [...prev, perm]
    );
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
            <span className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              {t('userManagement.permissions')}
            </span>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {ALL_PERMISSIONS.map((perm) => (
                <label
                  key={perm}
                  className="flex items-center gap-2 p-2 rounded-lg border border-gray-200 dark:border-gray-700 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800"
                >
                  <input
                    type="checkbox"
                    checked={formPermissions.includes(perm)}
                    onChange={() => togglePermission(perm)}
                    className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                  />
                  <span className="text-sm text-gray-700 dark:text-gray-300">
                    {t(`permissions.${perm}`)}
                  </span>
                </label>
              ))}
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
        <Button onClick={openCreate} size="sm">
          <Plus className="h-4 w-4 mr-2" />
          {t('userManagement.addUser')}
        </Button>
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
                    <button
                      onClick={() => openEdit(user)}
                      className="p-1.5 rounded-lg text-gray-400 hover:text-primary-600 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                    >
                      <Pencil className="h-4 w-4" />
                    </button>
                    {user.id !== currentUser?.id && (
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
