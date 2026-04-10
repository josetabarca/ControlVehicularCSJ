// ============================================================
//  Rutas del Administrador
//
//  Todas las rutas aqui requieren:
//  1. Token JWT válido (verificarToken)
//  2. Que el rol en el token sea 'Administrador' (soloAdmin)
//
//  router.use() aplica los middlewares a TODAS las rutas
//  definidas después de esa línea en este archivo.
//
//  Endpoints disponibles:
//  GET    /api/admin/vehiculos              → Lista paginada o búsqueda por placa
//  POST   /api/admin/vehiculos              → Crear alumno + vehículo + documentos
//  PUT    /api/admin/vehiculos/:placa       → Editar alumno + vehículo + documentos
//  DELETE /api/admin/vehiculos/:placa       → Eliminar registro completo
// ============================================================

import { Router } from 'express'
import { verificarToken, soloAdmin } from '../middlewares/auth.js'
import { uploadDocumentos } from '../config/cloudinary.js'
import {
    listarVehiculos,
    crearVehiculo,
    editarVehiculo,
    eliminarVehiculo,
} from '../controllers/vehiculos.controller.js'

const router = Router()
// Aplicamos los middlewares de autenticación y autorización a todas las rutas de este router.
router.use(verificarToken, soloAdmin)

// Configuración de Multer para recibir los archivos de documentos en memoria (Buffer).
const camposDocumentos = uploadDocumentos.fields([
    { name: 'ine', maxCount: 1 },
    { name: 'licencia', maxCount: 1 },
    { name: 'poliza', maxCount: 1 },
    { name: 'tarjeta', maxCount: 1 },
    { name: 'responsiva', maxCount: 1 },
])

// ── Vehículos ─────────────────────────────────────────────────────────────────

// GET sin parámetros → lista paginada: ?page=1&limit=5
// GET con ?placa=    → búsqueda parcial por placa
router.get('/vehiculos', listarVehiculos)

// POST → body: form-data con campos de texto + archivos
router.post('/vehiculos', camposDocumentos, crearVehiculo)

// PUT → :placa es la placa del vehículo (ej: /vehiculos/SDF5861)
// body: form-data con solo los campos a actualizar (no es necesario mandar todos)
router.put('/vehiculos/:placa', camposDocumentos, editarVehiculo)

// DELETE → elimina el alumno, su vehículo, documentos en BD y archivos en Cloudinary
router.delete('/vehiculos/:placa', eliminarVehiculo)

export default router