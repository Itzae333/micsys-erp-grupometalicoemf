"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ConfigColumnasSchemaResponseSchema = exports.ColumnaSchemaItemSchema = exports.UpsertConfigColumnasSchema = exports.ConfigColumnaItemSchema = exports.TipoColumnaSchema = void 0;
const zod_1 = require("zod");
exports.TipoColumnaSchema = zod_1.z.enum(['PRECIO', 'EXISTENCIA', 'DESCRIPCION']);
exports.ConfigColumnaItemSchema = zod_1.z.object({
    tipo: exports.TipoColumnaSchema,
    numero: zod_1.z.number().int().min(1).max(10),
    label: zod_1.z.string().min(1, 'El label es requerido').max(50),
    activa: zod_1.z.boolean(),
    orden: zod_1.z.number().int().min(0),
});
exports.UpsertConfigColumnasSchema = zod_1.z.object({
    columnas: zod_1.z
        .array(exports.ConfigColumnaItemSchema)
        .refine((cols) => {
        const precios = cols.filter((c) => c.tipo === 'PRECIO');
        const existencias = cols.filter((c) => c.tipo === 'EXISTENCIA');
        const descripciones = cols.filter((c) => c.tipo === 'DESCRIPCION');
        return (precios.every((c) => c.numero <= 10) &&
            existencias.every((c) => c.numero <= 5) &&
            descripciones.every((c) => c.numero <= 5));
    }, {
        message: 'Máximos: 10 precios, 5 existencias, 5 descripciones',
    }),
});
// Shape del endpoint /schema — lo que consume el frontend de inventario
exports.ColumnaSchemaItemSchema = zod_1.z.object({
    numero: zod_1.z.number(),
    label: zod_1.z.string(),
    activa: zod_1.z.boolean(),
});
exports.ConfigColumnasSchemaResponseSchema = zod_1.z.object({
    precios: zod_1.z.array(exports.ColumnaSchemaItemSchema),
    existencias: zod_1.z.array(exports.ColumnaSchemaItemSchema),
    descripciones: zod_1.z.array(exports.ColumnaSchemaItemSchema),
});
//# sourceMappingURL=config-columnas.schema.js.map