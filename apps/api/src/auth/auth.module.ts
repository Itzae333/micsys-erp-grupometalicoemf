import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { APP_GUARD } from '@nestjs/core';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { JwtStrategy } from './jwt.strategy';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { EmpresaUbicacionGuard } from '../common/guards/empresa-ubicacion.guard';
import { IpGuard } from '../common/guards/ip.guard';

@Module({
  imports: [PassportModule, JwtModule.register({})],
  providers: [
    AuthService,
    JwtStrategy,
    // Guards globales — se aplican a todos los endpoints
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
    { provide: APP_GUARD, useClass: EmpresaUbicacionGuard },
    { provide: APP_GUARD, useClass: IpGuard },
  ],
  controllers: [AuthController],
  exports: [AuthService],
})
export class AuthModule {}
