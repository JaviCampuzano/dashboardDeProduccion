"""
watcher_cosentino.py — Vigilante automático de lotes
=====================================================
Monitoriza la carpeta 'lotes/' en busca de nuevas imágenes.
Cuando detecta que un lote tiene fotos nuevas (y patrones maestros disponibles),
ejecuta el análisis CIELAB automáticamente y sube los resultados a Strapi.

Estructura de carpetas esperada:
    lotes/
    ├── _maestras/          ← imágenes de referencia (compartidas por todos los lotes)
    │   ├── patron1.jpg
    │   └── patron2.jpg
    ├── L2-P2/              ← fotos del lote idBatch="L2-P2"
    │   ├── placa1.jpg
    │   └── placa2.jpg
    └── OTRO-LOTE/
        └── ...

Uso:
    python3 watcher_cosentino.py
    python3 watcher_cosentino.py --lotes-dir ./lotes --strapi-url http://localhost:1337
    python3 watcher_cosentino.py --dry-run   # simula sin escribir en Strapi
"""

import os
import sys
import time
import json
import argparse
import logging
import requests
from pathlib import Path
from collections import defaultdict
from datetime import datetime

# Importar el inspector
sys.path.insert(0, os.path.dirname(__file__))
from inspector_cosentino import InspectorCalidadCosentino

# ─── Logging ──────────────────────────────────────────────────────────────────

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s  %(levelname)-8s  %(message)s',
    datefmt='%H:%M:%S',
)
log = logging.getLogger('watcher')

# ─── Extensiones válidas ───────────────────────────────────────────────────────

IMAGE_EXTS = {'.jpg', '.jpeg', '.png'}

# ─── Strapi helpers ───────────────────────────────────────────────────────────

def buscar_batch_por_idBatch(strapi_url: str, id_batch_str: str) -> tuple[int, str] | None:
    """
    Busca un lote en Strapi por su campo idBatch (texto).
    Devuelve (id numérico, documentId) o None si no existe.
    En Strapi v5 las relaciones se vinculan por documentId.
    """
    try:
        url = f"{strapi_url}/api/batches"
        params = {
            "filters[idBatch][$eq]": id_batch_str,
            "pagination[pageSize]": 1,
        }
        r = requests.get(url, params=params, timeout=8)
        r.raise_for_status()
        data = r.json().get("data", [])
        if data:
            return data[0]["id"], data[0]["documentId"]
    except Exception as e:
        log.warning(f"No se pudo buscar lote '{id_batch_str}' en Strapi: {e}")
    return None


# ─── Estado del watcher ───────────────────────────────────────────────────────

class EstadoWatcher:
    """Persiste qué archivos ya han sido analizados para no reprocesarlos."""

    def __init__(self, ruta: str = ".watcher_estado.json"):
        self.ruta = ruta
        self._estado: dict[str, list[str]] = self._cargar()

    def _cargar(self) -> dict:
        if os.path.exists(self.ruta):
            try:
                with open(self.ruta, encoding="utf-8") as f:
                    return json.load(f)
            except Exception:
                pass
        return {}

    def _guardar(self):
        with open(self.ruta, "w", encoding="utf-8") as f:
            json.dump(self._estado, f, indent=2)

    def ya_procesado(self, carpeta_lote: str, archivo: str) -> bool:
        return archivo in self._estado.get(carpeta_lote, [])

    def marcar_procesado(self, carpeta_lote: str, archivos: list[str]):
        if carpeta_lote not in self._estado:
            self._estado[carpeta_lote] = []
        for a in archivos:
            if a not in self._estado[carpeta_lote]:
                self._estado[carpeta_lote].append(a)
        self._guardar()


# ─── Watcher principal ────────────────────────────────────────────────────────

