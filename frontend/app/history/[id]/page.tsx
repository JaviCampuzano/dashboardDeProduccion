'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Sidebar from '../../components/Sidebar';
import Link from 'next/link';

// ─── Types ───────────────────────────────────────────────────────────────────

interface Material {
    id: number;
    name: string;
    code?: string;
    type?: string;
}

interface Batch {
    id: number;
    idBatch?: string;
    ai_status?: string;
    piece_count?: number;
    date_created?: string;
    material?: Material | null;
}

interface StrapiImage {
    id: number;
    url: string;
    formats?: {
        medium?: { url: string };
        small?: { url: string };
        thumbnail?: { url: string };
    };
    width?: number;
    height?: number;
    name?: string;
}

interface Defect {
    id: number;
    documentId: string;
    defect_type?: string;
    severity?: string;
    description?: string;
    location_x?: number;
    location_y?: number;
    aiConfidence?: string | number | null;
    stat?: string;
    createdAt: string;
    image?: StrapiImage[] | null;
}

interface Piece {
    id: number;
    documentId: string;
    sku?: string;
    idPiece?: string;
    dimensions?: string | null;
    thickness?: string | null;
    polishing_grade?: string | null;
    surface_brightness?: string | null;
    tone_homogeneity?: string | null;
    quality_status?: string | null;
    inspection_date?: string | null;
    ai_recommendation?: string | null;
    createdAt: string;
    batch?: Batch | null;
    defects?: Defect[];
}

interface TraceStage {
    id: string;
    nombre: string;
    probabilidad: number;
    razon: string;
    maquinas: string[];
    acciones: string[];
}

