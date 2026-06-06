import { z } from 'zod';
export declare const CreateEmpresaSchema: z.ZodObject<{
    nombre: z.ZodString;
    razon_social: z.ZodString;
    rfc: z.ZodString;
}, "strip", z.ZodTypeAny, {
    nombre: string;
    razon_social: string;
    rfc: string;
}, {
    nombre: string;
    razon_social: string;
    rfc: string;
}>;
export declare const UpdateEmpresaSchema: z.ZodObject<{
    nombre: z.ZodOptional<z.ZodString>;
    razon_social: z.ZodOptional<z.ZodString>;
    rfc: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    nombre?: string | undefined;
    razon_social?: string | undefined;
    rfc?: string | undefined;
}, {
    nombre?: string | undefined;
    razon_social?: string | undefined;
    rfc?: string | undefined;
}>;
export type CreateEmpresaDto = z.infer<typeof CreateEmpresaSchema>;
export type UpdateEmpresaDto = z.infer<typeof UpdateEmpresaSchema>;
//# sourceMappingURL=empresa.schema.d.ts.map