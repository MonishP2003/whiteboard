import { z } from "zod";
import { SceneSchema } from "./scene";

export const HealthResponseSchema = z.object({
  status: z.enum(["ok", "db_unavailable"]),
});
export type HealthResponse = z.infer<typeof HealthResponseSchema>;

// ---- Auth ----

const Email = z.string().trim().email().max(254);

export const RegisterBodySchema = z.object({
  email: Email,
  password: z.string().min(8, "At least 8 characters").max(128),
  name: z.string().trim().min(1, "Required").max(80),
});
export type RegisterBody = z.infer<typeof RegisterBodySchema>;

export const LoginBodySchema = z.object({
  email: Email,
  password: z.string().min(1, "Required").max(128),
});
export type LoginBody = z.infer<typeof LoginBodySchema>;

export const SubscriptionStatusSchema = z.enum(["ACTIVE", "EXPIRED", "CANCELLED"]);
export type SubscriptionStatus = z.infer<typeof SubscriptionStatusSchema>;

export const MeResponseSchema = z.object({
  id: z.string(),
  email: z.string(),
  name: z.string(),
  subscription: z
    .object({
      status: SubscriptionStatusSchema,
      /** ISO 8601 */
      expiresAt: z.string(),
    })
    .nullable(),
});
export type MeResponse = z.infer<typeof MeResponseSchema>;

// ---- Boards ----

const Title = z.string().trim().min(1).max(120);

export const BoardIdParamsSchema = z.object({ id: z.string().uuid() });
export type BoardIdParams = z.infer<typeof BoardIdParamsSchema>;

export const BoardSummarySchema = z.object({
  id: z.string(),
  title: z.string(),
  /** ISO 8601 */
  updatedAt: z.string(),
});
export type BoardSummary = z.infer<typeof BoardSummarySchema>;

export const BoardDetailSchema = BoardSummarySchema.extend({ scene: SceneSchema });
export type BoardDetail = z.infer<typeof BoardDetailSchema>;

export const CreateBoardBodySchema = z.object({
  title: Title.optional(),
  scene: SceneSchema.optional(),
});
export type CreateBoardBody = z.infer<typeof CreateBoardBodySchema>;

/** `scene` is optional so a rename doesn't have to send the whole board. */
export const SaveBoardBodySchema = z
  .object({
    title: Title.optional(),
    scene: SceneSchema.optional(),
  })
  .refine((b) => b.title !== undefined || b.scene !== undefined, "title or scene is required");
export type SaveBoardBody = z.infer<typeof SaveBoardBodySchema>;
