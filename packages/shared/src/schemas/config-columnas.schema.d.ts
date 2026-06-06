import { z } from 'zod';
export declare const TipoColumnaSchema: z.ZodEnum<["PRECIO", "EXISTENCIA", "DESCRIPCION"]>;
export declare const ConfigColumnaItemSchema: z.ZodObject<{
    tipo: z.ZodEnum<["PRECIO", "EXISTENCIA", "DESCRIPCION"]>;
    numero: z.ZodNumber;
    label: z.ZodString;
    activa: z.ZodBoolean;
    orden: z.ZodNumber;
}, "strip", z.ZodTypeAny, {
    activa: boolean;
    tipo: "PRECIO" | "EXISTENCIA" | "DESCRIPCION";
    orden: number;
    numero: number;
    label: string;
}, {
    activa: boolean;
    tipo: "PRECIO" | "EXISTENCIA" | "DESCRIPCION";
    orden: number;
    numero: number;
    label: string;
}>;
export declare const UpsertConfigColumnasSchema: z.ZodObject<{
    columnas: z.ZodEffects<z.ZodArray<z.ZodObject<{
        tipo: z.ZodEnum<["PRECIO", "EXISTENCIA", "DESCRIPCION"]>;
        numero: z.ZodNumber;
        label: z.ZodString;
        activa: z.ZodBoolean;
        orden: z.ZodNumber;
    }, "strip", z.ZodTypeAny, {
        activa: boolean;
        tipo: "PRECIO" | "EXISTENCIA" | "DESCRIPCION";
        orden: number;
        numero: number;
        label: string;
    }, {
        activa: boolean;
        tipo: "PRECIO" | "EXISTENCIA" | "DESCRIPCION";
        orden: number;
        numero: number;
        label: string;
    }>, "many">, {
        activa: boolean;
        tipo: "PRECIO" | "EXISTENCIA" | "DESCRIPCION";
        orden: number;
        numero: number;
        label: string;
    }[], {
        activa: boolean;
        tipo: "PRECIO" | "EXISTENCIA" | "DESCRIPCION";
        orden: number;
        numero: number;
        label: string;
    }[]>;
}, "strip", z.ZodTypeAny, {
    columnas: {
        activa: boolean;
        tipo: "PRECIO" | "EXISTENCIA" | "DESCRIPCION";
        orden: number;
        numero: number;
        label: string;
    }[];
}, {
    columnas: {
        activa: boolean;
        tipo: "PRECIO" | "EXISTENCIA" | "DESCRIPCION";
        orden: number;
        numero: number;
        label: string;
    }[];
}>;
export declare const ColumnaSchemaItemSchema: z.ZodObject<{
    numero: z.ZodNumber;
    label: z.ZodString;
    activa: z.ZodBoolean;
}, "strip", z.ZodTypeAny, {
    activa: boolean;
    numero: number;
    label: string;
}, {
    activa: boolean;
    numero: number;
    label: string;
}>;
export declare const ConfigColumnasSchemaResponseSchema: z.ZodObject<{
    precios: z.ZodArray<z.ZodObject<{
        numero: z.ZodNumber;
        label: z.ZodString;
        activa: z.ZodBoolean;
    }, "strip", z.ZodTypeAny, {
        activa: boolean;
        numero: number;
        label: string;
    }, {
        activa: boolean;
        numero: number;
        label: string;
    }>, "many">;
    existencias: z.ZodArray<z.ZodObject<{
        numero: z.ZodNumber;
        label: z.ZodString;
        activa: z.ZodBoolean;
    }, "strip", z.ZodTypeAny, {
        activa: boolean;
        numero: number;
        label: string;
    }, {
        activa: boolean;
        numero: number;
        label: string;
    }>, "many">;
    descripciones: z.ZodArray<z.ZodObject<{
        numero: z.ZodNumber;
        label: z.ZodString;
        activa: z.ZodBoolean;
    }, "strip", z.ZodTypeAny, {
        activa: boolean;
        numero: number;
        label: string;
    }, {
        activa: boolean;
        numero: number;
        label: string;
    }>, "many">;
}, "strip", z.ZodTypeAny, {
    precios: {
        activa: boolean;
        numero: number;
        label: string;
    }[];
    existencias: {
        activa: boolean;
        numero: number;
        label: string;
    }[];
    descripciones: {
        activa: boolean;
        numero: number;
        label: string;
    }[];
}, {
    precios: {
        activa: boolean;
        numero: number;
        label: string;
    }[];
    existencias: {
        activa: boolean;
        numero: number;
        label: string;
    }[];
    descripciones: {
        activa: boolean;
        numero: number;
        label: string;
    }[];
}>;
export type TipoColumna = z.infer<typeof TipoColumnaSchema>;
export type ConfigColumnaItem = z.infer<typeof ConfigColumnaItemSchema>;
export type UpsertConfigColumnasDto = z.infer<typeof UpsertConfigColumnasSchema>;
export type ConfigColumnasSchemaResponse = z.infer<typeof ConfigColumnasSchemaResponseSchema>;
//# sourceMappingURL=config-columnas.schema.d.ts.map