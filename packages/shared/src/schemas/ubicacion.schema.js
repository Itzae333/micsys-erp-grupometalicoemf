"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.UpdateUbicacionSchema = exports.CreateUbicacionSchema = exports.TipoUbicacionSchema = void 0;
const zod_1 = require("zod");
exports.TipoUbicacionSchema = zod_1.z.enum(['MATRIZ', 'FABRICA', 'PUNTO_VENTA']);
exports.CreateUbicacionSchema = zod_1.z.object({
    nombre: zod_1.z.string().min(1, 'El nombre es requerido').max(100),
    tipo: exports.TipoUbicacionSchema,
    razon_social: zod_1.z.string().max(200).optional(),
    rfc: zod_1.z.string().max(13).optional(),
    regimen_fiscal: zod_1.z.string().max(200).optional(),
    calle: zod_1.z.string().max(200).optional(),
    num_ext: zod_1.z.string().max(20).optional(),
    num_int: zod_1.z.string().max(20).optional(),
    colonia: zod_1.z.string().max(100).optional(),
    municipio: zod_1.z.string().max(100).optional(),
    estado: zod_1.z.string().max(100).optional(),
    cp: zod_1.z.string().max(10).optional(),
    telefono: zod_1.z.string().max(20).optional(),
});
exports.UpdateUbicacionSchema = exports.CreateUbicacionSchema.partial();
//# sourceMappingURL=ubicacion.schema.js.map