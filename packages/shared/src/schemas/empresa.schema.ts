import { z } from 'zod';

export const CreateEmpresaSchema = z.object({
  nombre: z.string().min(1, 'El nombre es requerido').max(100),
  razon_social: z.string().min(1, 'La razón social es requerida').max(200),
  rfc: z
    .string()
    .min(12, 'RFC inválido')
    .max(13, 'RFC inválido')
    .regex(/^[A-Z&Ñ]{3,4}\d{6}[A-Z\d]{3}$/, 'Formato de RFC inválido'),
});

export const UpdateEmpresaSchema = CreateEmpresaSchema.partial();

export type CreateEmpresaDto = z.infer<typeof CreateEmpresaSchema>;
export type UpdateEmpresaDto = z.infer<typeof UpdateEmpresaSchema>;