class WatcherCosentino:
    def __init__(
        self,
        lotes_dir: str = "./lotes",
        strapi_url: str = "http://localhost:1337",
        intervalo: int = 10,
        dry_run: bool = False,
    ):
        self.lotes_dir   = Path(lotes_dir).resolve()
        self.maestras_dir = self.lotes_dir / "_maestras"
        self.strapi_url  = strapi_url.rstrip("/")
        self.intervalo   = intervalo
        self.dry_run     = dry_run
        self.estado      = EstadoWatcher(str(self.lotes_dir / ".watcher_estado.json"))

    def _imgs_de_carpeta(self, carpeta: Path) -> list[Path]:
        """Devuelve lista de imágenes válidas en una carpeta."""
        return sorted([
            f for f in carpeta.iterdir()
            if f.is_file() and f.suffix.lower() in IMAGE_EXTS
        ])

    def _tiene_maestras(self) -> bool:
        if not self.maestras_dir.exists():
            return False
        return bool(self._imgs_de_carpeta(self.maestras_dir))

    def _archivos_nuevos(self, nombre_lote: str, carpeta: Path) -> list[Path]:
        """Filtra imágenes que aún no han sido procesadas."""
        todas = self._imgs_de_carpeta(carpeta)
        return [f for f in todas if not self.estado.ya_procesado(nombre_lote, f.name)]

    def analizar_lote(self, nombre_lote: str, carpeta_lote: Path, nuevas: list[Path]):
        """Crea un inspector temporal y analiza solo las imágenes nuevas."""
        log.info(f"🔍 Analizando lote '{nombre_lote}' — {len(nuevas)} imagen(es) nueva(s)...")

        # Buscar id numérico y documentId del lote en Strapi (v5 usa documentId para relaciones)
        resultado_batch = buscar_batch_por_idBatch(self.strapi_url, nombre_lote)
        if resultado_batch is None:
            log.warning(
                f"⚠️  Lote '{nombre_lote}' no encontrado en Strapi. "
                "Asegúrate de que el campo idBatch coincide con el nombre de la carpeta."
            )
            if not self.dry_run:
                return
            batch_id, batch_doc_id = 0, "dry-run"
        else:
            batch_id, batch_doc_id = resultado_batch
            log.info(f"   🔗 Lote encontrado → id={batch_id}  documentId={batch_doc_id}")

        inspector = InspectorCalidadCosentino(strapi_url=self.strapi_url)

        try:
            inspector.calibrar_patrones(str(self.maestras_dir))
        except Exception as e:
            log.error(f"Error calibrando patrones maestros: {e}")
            return

        aprobadas = 0
        rechazadas = 0
        procesadas = []

        for i, ruta_img in enumerate(nuevas):
            try:
                img = inspector.cargar_y_preparar(str(ruta_img))
                delta_e, porc_tono, porc_luz, pasa = inspector.comparar_contra_maestros(img)

                estado = "HOMOGÉNEO" if pasa else "RIESGO TONAL"
                simbolo = "✅" if pasa else "⚠️ "
                log.info(
                    f"   {simbolo} {ruta_img.name:<28} "
                    f"ΔE={delta_e:.2f}  Tono={porc_tono:.1f}%  Luz={porc_luz:.1f}%  → {estado}"
                )

                inspector.crear_pieza_en_strapi(
                    batch_id=batch_id,
                    batch_doc_id=batch_doc_id,
                    nombre_archivo=ruta_img.name,
                    index=i + 1,
                    delta_e=delta_e,
                    porc_tono=porc_tono,
                    porc_luz=porc_luz,
                    pasa=pasa,
                    sku=ruta_img.stem,
                    dry_run=self.dry_run,
                )

                if pasa:
                    aprobadas += 1
                else:
                    rechazadas += 1

                procesadas.append(ruta_img.name)

            except Exception as e:
                log.error(f"   ❌ Error procesando {ruta_img.name}: {e}")

        # Marcar como procesadas
        self.estado.marcar_procesado(nombre_lote, procesadas)

        # Actualizar estado del lote
        lote_ok = aprobadas > 0 and rechazadas == 0
        if procesadas:
            inspector.actualizar_estado_lote(batch_id, lote_ok, dry_run=self.dry_run, batch_doc_id=batch_doc_id)

        log.info(
            f"✅ Lote '{nombre_lote}': {aprobadas} homogéneas, "
            f"{rechazadas} con riesgo. Estado → "
            f"{'Homogéneo' if lote_ok else 'Pendiente de Revisión'}"
        )

    def escanear(self):
        """Un ciclo de escaneo de todos los sub-directorios de lotes/."""
        if not self.lotes_dir.exists():
            log.warning(f"Carpeta '{self.lotes_dir}' no existe. Esperando...")
            return

        if not self._tiene_maestras():
            log.warning(
                f"Sin imágenes maestras en '{self.maestras_dir}'. "
                "Añade al menos 1 foto de referencia."
            )
            return

        for carpeta in sorted(self.lotes_dir.iterdir()):
            # Ignorar carpeta de maestras y archivos sueltos
            if not carpeta.is_dir() or carpeta.name.startswith("_") or carpeta.name.startswith("."):
                continue

            nuevas = self._archivos_nuevos(carpeta.name, carpeta)
            if nuevas:
                self.analizar_lote(carpeta.name, carpeta, nuevas)

    def run(self):
        log.info("=" * 60)
        log.info("🚀 Watcher Cosentino iniciado")
        log.info(f"   Carpeta de lotes : {self.lotes_dir}")
        log.info(f"   Maestras         : {self.maestras_dir}")
        log.info(f"   Strapi URL       : {self.strapi_url}")
        log.info(f"   Intervalo        : {self.intervalo}s")
        log.info(f"   Dry-run          : {self.dry_run}")
        log.info("=" * 60)

        while True:
            try:
                self.escanear()
                self.escanear_piezas_bd()
            except KeyboardInterrupt:
                log.info("⏹  Watcher detenido.")
                break
            except Exception as e:
                log.error(f"Error en ciclo de escaneo: {e}")

            time.sleep(self.intervalo)

    def escanear_piezas_bd(self):
        """Busca piezas sin analizar (creadas vía defectos/manual) y las procesa."""
        if not self._tiene_maestras() or self.dry_run:
            return

        try:
            url = f"{self.strapi_url}/api/pieces?filters[$or][0][surface_brightness][$null]=true&filters[$or][1][tone_homogeneity][$null]=true&populate[defects][populate]=image"
            r = requests.get(url, timeout=10)
            if not r.ok:
                return
            
            data = r.json().get("data", [])
            if not data:
                return

            inspector = InspectorCalidadCosentino(strapi_url=self.strapi_url)
            calibrado = False

            for piece in data:
                doc_id = piece.get("documentId")
                defects = piece.get("defects", [])
                
                # Buscar imagen en los defectos asociados
                img_url = None
                for d in defects:
                    images = d.get("image", [])
                    if images and isinstance(images, list) and len(images) > 0:
                        img_url = images[0].get("url")
                        break
                
                if not img_url:
                    continue  # Si no hay imagen, no podemos usar el algoritmo CIELAB

                if img_url.startswith("/"):
                    img_url = f"{self.strapi_url}{img_url}"

                if not calibrado:
                    inspector.calibrar_patrones(str(self.maestras_dir))
                    calibrado = True

                log.info(f"🔄 Analizando pieza {piece.get('sku')} desde Strapi (Defecto)")
                
                # Descargar imagen temporalmente a tmp
                temp_path = f"/tmp/piece_{doc_id}.jpg"
                try:
                    img_data = requests.get(img_url, timeout=15).content
                    with open(temp_path, "wb") as f:
                        f.write(img_data)
                    
                    img_cv = inspector.cargar_y_preparar(temp_path)
                    delta_e, porc_tono, porc_luz, pasa = inspector.comparar_contra_maestros(img_cv)
                    
                    inspector.actualizar_pieza_en_strapi(
                        document_id=doc_id,
                        delta_e=delta_e,
                        porc_tono=porc_tono,
                        porc_luz=porc_luz,
                        pasa=pasa,
                        dry_run=self.dry_run
                    )
                except Exception as e:
                    log.error(f"   ❌ Error analizando pieza remota {piece.get('sku')}: {e}")
                finally:
                    if os.path.exists(temp_path):
                        os.remove(temp_path)

        except Exception as e:
            log.error(f"Error escaneando piezas en BD: {e}")


# ─── Entry point ──────────────────────────────────────────────────────────────

if __name__ == "__main__":
    parser = argparse.ArgumentParser(
        description="Watcher automático de lotes Cosentino"
    )
    parser.add_argument(
        "--lotes-dir", default="./lotes",
        help="Ruta a la carpeta raíz de lotes (default: ./lotes)"
    )
    parser.add_argument(
        "--strapi-url", default="http://localhost:1337",
        help="URL de Strapi (default: http://localhost:1337)"
    )
    parser.add_argument(
        "--intervalo", type=int, default=10,
        help="Segundos entre escaneos (default: 10)"
    )
    parser.add_argument(
        "--dry-run", action="store_true",
        help="Simula sin escribir en Strapi"
    )
    args = parser.parse_args()

    watcher = WatcherCosentino(
        lotes_dir=args.lotes_dir,
        strapi_url=args.strapi_url,
        intervalo=args.intervalo,
        dry_run=args.dry_run,
    )
    watcher.run()
