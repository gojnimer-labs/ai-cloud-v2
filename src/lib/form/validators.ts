import { m } from "@/paraglide/messages";

export const required = ({ value }: { value: string }) =>
  value.trim() ? undefined : m.field_required();
