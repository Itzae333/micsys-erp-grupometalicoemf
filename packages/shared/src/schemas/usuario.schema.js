"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ResetPasswordSchema = exports.UpdateUsuarioSchema = exports.CreateUsuarioSchema = exports.RolUsuarioSchema = void 0;
const zod_1 = require("zod");
exports.RolUsuarioSchema = zod_1.z.enum([
    'SUPER_USUARIO',
    'ADMIN',
    'ENCARGADO',
    'VENDEDOR',
    'ALMACENISTA',
    'JEFE_MANUFACTURA',
    'JEFE_RH',
]);
exports.CreateUsuarioSchema = zod_1.z.object({
    nombre: zod_1.z.string().min(1, 'El nombre es requerido').max(100),
    apellidos: zod_1.z.string().min(1, 'Los apellidos son requeridos').max(100),
    email: zod_1.z.string().email('Correo electrónico inválido'),
    password: zod_1.z
        .string()
        .min(8, 'La contraseña debe tener al menos 8 caracteres')
        .max(100),
    rol: exports.RolUsuarioSchema,
    ubicacion_ids: zod_1.z.array(zod_1.z.string().cuid()).min(1, 'Asigna al menos una ubicación'),
});
exports.UpdateUsuarioSchema = zod_1.z.object({
    nombre: zod_1.z.string().min(1).max(100).optional(),
    apellidos: zod_1.z.string().min(1).max(100).optional(),
    email: zod_1.z.string().email().optional(),
    rol: exports.RolUsuarioSchema.optional(),
    ubicacion_ids: zod_1.z.array(zod_1.z.string().cuid()).optional(),
    activo: zod_1.z.boolean().optional(),
});
exports.ResetPasswordSchema = zod_1.z.object({
    nueva_password: zod_1.z
        .string()
        .min(8, 'La contraseña debe tener al menos 8 caracteres')
        .max(100),
});
//# sourceMappingURL=usuario.schema.js.map