interface TraceAnalysis {
    resumen: string;
    probabilidadOrigen: 'alto' | 'medio' | 'bajo';
    etapasPrincipales: TraceStage[];
    maquinasPrioritarias: string[];
    parametrosCriticos: string[];
    patronRepeticion: boolean;
    alertaEscalado: boolean;
    recomendacionFinal: string;
    aiGenerated: boolean;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:1337';

function getAuthHeaders(): HeadersInit {
    if (typeof window !== 'undefined') {
        const token = localStorage.getItem('authToken');
        if (token) return { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };
    }
    return { 'Content-Type': 'application/json' };
}

function getPieceStatus(piece: Piece): { label: string; color: string } {
    if (piece.quality_status) {
        return {
            label: piece.quality_status,
            color: piece.quality_status === 'Aprobado'
                ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                : piece.quality_status === 'Rechazado'
                    ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
                    : 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
        };
    }
    const defects = piece.defects ?? [];
    if (defects.length === 0) return { label: 'Aprobado', color: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' };
    const hasCritical = defects.some((d) => d.severity === 'Critical' || d.severity === 'High');
    return hasCritical
        ? { label: 'Rechazado', color: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' }
        : { label: 'En Revisión', color: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400' };
}

function formatDate(d: string | null | undefined, withTime = false) {
    if (!d) return '—';
    return new Date(d).toLocaleDateString('es-ES', {
        day: 'numeric', month: 'short', year: 'numeric',
        ...(withTime ? { hour: '2-digit', minute: '2-digit' } : {}),
    });
}

function severityBadge(s: string | undefined | null) {
    const map: Record<string, { label: string; cls: string }> = {
        Critical: { label: 'Crítico', cls: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 border border-red-200 dark:border-red-800' },
        High: { label: 'Alto', cls: 'bg-red-50 text-red-600 dark:bg-red-900/20 dark:text-red-400 border border-red-100 dark:border-red-900' },
        Medium: { label: 'Medio', cls: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 border border-amber-200 dark:border-amber-800' },
        Low: { label: 'Bajo', cls: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 border border-green-200 dark:border-green-800' },
    };
    const entry = map[s ?? ''];
    if (!entry) return null;
    return <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold ${entry.cls}`}>{entry.label}</span>;
}

function probBar(pct: number) {
    const color = pct >= 70 ? 'bg-red-500' : pct >= 45 ? 'bg-amber-500' : 'bg-blue-500';
    return (
        <div className="flex items-center gap-2 mt-1">
            <div className="flex-1 h-1.5 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
                <div className={`h-full ${color} rounded-full transition-all duration-700`} style={{ width: `${pct}%` }} />
            </div>
            <span className="text-xs font-bold text-slate-500 w-8 text-right">{pct}%</span>
        </div>
    );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function PieceDetailPage() {
    const { id } = useParams<{ id: string }>();
    const router = useRouter();

    const [piece, setPiece] = useState<Piece | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    // Traceability state
    const [traceAnalysis, setTraceAnalysis] = useState<TraceAnalysis | null>(null);
    const [traceLoading, setTraceLoading] = useState(false);
    const [traceError, setTraceError] = useState<string | null>(null);

    const [activeTab, setActiveTab] = useState<'specs' | 'trace'>('specs');

    // ── Fetch piece ────────────────────────────────────────────────────────────
    const fetchPiece = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const url =
                `${API_BASE}/api/pieces` +
                `?filters[id][$eq]=${id}` +
                `&populate[0]=batch` +
                `&populate[1]=defects` +
                `&populate[2]=defects.image` +
                `&publicationState=preview`;

            const res = await fetch(url, { headers: getAuthHeaders(), credentials: 'include' });
            if (!res.ok) throw new Error(`Error ${res.status}`);
            const data = await res.json();
            let found: Piece | null = data.data?.[0] ?? null;
            if (!found) throw new Error('Pieza no encontrada');

            // ── Enrich batch with material (Strapi v5 doesn't deep-populate by default) ──
            if (found.batch?.id && !found.batch.material) {
                try {
                    const bRes = await fetch(
                        `${API_BASE}/api/batches?filters[id][$eq]=${found.batch.id}&populate=*&publicationState=preview`,
                        { headers: getAuthHeaders(), credentials: 'include' }
                    );
                    if (bRes.ok) {
                        const bData = await bRes.json();
                        const batchFull = bData.data?.[0];
                        if (batchFull) {
                            found = { ...found, batch: { ...found.batch, ...batchFull } };
                        }
                    }
                } catch {
                    // non-blocking – batch material won't show but piece data still loads
                }
            }

            setPiece(found);
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : 'Error desconocido');
        } finally {
            setLoading(false);
        }
    }, [id]);

    useEffect(() => { fetchPiece(); }, [fetchPiece]);

    // ── Save analysis to Strapi ────────────────────────────────────────────────
    const saveAnalysisToPiece = useCallback(async (p: Piece, analysis: TraceAnalysis) => {
        try {
            const summary = [
                `[Trazabilidad IA – ${new Date().toLocaleDateString('es-ES')}]`,
                analysis.resumen,
                `Etapa principal: ${analysis.etapasPrincipales[0]?.nombre || 'N/A'}`,
                `Máquinas prioritarias: ${analysis.maquinasPrioritarias.join(', ')}`,
                analysis.recomendacionFinal,
            ].join(' | ');

            await fetch(`${API_BASE}/api/pieces/${p.documentId}`, {
                method: 'PUT',
                headers: getAuthHeaders(),
                credentials: 'include',
                body: JSON.stringify({ data: { ai_recommendation: summary } }),
            });
        } catch (err) {
            // Non-blocking – we don't interrupt the UI if save fails
            console.warn('[Traceability] Could not save analysis to DB:', err);
        }
    }, []);

    // ── Run AI traceability ─────────────────────────────────────────────────────
    const runTraceability = useCallback(async (p: Piece) => {
        if (!p.defects || p.defects.length === 0) return;
        setTraceLoading(true);
        setTraceError(null);
        setTraceAnalysis(null);
        try {
            const res = await fetch('/api/trace-defect', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    pieceId: p.sku || p.idPiece || `#${p.id}`,
                    defects: p.defects,
                    batchId: p.batch?.idBatch,
                    material: p.batch?.material?.name,
                    createdAt: p.createdAt,
                }),
            });
            const data = await res.json();
            let analysis: TraceAnalysis | null = null;
            if (!res.ok) {
                if (data.fallback) {
                    analysis = data.fallback;
                } else {
                    throw new Error(data.error || 'Error del servidor');
                }
            } else {
                analysis = data;
            }
            if (analysis) {
                setTraceAnalysis(analysis);
                // Persist result summary to the piece's ai_recommendation field
                await saveAnalysisToPiece(p, analysis);
            }
        } catch (err: any) {
            setTraceError(err.message || 'Error al realizar el análisis de trazabilidad');
        } finally {
            setTraceLoading(false);
        }
    }, [saveAnalysisToPiece]);

    // Auto-run traceability when switching to trace tab
    useEffect(() => {
        if (activeTab === 'trace' && piece && !traceAnalysis && !traceLoading) {
            runTraceability(piece);
        }
    }, [activeTab, piece, traceAnalysis, traceLoading, runTraceability]);

    // ─────────────────────────────────────────────────────────────────────────────

    if (loading) {
        return (
            <div className="flex h-screen bg-[--color-background-light] dark:bg-[--color-background-dark]">
                <Sidebar />
                <main className="flex-1 ml-64 flex items-center justify-center">
                    <div className="flex flex-col items-center gap-4 text-slate-400">
                        <span className="material-symbols-outlined text-5xl animate-spin">progress_activity</span>
                        <p className="text-sm">Cargando especificaciones de pieza...</p>
                    </div>
                </main>
            </div>
        );
    }

