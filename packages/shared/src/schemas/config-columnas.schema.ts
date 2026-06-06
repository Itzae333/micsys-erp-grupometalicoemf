import { z } from 'zod';

export const TipoColumnaSchema = z.enum(['PRECIO', 'EXISTENCIA', 'DESCRIPCION']);

export const ConfigColumnaItemSchema = z.object({
  tipo: TipoColumnaSchema,
  numero: z.number().int().min(1).max(10),
  label: z.string().min(1, 'El label es requerido').max(50),
  activa: z.boolean(),
  orden: z.number().int().min(0),
});

export const UpsertConfigColumnasSchema = z.object({
  columnas: z
    .array(ConfigColumnaItemSchema)
    .refine(
      (cols) => {
        const precios = cols.filter((c) => c.tipo === 'PRECIO');
        const existencias = cols.filter((c) => c.tipo === 'EXISTENCIA');
        const descripciones = cols.filter((c) => c.tipo === 'DESCRIPCION');
        return (
          precios.every((c) => c.numero <= 10) &&
          existencias.every((c) => c.numero <= 5) &&
          descripciones.every((c) => c.numero <= 5)
        );
      },
      {
        message: 'Máximos: 10 precios, 5 existencias, 5 descripciones',
      },
    ),
});

// Shape del endpoint /schema — lo que consume el frontend de inventario
export const ColumnaSchemaItemSchema = z.object({
  numero: z.number(),
  label: z.string(),
  activa: z.boolean(),
});

export const ConfigColumnasSchemaResponseSchema = z.object({
  precios: z.array(ColumnaSchemaItemSchema),
  existencias: z.array(ColumnaSchemaItemSchema),
  descripciones: z.array(ColumnaSchemaItemSchema),
});

export type TipoColumna = z.infer<typeof TipoColumnaSchema>;
export type ConfigColumnaItem = z.infer<typeof ConfigColumnaItemSchema>;
export type UpsertConfigColumnasDto = z.infer<typeof UpsertConfigColumnasSchema>;
export type ConfigColumnasSchemaResponse = z.infer<typeof ConfigColumnasSchemaResponseSchema>;
