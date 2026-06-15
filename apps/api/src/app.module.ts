import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard } from '@nestjs/throttler';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { EmpresasModule } from './empresas/empresas.module';
import { UbicacionesModule } from './ubicaciones/ubicaciones.module';
import { UsuariosModule } from './usuarios/usuarios.module';
import { ConfigColumnasModule } from './config-columnas/config-columnas.module';
import { ProveedoresModule } from './proveedores/proveedores.module';
import { ArticulosModule } from './articulos/articulos.module';
import { ClientesModule } from './clientes/clientes.module';
import { VentasModule } from './ventas/ventas.module';
import { CuentasModule } from './cuentas/cuentas.module';
import { MovimientosModule } from './movimientos/movimientos.module';
import { ComprasModule } from './compras/compras.module';
import { RhModule } from './rh/rh.module';
import { ReportesModule } from './reportes/reportes.module';
import { MigracionModule } from './migracion/migracion.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 60 }]),
    PrismaModule,
    AuthModule,
    EmpresasModule,
    UbicacionesModule,
    UsuariosModule,
    ConfigColumnasModule,
    ProveedoresModule,
    ArticulosModule,
    ClientesModule,
    VentasModule,
    CuentasModule,
    MovimientosModule,
    ComprasModule,
    RhModule,
    ReportesModule,
    MigracionModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
})
export class AppModule {}
