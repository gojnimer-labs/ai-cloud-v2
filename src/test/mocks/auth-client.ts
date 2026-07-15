interface SignResult {
  error: { message?: string } | null;
}
interface SessionState {
  data: { user: { email?: string; role?: string } } | null;
  isPending: boolean;
}

let sessionState: SessionState = { data: null, isPending: false };
let signInEmailImpl = (_args: unknown): Promise<SignResult> =>
  Promise.resolve({ error: null });
let signUpEmailImpl = (_args: unknown): Promise<SignResult> =>
  Promise.resolve({ error: null });

export function setMockSession(next: SessionState) {
  sessionState = next;
}

export function setMockSignInEmail(
  impl: (args: unknown) => Promise<SignResult>
) {
  signInEmailImpl = impl;
}

export function setMockSignUpEmail(
  impl: (args: unknown) => Promise<SignResult>
) {
  signUpEmailImpl = impl;
}

export function resetAuthClientMock() {
  sessionState = { data: null, isPending: false };
  signInEmailImpl = () => Promise.resolve({ error: null });
  signUpEmailImpl = () => Promise.resolve({ error: null });
}

export const authClient = {
  signIn: { email: (args: unknown) => signInEmailImpl(args) },
  signOut: () => Promise.resolve(),
  signUp: { email: (args: unknown) => signUpEmailImpl(args) },
  useSession: () => sessionState,
};
