import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { posApi } from "@/lib/api";
import type {
  CreatePosRegisterInput,
  UpdatePosRegisterInput,
  OpenSessionInput,
  CloseSessionInput,
} from "@/types";

// Query keys
export const posKeys = {
  all: ["pos"] as const,
  registers: () => [...posKeys.all, "registers"] as const,
  register: (id: string) => [...posKeys.registers(), id] as const,
  sessions: () => [...posKeys.all, "sessions"] as const,
  activeSession: (registerId: string) =>
    [...posKeys.sessions(), "active", registerId] as const,
  sessionSummary: (sessionId: string) =>
    [...posKeys.sessions(), "summary", sessionId] as const,
  transactions: () => [...posKeys.all, "transactions"] as const,
  sessionTransactions: (sessionId: string) =>
    [...posKeys.transactions(), "session", sessionId] as const,
  cashMovements: (sessionId: string) =>
    [...posKeys.all, "cashMovements", sessionId] as const,
  printerConfigs: () => [...posKeys.all, "printerConfigs"] as const,
  dailyReport: (date: string, registerId?: string) =>
    [...posKeys.all, "dailyReport", date, registerId] as const,
};

// Registers
export function usePosRegisters() {
  return useQuery({
    queryKey: posKeys.registers(),
    queryFn: posApi.getRegisters,
  });
}

export function useCreatePosRegister() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreatePosRegisterInput) => posApi.createRegister(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: posKeys.registers() });
    },
  });
}

export function useUpdatePosRegister() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdatePosRegisterInput) => posApi.updateRegister(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: posKeys.registers() });
    },
  });
}

export function useDeletePosRegister() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => posApi.deleteRegister(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: posKeys.registers() });
    },
  });
}

// Sessions
export function useActiveSession(registerId: string | undefined) {
  return useQuery({
    queryKey: posKeys.activeSession(registerId ?? ""),
    queryFn: () => posApi.getActiveSession(registerId!),
    enabled: !!registerId,
  });
}

export function useOpenSession() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: OpenSessionInput) => posApi.openSession(input),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: posKeys.activeSession(variables.register_id),
      });
    },
  });
}

export function useCloseSession() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CloseSessionInput) => posApi.closeSession(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: posKeys.sessions() });
    },
  });
}

export function useSessionSummary(sessionId: string | undefined) {
  return useQuery({
    queryKey: posKeys.sessionSummary(sessionId ?? ""),
    queryFn: () => posApi.getSessionSummary(sessionId!),
    enabled: !!sessionId,
  });
}

// Printer configs
export function usePrinterConfigs() {
  return useQuery({
    queryKey: posKeys.printerConfigs(),
    queryFn: posApi.getPrinterConfigs,
  });
}

// Daily report
export function useDailyPosReport(date: string, registerId?: string) {
  return useQuery({
    queryKey: posKeys.dailyReport(date, registerId),
    queryFn: () => posApi.getDailyReport(date, registerId),
    enabled: !!date,
  });
}
