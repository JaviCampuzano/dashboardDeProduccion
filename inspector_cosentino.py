"""
InspectorCalidadCosentino — con integración Strapi
====================================================
Uso:
    python inspector_cosentino.py --batch-id 13 --referencias fotos_maestras --lote placa2

Argumentos:
    --batch-id      ID numérico del lote en Strapi (campo 'id', no 'idBatch')
    --referencias   Carpeta con imágenes maestras de referencia
    --lote          Carpeta con imágenes del lote a analizar
    --strapi-url    URL base de Strapi (por defecto: http://localhost:1337)
    --reporte       Nombre del CSV de salida (por defecto: reporte_calidad.csv)
    --dry-run       Si se activa, no envía datos a Strapi (solo muestra en consola)
"""

import cv2
import numpy as np
import os
import csv
import glob
import math
import json
import argparse
import requests
from datetime import date

# ─── Constantes ───────────────────────────────────────────────────────────────

LIMITE_APROBACION = 90.0   # Umbral universal: una pieza necesita ≥90% en tono Y luz


# ─── Inspector ────────────────────────────────────────────────────────────────

class InspectorCalidadCosentino:
    def __init__(self, strapi_url: str = "http://localhost:1337"):
        self.limite_aprobacion = LIMITE_APROBACION
        self.patrones_maestros_lab = []
        self.tamano_estandar = None
        self.strapi_url = strapi_url.rstrip("/")

    # ── Imagen ────────────────────────────────────────────────────────────────

    def cargar_y_preparar(self, ruta_imagen: str):
        if not os.path.exists(ruta_imagen):
            raise FileNotFoundError(f"No se encontró la imagen: {ruta_imagen}")
        img = cv2.imread(ruta_imagen)
        if img is None:
            raise ValueError(f"No se pudo leer la imagen: {ruta_imagen}")
        if self.tamano_estandar is not None and img.shape[:2] != self.tamano_estandar:
            img = cv2.resize(img, (self.tamano_estandar[1], self.tamano_estandar[0]))
        return img

    def obtener_coordenadas_lab(self, img):
        """Convierte a L*a*b* CIE y devuelve los promedios de canal."""
        lab = cv2.cvtColor(img, cv2.COLOR_BGR2LAB)
        l_canal, a_canal, b_canal = cv2.split(lab)
        l_promedio = np.mean(l_canal) * 100.0 / 255.0
        a_promedio = np.mean(a_canal) - 128.0
        b_promedio = np.mean(b_canal) - 128.0
        return l_promedio, a_promedio, b_promedio

    # ── Calibración ───────────────────────────────────────────────────────────

    def calibrar_patrones(self, carpeta_referencias: str):
        print(f"\n⚙️  Calibrando Patrones Maestros en '{carpeta_referencias}'...")
        archivos = glob.glob(os.path.join(carpeta_referencias, "*"))
        rutas_ref = [f for f in archivos if os.path.splitext(f)[1].lower() in ['.jpg', '.jpeg', '.png']]

        if not rutas_ref:
            raise ValueError(f"No se encontraron imágenes en '{carpeta_referencias}'.")

        self.patrones_maestros_lab = []
        for i, ruta in enumerate(sorted(rutas_ref)):
            img = self.cargar_y_preparar(ruta)
            if i == 0:
                self.tamano_estandar = img.shape[:2]
            l, a, b = self.obtener_coordenadas_lab(img)
            self.patrones_maestros_lab.append((l, a, b))
            print(f"   Patrón {i+1}: {os.path.basename(ruta):<25} L*={l:.2f}  a*={a:.2f}  b*={b:.2f}")

        print(f"✅ {len(self.patrones_maestros_lab)} patrón/es registrado/s.\n")

    # ── Comparación ───────────────────────────────────────────────────────────

    def comparar_contra_maestros(self, img_prueba):
        """
        Compara una imagen contra todos los patrones maestros.
        Devuelve (delta_e, porc_tono, porc_luz, pasa_todo).
        """
        l_prueba, a_prueba, b_prueba = self.obtener_coordenadas_lab(img_prueba)
        mejor_delta_e = float('inf')
        mejor_dif_luz = float('inf')

        for (l_maestro, a_maestro, b_maestro) in self.patrones_maestros_lab:
            delta_e = math.sqrt(
                (l_prueba - l_maestro) ** 2 +
                (a_prueba - a_maestro) ** 2 +
                (b_prueba - b_maestro) ** 2
            )
            dif_luz = abs(l_prueba - l_maestro)
            if delta_e < mejor_delta_e:
                mejor_delta_e = delta_e
                mejor_dif_luz = dif_luz

        porc_tono = max(0.0, 100.0 - (mejor_delta_e * 1.5))
        porc_luz  = max(0.0, 100.0 - (mejor_dif_luz  * 1.5))
        pasa_todo = (porc_tono >= self.limite_aprobacion) and (porc_luz >= self.limite_aprobacion)

        return mejor_delta_e, porc_tono, porc_luz, pasa_todo

    # ── Strapi ────────────────────────────────────────────────────────────────

    def crear_pieza_en_strapi(
        self,
        batch_id: int,
        nombre_archivo: str,
        index: int,
        delta_e: float,
        porc_tono: float,
        porc_luz: float,
        pasa: bool,
        sku: str | None = None,
        dry_run: bool = False,
        batch_doc_id: str | None = None,
    ) -> dict | None:
        """
        Crea un registro de pieza en Strapi con los resultados del análisis.
        Strapi v5: las relaciones se vinculan por documentId, no por id numérico.
        Campos mapeados:
            surface_brightness  ← porc_luz  (% similitud de luminosidad)
            tone_homogeneity    ← porc_tono (% similitud de tono/color)
            quality_status      ← 'Homogéneo' | 'Riesgo Tonal'
            ai_recommendation   ← texto resumen del análisis
        """
        estado = "Homogéneo" if pasa else "Riesgo Tonal"
        recomendacion = (
            f"Delta E: {delta_e:.2f} | Tono: {porc_tono:.1f}% | Luz: {porc_luz:.1f}% | "
            + ("Pieza dentro de tolerancia." if pasa else
               f"ATENCIÓN: {'Tono' if porc_tono < LIMITE_APROBACION else 'Brillo'} fuera de umbral (90%).")
        )

        # Strapi v5: relación por documentId si está disponible, sino por id numérico
        batch_ref = batch_doc_id if batch_doc_id else batch_id

        payload = {
            "data": {
                "sku": sku or f"AUTO-{batch_id}-{index:04d}",
                "batch": batch_ref,
                "surface_brightness": str(round(porc_luz,  2)),
                "tone_homogeneity":   str(round(porc_tono, 2)),
                "quality_status":     estado,
                "ai_recommendation":  recomendacion,
                "inspection_date":    date.today().isoformat(),
                "publishedAt":        date.today().isoformat(),
            }
        }

        if dry_run:
            print(f"   [DRY-RUN] POST /api/pieces → {json.dumps(payload['data'], ensure_ascii=False)}")
            return None

        try:
            url = f"{self.strapi_url}/api/pieces"
            r = requests.post(url, json=payload, timeout=10)
            r.raise_for_status()
            data = r.json()
            piece = data.get("data", {})
            print(f"   ✅ Pieza #{piece.get('id')} ({sku}) creada — Tono:{porc_tono:.1f}% Luz:{porc_luz:.1f}%")
            return data
        except requests.RequestException as e:
            print(f"   ❌ Error al crear pieza en Strapi: {e}")
            return None

    def actualizar_pieza_en_strapi(
        self,
        document_id: str,
        delta_e: float,
        porc_tono: float,
        porc_luz: float,
        pasa: bool,
        dry_run: bool = False,
    ) -> dict | None:
        estado = "Homogéneo" if pasa else "Riesgo Tonal"
        recomendacion = (
            f"Delta E: {delta_e:.2f} | Tono: {porc_tono:.1f}% | Luz: {porc_luz:.1f}% | "
            + ("Pieza dentro de tolerancia." if pasa else
               f"ATENCIÓN: {'Tono' if porc_tono < LIMITE_APROBACION else 'Brillo'} fuera de umbral (90%).")
        )

        payload = {
            "data": {
                "surface_brightness": str(round(porc_luz,  2)),
                "tone_homogeneity":   str(round(porc_tono, 2)),
                "quality_status":     estado,
                "ai_recommendation":  recomendacion,
                "inspection_date":    date.today().isoformat(),
            }
        }

        if dry_run:
            print(f"   [DRY-RUN] PUT /api/pieces/{document_id} → {json.dumps(payload['data'], ensure_ascii=False)}")
            return None

        try:
            url = f"{self.strapi_url}/api/pieces/{document_id}"
            r = requests.put(url, json=payload, timeout=10)
            r.raise_for_status()
            data = r.json()
            print(f"   ✅ Pieza actualizada ({document_id}) — Tono:{porc_tono:.1f}% Luz:{porc_luz:.1f}%")
            return data
        except requests.RequestException as e:
            print(f"   ❌ Error al actualizar pieza en Strapi: {e}")
            return None

    def actualizar_estado_lote(self, batch_id: int, pasa: bool, dry_run: bool = False, batch_doc_id: str | None = None):
        """Actualiza el ai_status del lote en Strapi al terminar el análisis."""
        nuevo_estado = "Homogéneo" if pasa else "Pendiente de Revisión"

        batch_ref = batch_doc_id if batch_doc_id else batch_id

        if dry_run:
            print(f"\n[DRY-RUN] PUT /api/batches/{batch_ref} → ai_status={nuevo_estado}")
            return

        try:
            url = f"{self.strapi_url}/api/batches/{batch_ref}"
            r = requests.put(url, json={"data": {"ai_status": nuevo_estado}}, timeout=10)
            r.raise_for_status()
            print(f"\n✅ Estado del lote actualizado a '{nuevo_estado}' en Strapi.")
        except requests.RequestException as e:
            print(f"\n❌ Error al actualizar lote en Strapi: {e}")

    # ── Evaluación del lote ───────────────────────────────────────────────────

    def evaluar_lote_produccion(
        self,
        carpeta_lote: str,
        batch_id: int,
        ruta_reporte: str = "reporte_calidad.csv",
        dry_run: bool = False,
    ):
        print(f"🔍 Analizando lote #{batch_id} en: '{carpeta_lote}'\n")

        archivos = glob.glob(os.path.join(carpeta_lote, "*"))
        rutas_pruebas = sorted([
            f for f in archivos
            if os.path.splitext(f)[1].lower() in ['.jpg', '.jpeg', '.png']
        ])

        if not rutas_pruebas:
            print("⚠️  No se encontraron imágenes válidas.")
            return

        aprobadas, rechazadas = 0, 0
        total_delta, total_tono, total_luz = 0.0, 0.0, 0.0
        ancho = 100

        print("-" * ancho)
        print(f"| {'Archivo':<22} | {'Delta E':>8} | {'% Tono':>8} | {'% Luz':>8} | {'Estado':<18} | Strapi |")
        print("-" * ancho)

        with open(ruta_reporte, mode='w', newline='', encoding='utf-8') as csv_file:
            writer = csv.writer(csv_file, delimiter=';')
            writer.writerow(['Archivo', 'Delta_E', 'Similitud_Tono_%', 'Similitud_Luz_%', 'Estado'])

            for i, ruta in enumerate(rutas_pruebas):
                nombre = os.path.basename(ruta)
                try:
                    img = self.cargar_y_preparar(ruta)
                    delta_e, porc_tono, porc_luz, pasa = self.comparar_contra_maestros(img)

                    total_delta += delta_e
                    total_tono  += porc_tono
                    total_luz   += porc_luz

                    estado = "HOMOGÉNEO" if pasa else "RIESGO TONAL"
                    if pasa:
                        aprobadas += 1
                    else:
                        rechazadas += 1

                    writer.writerow([nombre, f"{delta_e:.2f}", f"{porc_tono:.2f}", f"{porc_luz:.2f}", estado])

                    str_tono = f"{porc_tono:>5.1f}{'(!)' if porc_tono < LIMITE_APROBACION else '   '}"
                    str_luz  = f"{porc_luz:>5.1f}{'(!)' if porc_luz  < LIMITE_APROBACION else '   '}"

                    # → Enviar a Strapi
                    resultado = self.crear_pieza_en_strapi(
                        batch_id=batch_id,
                        nombre_archivo=nombre,
                        index=i + 1,
                        delta_e=delta_e,
                        porc_tono=porc_tono,
                        porc_luz=porc_luz,
                        pasa=pasa,
                        sku=os.path.splitext(nombre)[0],
                        dry_run=dry_run,
                    )
                    strapi_ok = "✅" if (resultado or dry_run) else "❌"

                    print(f"| {nombre[:22]:<22} | {delta_e:>8.2f} | {str_tono:>8} | {str_luz:>8} | {estado:<18} | {strapi_ok}     |")

                except Exception as e:
                    print(f"| {nombre[:22]:<22} | ERROR: {e}")

        n = len(rutas_pruebas)
        lote_ok = (total_tono / n) >= LIMITE_APROBACION and (total_luz / n) >= LIMITE_APROBACION

        print("-" * ancho)
        print(f"\nPROMEDIOS DEL LOTE #{batch_id}:")
        print(f"   Delta E (Físico):   {total_delta / n:.2f}")
        print(f"   Similitud Tonal:    {total_tono  / n:.2f}%")
        print(f"   Similitud de Luz:   {total_luz   / n:.2f}%")
        print(f"\nRESUMEN: {n} analizadas | {aprobadas} Homogéneas | {rechazadas} Con Riesgo")
        print(f"\n📄 Reporte CSV guardado en: {ruta_reporte}")

        # → Actualizar estado del lote en Strapi
        self.actualizar_estado_lote(batch_id, lote_ok, dry_run=dry_run, batch_doc_id=batch_doc_id)


