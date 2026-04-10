// ============================================================
//  CRUD de vehículos
//
//  Contiene toda la lógica para:
//  - Listar vehículos con paginación o buscar por placa
//  - Crear un registro completo: alumno + vehículo + QR + documentos
//  - Editar datos del alumno, vehículo y/o documentos
//  - Eliminar el registro completo y limpiar Cloudinary
//  - Buscar un vehículo por placa (Guardia — solo lectura)
//
//  Transacciones de base de datos:
//  Las operaciones que afectan varias tablas usan transacciones.
//  Si algo falla en medio del proceso, se hace ROLLBACK y ningún
//  cambio parcial queda guardado en la BD.
//  BEGIN → operaciones → COMMIT (éxito) o ROLLBACK (error)
// ============================================================

import QRCode from 'qrcode' // Para generar códigos QR a partir del vehiculo_id
import pool from '../config/db.js'
import { cloudinary, subirBuffer, eliminarCarpeta } from '../config/cloudinary.js'

// ─── Validaciones ─────────────────────────────────────────────────────────────
// Patrones para validar formularios.
const patterns = {
    nombre: /^[a-zA-Z\s]{2,30}$/, // Solo letras y espacios, entre 2 y 30 caracteres
    apellido: /^[a-zA-ZÀ-ÿ\u00f1\u00d1\s]{2,60}$/, // Letras (incluyendo acentos y ñ) y espacios, entre 2 y 60 caracteres
    telefono: /^\d{3}-\d{3}-\d{4}$/, // Formato de teléfono: 123-456-7890
    correo: /^[^\s@]+@[^\s@]+\.[^\s@]+$/, // Validación básica de correo electrónico
    placa: /^[A-Z0-9]{1,7}$/, // Placas de 1 a 7 caracteres, solo mayúsculas y números
    marca: /^[a-zA-ZÀ-ÿ\u00f1\u00d1\s]{1,30}$/, // Letras (incluyendo acentos y ñ) y espacios, entre 1 y 30 caracteres
    modelo: /^[a-zA-Z0-9\s]{1,20}$/, // Letras, números y espacios, entre 1 y 20 caracteres
    color: /^[a-zA-ZÀ-ÿ\u00f1\u00d1\s]{1,30}$/, // Letras (incluyendo acentos y ñ) y espacios, entre 1 y 30 caracteres
}

const gradosValidos = ['1°', '2°', '3°'] // Grados escolares permitidos
const gruposValidos = ['A', 'B', 'C', 'D'] // Grupos escolares permitidos

// Función auxiliar para validar un campo con un patrón. Devuelve un mensaje de error o null si es válido.
const validar = (campo, valor, patron) =>
    patron.test(valor) ? null : `El campo '${campo}' no tiene un formato válido`

// Función para generar el nombre de la carpeta en Cloudinary según el vehiculo_id
const carpeta = (vehiculo_id) => `acceso-vehicular/documentos/${vehiculo_id}`

// ─── GET /api/admin/vehiculos ─────────────────────────────────────────────────
// Sin parámetros:  devuelve lista paginada (5, 10 o 20 registros por página)
// Con ?placa=ABC:  busca vehículos cuya placa contenga ese texto
export const listarVehiculos = async (req, res) => {
    const { placa, page = 1, limit = 5 } = req.query // Parámetros de consulta: placa para búsqueda, page y limit para paginación
    const limitesPermitidos = [5, 10, 20] // Límites de registros por página permitidos
    const limitNum = limitesPermitidos.includes(Number(limit)) ? Number(limit) : 5 // Validar el límite, por defecto 5
    const offset = (Number(page) - 1) * limitNum // Calcular el offset para la consulta SQL

    try {
        if (placa) {
            const result = await pool.query(
                `SELECT * FROM vista_vehiculos_lista WHERE placa ILIKE $1`,
                [`%${placa}%`]
            )
            if (result.rowCount === 0) {
                return res.status(404).json({ error: 'No se encontró ningún vehículo con esa placa' })
            }
            return res.json({ data: result.rows, total: result.rowCount })
        }

        // Si no se proporciona placa, devolver la lista paginada. Usamos Promise.all para ejecutar 
        // ambas consultas en paralelo: una para los datos paginados y otra para el conteo total de registros.
        const [data, count] = await Promise.all([
            pool.query(
                `SELECT * FROM vista_vehiculos_lista ORDER BY fecha_registro DESC LIMIT $1 OFFSET $2`,
                [limitNum, offset]
            ),
            pool.query(`SELECT COUNT(*) FROM vehiculos`),
        ])

        // Devolvemos los datos junto con la información de paginación: total de registros, página actual, 
        // límite por página y total de páginas.
        res.json({
            data: data.rows,
            total: Number(count.rows[0].count),
            page: Number(page),
            limit: limitNum,
            totalPages: Math.ceil(Number(count.rows[0].count) / limitNum),
        })
    } catch (err) {
        console.error(err)
        res.status(500).json({ error: 'Error al obtener vehículos' })
    }
}

