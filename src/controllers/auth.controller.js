// ============================================================
//  Autenticación
//
//  Maneja el inicio y cierre de sesión del Administrador y Guardia.
//  Utiliza JWTs para mantener la sesión del usuario.
//  El token de acceso (accessToken) se guarda en una cookie httpOnly
//  y se renueva automáticamente con un refresh token.
// ============================================================

import bcrypt from 'bcrypt'
import jwt from 'jsonwebtoken'
import pool from '../config/db.js'

// Opciones para las cookies de autenticación
const cookieOpts = (maxAge) => ({
    httpOnly: true, // No accesible desde JavaScript del cliente
    secure: process.env.NODE_ENV === 'production', // Solo se envía por HTTPS en producción
    sameSite: process.env.NODE_ENV === 'production' ? 'strict' : 'lax', // Protección CSRF
    maxAge, // Duración de la cookie en milisegundos
})

// POST /api/auth/login
export const login = async (req, res) => {
    const { correo, password } = req.body

    if (!correo || !password) {
        return res.status(400).json({ error: 'Correo y contraseña requeridos' })
    }

    try {
        // Buscar el usuario en sistema_usuarios por su correo.
        const result = await pool.query(
            `SELECT sistema_uid, nombre, apellido, correo, rol, password_hash
                FROM sistema_usuarios
                WHERE correo = $1`,
            [correo]
        )

        if (result.rows.length === 0) {
            return res.status(401).json({ error: 'Credenciales incorrectas' })
        }

        const user = result.rows[0]

        // Verificar la contraseña usando bcrypt.compare, que compara el password plano con el hash almacenado.
        const passwordValido = await bcrypt.compare(password, user.password_hash)
        if (!passwordValido) {
            return res.status(401).json({ error: 'Credenciales incorrectas' })
        }

        // Crear el payload del JWT con la información mínima necesaria (sistema_uid y rol).
        const payload = {
            sistema_uid: user.sistema_uid,
            rol: user.rol,
        }

        // Generar el access token y el refresh token usando jsonwebtoken.
        const accessToken = jwt.sign(payload, process.env.JWT_SECRET, {
            expiresIn: process.env.JWT_EXPIRES_IN,
        })

        // El refresh token se firma con una clave diferente y tiene una duración más larga.
        const refreshToken = jwt.sign(payload, process.env.JWT_REFRESH_SECRET, {
            expiresIn: process.env.JWT_REFRESH_EXPIRES_IN,
        })

        // Guardar el refresh token en la base de datos para poder invalidarlo en el futuro (logout).
        // También actualizamos el campo ultimo_acceso para llevar un registro de la última vez que el usuario inició sesión.
        await pool.query(
            `UPDATE sistema_usuarios
       SET refresh_token = $1, ultimo_acceso = NOW()
       WHERE sistema_uid = $2`,
            [refreshToken, user.sistema_uid]
        )

        // Enviar los tokens al cliente en cookies httpOnly.
        res.cookie('accessToken', accessToken, cookieOpts(15 * 60 * 1000))
        res.cookie('refreshToken', refreshToken, cookieOpts(7 * 24 * 60 * 60 * 1000))

        // Responder con la información del usuario (sin el password ni el refresh token).
        res.json({
            usuario: {
                nombre: user.nombre,
                apellido: user.apellido,
                rol: user.rol,
            },
        })
    } catch (err) {
        console.error(err)
        res.status(500).json({ error: 'Error interno del servidor' })
    }
}

// POST /api/auth/logout
// Cierr sesion Elimina el refresh token de la base de datos y borra las cookies de autenticación.
export const logout = async (req, res) => {
    const refreshToken = req.cookies?.refreshToken
    try {
        if (refreshToken) {
            // Eliminar el refresh token de la base de datos para invalidar la sesión.
            await pool.query(
                `UPDATE sistema_usuarios SET refresh_token = NULL WHERE refresh_token = $1`,
                [refreshToken]
            )
        }
        // Borrar las cookies de autenticación en el cliente.
        res.clearCookie('accessToken', cookieOpts(0))
        res.clearCookie('refreshToken', cookieOpts(0))
        res.json({ mensaje: 'Sesión cerrada correctamente' })
    } catch (err) {
        console.error(err)
        res.status(500).json({ error: 'Error interno del servidor' })
    }
}

// POST /api/auth/refresh
// Renueva el access token usando el refresh token. Verifica que el refresh token sea válido y exista en la base de datos.
export const refresh = async (req, res) => {
    const refreshToken = req.cookies?.refreshToken

    if (!refreshToken) {
        return res.status(401).json({ error: 'Refresh token no encontrado' })
    }

    try {
        // Buscar el refresh token en la base de datos para verificar que sea válido y no haya sido revocado (logout).
        const result = await pool.query(
            `SELECT sistema_uid, rol FROM sistema_usuarios WHERE refresh_token = $1`,
            [refreshToken]
        )

        if (result.rows.length === 0) {
            return res.status(401).json({ error: 'Refresh token inválido o revocado' })
        }

        // Verificar que el refresh token sea válido y no haya expirado.
        jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET)

        const { sistema_uid, rol } = result.rows[0]

        // Generar un nuevo access token con la misma información del usuario.
        const newAccessToken = jwt.sign(
            { sistema_uid, rol },
            process.env.JWT_SECRET,
            { expiresIn: process.env.JWT_EXPIRES_IN }
        )

        // Enviar el nuevo access token al cliente en una cookie httpOnly.
        res.cookie('accessToken', newAccessToken, cookieOpts(15 * 60 * 1000))
        res.json({ mensaje: 'Token renovado' })
    } catch {
        return res.status(401).json({ error: 'Refresh token inválido o expirado' })
    }
}

// ─── GET /api/auth/me ─────────────────────────────────────────────────────────
// Verifica si hay sesión activa y devuelve los datos básicos del usuario.
// El frontend lo usa al cargar cada página protegida para verificar
// que el token sigue siendo válido antes de mostrar el contenido.
export const me = async (req, res) => {
    try {
        const result = await pool.query(
            `SELECT nombre, apellido, rol FROM sistema_usuarios WHERE sistema_uid = $1`,
            [req.usuario.sistema_uid]
        )
        if (result.rows.length === 0) {
            return res.status(401).json({ error: 'Usuario no encontrado' })
        }
        res.json({ usuario: result.rows[0] })
    } catch (err) {
        console.error(err)
        res.status(500).json({ error: 'Error interno del servidor' })
    }
}