import type { CookieOptions, RequestHandler, Response } from 'express';
import { env } from '../../config/env.js';
import { AppError } from '../../shared/errors/AppError.js';
import type {
  EstablecerContrasenaBody,
  LoginBody,
  OlvidoBody,
  RegistroBody,
  VerificarTokenBody,
} from './auth.schemas.js';
import { authService } from './auth.service.js';
import type { ResultadoSesion } from './auth.types.js';
import { extraerBearer } from './tokens.js';

export const COOKIE_REFRESH = 'refreshToken';

/** HttpOnly; Secure; SameSite=Strict; Path=/api/auth: solo viaja a las rutas de auth. */
const opcionesCookie: CookieOptions = {
  httpOnly: true,
  secure: true,
  sameSite: 'strict',
  path: '/api/auth',
};

function ponerCookieRefresh(res: Response, refreshToken: string): void {
  res.cookie(COOKIE_REFRESH, refreshToken, {
    ...opcionesCookie,
    maxAge: env.REFRESH_TOKEN_DAYS * 86_400_000,
  });
}

function borrarCookieRefresh(res: Response): void {
  res.clearCookie(COOKIE_REFRESH, opcionesCookie);
}

function leerCookieRefresh(cookies: unknown): string | undefined {
  const valor = (cookies as Record<string, unknown> | undefined)?.[COOKIE_REFRESH];
  return typeof valor === 'string' && valor.length > 0 ? valor : undefined;
}

/** Login: cookie de refresh y el resto en el body. */
function responderSesion(res: Response, status: number, sesion: ResultadoSesion): void {
  const { refreshToken, ...cuerpo } = sesion;
  ponerCookieRefresh(res, refreshToken);
  res.setHeader('Cache-Control', 'no-store');
  res.status(status).json(cuerpo);
}

/** Misma respuesta exista o no el correo: la API no revela qué correos tienen cuenta. */
const MENSAJE_REGISTRO =
  'Si el correo puede registrarse, te enviamos un mensaje con el enlace para crear tu contraseña.';
const MENSAJE_OLVIDO =
  'Si el correo tiene una cuenta, te enviamos un mensaje con el enlace para restablecer tu contraseña.';

export const authController = {
  registro: (async (_req, res) => {
    const { body } = res.locals.validado as { body: RegistroBody };
    await authService.registrar(body);
    res.status(202).json({ mensaje: MENSAJE_REGISTRO });
  }) satisfies RequestHandler,

  olvido: (async (_req, res) => {
    const { body } = res.locals.validado as { body: OlvidoBody };
    await authService.solicitarRestablecimiento(body.correo);
    res.status(202).json({ mensaje: MENSAJE_OLVIDO });
  }) satisfies RequestHandler,

  verificarToken: (async (_req, res) => {
    const { body } = res.locals.validado as { body: VerificarTokenBody };
    res.setHeader('Cache-Control', 'no-store');
    res.json(await authService.verificarToken(body.token));
  }) satisfies RequestHandler,

  establecerContrasena: (async (_req, res) => {
    const { body } = res.locals.validado as { body: EstablecerContrasenaBody };
    await authService.establecerContrasena(body.token, body.contrasena);
    res.status(204).end();
  }) satisfies RequestHandler,

  login: (async (_req, res) => {
    const { body } = res.locals.validado as { body: LoginBody };
    responderSesion(res, 200, await authService.login(body.correo, body.contrasena));
  }) satisfies RequestHandler,

  refresh: (async (req, res) => {
    try {
      const { refreshToken, ...cuerpo } = await authService.refrescar(
        leerCookieRefresh(req.cookies),
      );
      ponerCookieRefresh(res, refreshToken);
      res.setHeader('Cache-Control', 'no-store');
      res.json(cuerpo);
    } catch (error) {
      // Una sesión que ya no sirve no debe seguir en el navegador.
      if (
        error instanceof AppError &&
        (error.code === 'REFRESH_INVALIDO' || error.code === 'USUARIO_INACTIVO')
      ) {
        borrarCookieRefresh(res);
      }
      throw error;
    }
  }) satisfies RequestHandler,

  logout: (async (req, res) => {
    await authService.logout({
      refreshToken: leerCookieRefresh(req.cookies),
      accessToken: extraerBearer(req.headers.authorization),
    });
    borrarCookieRefresh(res);
    res.status(204).end();
  }) satisfies RequestHandler,

  me: (async (req, res) => {
    const { valor, hit } = await authService.obtenerUsuarioActual(req.usuario!.idUsuario);
    res.setHeader('X-Cache', hit ? 'HIT' : 'MISS');
    res.setHeader('Cache-Control', 'no-store');
    res.json(valor);
  }) satisfies RequestHandler,
};
