import { getFunctionName } from "convex/server";
import type { ReactNode } from "react";

interface AuthState {
  isAuthenticated: boolean;
  isLoading: boolean;
}

const queryResults = new Map<string, unknown>();
const mutationImpls = new Map<string, (...args: unknown[]) => unknown>();
const actionImpls = new Map<string, (...args: unknown[]) => unknown>();
let authState: AuthState = { isAuthenticated: true, isLoading: false };

function key(ref: unknown): string {
  return getFunctionName(ref as Parameters<typeof getFunctionName>[0]);
}

export function mockQueryResult(ref: unknown, value: unknown) {
  queryResults.set(key(ref), value);
}

export function mockMutation(
  ref: unknown,
  impl: (...args: unknown[]) => unknown
) {
  mutationImpls.set(key(ref), impl);
}

export function mockAction(
  ref: unknown,
  impl: (...args: unknown[]) => unknown
) {
  actionImpls.set(key(ref), impl);
}

export function setMockAuthState(state: AuthState) {
  authState = state;
}

export function resetConvexMocks() {
  queryResults.clear();
  mutationImpls.clear();
  actionImpls.clear();
  authState = { isAuthenticated: true, isLoading: false };
}

export function useQuery(ref: unknown) {
  return queryResults.get(key(ref));
}

export function useMutation(ref: unknown) {
  return mutationImpls.get(key(ref)) ?? (async () => undefined);
}

export function useAction(ref: unknown) {
  return actionImpls.get(key(ref)) ?? (async () => undefined);
}

export function useConvexAuth() {
  return authState;
}

export function Authenticated({ children }: { children: ReactNode }) {
  return authState.isAuthenticated ? children : null;
}

export function AuthLoading({ children }: { children: ReactNode }) {
  return authState.isLoading ? children : null;
}

export function Unauthenticated({ children }: { children: ReactNode }) {
  return authState.isAuthenticated || authState.isLoading ? null : children;
}

export class ConvexReactClient {}

export function ConvexProvider({ children }: { children: ReactNode }) {
  return children;
}
