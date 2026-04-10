// ============================================================
//  Consultas del Guardia
//
//  El guardia solo puede buscar vehículos por placa.
//  No puede crear, editar ni eliminar registros.
//  Esa restricción se aplica en las rutas (guardia.routes.js)
//  — simplemente no existen las rutas POST, PUT ni DELETE
//  para el guardia, así que aunque lo intente, recibirá 404.
// ============================================================

import pool from '../config/db.js'

// ─── GET /api/guardia/vehiculos/:placa ────────────────────────────────────────
// Solo lectura — busca un vehículo por placa y devuelve vehículo + dueño
export const buscarPorPlaca = async (req, res) => {
    const { placa } = req.params
    try {
        const result = await pool.query(
            `SELECT * FROM vista_vehiculo_por_placa WHERE placa = $1`,
            [placa.toUpperCase()] // Convertimos la placa a mayúsculas para evitar problemas de coincidencia
        )
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Vehículo no encontrado' })
        }
        res.json(result.rows[0])
    } catch (err) {
        console.error(err)
        res.status(500).json({ error: 'Error al buscar el vehículo' })
    }
}