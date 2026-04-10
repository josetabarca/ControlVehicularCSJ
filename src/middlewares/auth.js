// ============================================================
//  Verificación de identidad y permisos
//
//  El middleware se ejecuta ANTES del controller.
//  Si algo falla (no hay token, token inválido, rol incorrecto),
//  responde con error y el controller nunca se ejecuta.
//  Si todo está bien, llama a next() para continuar al controller.
//
//  Flujo de autenticación:
//  Request → verificarToken → soloAdmin/soloGuardia → Controller
//
//  El token JWT viaja en una cookie httpOnly llamada 'accessToken'.
// ============================================================

import jwt from 'jsonwebtoken' // Para verificar y decodificar JWTs

// Verifica que el token JWT sea válido y no haya expirado.
// Si es válido, agrega la información del usuario (sistema_uid y rol) a req.usuario.
// Si no es válido o no existe, responde con 401 Unauthorized.
export const verificarToken = (req, res, next) => {
    const token = req.cookies?.accessToken
    if (!token) {
        return res.status(401).json({ error: 'Token requerido' })
    }
    try {
        // El JWT ahora solo tiene sistema_uid y rol
        req.usuario = jwt.verify(token, process.env.JWT_SECRET)
        next()
    } catch {
        return res.status(401).json({ error: 'Token inválido o expirado' })
    }
}

// Middleware para verificar que el usuario tenga rol "Administrador"
// Si el rol no es correcto, responde con 403.
export const soloAdmin = (req, res, next) => {
    if (req.usuario.rol !== 'Administrador') {
        return res.status(403).json({ error: 'Acceso denegado: se requiere rol Administrador' })
    }
    next()
}

// Middleware para verificar que el usuario tenga rol "Guardia"
// Si el rol no es correcto, responde con 403.
export const soloGuardia = (req, res, next) => {
    if (req.usuario.rol !== 'Guardia') {
        return res.status(403).json({ error: 'Acceso denegado: se requiere rol Guardia' })
    }
    next()
}