// ─── POST /api/admin/vehiculos ────────────────────────────────────────────────
// Crea un registro completo en una sola operación:
// 1. Valida todos los campos y documentos
// 2. Inserta el alumno en 'usuarios'
// 3. Inserta el vehículo en 'vehiculos'
// 4. Genera el código QR y lo sube a Cloudinary
// 5. Sube los 5 documentos a Cloudinary
// 6. Inserta las URLs en 'documentos_vehiculo'
// Todo dentro de una transacción — si algo falla, nada se guarda.
export const crearVehiculo = async (req, res) => {
    const { nombre, apellido, correo, telefono, grado, grupo, marca, modelo, color, placa } = req.body
    const files = req.files || {}

    const errores = []

    // Datos del alumno
    if (!nombre) errores.push("El campo 'nombre' es requerido")
    else { const e = validar('nombre', nombre, patterns.nombre); if (e) errores.push(e) }

    if (!apellido) errores.push("El campo 'apellido' es requerido")
    else { const e = validar('apellido', apellido, patterns.apellido); if (e) errores.push(e) }

    if (!correo) errores.push("El campo 'correo' es requerido")
    else { const e = validar('correo', correo, patterns.correo); if (e) errores.push(e) }

    if (!telefono) errores.push("El campo 'telefono' es requerido")
    else { const e = validar('telefono', telefono, patterns.telefono); if (e) errores.push(e) }

    if (!grado || !gradosValidos.includes(grado))
        errores.push(`El campo 'grado' es requerido (${gradosValidos.join(', ')})`)

    if (!grupo || !gruposValidos.includes(grupo))
        errores.push(`El campo 'grupo' es requerido (${gruposValidos.join(', ')})`)

    // Datos del vehículo
    if (!marca) errores.push("El campo 'marca' es requerido")
    else { const e = validar('marca', marca, patterns.marca); if (e) errores.push(e) }

    if (!modelo) errores.push("El campo 'modelo' es requerido")
    else { const e = validar('modelo', modelo, patterns.modelo); if (e) errores.push(e) }

    if (!color) errores.push("El campo 'color' es requerido")
    else { const e = validar('color', color, patterns.color); if (e) errores.push(e) }

    if (!placa) errores.push("El campo 'placa' es requerido")
    else { const e = validar('placa', placa.toUpperCase(), patterns.placa); if (e) errores.push(e) }

    // Todos los documentos requeridos al crear
    ;['ine', 'licencia', 'poliza', 'tarjeta', 'responsiva'].forEach(doc => {
        if (!files[doc]) errores.push(`El documento '${doc}' es requerido`)
    })

    if (errores.length > 0) return res.status(400).json({ errores })

    // Usamos una transacción para asegurar que todas las operaciones se completen correctamente.
    const client = await pool.connect()
    try {
        await client.query('BEGIN')

        // 1. Crear alumno
        const usuarioResult = await client.query(
            `INSERT INTO usuarios (nombre, apellido, correo, telefono, grado, grupo)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING uid`,
            [nombre, apellido, correo, telefono, grado, grupo]
        )
        const usuario_id = usuarioResult.rows[0].uid

        // 2. Crear vehículo
        const vehiculoResult = await client.query(
            `INSERT INTO vehiculos (usuario_id, marca, modelo, color, placa)
       VALUES ($1,$2,$3,$4,$5) RETURNING vehiculo_id`,
            [usuario_id, marca, modelo, color, placa.toUpperCase()]
        )
        const vehiculo_id = vehiculoResult.rows[0].vehiculo_id

        // 3. Generar QR automáticamente
        const qrBuffer = await QRCode.toBuffer(vehiculo_id, { type: 'png', width: 300 })
        const qrUpload = await subirBuffer(qrBuffer, {
            folder: carpeta(vehiculo_id), public_id: 'qr', format: 'png',
        })

        // 4. Subir todos los documentos
        const camposMap = {
            ine: 'ine_url', licencia: 'licencia_url', poliza: 'poliza_seguro_url',
            tarjeta: 'tarjeta_circulacion_url', responsiva: 'responsiva_url',
        }
        const docUpdates = { qr_url: qrUpload.secure_url }

        // Usamos Promise.all para subir los documentos en paralelo y esperar a que todos terminen antes de continuar.
        await Promise.all(
            Object.entries(camposMap).map(async ([campo, columna]) => {
                const file = files[campo][0]
                const result = await subirBuffer(file.buffer, {
                    folder: carpeta(vehiculo_id), public_id: campo, format: 'jpg',
                })
                docUpdates[columna] = result.secure_url
            })
        )

        // 5. Insertar documentos
        const colNames = Object.keys(docUpdates).join(', ')
        const colVals = Object.values(docUpdates)
        const colPlaceholders = colVals.map((_, i) => `$${i + 2}`).join(', ')

        await client.query(
            `INSERT INTO documentos_vehiculo (vehiculo_id, ${colNames}) VALUES ($1, ${colPlaceholders})`,
            [vehiculo_id, ...colVals]
        )

        await client.query('COMMIT')
        res.status(201).json({ mensaje: 'Registro creado correctamente', vehiculo_id, usuario_id })
    } catch (err) {
        await client.query('ROLLBACK')
        console.error(err)
        if (err.code === '23505') {
            return res.status(409).json({ error: 'La placa o correo ya están registrados' })
        }
        res.status(500).json({ error: 'Error al crear el registro' })
    } finally {
        client.release()
    }
}

