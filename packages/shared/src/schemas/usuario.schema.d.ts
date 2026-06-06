import { z } from 'zod';
export declare const RolUsuarioSchema: z.ZodEnum<["SUPER_USUARIO", "ADMIN", "ENCARGADO", "VENDEDOR", "ALMACENISTA", "JEFE_MANUFACTURA", "JEFE_RH"]>;
export declare const CreateUsuarioSchema: z.ZodObject<{
    nombre: z.ZodString;
    apellidos: z.ZodString;
    email: z.ZodString;
    password: z.ZodString;
    rol: z.ZodEnum<["SUPER_USUARIO", "ADMIN", "ENCARGADO", "VENDEDOR", "ALMACENISTA", "JEFE_MANUFACTURA", "JEFE_RH"]>;
    ubicacion_ids: z.ZodArray<z.ZodString, "many">;
}, "strip", z.ZodTypeAny, {
    email: string;
    nombre: string;
    apellidos: string;
    rol: "SUPER_USUARIO" | "ADMIN" | "ENCARGADO" | "VENDEDOR" | "ALMACENISTA" | "JEFE_MANUFACTURA" | "JEFE_RH";
    password: string;
    ubicacion_ids: string[];
}, {
    email: string;
    nombre: string;
    apellidos: string;
    rol: "SUPER_USUARIO" | "ADMIN" | "ENCARGADO" | "VENDEDOR" | "ALMACENISTA" | "JEFE_MANUFACTURA" | "JEFE_RH";
    password: string;
    ubicacion_ids: string[];
}>;
export declare const UpdateUsuarioSchema: z.ZodObject<{
    nombre: z.ZodOptional<z.ZodString>;
    apellidos: z.ZodOptional<z.ZodString>;
    email: z.ZodOptional<z.ZodString>;
    rol: z.ZodOptional<z.ZodEnum<["SUPER_USUARIO", "ADMIN", "ENCARGADO", "VENDEDOR", "ALMACENISTA", "JEFE_MANUFACTURA", "JEFE_RH"]>>;
    ubicacion_ids: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    activo: z.ZodOptional<z.ZodBoolean>;
}, "strip", z.ZodTypeAny, {
    email?: string | undefined;
    nombre?: string | undefined;
    apellidos?: string | undefined;
    rol?: "SUPER_USUARIO" | "ADMIN" | "ENCARGADO" | "VENDEDOR" | "ALMACENISTA" | "JEFE_MANUFACTURA" | "JEFE_RH" | undefined;
    activo?: boolean | undefined;
    ubicacion_ids?: string[] | undefined;
}, {
    email?: string | undefined;
    nombre?: string | undefined;
    apellidos?: string | undefined;
    rol?: "SUPER_USUARIO" | "ADMIN" | "ENCARGADO" | "VENDEDOR" | "ALMACENISTA" | "JEFE_MANUFACTURA" | "JEFE_RH" | undefined;
    activo?: boolean | undefined;
    ubicacion_ids?: string[] | undefined;
}>;
export declare const ResetPasswordSchema: z.ZodObject<{
    nueva_password: z.ZodString;
}, "strip", z.ZodTypeAny, {
    nueva_password: string;
}, {
    nueva_password: string;
}>;
export type RolUsuario = z.infer<typeof RolUsuarioSchema>;
export type CreateUsuarioDto = z.infer<typeof CreateUsuarioSchema>;
export type UpdateUsuarioDto = z.infer<typeof UpdateUsuarioSchema>;
export type ResetPasswordDto = z.infer<typeof ResetPasswordSchema>;
//# sourceMappingURL=usuario.schema.d.ts.map