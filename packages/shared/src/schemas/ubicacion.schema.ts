import { z } from 'zod';

export const TipoUbicacionSchema = z.enum(['MATRIZ', 'FABRICA', 'PUNTO_VENTA']);

export const CreateUbicacionSchema = z.object({
  nombre: z.string().min(1, 'El nombre es requerido').max(100),
  tipo: TipoUbicacionSchema,
  razon_social: z.string().max(200).optional(),
  rfc: z.string().max(13).optional(),
  regimen_fiscal: z.string().max(200).optional(),
  calle: z.string().max(200).optional(),
  num_ext: z.string().max(20).optional(),
  num_int: z.string().max(20).optional(),
  colonia: z.string().max(100).optional(),
  municipio: z.string().max(100).optional(),
  estado: z.string().max(100).optional(),
  cp: z.string().max(10).optional(),
  telefono: z.string().max(20).optional(),
});

export const UpdateUbicacionSchema = CreateUbicacionSchema.partial();

export type TipoUbicacion = z.infer<typeof TipoUbicacionSchema>;
export type CreateUbicacionDto = z.infer<typeof CreateUbicacionSchema>;
export type UpdateUbicacionDto = z.infer<typeof UpdateUbicacionSchema>;
