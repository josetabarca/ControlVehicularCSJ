// ============================================================
//  Rutas de autenticación
//
//  Estas rutas son públicas — no requieren token para acceder.
//  Cualquiera puede intentar hacer login, pero solo tendrá
//  éxito si el correo y contraseña son correctos.
// ============================================================

import { Router } from 'express'
import { login, logout, refresh, me } from '../controllers/auth.controller.js'
import { verificarToken } from '../middlewares/auth.js'

const router = Router()

router.post('/login', login)     // Login con correo y contraseña, devuelve access token en cookie httpOnly
router.post('/logout', logout)   // Logout: elimina el refresh token de la BD y borra las cookies de autenticación
router.post('/refresh', refresh) // Renueva el access token usando el refresh token, devuelve nuevo access token en cookie httpOnly
router.get ('/me',      verificarToken, me) // Verifica sesión activa

export default router