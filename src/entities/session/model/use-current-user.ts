import { api } from "@convex/_generated/api";
import { useQuery } from "convex/react";

export const useCurrentUser = () => useQuery(api.auth.getCurrentUser);
