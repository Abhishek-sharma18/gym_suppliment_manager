'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { loginRequest, userOut, type LoginRequest, type UserOut } from '@gym/shared';
import { getJson, postJson } from './api';

export function useMe() {
  return useQuery<UserOut>({
    queryKey: ['me'],
    queryFn: async () => userOut.parse((await getJson<{ data: unknown }>('/auth/me')).data),
    retry: false,
    staleTime: 5 * 60 * 1000,
  });
}

export function useLogin() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (creds: LoginRequest) =>
      userOut.parse((await postJson<{ data: unknown }>('/auth/login', loginRequest.parse(creds))).data),
    onSuccess: (user) => qc.setQueryData(['me'], user),
  });
}

export function useLogout() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => postJson<{ data: unknown }>('/auth/logout', {}),
    onSuccess: () => qc.clear(),
  });
}
