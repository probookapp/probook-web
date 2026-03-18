import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { authApi } from '@/lib/api';
import { useAuthStore } from '@/stores/useAuthStore';
import type { CreateUserInput, UpdateUserInput, UserInfo } from '@/types';

export function useUsers() {
  return useQuery({
    queryKey: ['users'],
    queryFn: authApi.getUsers,
  });
}

export function useCreateUser() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateUserInput) => authApi.createUser(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
    },
  });
}

export function useUpdateUser() {
  const queryClient = useQueryClient();
  const { currentUser, setUser } = useAuthStore();
  return useMutation({
    mutationFn: (input: UpdateUserInput) => authApi.updateUser(input),
    onSuccess: (updatedUser: UserInfo) => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
      if (currentUser && updatedUser.id === currentUser.id) {
        setUser(updatedUser);
      }
    },
  });
}

export function useDeleteUser() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => authApi.deleteUser(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
    },
  });
}
