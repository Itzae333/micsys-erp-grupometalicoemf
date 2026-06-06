"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.UpdateEmpresaSchema = exports.CreateEmpresaSchema = void 0;
const zod_1 = require("zod");
exports.CreateEmpresaSchema = zod_1.z.object({
    nombre: zod_1.z.string().min(1, 'El nombre es requerido').max(100),
    razon_social: zod_1.z.string().min(1, 'La razón social es requerida').max(200),
    rfc: zod_1.z
        .string()
        .min(12, 'RFC inválido')
        .max(13, 'RFC inválido')
        .regex(/^[A-Z&Ñ]{3,4}\d{6}[A-Z\d]{3}$/, 'Formato de RFC inválido'),
});
exports.UpdateEmpresaSchema = exports.CreateEmpresaSchema.partial();
//# sourceMappingURL=empresa.schema.js.map