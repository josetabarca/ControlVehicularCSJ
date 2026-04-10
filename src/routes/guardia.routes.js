// ============================================================
//  Rutas del Guardia
//
//  Todas las rutas aquí requieren:
//  1. Token JWT válido (verificarToken)
//  2. Que el rol en el token sea 'Guardia' (soloGuardia)
//
//  El guardia solo tiene acceso de lectura.
//  No existen rutas POST, PUT ni DELETE en este archivo,
//  por lo que el guardia no puede modificar ningún dato.
//
//  Endpoints disponibles:
//  GET /api/guardia/vehiculos/:placa → Buscar vehículo por placa exacta
// ============================================================

import { Router } from 'express'
import { verificarToken, soloGuardia } from '../middlewares/auth.js'
import { buscarPorPlaca } from '../controllers/guardia.controller.js'

const router = Router()
router.use(verificarToken, soloGuardia)

// GET /api/guardia/vehiculos/:placa → Solo lectura — busca un vehículo por placa y devuelve vehículo + dueño
router.get('/vehiculos/:placa', buscarPorPlaca)

export default router