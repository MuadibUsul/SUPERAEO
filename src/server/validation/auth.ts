import { z } from "zod";

export const signupSchema = z.object({
  email: z.string().trim().email(),
  password: z.string().min(8),
  name: z.string().trim().min(1),
  organizationName: z.string().trim().optional().default(""),
  locale: z.enum(["zh-CN", "en"]).default("zh-CN"),
});

export const loginSchema = z.object({
  email: z.string().trim().email(),
  password: z.string().min(1),
  locale: z.enum(["zh-CN", "en"]).default("zh-CN"),
});
