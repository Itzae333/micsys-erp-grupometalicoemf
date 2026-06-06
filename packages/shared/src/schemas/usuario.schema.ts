import { z } from 'zod';

export const RolUsuarioSchema = z.enum([
  'SUPER_USUARIO',
  'ADMIN',
  'ENCARGADO',
  'VENDEDOR',
  'ALMACENISTA',
  'JEFE_MANUFACTURA',
  'JEFE_RH',
]);

export const CreateUsuarioSchema = z.object({
  nombre: z.string().min(1, 'El nombre es requerido').max(100),
  apellidos: z.string().min(1, 'Los apellidos son requeridos').max(100),
  email: z.string().email('Correo electrónico inválido'),
  password: z
    .string()
    .min(8, 'La contraseña debe tener al menos 8 caracteres')
    .max(100),
  rol: RolUsuarioSchema,
  ubicacion_ids: z.array(z.string().cuid()).min(1, 'Asigna al menos una ubicación'),
});

export const UpdateUsuarioSchema = z.object({
  nombre: z.string().min(1).max(100).optional(),
  apellidos: z.string().min(1).max(100).optional(),
  email: z.string().email().optional(),
  rol: RolUsuarioSchema.optional(),
  ubicacion_ids: z.array(z.string().cuid()).optional(),
  activo: z.boolean().optional(),
});

export const ResetPasswordSchema = z.object({
  nueva_password: z
    .string()
    .min(8, 'La contraseña debe tener al menos 8 caracteres')
    .max(100),
});

export type RolUsuario = z.infer<typeof RolUsuarioSchema>;
export type CreateUsuarioDto = z.infer<typeof CreateUsuarioSchema>;
export type UpdateUsuarioDto = z.infer<typeof UpdateUsuarioSchema>;
export type ResetPasswordDto = z.infer<typeof ResetPasswordSchema>;
