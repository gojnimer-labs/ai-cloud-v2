import { z } from "zod";

import { m } from "@/paraglide/messages";

export const requiredText = z.string().trim().min(1, m.field_required());

export const requiredEmail = z
  .string()
  .trim()
  .min(1, m.field_required())
  .email(m.invalid_email());
