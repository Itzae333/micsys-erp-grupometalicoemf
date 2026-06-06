"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RefreshTokenSchema = exports.LoginSchema = void 0;
const zod_1 = require("zod");
exports.LoginSchema = zod_1.z.object({
    email: zod_1.z.string().email('Correo electrónico inválido'),
    password: zod_1.z.string().min(1, 'La contraseña es requerida'),
});
exports.RefreshTokenSchema = zod_1.z.object({
    refresh_token: zod_1.z.string().min(1),
});
//# sourceMappingURL=auth.schema.js.map