    if (error || !piece) {
        return (
            <div className="flex h-screen bg-[--color-background-light] dark:bg-[--color-background-dark]">
                <Sidebar />
                <main className="flex-1 ml-64 flex items-center justify-center">
                    <div className="text-center">
                        <span className="material-symbols-outlined text-5xl text-red-400 mb-4 block">error</span>
                        <p className="text-lg font-bold text-slate-700 dark:text-slate-300">{error || 'Pieza no encontrada'}</p>
                        <button onClick={() => router.back()} className="mt-4 text-[--color-primary] hover:underline text-sm flex items-center gap-1 mx-auto">
                            <span className="material-symbols-outlined text-sm">arrow_back</span>
                            Volver al historial
                        </button>
                    </div>
                </main>
            </div>
        );
    }

    const status = getPieceStatus(piece);
    const defects = piece.defects ?? [];
    const hasDefects = defects.length > 0;
    const pieceLabel = piece.sku || piece.idPiece || `#${piece.id}`;

    return (
        <div className="bg-[--color-background-light] dark:bg-[--color-background-dark] min-h-screen flex">
            <Sidebar />

            <main className="flex-1 ml-64 overflow-y-auto p-8">
                <div className="max-w-5xl mx-auto">

                    {/* ── Breadcrumb + Back ── */}
                    <div className="flex items-center gap-2 text-sm text-slate-500 mb-6">
                        <Link href="/history" className="hover:text-[--color-primary] transition-colors flex items-center gap-1">
                            <span className="material-symbols-outlined text-[16px]">history</span>
                            Historial
                        </Link>
                        <span className="material-symbols-outlined text-[14px]">chevron_right</span>
                        <span className="font-mono font-bold text-slate-700 dark:text-slate-300">{pieceLabel}</span>
                    </div>

                    {/* ── Header Card ── */}
                    <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 mb-6 shadow-sm">
                        <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
                            <div className="flex items-start gap-4">
                                {/* Status icon */}
                                <div className={`size-14 rounded-xl flex items-center justify-center flex-shrink-0 ${status.label === 'Aprobado' ? 'bg-green-100 dark:bg-green-900/30'
                                    : status.label === 'Rechazado' ? 'bg-red-100 dark:bg-red-900/30'
                                        : 'bg-amber-100 dark:bg-amber-900/30'
                                    }`}>
                                    <span className={`material-symbols-outlined text-3xl ${status.label === 'Aprobado' ? 'text-green-600 dark:text-green-400'
                                        : status.label === 'Rechazado' ? 'text-red-600 dark:text-red-400'
                                            : 'text-amber-600 dark:text-amber-400'
                                        }`}>
                                        {status.label === 'Aprobado' ? 'verified' : status.label === 'Rechazado' ? 'cancel' : 'pending'}
                                    </span>
                                </div>
                                <div>
                                    <div className="flex items-center gap-2 mb-1">
                                        <h1 className="text-2xl font-black font-mono text-slate-900 dark:text-slate-100">{pieceLabel}</h1>
                                        <span className={`px-3 py-1 rounded-full text-xs font-bold ${status.color}`}>{status.label}</span>
                                    </div>
                                    <p className="text-slate-500 text-sm">
                                        {piece.batch ? (
                                            <>Lote <strong className="font-mono text-slate-700 dark:text-slate-300">{piece.batch.idBatch}</strong>
                                                {piece.batch.material && <> · {piece.batch.material.name}</>}
                                            </>
                                        ) : (
                                            'Sin lote asignado'
                                        )}
                                    </p>
                                    <p className="text-slate-400 text-xs mt-1">
                                        Registrada el {formatDate(piece.createdAt, true)}
                                    </p>
                                </div>
                            </div>

                            <div className="flex gap-2 flex-wrap">
                                <button
                                    onClick={() => router.back()}
                                    className="flex items-center gap-1.5 px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-lg text-sm text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                                >
                                    <span className="material-symbols-outlined text-[18px]">arrow_back</span>
                                    Volver
                                </button>
                                {hasDefects && (
                                    <button
                                        onClick={() => { setActiveTab('trace'); runTraceability(piece); }}
                                        className="flex items-center gap-1.5 px-3 py-2 bg-violet-600 text-white rounded-lg text-sm font-semibold hover:bg-violet-700 transition-colors shadow-lg shadow-violet-600/20"
                                    >
                                        <span className="material-symbols-outlined text-[18px]">psychology</span>
                                        Análisis IA
                                    </button>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* ── Tabs ── */}
                    <div className="border-b border-slate-200 dark:border-slate-800 flex gap-6 mb-6">
                        <button
                            onClick={() => setActiveTab('specs')}
                            className={`pb-3 text-sm flex items-center gap-2 transition-colors ${activeTab === 'specs'
                                ? 'font-bold border-b-2 border-[--color-primary] text-[--color-primary]'
                                : 'font-medium text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
                                }`}
                        >
                            <span className="material-symbols-outlined text-[18px]">info</span>
                            Especificaciones
                            {hasDefects && (
                                <span className={`px-1.5 py-0.5 rounded text-[11px] font-bold ${activeTab === 'specs' ? 'bg-[--color-primary]/10 text-[--color-primary]' : 'bg-slate-100 dark:bg-slate-800 text-slate-500'
                                    }`}>
                                    {defects.length} defecto{defects.length !== 1 ? 's' : ''}
                                </span>
                            )}
                        </button>
                        <button
                            onClick={() => setActiveTab('trace')}
                            disabled={!hasDefects}
                            className={`pb-3 text-sm flex items-center gap-2 transition-colors ${!hasDefects ? 'text-slate-300 dark:text-slate-600 cursor-not-allowed' :
                                activeTab === 'trace'
                                    ? 'font-bold border-b-2 border-violet-600 text-violet-600'
                                    : 'font-medium text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
                                }`}
                        >
                            <span className="material-symbols-outlined text-[18px]">account_tree</span>
                            Trazabilidad IA
                            {!hasDefects && (
                                <span className="text-[11px] text-slate-400">(sin defectos)</span>
                            )}
                        </button>
                    </div>

                    {/* ══════════════════════════ TAB: SPECS ══════════════════════════ */}
                    {activeTab === 'specs' && (
                        <div className="space-y-6">

                            {/* Piece data grid */}
                            <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden">
                                <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center gap-2">
                                    <span className="material-symbols-outlined text-[--color-primary] text-[20px]">straighten</span>
                                    <h3 className="font-bold text-slate-900 dark:text-slate-100 text-sm uppercase tracking-wider">Especificaciones de la Pieza</h3>
                                </div>
                                <div className="grid grid-cols-2 md:grid-cols-3 divide-x divide-y divide-slate-100 dark:divide-slate-800">
                                    {[
                                        { label: 'ID / SKU', value: pieceLabel, mono: true },
                                        { label: 'Lote', value: piece.batch?.idBatch || '—', mono: true },
                                        { label: 'Estado', value: <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold ${status.color}`}>{status.label}</span> },
                                        { label: 'Material', value: piece.batch?.material?.name || '—' },
                                        { label: 'Tipo de material', value: piece.batch?.material?.type || '—' },
                                        { label: 'Código material', value: piece.batch?.material?.code || '—', mono: true },
                                        { label: 'Dimensiones', value: piece.dimensions || '—' },
                                        { label: 'Espesor', value: piece.thickness || '—' },
                                        { label: 'Grado de pulido', value: piece.polishing_grade || '—' },
                                        { label: 'Brillo superficial', value: piece.surface_brightness || '—' },
                                        { label: 'Homogeneidad de tono', value: piece.tone_homogeneity || '—' },
                                        { label: 'Fecha de registro', value: formatDate(piece.createdAt, true) },
                                        { label: 'Fecha de inspección', value: formatDate(piece.inspection_date, true) },
                                        { label: 'Piezas en lote', value: piece.batch?.piece_count?.toString() || '—' },
                                        { label: 'Estado IA del lote', value: piece.batch?.ai_status || '—' },
                                    ].map(({ label, value, mono }) => (
                                        <div key={label} className="px-5 py-4">
                                            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">{label}</p>
                                            <p className={`text-sm font-semibold text-slate-700 dark:text-slate-300 ${mono ? 'font-mono' : ''}`}>
                                                {typeof value === 'string' ? value : value}
                                            </p>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            {/* AI recommendation */}
                            {piece.ai_recommendation && (
                                <div className="bg-violet-50 dark:bg-violet-900/20 border border-violet-200 dark:border-violet-800 rounded-xl p-5 flex items-start gap-3">
                                    <span className="material-symbols-outlined text-violet-600 dark:text-violet-400 flex-shrink-0">psychology</span>
                                    <div>
                                        <p className="text-xs font-bold uppercase tracking-wider text-violet-600 dark:text-violet-400 mb-1">Recomendación IA anterior</p>
                                        <p className="text-sm text-violet-800 dark:text-violet-300">{piece.ai_recommendation}</p>
                                    </div>
                                </div>
                            )}

                            {/* Defects list */}
                            {hasDefects ? (
                                <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden">
                                    <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
                                        <div className="flex items-center gap-2">
                                            <span className="material-symbols-outlined text-red-500 text-[20px]">warning</span>
                                            <h3 className="font-bold text-slate-900 dark:text-slate-100 text-sm uppercase tracking-wider">
                                                Defectos Detectados
                                            </h3>
                                            <span className="px-2 py-0.5 rounded-full bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 text-xs font-bold">
                                                {defects.length}
                                            </span>
                                        </div>
                                        <button
                                            onClick={() => setActiveTab('trace')}
                                            className="flex items-center gap-1.5 text-xs font-bold text-violet-600 hover:text-violet-800 border border-violet-300 dark:border-violet-700 px-3 py-1.5 rounded-lg hover:bg-violet-50 dark:hover:bg-violet-900/20 transition-colors"
                                        >
                                            <span className="material-symbols-outlined text-[14px]">account_tree</span>
                                            Ver trazabilidad IA
                                        </button>
                                    </div>

                                    <div className="divide-y divide-slate-100 dark:divide-slate-800">
                                        {defects.map((defect, idx) => (
                                            <div key={defect.id} className="px-6 py-5">
                                                <div className="flex items-start justify-between gap-4 mb-3">
                                                    <div className="flex items-center gap-3">
                                                        <span className="size-7 rounded-full bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 text-xs font-bold flex items-center justify-center flex-shrink-0">
                                                            {idx + 1}
                                                        </span>
                                                        <div>
                                                            <p className="font-bold text-slate-900 dark:text-slate-100">
                                                                {defect.defect_type || 'Tipo desconocido'}
                                                            </p>
                                                            <p className="text-xs text-slate-400 font-mono">{formatDate(defect.createdAt, true)}</p>
                                                        </div>
                                                    </div>
                                                    <div className="flex items-center gap-2 flex-shrink-0">
                                                        {severityBadge(defect.severity)}
                                                        {defect.aiConfidence != null && (
                                                            <span className="px-2 py-0.5 rounded-full bg-violet-100 dark:bg-violet-900/30 text-violet-700 dark:text-violet-400 text-xs font-bold">
                                                                {defect.aiConfidence}% IA
                                                            </span>
                                                        )}
                                                    </div>
                                                </div>

                                                {defect.description && (
                                                    <p className="text-sm text-slate-600 dark:text-slate-400 ml-10 mb-3">{defect.description}</p>
                                                )}

                                                {defect.location_x != null && defect.location_y != null && (() => {
                                                    const imgEntry = (defect.image && defect.image.length > 0) ? defect.image[0] : null;
                                                    const imgUrl = imgEntry
                                                        ? `${API_BASE}${imgEntry.formats?.medium?.url || imgEntry.formats?.small?.url || imgEntry.url}`
                                                        : null;

                                                    return (
                                                        <div className="ml-10 mt-3">
                                                            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-2 flex items-center gap-1.5">
                                                                <span className="material-symbols-outlined text-[14px]">location_on</span>
                                                                Ubicación del desperfecto
                                                                <span className="font-mono font-normal text-slate-300">
                                                                    (X={defect.location_x!.toFixed(1)}%, Y={defect.location_y!.toFixed(1)}%)
                                                                </span>
                                                            </p>

                                                            {imgUrl ? (
                                                                /* ── Real stone image with defect marker ── */
                                                                <div className="relative rounded-xl overflow-hidden border border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 max-w-lg shadow-sm group">
                                                                    {/* eslint-disable-next-line @next/next/no-img-element */}
                                                                    <img
                                                                        src={imgUrl}
                                                                        alt={`Imagen de defecto: ${defect.defect_type}`}
                                                                        className="w-full object-cover"
                                                                        style={{ maxHeight: '280px' }}
                                                                    />

                                                                    {/* Defect location crosshair overlay */}
                                                                    <div
                                                                        className="absolute -translate-x-1/2 -translate-y-1/2"
                                                                        style={{ left: `${defect.location_x}%`, top: `${defect.location_y}%` }}
                                                                    >
                                                                        {/* Outer ping */}
                                                                        <div className="absolute inset-0 size-8 -translate-x-1/2 -translate-y-1/2 rounded-full bg-red-500/30 animate-ping" />
                                                                        {/* Crosshair ring */}
                                                                        <div className="size-8 -translate-x-1/2 -translate-y-1/2 absolute rounded-full border-2 border-red-500 bg-red-500/10 backdrop-blur-sm" />
                                                                        {/* Center dot */}
                                                                        <div className="size-2 -translate-x-1/2 -translate-y-1/2 absolute rounded-full bg-red-500 shadow-lg" />
                                                                        {/* Cross lines */}
                                                                        <div className="absolute w-5 h-0.5 bg-red-400 -translate-x-1/2 -translate-y-1/2 top-0 left-0" />
                                                                        <div className="absolute w-0.5 h-5 bg-red-400 -translate-x-1/2 -translate-y-1/2 top-0 left-0" />
                                                                    </div>

                                                                    {/* Label badge */}
                                                                    <div className="absolute top-2 right-2 bg-black/60 text-white text-[10px] font-bold px-2 py-1 rounded-full backdrop-blur-sm">
                                                                        {defect.defect_type || 'Defecto'}
                                                                    </div>
                                                                </div>
                                                            ) : (
                                                                /* ── Fallback: no image, just a schematic grid ── */
                                                                <div className="relative rounded-xl overflow-hidden border-2 border-dashed border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 max-w-lg" style={{ height: '120px' }}>
                                                                    {/* Grid pattern */}
                                                                    <div className="absolute inset-0 opacity-20" style={{ backgroundImage: 'linear-gradient(#94a3b8 1px, transparent 1px), linear-gradient(90deg, #94a3b8 1px, transparent 1px)', backgroundSize: '20% 25%' }} />
                                                                    <div className="absolute inset-0 flex items-center justify-center">
                                                                        <p className="text-xs text-slate-400 flex items-center gap-1">
                                                                            <span className="material-symbols-outlined text-[14px]">image_not_supported</span>
                                                                            Sin imagen asociada
                                                                        </p>
                                                                    </div>
                                                                    {/* Defect dot on schematic */}
                                                                    <div
                                                                        className="absolute w-4 h-4 -translate-x-1/2 -translate-y-1/2"
                                                                        style={{ left: `${defect.location_x}%`, top: `${defect.location_y}%` }}
                                                                    >
                                                                        <div className="size-4 rounded-full bg-red-500 border-2 border-white shadow animate-pulse" />
                                                                    </div>
                                                                </div>
                                                            )}
                                                        </div>
                                                    );
                                                })()}
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            ) : (
                                <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-xl p-6 flex items-center gap-4">
                                    <span className="material-symbols-outlined text-green-600 dark:text-green-400 text-4xl">verified</span>
                                    <div>
                                        <p className="font-bold text-green-700 dark:text-green-400">Pieza sin defectos registrados</p>
                                        <p className="text-sm text-green-600/80 dark:text-green-500/80 mt-0.5">Esta pieza ha pasado el control de calidad sin incidencias.</p>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    {/* ══════════════════════════ TAB: TRACEABILITY ══════════════════════════ */}
                    {activeTab === 'trace' && (
                        <div className="space-y-6">

                            {/* Loading state */}
                            {traceLoading && (
                                <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-10 flex flex-col items-center gap-4">
                                    <div className="relative size-16">
                                        <div className="absolute inset-0 rounded-full bg-violet-100 dark:bg-violet-900/30 animate-ping opacity-60" />
                                        <div className="size-16 rounded-full bg-violet-600 flex items-center justify-center relative z-10">
                                            <span className="material-symbols-outlined text-white text-2xl">psychology</span>
                                        </div>
                                    </div>
                                    <div className="text-center">
                                        <p className="font-bold text-slate-900 dark:text-slate-100">Analizando trazabilidad con Gemini AI...</p>
                                        <p className="text-sm text-slate-500 mt-1">Identificando etapas del proceso y máquinas involucradas</p>
                                    </div>
                                    <div className="flex gap-1.5 mt-2">
                                        {[0, 150, 300].map((delay) => (
                                            <span
                                                key={delay}
                                                className="w-2 h-2 bg-violet-500 rounded-full animate-bounce"
                                                style={{ animationDelay: `${delay}ms` }}
                                            />
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* Error state */}
                            {traceError && !traceLoading && (
                                <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl p-5 flex items-start gap-3">
                                    <span className="material-symbols-outlined text-red-500 text-2xl flex-shrink-0">error</span>
                                    <div>
                                        <p className="font-bold text-red-700 dark:text-red-400 text-sm">Error en el análisis de trazabilidad</p>
                                        <p className="text-sm text-red-600 dark:text-red-400 mt-0.5">{traceError}</p>
                                        <button
                                            onClick={() => runTraceability(piece)}
                                            className="mt-3 text-sm font-bold text-red-600 dark:text-red-400 border border-red-400 px-3 py-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/30 flex items-center gap-2 transition-colors"
                                        >
                                            <span className="material-symbols-outlined text-sm">refresh</span>
                                            Reintentar análisis
                                        </button>
                                    </div>
                                </div>
                            )}

                            {/* Analysis result */}
                            {traceAnalysis && !traceLoading && (
                                <>
                                    {/* Summary banner */}
                                    <div className={`rounded-xl p-5 border flex items-start gap-4 ${traceAnalysis.alertaEscalado
                                        ? 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800'
                                        : traceAnalysis.probabilidadOrigen === 'alto'
                                            ? 'bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800'
                                            : 'bg-violet-50 dark:bg-violet-900/20 border-violet-200 dark:border-violet-800'
                                        }`}>
                                        <span className={`material-symbols-outlined text-3xl flex-shrink-0 ${traceAnalysis.alertaEscalado ? 'text-red-600 dark:text-red-400'
                                            : traceAnalysis.probabilidadOrigen === 'alto' ? 'text-amber-600 dark:text-amber-400'
                                                : 'text-violet-600 dark:text-violet-400'
                                            }`}>
                                            {traceAnalysis.alertaEscalado ? 'emergency_home' : traceAnalysis.probabilidadOrigen === 'alto' ? 'warning' : 'account_tree'}
                                        </span>
                                        <div className="flex-1">
                                            <div className="flex items-center gap-2 mb-1 flex-wrap">
                                                <p className="font-bold text-slate-900 dark:text-slate-100">{traceAnalysis.resumen}</p>
                                                {!traceAnalysis.aiGenerated && (
                                                    <span className="text-[10px] font-bold bg-slate-200 dark:bg-slate-700 text-slate-500 px-2 py-0.5 rounded-full">
                                                        Análisis por reglas
                                                    </span>
                                                )}
                                                {traceAnalysis.aiGenerated && (
                                                    <span className="text-[10px] font-bold bg-violet-100 dark:bg-violet-900/30 text-violet-600 dark:text-violet-400 px-2 py-0.5 rounded-full flex items-center gap-1">
                                                        <span className="material-symbols-outlined text-[10px]">psychology</span>
                                                        Gemini AI
                                                    </span>
                                                )}
                                            </div>
                                            <div className="flex items-center gap-3 mt-2 flex-wrap">
                                                <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold ${traceAnalysis.probabilidadOrigen === 'alto' ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
                                                    : traceAnalysis.probabilidadOrigen === 'medio' ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400'
                                                        : 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'
                                                    }`}>
                                                    Probabilidad de origen: {traceAnalysis.probabilidadOrigen.toUpperCase()}
                                                </span>
                                                {traceAnalysis.patronRepeticion && (
                                                    <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400 flex items-center gap-1">
                                                        <span className="material-symbols-outlined text-[12px]">repeat</span>
                                                        Patrón repetitivo detectado
                                                    </span>
                                                )}
                                                {traceAnalysis.alertaEscalado && (
                                                    <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 flex items-center gap-1">
                                                        <span className="material-symbols-outlined text-[12px]">priority_high</span>
                                                        Escalado recomendado
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                    </div>

                                    {/* Process stages timeline */}
                                    <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden">
                                        <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center gap-2">
                                            <span className="material-symbols-outlined text-[--color-primary] text-[20px]">account_tree</span>
                                            <h3 className="font-bold text-slate-900 dark:text-slate-100 text-sm uppercase tracking-wider">
                                                Etapas del Proceso — Trazabilidad Hacia Atrás
                                            </h3>
                                        </div>

                                        <div className="divide-y divide-slate-100 dark:divide-slate-800">
                                            {traceAnalysis.etapasPrincipales.map((stage, idx) => (
                                                <div key={stage.id} className={`px-6 py-5 ${idx === 0 ? 'bg-red-50/50 dark:bg-red-900/10' : ''}`}>
                                                    <div className="flex items-start gap-4">
                                                        {/* Index */}
                                                        <div className={`size-8 rounded-full flex items-center justify-center text-sm font-black flex-shrink-0 ${idx === 0
                                                            ? 'bg-red-500 text-white'
                                                            : idx === 1
                                                                ? 'bg-amber-500 text-white'
                                                                : 'bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-400'
                                                            }`}>
                                                            {idx + 1}
                                                        </div>

                                                        <div className="flex-1 min-w-0">
                                                            <div className="flex items-center gap-2 mb-1 flex-wrap">
                                                                <h4 className="font-bold text-slate-900 dark:text-slate-100">{stage.nombre}</h4>
                                                                {idx === 0 && (
                                                                    <span className="text-[10px] font-bold bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 px-2 py-0.5 rounded-full">
                                                                        PRINCIPAL SOSPECHOSA
                                                                    </span>
                                                                )}
                                                            </div>

                                                            {/* Probability bar */}
                                                            {probBar(stage.probabilidad)}

                                                            <p className="text-sm text-slate-600 dark:text-slate-400 mt-3">{stage.razon}</p>

                                                            {/* Machines */}
                                                            <div className="mt-3">
                                                                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-2">Máquinas involucradas</p>
                                                                <div className="flex flex-wrap gap-2">
                                                                    {stage.maquinas.map((m, mi) => (
                                                                        <span
                                                                            key={mi}
                                                                            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold ${idx === 0
                                                                                ? 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 border border-red-200 dark:border-red-800'
                                                                                : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-700'
                                                                                }`}
                                                                        >
                                                                            <span className="material-symbols-outlined text-[14px]">precision_manufacturing</span>
                                                                            {m}
                                                                        </span>
                                                                    ))}
                                                                </div>
                                                            </div>

                                                            {/* Corrective actions */}
                                                            <div className="mt-4 bg-slate-50 dark:bg-slate-800/60 rounded-lg p-4">
                                                                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-2">Acciones correctivas</p>
                                                                <ol className="space-y-1.5">
                                                                    {stage.acciones.map((action, ai) => (
                                                                        <li key={ai} className="flex items-start gap-2 text-sm text-slate-700 dark:text-slate-300">
                                                                            <span className="size-4 rounded-full bg-[--color-primary] text-white text-[10px] font-bold flex items-center justify-center flex-shrink-0 mt-0.5">
                                                                                {ai + 1}
                                                                            </span>
                                                                            {action}
                                                                        </li>
                                                                    ))}
                                                                </ol>
                                                            </div>
                                                        </div>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>

                                    {/* Priority machines + critical parameters */}
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                        {/* Priority machines */}
                                        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-5">
                                            <div className="flex items-center gap-2 mb-4">
                                                <span className="material-symbols-outlined text-amber-500 text-[20px]">build</span>
                                                <h4 className="font-bold text-slate-900 dark:text-slate-100 text-sm uppercase tracking-wider">
                                                    Máquinas Prioritarias a Revisar
                                                </h4>
                                            </div>
                                            <div className="space-y-2">
                                                {traceAnalysis.maquinasPrioritarias.map((m, i) => (
                                                    <div key={i} className="flex items-center gap-3 p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-100 dark:border-amber-900 rounded-lg">
                                                        <div className="size-6 rounded-full bg-amber-500 text-white text-xs font-black flex items-center justify-center flex-shrink-0">
                                                            {i + 1}
                                                        </div>
                                                        <span className="text-sm font-semibold text-amber-800 dark:text-amber-300 flex items-center gap-2">
                                                            <span className="material-symbols-outlined text-[16px]">precision_manufacturing</span>
                                                            {m}
                                                        </span>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>

                                        {/* Critical parameters */}
                                        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-5">
                                            <div className="flex items-center gap-2 mb-4">
                                                <span className="material-symbols-outlined text-blue-500 text-[20px]">tune</span>
                                                <h4 className="font-bold text-slate-900 dark:text-slate-100 text-sm uppercase tracking-wider">
                                                    Parámetros Críticos
                                                </h4>
                                            </div>
                                            <div className="space-y-2">
                                                {traceAnalysis.parametrosCriticos.map((p, i) => (
                                                    <div key={i} className="flex items-start gap-3 p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-100 dark:border-blue-900 rounded-lg">
                                                        <span className="material-symbols-outlined text-blue-500 text-[16px] flex-shrink-0 mt-0.5">check_circle</span>
                                                        <span className="text-sm text-blue-800 dark:text-blue-300">{p}</span>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    </div>

                                    {/* Final recommendation */}
                                    <div className="bg-slate-900 dark:bg-slate-950 rounded-xl p-5 flex items-start gap-4">
                                        <span className="material-symbols-outlined text-violet-400 text-2xl flex-shrink-0 mt-0.5">tips_and_updates</span>
                                        <div>
                                            <p className="text-xs font-bold uppercase tracking-wider text-violet-400 mb-2">Recomendación Final</p>
                                            <p className="text-sm text-slate-200 font-medium">{traceAnalysis.recomendacionFinal}</p>
                                        </div>
                                    </div>

                                    {/* Re-analyze button */}
                                    <div className="flex justify-end">
                                        <button
                                            onClick={() => { setTraceAnalysis(null); runTraceability(piece); }}
                                            className="flex items-center gap-2 text-sm text-violet-600 dark:text-violet-400 hover:text-violet-800 font-semibold border border-violet-300 dark:border-violet-700 px-4 py-2 rounded-lg hover:bg-violet-50 dark:hover:bg-violet-900/20 transition-colors"
                                        >
                                            <span className="material-symbols-outlined text-[18px]">refresh</span>
                                            Regenerar análisis
                                        </button>
                                    </div>
                                </>
                            )}
                        </div>
                    )}

                </div>
            </main>
        </div>
    );
}
