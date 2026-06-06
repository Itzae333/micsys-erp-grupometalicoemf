import {
  Controller,
  Post,
  Get,
  Body,
  Req,
  Res,
  HttpCode,
  HttpStatus,
  UseGuards,
  SetMetadata,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiCookieAuth } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { Public } from '../common/decorators/public.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { SKIP_EMPRESA_UBICACION_KEY } from '../common/guards/empresa-ubicacion.guard';
import type { JwtPayload } from './types/jwt-payload.type';

const SkipEmpresaUbicacion = () => SetMetadata(SKIP_EMPRESA_UBICACION_KEY, true);

@ApiTags('Auth')
@Controller('auth')
@UseGuards(JwtAuthGuard)
export class AuthController {
  constructor(private auth: AuthService) {}

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Iniciar sesión' })
  async login(@Body() dto: LoginDto, @Res({ passthrough: true }) res: Response) {
    const result = await this.auth.login(dto.email, dto.password);

    res.cookie('refresh_token', result.refresh_token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 7 * 24 * 60 * 60 * 1000,
      path: '/api/v1/auth',
    });

    return {
      access_token: result.access_token,
      usuario: result.usuario,
    };
  }

  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiCookieAuth('refresh_token')
  @ApiOperation({ summary: 'Renovar access token' })
  async refresh(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const refreshToken = req.cookies?.['refresh_token'] as string | undefined;
    if (!refreshToken) {
      return res.status(HttpStatus.UNAUTHORIZED).json({ message: 'Refresh token no encontrado' });
    }

    const result = await this.auth.refresh(refreshToken);

    res.cookie('refresh_token', result.refresh_token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 7 * 24 * 60 * 60 * 1000,
      path: '/api/v1/auth',
    });

    return { access_token: result.access_token };
  }

  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiBearerAuth()
  @SkipEmpresaUbicacion()
  @ApiOperation({ summary: 'Cerrar sesión' })
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const refreshToken = req.cookies?.['refresh_token'] as string | undefined;
    if (refreshToken) {
      await this.auth.logout(refreshToken);
    }
    res.clearCookie('refresh_token', { path: '/api/v1/auth' });
  }

  @Get('me')
  @ApiBearerAuth()
  @SkipEmpresaUbicacion()
  @ApiOperation({ summary: 'Usuario autenticado + permisos' })
  me(@CurrentUser() user: JwtPayload) {
    return this.auth.me(user.sub);
  }
}