# ─── Entry point ──────────────────────────────────────────────────────────────

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Inspector de Calidad Cosentino — integración Strapi")
    parser.add_argument("--batch-id",    type=int,   required=True,                        help="ID del lote en Strapi")
    parser.add_argument("--referencias", type=str,   default="fotos_maestras",             help="Carpeta con imágenes de referencia")
    parser.add_argument("--lote",        type=str,   default="placa2",                     help="Carpeta con imágenes del lote")
    parser.add_argument("--strapi-url",  type=str,   default="http://localhost:1337",      help="URL base de Strapi")
    parser.add_argument("--reporte",     type=str,   default="reporte_calidad.csv",        help="Nombre del archivo CSV de salida")
    parser.add_argument("--dry-run",     action="store_true",                              help="Simular sin escribir en Strapi")
    args = parser.parse_args()

    # Crear carpetas si no existen
    for carpeta in [args.referencias, args.lote]:
        if not os.path.exists(carpeta):
            os.makedirs(carpeta)
            print(f"📁 Carpeta creada: {carpeta}")

    inspector = InspectorCalidadCosentino(strapi_url=args.strapi_url)

    if not os.listdir(args.referencias):
        print(f"⚠️  Coloca al menos 1 imagen de referencia en '{args.referencias}' y vuelve a ejecutar.")
    else:
        inspector.calibrar_patrones(args.referencias)
        inspector.evaluar_lote_produccion(
            carpeta_lote=args.lote,
            batch_id=args.batch_id,
            ruta_reporte=args.reporte,
            dry_run=args.dry_run,
        )
