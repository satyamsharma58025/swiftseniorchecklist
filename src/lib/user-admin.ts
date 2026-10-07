import { z } from "zod";

/** Domain used when a manager types a plain user id (no "@") for someone without an email. */
export const LOGIN_ID_DOMAIN = "swiftstrips.local";

export const MIN_PASSWORD_LENGTH = 8;

/**
 * Login in this app is by the `email` column (the login form uses an email
 * input). A plain user id such as "rahul.k" is stored as "rahul.k@swiftstrips.local"
 * so people without an email can still sign in with no change to the login page.
 */
export function normalizeLoginId(input: string): string {
  const value = input.trim().toLowerCase();
  return value.includes("@") ? value : `${value}@${LOGIN_ID_DOMAIN}`;
}

const loginIdPattern = /^[a-z0-9][a-z0-9._+-]*(@[a-z0-9.-]+\.[a-z]{2,})?$/i;

export const createUserSchema = z.object({
  name: z.string().trim().min(2, "Name is required").max(80),
  loginId: z
    .string()
    .trim()
    .min(3, "User id must be at least 3 characters")
    .max(120)
    .regex(loginIdPattern, "Use letters, numbers, dot, dash or underscore (or a full email)"),
  password: z
    .string()
    .min(MIN_PASSWORD_LENGTH, `Password must be at least ${MIN_PASSWORD_LENGTH} characters`)
    .max(72, "Password must be 72 characters or fewer"),
  role: z.enum(["MANAGER", "SENIOR", "EMPLOYEE"]),
  phone: z.string().trim().max(20).optional().or(z.literal("")),
});

export type CreateUserInput = z.infer<typeof createUserSchema>;