// ─── PUT /api/admin/vehiculos/:placa ─────────────────────────────────────────
// Edita un registro existente. Solo actualiza los campos que lleguen —
// si un campo no viene en el request, su valor en BD no cambia (COALESCE).
// Acepta texto y archivos en el mismo request (multipart/form-data).
export const editarVehiculo = async (req, res) => {
    const { placa } = req.params
    const { nombre, apellido, correo, telefono, grado, grupo, nueva_placa, marca, modelo, color } = req.body
    const files = req.files || {}

    // Validamos solo los campos que se quieran actualizar. Si un campo no viene, no se valida ni se actualiza.
    const errores = []

    // Validamos cada campo solo si se proporciona en el request. Si no se proporciona, lo ignoramos (no es obligatorio actualizarlo).
    if (nombre !== undefined) { const e = validar('nombre', nombre, patterns.nombre); if (e) errores.push(e) }
    if (apellido !== undefined) { const e = validar('apellido', apellido, patterns.apellido); if (e) errores.push(e) }
    if (correo !== undefined) { const e = validar('correo', correo, patterns.correo); if (e) errores.push(e) }
    if (telefono !== undefined) { const e = validar('telefono', telefono, patterns.telefono); if (e) errores.push(e) }
    if (marca !== undefined) { const e = validar('marca', marca, patterns.marca); if (e) errores.push(e) }
    if (modelo !== undefined) { const e = validar('modelo', modelo, patterns.modelo); if (e) errores.push(e) }
    if (color !== undefined) { const e = validar('color', color, patterns.color); if (e) errores.push(e) }
    if (nueva_placa !== undefined) { const e = validar('placa', nueva_placa.toUpperCase(), patterns.placa); if (e) errores.push(e) }
    if (grado !== undefined && !gradosValidos.includes(grado))
        errores.push(`El campo 'grado' debe ser uno de: ${gradosValidos.join(', ')}`)
    if (grupo !== undefined && !gruposValidos.includes(grupo))
        errores.push(`El campo 'grupo' debe ser uno de: ${gruposValidos.join(', ')}`)

    if (errores.length > 0) return res.status(400).json({ errores })

    const client = await pool.connect()
    try {
        await client.query('BEGIN')
        // Buscamos el vehículo por placa para obtener su vehiculo_id y usuario_id. Si no existe, 
        // hacemos ROLLBACK y respondemos con 404.
        const ref = await client.query(
            `SELECT vehiculo_id, usuario_id FROM vehiculos WHERE placa = $1`,
            [placa.toUpperCase()]
        )
        if (ref.rows.length === 0) {
            await client.query('ROLLBACK')
            return res.status(404).json({ error: 'Vehículo no encontrado' })
        }
        const { vehiculo_id, usuario_id } = ref.rows[0]

        // Actualizamos solo los campos que se proporcionen en el request. Usamos COALESCE para mantener el valor actual si no 
        // se proporciona uno nuevo.
        if (nombre || apellido || correo || telefono || grado || grupo) {
            await client.query(
                `UPDATE usuarios SET
           nombre   = COALESCE($1, nombre),
           apellido = COALESCE($2, apellido),
           correo   = COALESCE($3, correo),
           telefono = COALESCE($4, telefono),
           grado    = COALESCE($5, grado),
           grupo    = COALESCE($6, grupo)
         WHERE uid = $7`,
                [nombre, apellido, correo, telefono, grado, grupo, usuario_id]
            )
        }

        if (nueva_placa || marca || modelo || color) {
            await client.query(
                `UPDATE vehiculos SET
           placa  = COALESCE($1, placa),
           marca  = COALESCE($2, marca),
           modelo = COALESCE($3, modelo),
           color  = COALESCE($4, color)
         WHERE vehiculo_id = $5`,
                [nueva_placa?.toUpperCase(), marca, modelo, color, vehiculo_id]
            )
        }

        // Si llegan nuevos archivos, los subimos a Cloudinary y actualizamos las URLs en la tabla documentos_vehiculo.
        const camposMap = {
            ine: 'ine_url', licencia: 'licencia_url', poliza: 'poliza_seguro_url',
            tarjeta: 'tarjeta_circulacion_url', responsiva: 'responsiva_url',
        }
        const docUpdates = {}

        await Promise.all(
            Object.entries(camposMap).map(async ([campo, columna]) => {
                if (!files[campo]) return
                const file = files[campo][0]
                const result = await subirBuffer(file.buffer, {
                    folder: carpeta(vehiculo_id), public_id: campo, format: 'jpg',
                    overwrite: true, invalidate: true,
                })
                docUpdates[columna] = result.secure_url
            })
        )

        // Si se subió un nuevo QR (porque se cambió la placa), lo actualizamos también.
        if (Object.keys(docUpdates).length > 0) {
            const campos = Object.keys(docUpdates).map((k, i) => `${k} = $${i + 1}`)
            const valores = Object.values(docUpdates)
            await client.query(
                `UPDATE documentos_vehiculo SET ${campos.join(', ')} WHERE vehiculo_id = $${valores.length + 1}`,
                [...valores, vehiculo_id]
            )
        }

        // Si se cambió la placa, también necesitamos actualizar el código QR, ya que el QR se genera a partir del vehiculo_id,
        await client.query('COMMIT')
        res.json({ mensaje: 'Registro actualizado correctamente' })
    } catch (err) {
        await client.query('ROLLBACK')
        console.error(err)
        if (err.code === '23505') {
            return res.status(409).json({ error: 'La placa o correo ya están en uso' })
        }
        res.status(500).json({ error: 'Error al actualizar el registro' })
    } finally {
        client.release()
    }
}

