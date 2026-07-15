import { authClient } from "@/shared/api/auth-client";

export const useAdminGuard = () => {
  const { data: session, isPending } = authClient.useSession();
  const isAdmin = session?.user?.role === "admin";
  return { isAdmin, isPending };
};
