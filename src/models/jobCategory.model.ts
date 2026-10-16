import { z } from 'zod';

export const JobCategorySchema = z.object({
    id: z.string(), // Slug (e.g., fowlrun_construction)
    name: z.string(),
    createdAt: z.any().optional(),
    updatedAt: z.any().optional(),
});

export type JobCategory = z.infer<typeof JobCategorySchema>;
