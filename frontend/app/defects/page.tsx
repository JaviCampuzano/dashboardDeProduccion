'use client';
import { useState, useEffect, useRef } from 'react';
import Sidebar from '../components/Sidebar';
import { useRouter } from 'next/navigation';
import { generatePieceNumber, uploadImage, createDefect, fetchDefectTypes, fetchAllBatches } from '@/lib/api';

interface DefectMarker {
  x: number;
  y: number;
}

interface BatchOption {
  id: number | string;
  idBatch: string;
  materialName: string;
}

interface AIResult {
  detectado: boolean;
  tipo: string | null;
  severidad: 'bajo' | 'medio' | 'alto' | null;
  confianza: number | null;
  descripcion: string | null;
  coincidencia_historica?: boolean;
  usedHistoricalData?: boolean;
  machineDiagnosis: {
    machines: string[];
    instructions: string[];
  } | null;
}

// ─── Canvas: draw image + markers and return as File ─────────────────────────
async function buildAnnotatedImageFile(
  imageSrc: string,
  markers: DefectMarker[],
  originalFileName: string
): Promise<File> {
  return new Promise((resolve, reject) => {
    const img = new window.Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(img, 0, 0);

      markers.forEach((marker, i) => {
        const cx = (marker.x / 100) * canvas.width;
        const cy = (marker.y / 100) * canvas.height;
        const radius = Math.min(canvas.width, canvas.height) * 0.04;

        ctx.beginPath();
        ctx.arc(cx, cy, radius, 0, Math.PI * 2);
        ctx.strokeStyle = '#ef4444';
        ctx.lineWidth = Math.max(3, radius * 0.15);
        ctx.stroke();

        ctx.beginPath();
        ctx.arc(cx, cy, radius, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(239, 68, 68, 0.15)';
        ctx.fill();

        ctx.beginPath();
        ctx.moveTo(cx - radius * 0.5, cy);
        ctx.lineTo(cx + radius * 0.5, cy);
        ctx.moveTo(cx, cy - radius * 0.5);
        ctx.lineTo(cx, cy + radius * 0.5);
        ctx.strokeStyle = '#ef4444';
        ctx.lineWidth = Math.max(2, radius * 0.1);
        ctx.stroke();

        const labelR = radius * 0.4;
        ctx.beginPath();
        ctx.arc(cx + radius * 0.6, cy - radius * 0.6, labelR, 0, Math.PI * 2);
        ctx.fillStyle = '#ef4444';
        ctx.fill();
        ctx.fillStyle = '#fff';
        ctx.font = `bold ${Math.max(10, labelR * 1.4)}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(String(i + 1), cx + radius * 0.6, cy - radius * 0.6);
      });

      const ext = originalFileName.match(/\.(png|gif|webp)$/i)?.[0]?.toLowerCase() ?? '.jpg';
      const mimeType =
        ext === '.png' ? 'image/png' :
          ext === '.gif' ? 'image/gif' :
            ext === '.webp' ? 'image/webp' :
              'image/jpeg';

      canvas.toBlob(
        (blob) => {
          if (!blob) return reject(new Error('Canvas toBlob failed'));
          const annotatedFile = new File(
            [blob],
            originalFileName.replace(/(\.[^.]+)$/, '_annotated$1'),
            { type: mimeType }
          );
          resolve(annotatedFile);
        },
        mimeType,
        0.92
      );
    };
    img.onerror = reject;
    img.src = imageSrc;
  });
}

// Convierte dataURL a base64 puro
function dataURLtoBase64(dataUrl: string): { base64: string; mimeType: string } {
  const [header, base64] = dataUrl.split(',');
  const mimeType = header.match(/:(.*?);/)?.[1] || 'image/jpeg';
  return { base64, mimeType };
}

// ─── Component ────────────────────────────────────────────────────────────────
export default function DefectsPage() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);

  const [batches, setBatches] = useState<BatchOption[]>([]);
  const [selectedBatchId, setSelectedBatchId] = useState<string>('');
  const [loadingBatches, setLoadingBatches] = useState(true);
  const [pieceNumber, setPieceNumber] = useState<string>('');
  const [loadingPiece, setLoadingPiece] = useState(false);
  const [defectTypeOptions, setDefectTypeOptions] = useState<string[]>([]);
  const [loadingDefectTypes, setLoadingDefectTypes] = useState(true);

  const [uploadedImage, setUploadedImage] = useState<string | null>(null);
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [defectMarkers, setDefectMarkers] = useState<DefectMarker[]>([]);

  // AI state
  const [aiResult, setAiResult] = useState<AIResult | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);

  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    defect_type: '',
    severity: 'Medium',
    description: '',
    // Piece specification fields
    dimensions: '',
    thickness: '',
    polishing_grade: '',
    surface_brightness: '',
    tone_homogeneity: '',
  });

  useEffect(() => {
    loadBatches();
    loadDefectTypes();
  }, []);

  useEffect(() => {
    if (selectedBatchId && batches.length > 0) {
      updatePieceNumber(selectedBatchId);
    }
  }, [selectedBatchId, batches]);

  // Auto-fill form after AI analysis
  useEffect(() => {
    if (aiResult?.detectado && aiResult.tipo) {
      setFormData(prev => ({
        ...prev,
        defect_type: prev.defect_type || aiResult.tipo || prev.defect_type,
        severity:
          aiResult.severidad === 'alto' ? 'High' :
            aiResult.severidad === 'medio' ? 'Medium' : 'Low',
        description: prev.description || aiResult.descripcion || '',
      }));
    }
  }, [aiResult]);

  const loadBatches = async () => {
    try {
      setLoadingBatches(true);
      const data = await fetchAllBatches();
      const options: BatchOption[] = data.map((b: any) => {
        const attrs = b.attributes ?? b;
        const matAttrs = attrs.material?.data?.attributes ?? attrs.material ?? {};
        return {
          id: b.documentId || String(b.id),
          idBatch: attrs.idBatch || `Lote #${b.id}`,
          materialName: matAttrs.name || matAttrs.type || 'Sin material',
        };
      });
      setBatches(options);
      if (options.length > 0) setSelectedBatchId(String(options[0].id));
    } catch (error) {
      console.error('Error loading batches:', error);
    } finally {
      setLoadingBatches(false);
    }
  };

  const loadDefectTypes = async () => {
    try {
      setLoadingDefectTypes(true);
      const types = await fetchDefectTypes();
      setDefectTypeOptions(types);
      if (types.length > 0) setFormData(prev => ({ ...prev, defect_type: types[0] }));
    } catch (error) {
      console.error('Error loading defect types:', error);
    } finally {
      setLoadingDefectTypes(false);
    }
  };

  const updatePieceNumber = async (batchId: string) => {
    try {
      setLoadingPiece(true);
      const selectedBatch = batches.find(b => String(b.id) === batchId);
      const pieceNum = await generatePieceNumber(batchId);
      const batchLabel = selectedBatch?.idBatch || 'BATCH';
      setPieceNumber(`${batchLabel}-P${pieceNum.toString().padStart(4, '0')}`);
    } catch (error) {
      console.error('Error generating piece number:', error);
      setPieceNumber('Error');
    } finally {
      setLoadingPiece(false);
    }
  };

  const selectedBatch = batches.find(b => String(b.id) === selectedBatchId);
  const materialType = selectedBatch?.materialName || '—';

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadedFile(file);
    setDefectMarkers([]);
    setAiResult(null);
    setAiError(null);

    const reader = new FileReader();
    reader.onload = async (event) => {
      const dataUrl = event.target?.result as string;
      setUploadedImage(dataUrl);
      // Auto-analyze after upload
      await analyzeImage(dataUrl);
    };
    reader.readAsDataURL(file);
  };

  const analyzeImage = async (dataUrl: string) => {
    setAiLoading(true);
    setAiError(null);
    setAiResult(null);
    try {
      const { base64, mimeType } = dataURLtoBase64(dataUrl);
      const res = await fetch('/api/analyze-defect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageBase64: base64, mimeType }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error del servidor');
      setAiResult(data);
    } catch (err: any) {
      setAiError(err.message || 'Error al analizar la imagen');
    } finally {
      setAiLoading(false);
    }
  };

  const handleImageClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!uploadedImage || !imageRef.current) return;
    const rect = imageRef.current.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;
    setDefectMarkers(prev => [...prev, { x, y }]);
  };

  const removeMarker = (index: number) => {
    setDefectMarkers(prev => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!uploadedFile || !uploadedImage) {
      alert('Por favor, sube una imagen del defecto');
      return;
    }
    if (defectMarkers.length === 0) {
      alert('Por favor, marca la ubicación del defecto en la imagen');
      return;
    }
    try {
      setLoading(true);
      const annotatedFile = await buildAnnotatedImageFile(uploadedImage, defectMarkers, uploadedFile.name);
      const uploadedFiles = await uploadImage(annotatedFile);
      const imageId = uploadedFiles[0]?.id;

      const defectData = {
        pieceId: pieceNumber,
        batch: selectedBatchId || null,
        type: formData.defect_type,
        severity: formData.severity,
        description: formData.description,
        locationX: defectMarkers[0].x.toFixed(2),
        locationY: defectMarkers[0].y.toFixed(2),
        image: imageId,
        aiConfidence: aiResult?.confianza ?? null,
        status: 'En Revisión',
      };

      const defectResult = await createDefect(defectData);

      // ── Save piece specs to the piece that was just created ──
      const pieceDocId =
        defectResult?.data?.pieces?.[0]?.documentId ||
        defectResult?.data?.piece?.documentId ||
        null;
      const hasSpecs = formData.dimensions || formData.thickness ||
        formData.polishing_grade || formData.surface_brightness || formData.tone_homogeneity;

      if (pieceDocId && hasSpecs) {
        try {
          const apiBase = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:1337';
          const token = typeof window !== 'undefined' ? localStorage.getItem('authToken') : null;
          await fetch(`${apiBase}/api/pieces/${pieceDocId}`, {
            method: 'PUT',
            headers: {
              'Content-Type': 'application/json',
              ...(token ? { Authorization: `Bearer ${token}` } : {}),
            },
            credentials: 'include',
            body: JSON.stringify({
              data: {
                ...(formData.dimensions && { dimensions: formData.dimensions }),
                ...(formData.thickness && { thickness: formData.thickness }),
                ...(formData.polishing_grade && { polishing_grade: formData.polishing_grade }),
                ...(formData.surface_brightness && { surface_brightness: formData.surface_brightness }),
                ...(formData.tone_homogeneity && { tone_homogeneity: formData.tone_homogeneity }),
              },
            }),
          });
        } catch (specErr) {
          console.warn('[Defects] Could not save piece specs:', specErr);
        }
      }

      alert('Defecto registrado exitosamente');
      router.push('/');
    } catch (error) {
      console.error('Error al guardar defecto:', error);
      alert('Error al guardar el defecto.');
    } finally {
      setLoading(false);
    }
  };

  const severityColor = (s: string | null) => {
    if (s === 'alto') return 'text-red-600 bg-red-100 dark:bg-red-900/30 dark:text-red-400';
    if (s === 'medio') return 'text-amber-600 bg-amber-100 dark:bg-amber-900/30 dark:text-amber-400';
    return 'text-green-600 bg-green-100 dark:bg-green-900/30 dark:text-green-400';
  };

  return (
    <div className="bg-[--color-background-light] dark:bg-[--color-background-dark] min-h-screen flex">
      <Sidebar />
      <main className="flex-1 ml-64 overflow-y-auto bg-[--color-background-light] dark:bg-[--color-background-dark] p-8">
        <div className="max-w-5xl mx-auto">
          <header className="mb-8">
            <h2 className="text-3xl font-bold text-slate-900 dark:text-slate-100">Registrar Defecto</h2>
            <p className="text-slate-500 dark:text-slate-400">La IA analiza automáticamente la imagen y sugiere el tipo de fallo y la máquina responsable.</p>
          </header>

          <form onSubmit={handleSubmit} className="grid grid-cols-1 lg:grid-cols-12 gap-8">
            {/* ── Left Column ── */}
            <div className="lg:col-span-7 space-y-6">

              {/* Image upload */}
              <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-sm">
                <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center">
                  <h3 className="font-semibold flex items-center gap-2">
                    <span className="material-symbols-outlined text-[--color-primary]">image</span>
                    Evidencia Visual
                  </h3>
                  {uploadedImage && (
                    <div className="flex items-center gap-3">
                      {defectMarkers.length > 0 && (
                        <span className="text-xs text-red-500 font-medium flex items-center gap-1">
                          <span className="material-symbols-outlined text-xs">location_on</span>
                          {defectMarkers.length} marca(s)
                        </span>
                      )}
                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        className="text-xs font-medium text-[--color-primary] hover:underline"
                      >
                        Re-subir Foto
                      </button>
                    </div>
                  )}
                </div>

                <div
                  className="relative aspect-video bg-slate-100 dark:bg-slate-950 flex items-center justify-center overflow-hidden"
                  style={{ cursor: uploadedImage ? 'crosshair' : 'pointer' }}
                  onClick={uploadedImage ? handleImageClick : () => fileInputRef.current?.click()}
                >
                  {!uploadedImage ? (
                    <div className="text-center select-none">
                      <span className="material-symbols-outlined text-6xl text-slate-300">add_photo_alternate</span>
                      <p className="text-slate-400 text-sm mt-2">Haz clic para subir una imagen</p>
                      <p className="text-slate-500 text-xs mt-1">Formatos: JPG, PNG (Max 10MB)</p>
                      <p className="text-slate-500 text-xs mt-1 font-medium text-[--color-primary]">🤖 La IA analizará el defecto automáticamente</p>
                    </div>
                  ) : (
                    <>
                      <img
                        ref={imageRef}
                        src={uploadedImage}
                        alt="Defecto detectado"
                        className="w-full h-full object-contain select-none"
                        draggable={false}
                      />
                      {defectMarkers.map((marker, index) => (
                        <div
                          key={index}
                          className="absolute pointer-events-none"
                          style={{
                            left: `${marker.x}%`,
                            top: `${marker.y}%`,
                            transform: 'translate(-50%, -50%)',
                          }}
                        >
                          <div className="absolute inset-0 w-14 h-14 -translate-x-1/2 -translate-y-1/2 rounded-full border-4 border-red-500 animate-ping opacity-50" />
                          <div className="w-14 h-14 -translate-x-1/2 -translate-y-1/2 rounded-full border-4 border-red-500 bg-red-500/10 absolute inset-0 flex items-center justify-center">
                            <div className="w-4 h-0.5 bg-red-500 absolute" />
                            <div className="w-0.5 h-4 bg-red-500 absolute" />
                          </div>
                          <div className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 rounded-full flex items-center justify-center text-white text-[10px] font-bold pointer-events-auto">
                            {index + 1}
                          </div>
                          <button
                            type="button"
                            className="absolute -bottom-1 -right-1 w-5 h-5 bg-slate-800 hover:bg-red-700 text-white rounded-full flex items-center justify-center text-[10px] font-bold pointer-events-auto transition-colors"
                            onClick={(ev) => { ev.stopPropagation(); removeMarker(index); }}
                            title="Eliminar marca"
                          >
                            ×
                          </button>
                        </div>
                      ))}
                      <div className="absolute bottom-3 left-3 bg-black/65 text-white px-3 py-1.5 rounded-lg text-xs font-medium pointer-events-none select-none">
                        {defectMarkers.length === 0
                          ? '🎯 Haz clic en la imagen para marcar el defecto'
                          : `✅ ${defectMarkers.length} defecto(s) marcado(s)`}
                      </div>
                    </>
                  )}
                </div>

                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleImageUpload}
                  className="hidden"
                />
              </div>

              {/* ── AI Analysis Panel ── */}
              {(aiLoading || aiResult || aiError) && (
                <div className="rounded-xl overflow-hidden border border-slate-200 dark:border-slate-700 shadow-sm">
                  {/* Header */}
                  <div className="flex items-center gap-3 px-5 py-3 bg-slate-900 dark:bg-slate-800">
                    <div className="w-8 h-8 rounded-lg bg-violet-600 flex items-center justify-center flex-shrink-0">
                      <span className="material-symbols-outlined text-white text-base">psychology</span>
                    </div>
                    <div>
                      <p className="text-white font-bold text-sm">Análisis por IA — Gemini Vision</p>
                      <p className="text-slate-400 text-xs">Detección automática de defectos</p>
                    </div>
                    {aiLoading && (
                      <span className="ml-auto material-symbols-outlined text-violet-400 animate-spin">refresh</span>
                    )}
                  </div>

                  {/* Loading */}
                  {aiLoading && (
                    <div className="bg-white dark:bg-slate-900 px-5 py-6 flex items-center gap-3 text-slate-500">
                      <div className="flex gap-1">
                        <span className="w-2 h-2 bg-violet-500 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                        <span className="w-2 h-2 bg-violet-500 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                        <span className="w-2 h-2 bg-violet-500 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                      </div>
                      <span className="text-sm">Analizando imagen con Gemini Vision...</span>
                    </div>
                  )}

                  {/* Error */}
                  {!aiLoading && aiError && (
                    <div className={`bg-white dark:bg-slate-900 px-5 py-4`}>
                      {aiError.includes('Cuota') || aiError.includes('429') || aiError.includes('agotada') ? (
                        <div className="flex items-start gap-3">
                          <span className="material-symbols-outlined text-amber-500 text-2xl flex-shrink-0">schedule</span>
                          <div>
                            <p className="font-bold text-amber-600 dark:text-amber-400 text-sm">Cuota gratuita de Gemini agotada</p>
                            <p className="text-slate-500 dark:text-slate-400 text-sm mt-1">
                              El plan gratuito tiene un límite diario de peticiones. Puedes esperar unos minutos e intentarlo de nuevo, o activar la facturación en{' '}
                              <a href="https://ai.dev/rate-limit" target="_blank" rel="noopener noreferrer" className="text-[--color-primary] underline">ai.dev/rate-limit</a>.
                            </p>
                            <button
                              type="button"
                              onClick={() => uploadedImage && analyzeImage(uploadedImage)}
                              className="mt-3 text-sm font-bold text-amber-600 dark:text-amber-400 border border-amber-400 px-3 py-1.5 rounded-lg hover:bg-amber-50 dark:hover:bg-amber-900/20 flex items-center gap-2 transition-colors"
                            >
                              <span className="material-symbols-outlined text-sm">refresh</span>
                              Reintentar ahora
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="flex items-center gap-3 text-red-500">
                          <span className="material-symbols-outlined">error</span>
                          <p className="text-sm">{aiError}</p>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Result */}
                  {!aiLoading && aiResult && (
                    <div className="bg-white dark:bg-slate-900 divide-y divide-slate-100 dark:divide-slate-800">
                      {/* Detection result */}
                      <div className="px-5 py-4">
                        {/* Historical data indicator */}
                        {aiResult.usedHistoricalData && (
                          <div className="flex items-center gap-1.5 mb-3 text-xs text-violet-600 dark:text-violet-400 bg-violet-50 dark:bg-violet-900/20 px-2.5 py-1 rounded-full w-fit">
                            <span className="material-symbols-outlined text-xs">model_training</span>
                            <span className="font-semibold">Analizado con historial real de la planta</span>
                          </div>
                        )}
                        {aiResult.detectado ? (
                          <div className="flex items-start justify-between gap-4">
                            <div>
                              <div className="flex items-center gap-2 mb-1 flex-wrap">
                                <span className="material-symbols-outlined text-red-500 text-xl">warning</span>
                                <span className="font-bold text-slate-900 dark:text-white text-lg">
                                  {aiResult.tipo}
                                </span>
                                <span className={`text-xs font-bold px-2 py-0.5 rounded-full uppercase ${severityColor(aiResult.severidad)}`}>
                                  {aiResult.severidad}
                                </span>
                                {aiResult.coincidencia_historica && (
                                  <span className="text-xs font-bold bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 px-2 py-0.5 rounded-full flex items-center gap-1">
                                    <span className="material-symbols-outlined text-xs">verified</span>
                                    Patrón conocido de la planta
                                  </span>
                                )}
                              </div>
                              <p className="text-slate-600 dark:text-slate-300 text-sm">{aiResult.descripcion}</p>
                            </div>
                            <div className="flex-shrink-0 text-right">
                              <p className="text-2xl font-black text-violet-600">{aiResult.confianza}%</p>
                              <p className="text-xs text-slate-400">Confianza</p>
                            </div>
                          </div>
                        ) : (
                          <div className="flex items-center gap-3 text-green-600">
                            <span className="material-symbols-outlined text-2xl">check_circle</span>
                            <div>
                              <p className="font-bold">Sin defectos evidentes detectados</p>
                              <p className="text-sm text-slate-500">La IA no detecta fallos claros. Puedes registrar el defecto manualmente.</p>
                            </div>
                          </div>
                        )}
                      </div>

                      {/* Machine diagnosis */}
                      {aiResult.detectado && aiResult.machineDiagnosis && (
                        <div className="px-5 py-4">
                          <div className="flex items-center gap-2 mb-3">
                            <span className="material-symbols-outlined text-amber-500">build</span>
                            <h4 className="font-bold text-slate-900 dark:text-white">Máquina(s) posiblemente afectada(s)</h4>
                          </div>
                          <div className="flex flex-wrap gap-2 mb-4">
                            {aiResult.machineDiagnosis.machines.map((m, i) => (
                              <span key={i} className="bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 text-sm font-semibold px-3 py-1 rounded-full flex items-center gap-1">
                                <span className="material-symbols-outlined text-sm">precision_manufacturing</span>
                                {m}
                              </span>
                            ))}
                          </div>
                          <div className="bg-slate-50 dark:bg-slate-800 rounded-lg p-4">
                            <p className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-3">Instrucciones de revisión</p>
                            <ol className="space-y-2">
                              {aiResult.machineDiagnosis.instructions.map((inst, i) => (
                                <li key={i} className="flex items-start gap-2.5 text-sm text-slate-700 dark:text-slate-300">
                                  <span className="flex-shrink-0 w-5 h-5 rounded-full bg-amber-500 text-white text-xs font-bold flex items-center justify-center mt-0.5">
                                    {i + 1}
                                  </span>
                                  {inst}
                                </li>
                              ))}
                            </ol>
                          </div>
                        </div>
                      )}

                      {/* Re-analyze button */}
                      <div className="px-5 py-3 flex justify-end">
                        <button
                          type="button"
                          onClick={() => uploadedImage && analyzeImage(uploadedImage)}
                          className="text-xs text-violet-600 hover:text-violet-800 font-semibold flex items-center gap-1 hover:underline"
                        >
                          <span className="material-symbols-outlined text-sm">refresh</span>
                          Volver a analizar
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* ── Right Column ── */}
            <div className="lg:col-span-5 space-y-6">
              <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-6 shadow-sm">
                <h3 className="text-lg font-bold mb-6 flex items-center gap-2">
                  <span className="material-symbols-outlined text-[--color-primary]">analytics</span>
                  Detalles de Trazabilidad
                </h3>

                <div className="space-y-4">
                  {/* Nº de Pieza */}
                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5 flex items-center gap-2">
                      Nº de Pieza
                      <span className="text-xs text-green-500 flex items-center gap-1">
                        <span className="material-symbols-outlined text-xs">check_circle</span>
                        Auto-generado
                      </span>
                    </label>
                    <input
                      className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 px-4 py-3 font-mono font-bold text-[--color-primary]"
                      readOnly
                      type="text"
                      value={loadingBatches || loadingPiece ? 'Generando...' : pieceNumber || '—'}
                    />
                  </div>

                  {/* Lote y Material */}
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">Número de Lote</label>
                      <select
                        className="w-full rounded-lg border border-slate-200 dark:border-slate-700 dark:bg-slate-800 focus:ring-[--color-primary] focus:border-[--color-primary] px-4 py-3 text-sm font-medium disabled:opacity-60"
                        value={selectedBatchId}
                        onChange={(e) => setSelectedBatchId(e.target.value)}
                        disabled={loadingBatches}
                        required
                      >
                        {loadingBatches ? (
                          <option value="">Cargando lotes...</option>
                        ) : batches.length > 0 ? (
                          batches.map((b) => (
                            <option key={b.id} value={String(b.id)}>{b.idBatch}</option>
                          ))
                        ) : (
                          <option value="">Sin lotes disponibles</option>
                        )}
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">Tipo de Material</label>
                      <input
                        className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 text-slate-600 dark:text-slate-400 px-4 py-3 text-sm font-medium"
                        readOnly
                        type="text"
                        value={loadingBatches ? 'Cargando...' : materialType}
                      />
                    </div>
                  </div>

                  {/* ── Especificaciones de la pieza ── */}
                  <div className="pt-2">
                    <div className="flex items-center gap-2 mb-3">
                      <span className="material-symbols-outlined text-[--color-primary] text-[18px]">straighten</span>
                      <p className="text-sm font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider">Especificaciones de la pieza</p>
                      <span className="text-[10px] text-slate-400 font-normal">(opcional)</span>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-medium text-slate-500 mb-1">Dimensiones</label>
                        <input
                          type="text"
                          placeholder="ej. 3200x1600mm"
                          className="w-full rounded-lg border border-slate-200 dark:border-slate-700 dark:bg-slate-800 px-3 py-2 text-sm"
                          value={formData.dimensions}
                          onChange={(e) => setFormData({ ...formData, dimensions: e.target.value })}
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-slate-500 mb-1">Espesor</label>
                        <input
                          type="text"
                          placeholder="ej. 20mm"
                          className="w-full rounded-lg border border-slate-200 dark:border-slate-700 dark:bg-slate-800 px-3 py-2 text-sm"
                          value={formData.thickness}
                          onChange={(e) => setFormData({ ...formData, thickness: e.target.value })}
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-slate-500 mb-1">Grado de pulido</label>
                        <select
                          className="w-full rounded-lg border border-slate-200 dark:border-slate-700 dark:bg-slate-800 px-3 py-2 text-sm"
                          value={formData.polishing_grade}
                          onChange={(e) => setFormData({ ...formData, polishing_grade: e.target.value })}
                        >
                          <option value="">— Seleccionar —</option>
                          <option>Brillante</option>
                          <option>Satinado</option>
                          <option>Mate</option>
                          <option>Lavado</option>
                          <option>Honed</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-slate-500 mb-1">Brillo superficial</label>
                        <input
                          type="text"
                          placeholder="ej. 85 GU"
                          className="w-full rounded-lg border border-slate-200 dark:border-slate-700 dark:bg-slate-800 px-3 py-2 text-sm"
                          value={formData.surface_brightness}
                          onChange={(e) => setFormData({ ...formData, surface_brightness: e.target.value })}
                        />
                      </div>
                      <div className="col-span-2">
                        <label className="block text-xs font-medium text-slate-500 mb-1">Homogeneidad de tono</label>
                        <select
                          className="w-full rounded-lg border border-slate-200 dark:border-slate-700 dark:bg-slate-800 px-3 py-2 text-sm"
                          value={formData.tone_homogeneity}
                          onChange={(e) => setFormData({ ...formData, tone_homogeneity: e.target.value })}
                        >
                          <option value="">— Seleccionar —</option>
                          <option>Alta</option>
                          <option>Media</option>
                          <option>Baja</option>
                        </select>
                      </div>
                    </div>
                  </div>

                  {/* Tipo de Defecto */}
                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5 flex items-center gap-2">
                      Tipo de Defecto
                      {aiResult?.detectado && (
                        <span className="text-xs font-bold bg-violet-100 dark:bg-violet-900/30 text-violet-600 dark:text-violet-400 px-2 py-0.5 rounded-full flex items-center gap-1">
                          <span className="material-symbols-outlined text-xs">psychology</span>
                          Sugerido por IA
                        </span>
                      )}
                    </label>
                    <select
                      className="w-full rounded-lg border border-slate-200 dark:border-slate-700 dark:bg-slate-800 focus:ring-[--color-primary] focus:border-[--color-primary] px-4 py-3 disabled:opacity-60"
                      value={formData.defect_type}
                      onChange={(e) => setFormData({ ...formData, defect_type: e.target.value })}
                      required
                      disabled={loadingDefectTypes}
                    >
                      {loadingDefectTypes ? (
                        <option>Cargando tipos...</option>
                      ) : defectTypeOptions.length > 0 ? (
                        defectTypeOptions.map((type) => (
                          <option key={type} value={type}>{type}</option>
                        ))
                      ) : (
                        <option value="">Sin tipos registrados</option>
                      )}
                    </select>
                  </div>

                  {/* Severidad */}
                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5 flex items-center gap-2">
                      Severidad
                      {aiResult?.severidad && (
                        <span className="text-xs font-bold bg-violet-100 dark:bg-violet-900/30 text-violet-600 dark:text-violet-400 px-2 py-0.5 rounded-full flex items-center gap-1">
                          <span className="material-symbols-outlined text-xs">psychology</span>
                          Sugerida por IA
                        </span>
                      )}
                    </label>
                    <select
                      className="w-full rounded-lg border border-slate-200 dark:border-slate-700 dark:bg-slate-800 focus:ring-[--color-primary] focus:border-[--color-primary] px-4 py-3"
                      value={formData.severity}
                      onChange={(e) => setFormData({ ...formData, severity: e.target.value })}
                      required
                    >
                      <option>Low</option>
                      <option>Medium</option>
                      <option>High</option>
                      <option>Critical</option>
                    </select>
                  </div>

                  {/* Notas */}
                  <div className="pt-2">
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">Notas de Observación</label>
                    <textarea
                      className="w-full rounded-lg border border-slate-200 dark:border-slate-700 dark:bg-slate-800 focus:ring-[--color-primary] focus:border-[--color-primary] px-4 py-3"
                      placeholder="Detalles adicionales sobre el defecto..."
                      rows={3}
                      value={formData.description}
                      onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    />
                  </div>

                  <div className="flex items-center gap-2 text-[--color-primary] text-xs bg-[--color-primary]/10 p-3 rounded">
                    <span className="material-symbols-outlined text-sm">info</span>
                    <span>El número de pieza se genera automáticamente. La imagen se guardará con las marcas de defecto.</span>
                  </div>
                </div>
              </div>

              <div className="flex flex-col gap-3">
                <button
                  type="submit"
                  disabled={loading || !uploadedImage || defectMarkers.length === 0}
                  className="w-full bg-[#1173d4] hover:bg-[#1173d4]/90 text-white font-bold py-4 px-6 rounded-xl transition-all shadow-lg flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {loading ? (
                    <>
                      <span className="material-symbols-outlined animate-spin">refresh</span>
                      Guardando...
                    </>
                  ) : (
                    <>
                      <span className="material-symbols-outlined">save</span>
                      Guardar Registro
                    </>
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => router.back()}
                  disabled={loading}
                  className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 font-semibold py-3 px-6 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Descartar
                </button>
              </div>
            </div>
          </form>
        </div>
      </main>
    </div>
  );
}
