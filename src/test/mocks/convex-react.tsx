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

const key = (ref: unknown): string =>
  getFunctionName(ref as Parameters<typeof getFunctionName>[0]);

export const mockQueryResult = (ref: unknown, value: unknown) => {
  queryResults.set(key(ref), value);
};

export const mockMutation = (
  ref: unknown,
  impl: (...args: unknown[]) => unknown
) => {
  mutationImpls.set(key(ref), impl);
};

export const mockAction = (
  ref: unknown,
  impl: (...args: unknown[]) => unknown
) => {
  actionImpls.set(key(ref), impl);
};

export const setMockAuthState = (state: AuthState) => {
  authState = state;
};

export const resetConvexMocks = () => {
  queryResults.clear();
  mutationImpls.clear();
  actionImpls.clear();
  authState = { isAuthenticated: true, isLoading: false };
};

const noop = () => {
  // Default stand-in for a mutation/action that hasn't been mocked.
};

export const useQuery = (ref: unknown) => queryResults.get(key(ref));

export const useMutation = (ref: unknown) =>
  mutationImpls.get(key(ref)) ?? noop;

export const useAction = (ref: unknown) => actionImpls.get(key(ref)) ?? noop;

export const useConvexAuth = () => authState;

export const Authenticated = ({ children }: { children: ReactNode }) =>
  authState.isAuthenticated ? children : null;

export const AuthLoading = ({ children }: { children: ReactNode }) =>
  authState.isLoading ? children : null;

export const Unauthenticated = ({ children }: { children: ReactNode }) =>
  authState.isAuthenticated || authState.isLoading ? null : children;

// oxlint-disable-next-line typescript/no-extraneous-class -- must stay a class: main.tsx does `new ConvexReactClient(...)`, so the mock needs to be constructible.
export class ConvexReactClient {
  // No-op stand-in — tests never talk to a real Convex deployment.
}

export const ConvexProvider = ({ children }: { children: ReactNode }) =>
  children;
