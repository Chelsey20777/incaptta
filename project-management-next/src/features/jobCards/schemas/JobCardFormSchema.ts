import { z } from 'zod';

export const JobCardFormSchema = z.object({
  clientName: z.string().min(2, 'Client name must be at least 2 characters'),
  siteAddress: z.string().min(5, 'Site address must be at least 5 characters'),
  startDate: z.string().min(1, 'Start date is required'),
  endDate: z.string().min(1, 'End date is required'),
  structureType: z.string().min(1, 'Structure type is required'),
  length: z.coerce.number().positive('Length must be positive'),
  width: z.coerce.number().positive('Width must be positive'),
  height: z.coerce.number().positive('Height must be positive'),
  vatRate: z.coerce.number().min(0, 'VAT rate must be non-negative'),
  notes: z.string().optional(),
});

export type JobCardFormValues = z.infer<typeof JobCardFormSchema>;
