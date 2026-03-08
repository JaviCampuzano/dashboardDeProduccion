import fs from 'fs';
import path from 'path';

/**
 * Directorio raíz donde se almacenan las fotos de los lotes.
 * Ruta: <proyecto_strapi>/lotes/<idBatch>/
 */
const LOTES_ROOT = path.join(process.cwd(), '..', 'lotes');
const MAESTRAS_ROOT = path.join(process.cwd(), '..', 'lotes', '_maestras');

function ensureDir(dirPath: string) {
    if (!fs.existsSync(dirPath)) {
        fs.mkdirSync(dirPath, { recursive: true });
    }
}

export default {
    async afterCreate(event: any) {
        const { result } = event;
        const idBatch = result.idBatch ?? `lote_${result.id}`;

        try {
            // Crear carpeta raíz de lotes si no existe
            ensureDir(LOTES_ROOT);

            // Crear carpeta de patrones maestros si no existe
            ensureDir(MAESTRAS_ROOT);

            // Crear carpeta específica del lote: lotes/<idBatch>/
            const carpetaLote = path.join(LOTES_ROOT, idBatch);
            ensureDir(carpetaLote);

            // Crear README con instrucciones dentro de la carpeta
            const readme = path.join(carpetaLote, 'INSTRUCCIONES.txt');
            if (!fs.existsSync(readme)) {
                fs.writeFileSync(
                    readme,
                    [
                        `LOTE: ${idBatch} (ID Strapi: ${result.id})`,
                        `Fecha creación: ${new Date().toISOString()}`,
                        '',
                        'INSTRUCCIONES:',
                        '  1. Coloca en esta carpeta las fotos de las placas de este lote.',
                        '  2. El watcher detectará automáticamente las nuevas imágenes.',
                        '  3. El análisis CIELAB se ejecutará y los resultados se subirán a Strapi.',
                        '',
                        'Formatos aceptados: .jpg, .jpeg, .png',
                        '',
                        `Carpeta de patrones maestros: lotes/_maestras/`,
                        '  (Asegúrate de tener al menos 1 imagen de referencia ahí)',
                    ].join('\n')
                );
            }

            strapi.log.info(
                `📁 Carpeta de lote creada: lotes/${idBatch}/`
            );
        } catch (err) {
            strapi.log.error(`Error creando carpeta del lote ${idBatch}:`, err);
        }
    },
};
