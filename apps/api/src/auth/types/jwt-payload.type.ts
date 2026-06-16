import type { RolUsuario } from '@grupometalicoemf/database';

export interface JwtPayload {
  sub: string;
  email: string;
  nombre: string;
  apellidos: string;
  rol: RolUsuario;
  empresa_id: string;
  ubicacion_ids: string[];
  allowed_ips: string[];
}