// ─── DELETE /api/admin/vehiculos/:placa ───────────────────────────────────────
// Elimina el alumno de la BD (el CASCADE elimina automáticamente su vehículo
// y documentos por la restricción ON DELETE CASCADE del schema).
// También elimina todos los archivos del vehículo en Cloudinary.
export const eliminarVehiculo = async (req, res) => {
    const { placa } = req.params
    const client = await pool.connect()
    try {
        await client.query('BEGIN')

        const ref = await client.query(
            `SELECT v.vehiculo_id, v.usuario_id FROM vehiculos v WHERE v.placa = $1`,
            [placa.toUpperCase()]
        )
        if (ref.rows.length === 0) {
            await client.query('ROLLBACK')
            return res.status(404).json({ error: 'Vehículo no encontrado' })
        }
        const { vehiculo_id, usuario_id } = ref.rows[0]

        // Eliminamos el usuario. Gracias al ON DELETE CASCADE, esto eliminará automáticamente el vehículo y 
        // los documentos relacionados.
        await client.query(`DELETE FROM usuarios WHERE uid = $1`, [usuario_id])
        await client.query('COMMIT')

        // Eliminamos la carpeta completa del vehículo en Cloudinary, incluyendo el QR y todos los documentos.
        eliminarCarpeta(vehiculo_id)

        res.json({ mensaje: 'Registro eliminado correctamente' })
    } catch (err) {
        await client.query('ROLLBACK')
        console.error(err)
        res.status(500).json({ error: 'Error al eliminar el registro' })
    } finally {
        client.release()
    }
}