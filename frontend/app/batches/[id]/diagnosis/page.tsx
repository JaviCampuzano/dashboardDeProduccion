'use client';

import { useParams } from 'next/navigation';
import { useState, useEffect, useMemo } from 'react';
import Sidebar from '../../../components/Sidebar';
import Link from 'next/link';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Material {
  id: number;
  name: string;
  code: string;
  type: string;
}

interface Batch {
  id: number;
  documentId: string;
  idBatch: string;
  date_created: string | null;
  ai_status: string | null;
  piece_count: number;
  createdAt: string;
  material?: Material | null;
}

interface Piece {
  id: number;
  documentId: string;
  idPiece: string;
  sku: string | null;
  dimensions: string | null;
  thickness: string | null;
  polishing_grade: string | null;
  surface_brightness: string | null; // stored as numeric string, e.g. "72.5"
  tone_homogeneity: string | null;   // stored as numeric string, e.g. "88.3"
  quality_status: string | null;
  inspection_date: string | null;
  ai_recommendation: string | null;
}

// ─── Algorithm helpers ────────────────────────────────────────────────────────

interface PieceAnalysis {
  id: string;
  sku: string;
  porc_luz: number;           // surface_brightness as %
  porc_tono: number;          // tone_homogeneity as %
  delta_e: number;            // derived: how far from 100%
  quality_status: string | null;
  ai_recommendation: string | null;
  inspection_date: string | null;
  pasa: boolean;
}

const LIMIT = 90.0;

/**
 * Converts the raw piece fields into the same metrics the Python algorithm produces.
 * surface_brightness  → porc_luz  (0–100)
 * tone_homogeneity    → porc_tono (0–100)
 * delta_e             → simulated from the two percentages
 */
function analyzePiece(p: Piece): PieceAnalysis {
  const porc_luz = parseFloat(p.surface_brightness ?? '0') || 0;
  const porc_tono = parseFloat(p.tone_homogeneity ?? '0') || 0;
  // Delta E reverse-engineered from the algorithm: porc = max(0, 100 - delta * 1.5)
  // → delta = (100 - porc) / 1.5
  const delta_e = (100 - Math.min(porc_tono, porc_luz)) / 1.5;
  const pasa = porc_tono >= LIMIT && porc_luz >= LIMIT;

  return {
    id: p.idPiece ?? String(p.id),
    sku: p.sku ?? '—',
    porc_luz,
    porc_tono,
    delta_e,
    quality_status: p.quality_status,
    ai_recommendation: p.ai_recommendation,
    inspection_date: p.inspection_date,
    pasa,
  };
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function StatCard({
  label,
  value,
  sub,
  icon,
  textColor = 'text-slate-900 dark:text-slate-100',
}: {
  label: string;
  value: string;
  sub?: string;
  icon: string;
  textColor?: string;
}) {
  return (
    <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <span className="material-symbols-outlined text-[20px] text-[--color-primary]">{icon}</span>
        <span className="text-xs font-bold uppercase tracking-wider text-slate-400">{label}</span>
      </div>
      <div className="flex items-baseline gap-2">
        <span className={`text-2xl font-black tracking-tight truncate ${textColor}`}>{value}</span>
        {sub && <span className="text-xs text-slate-400 font-medium">{sub}</span>}
      </div>
    </div>
  );
}

function ProgressBar({ value, label }: { value: number; label: string }) {
  const color = value >= 90 ? 'bg-emerald-500' : value >= 80 ? 'bg-amber-500' : 'bg-red-500';
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex justify-between items-center">
        <span className="text-xs font-semibold text-slate-600 dark:text-slate-400">{label}</span>
        <span className={`text-xs font-bold ${value >= 90 ? 'text-emerald-600' : value >= 80 ? 'text-amber-500' : 'text-red-500'}`}>
          {value.toFixed(1)}%
        </span>
      </div>
      <div className="h-2 w-full bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all ${color}`} style={{ width: `${Math.min(value, 100)}%` }} />
      </div>
    </div>
  );
}

function getStatusStyle(status: string | null) {
  switch (status) {
    case 'Homogéneo': return 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400';
    case 'No Homogéneo': return 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400';
    case 'Alerta de Tono':
    case 'Alerta de Brillo': return 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400';
    case 'Defecto Crítico': return 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400';
    default: return 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400';
  }
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function BatchDiagnosisPage() {
  const params = useParams();
  const rawId = params.id as string;

  const [batch, setBatch] = useState<Batch | null>(null);
  const [pieces, setPieces] = useState<Piece[]>([]);
  const [loadingBatch, setLoadingBatch] = useState(true);
  const [loadingPieces, setLoadingPieces] = useState(true);
  const [activeTab, setActiveTab] = useState<'detalle' | 'calidad'>('detalle');
  const [actionLoading, setActionLoading] = useState(false);
  const [actionDone, setActionDone] = useState<string | null>(null);

  // ── Fetch batch ──
  useEffect(() => {
    setLoadingBatch(true);
    fetch(`http://localhost:1337/api/batches?filters[$or][0][documentId][$eq]=${rawId}&filters[$or][1][idBatch][$eq]=${rawId}&filters[$or][2][id][$eq]=${rawId}&populate=material`)
      .then(r => r.json())
      .then(d => {
        setBatch(d.data && d.data.length > 0 ? d.data[0] : null);
      })
      .catch(() => setBatch(null))
      .finally(() => setLoadingBatch(false));
  }, [rawId]);

  // ── Fetch pieces for this batch ──
  useEffect(() => {
    if (!batch) return;
    setLoadingPieces(true);
    // Filter pieces by their batch relation using Strapi v5 filter syntax
    fetch(
      `http://localhost:1337/api/pieces?filters[batch][documentId][$eq]=${batch.documentId}&pagination[pageSize]=100&sort=createdAt:asc`
    )
      .then(r => r.json())
      .then(d => setPieces(d.data ?? []))
      .catch(() => setPieces([]))
      .finally(() => setLoadingPieces(false));
  }, [batch]);

  // ── Run algorithm over real piece data ──
  const analyzed = useMemo<PieceAnalysis[]>(() => pieces.map(analyzePiece), [pieces]);

  const approved = analyzed.filter(p => p.pasa).length;
  const rejected = analyzed.filter(p => !p.pasa).length;
  const avgDeltaE = analyzed.length ? analyzed.reduce((s, p) => s + p.delta_e, 0) / analyzed.length : 0;
  const avgTono = analyzed.length ? analyzed.reduce((s, p) => s + p.porc_tono, 0) / analyzed.length : 0;
  const avgLuz = analyzed.length ? analyzed.reduce((s, p) => s + p.porc_luz, 0) / analyzed.length : 0;
  const batchPasa = analyzed.length > 0 && avgTono >= LIMIT && avgLuz >= LIMIT;

  const currentStatus = actionDone ?? batch?.ai_status ?? 'Pendiente';
  const isPendingReview =
    !actionDone &&
    (currentStatus === 'Pendiente' || !batch?.ai_status ||
      ['Alerta de Tono', 'Alerta de Brillo', 'Defecto Crítico'].includes(currentStatus) || currentStatus === 'Pendiente de Revisión');

  // ── Accept / Reject ──
  const handleAction = async (accept: boolean) => {
    if (!batch) return;
    const newStatus = accept ? 'Homogéneo' : 'No Homogéneo';
    setActionLoading(true);
    try {
      await fetch(`http://localhost:1337/api/batches/${batch.documentId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data: { ai_status: newStatus } }),
      });
      setActionDone(newStatus);
    } catch { /* silent */ }
    finally { setActionLoading(false); }
  };

  const formatDate = (d: string | null) => {
    if (!d) return '—';
    return new Date(d).toLocaleDateString('es-ES', { year: 'numeric', month: 'long', day: 'numeric' });
  };

  const loading = loadingBatch || loadingPieces;

  return (
    <div className="bg-[--color-background-light] dark:bg-[--color-background-dark] text-slate-900 dark:text-slate-100 antialiased font-display min-h-screen">
      <div className="flex h-screen overflow-hidden">
        <Sidebar />

        <main className="flex-1 ml-64 flex flex-col min-w-0 overflow-hidden">

          {/* ── Header ── */}
          <header className="h-16 flex-shrink-0 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between px-8 sticky top-0 z-10">
            <div className="flex items-center gap-4">
              <span className="material-symbols-outlined text-slate-400">factory</span>
              <h2 className="text-lg font-semibold tracking-tight">Cosentino Quality Tracker</h2>
            </div>
            <Link
              href="/batches"
              className="flex items-center gap-1.5 px-4 py-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg text-sm font-medium transition-colors"
            >
              <span className="material-symbols-outlined text-[18px]">arrow_back</span>
              Volver a Lotes
            </Link>
          </header>

          <div className="flex-1 overflow-y-auto p-8 space-y-8">

            {/* ── Breadcrumb + Title ── */}
            <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-6">
              <div>
                <nav className="flex items-center gap-2 text-xs text-slate-500 mb-3">
                  <Link href="/batches" className="hover:text-[--color-primary] transition-colors">Lotes</Link>
                  <span className="material-symbols-outlined text-[12px]">chevron_right</span>
                  <span className="text-[--color-primary] font-medium">Lote #{batch?.idBatch ?? rawId}</span>
                </nav>
                <h1 className="text-3xl font-black tracking-tight">
                  Detalle del Lote{' '}
                  <span className="text-[--color-primary]">#{batch?.idBatch ?? rawId}</span>
                </h1>
                <p className="text-slate-500 dark:text-slate-400 mt-1">
                  Diagnóstico técnico y análisis CIELAB automatizado por pieza.
                </p>
              </div>
              <span className={`px-4 py-2 rounded-full text-sm font-bold flex-shrink-0 ${getStatusStyle(currentStatus)}`}>
                {currentStatus}
              </span>
            </div>

            {/* ── Loading state ── */}
            {loading && (
              <div className="flex items-center gap-3 text-slate-400 py-8">
                <span className="material-symbols-outlined animate-spin text-2xl">progress_activity</span>
                <span className="text-sm">Cargando datos del lote y piezas...</span>
              </div>
            )}

            {/* ── Batch Info Cards ── */}
            {!loadingBatch && batch && (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <StatCard label="Material" value={batch.material?.name ?? 'N/A'} sub={batch.material?.type} icon="category" />
                <StatCard label="Piezas en Lote" value={String(batch.piece_count ?? '—')} sub="unidades" icon="widgets" />
                <StatCard label="Fecha Producción" value={formatDate(batch.date_created)} icon="calendar_today" textColor="text-slate-700 dark:text-slate-300" />
                <StatCard label="Código Material" value={batch.material?.code ?? '—'} icon="qr_code" textColor="text-slate-700 dark:text-slate-300" />
              </div>
            )}

            {/* ── No pieces warning ── */}
            {!loadingPieces && batch && pieces.length === 0 && (
              <div className="flex items-center gap-3 px-5 py-4 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl">
                <span className="material-symbols-outlined text-slate-400 text-xl">info</span>
                <p className="text-sm text-slate-500">
                  Este lote aún no tiene piezas registradas. Añade piezas en Strapi vinculadas a este lote para ver el análisis de calidad.
                </p>
              </div>
            )}

            {/* ── Action Banner (pending review) ── */}
            {!loading && isPendingReview && (
              <div className="bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900/40 rounded-2xl p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="flex items-start gap-3">
                  <span className="material-symbols-outlined text-amber-500 text-2xl mt-0.5">warning</span>
                  <div>
                    <p className="font-bold text-amber-900 dark:text-amber-400">Lote pendiente de revisión manual</p>
                    <p className="text-sm text-amber-700 dark:text-amber-500/80 mt-0.5">
                      Revisa el análisis de calidad y decide si el lote es <strong>Homogéneo</strong> (aceptado) o <strong>No Homogéneo</strong> (rechazado).
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3 flex-shrink-0">
                  <button
                    disabled={actionLoading}
                    onClick={() => handleAction(false)}
                    className="flex items-center gap-2 px-5 py-2.5 bg-red-500 hover:bg-red-600 text-white rounded-xl text-sm font-bold transition-all shadow-lg shadow-red-500/20 disabled:opacity-60"
                  >
                    <span className="material-symbols-outlined text-[18px]">
                      {actionLoading ? 'progress_activity' : 'close'}
                    </span>
                    Rechazar Lote
                  </button>
                  <button
                    disabled={actionLoading}
                    onClick={() => handleAction(true)}
                    className="flex items-center gap-2 px-5 py-2.5 bg-emerald-500 hover:bg-emerald-600 text-white rounded-xl text-sm font-bold transition-all shadow-lg shadow-emerald-500/20 disabled:opacity-60"
                  >
                    <span className="material-symbols-outlined text-[18px]">
                      {actionLoading ? 'progress_activity' : 'check'}
                    </span>
                    Aceptar Lote
                  </button>
                </div>
              </div>
            )}

            {/* ── Action result banner ── */}
            {actionDone && (
              <div className={`rounded-2xl p-5 flex items-center gap-3 border ${actionDone === 'Homogéneo' ? 'bg-emerald-50 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-900/40' : 'bg-red-50 dark:bg-red-950/20 border-red-200 dark:border-red-900/40'}`}>
                <span className={`material-symbols-outlined text-2xl ${actionDone === 'Homogéneo' ? 'text-emerald-500' : 'text-red-500'}`}>
                  {actionDone === 'Homogéneo' ? 'check_circle' : 'cancel'}
                </span>
                <div>
                  <p className={`font-bold ${actionDone === 'Homogéneo' ? 'text-emerald-800 dark:text-emerald-400' : 'text-red-800 dark:text-red-400'}`}>
                    Lote marcado como <strong>{actionDone}</strong>
                  </p>
                  <p className="text-sm text-slate-500 mt-0.5">El estado ha sido actualizado en la base de datos.</p>
                </div>
              </div>
            )}

            {/* ── Tabs (only if there's real data) ── */}
            {!loading && batch && (
              <>
                <div className="border-b border-slate-200 dark:border-slate-800 flex gap-8">
                  {([
                    { key: 'detalle', label: 'Ver Detalle', icon: 'info' },
                    { key: 'calidad', label: 'Análisis de Calidad', icon: 'monitoring' },
                  ] as const).map(({ key, label, icon }) => (
                    <button
                      key={key}
                      onClick={() => setActiveTab(key)}
                      className={`pb-3 flex items-center gap-2 text-sm transition-colors whitespace-nowrap ${activeTab === key
                        ? 'font-bold border-b-2 border-[--color-primary] text-[--color-primary]'
                        : 'font-medium text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
                        }`}
                    >
                      <span className="material-symbols-outlined text-[18px]">{icon}</span>
                      {label}
                    </button>
                  ))}
                </div>

                {/* ══════════════════════════════════════ TAB: DETALLE */}
                {activeTab === 'detalle' && (
                  <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">

                    {/* Left: radar + recent table */}
                    <div className="lg:col-span-2 space-y-8">

                      {/* Radar */}
                      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden">
                        <div className="p-6 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center">
                          <div>
                            <h4 className="text-base font-bold">Patrón vs Escaneado (Radar de Desviación)</h4>
                            <p className="text-xs text-slate-500">Métricas comparativas CIELAB del lote</p>
                          </div>
                          <div className="flex gap-4">
                            <span className="flex items-center gap-1.5 text-xs text-slate-500">
                              <span className="size-2.5 rounded-full bg-[--color-primary]/30 inline-block" />Referencia
                            </span>
                            <span className="flex items-center gap-1.5 text-xs text-slate-500">
                              <span className="size-2.5 rounded-full bg-[--color-primary] inline-block" />Lote Actual
                            </span>
                          </div>
                        </div>
                        <div className="p-8 flex items-center justify-center min-h-[320px]">
                          <div className="relative w-full max-w-xs aspect-square flex items-center justify-center">
                            {[0, 1, 2, 3].map(i => (
                              <div key={i} className="absolute border border-slate-100 dark:border-slate-800 rounded-full" style={{ inset: `${i * 12}%` }} />
                            ))}
                            {/* Dynamic 5-point labels */}
                            {['L* (Brillo)', 'Tono (a*)', 'Delta E', 'Sat. (b*)', 'Luz'].map((lbl, i) => {
                              const angle = -Math.PI / 2 + (i * 2 * Math.PI) / 5;
                              const x = 50 + 44 * Math.cos(angle);
                              const y = 50 + 44 * Math.sin(angle);
                              return (
                                <div
                                  key={lbl}
                                  className="absolute text-[9px] font-bold text-slate-400 uppercase tracking-widest whitespace-nowrap"
                                  style={{
                                    left: `${x}%`,
                                    top: `${y}%`,
                                    transform: 'translate(-50%, -50%)',
                                  }}
                                >
                                  {lbl}
                                </div>
                              );
                            })}

                            <svg className="w-full h-full" viewBox="0 0 100 100">
                              {/* Reference 5-point polygon (100% boundary) */}
                              <polygon
                                className="fill-slate-100/50 dark:fill-slate-700/30 stroke-slate-300 dark:stroke-slate-600 stroke-[0.5]"
                                points={[...Array(5)].map((_, i) => {
                                  const angle = -Math.PI / 2 + (i * 2 * Math.PI) / 5;
                                  return `${50 + 35 * Math.cos(angle)},${50 + 35 * Math.sin(angle)}`;
                                }).join(' ')}
                              />
                              {/* Actual polygon — scales dynamically */}
                              <polygon
                                className="fill-[--color-primary]/15 stroke-[--color-primary] stroke-[1.5]"
                                points={[avgLuz, avgTono, Math.max(0, 100 - Math.abs(avgLuz - avgTono)), avgTono, avgLuz].map((val, i) => {
                                  // Make sure `val` is not NaN, defaults to 0
                                  const safeVal = isNaN(val) ? 0 : val;
                                  const angle = -Math.PI / 2 + (i * 2 * Math.PI) / 5;
                                  const r = (safeVal / 100) * 35;
                                  return `${50 + r * Math.cos(angle)},${50 + r * Math.sin(angle)}`;
                                }).join(' ')}
                              />
                            </svg>
                          </div>
                        </div>
                      </div>

                      {/* Recent pieces table */}
                      {analyzed.length > 0 && (
                        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden">
                          <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
                            <h4 className="text-sm font-bold uppercase tracking-wider text-slate-500">Muestreo de Piezas del Lote</h4>
                            <span className="text-xs text-slate-400">{analyzed.length} piezas</span>
                          </div>
                          <table className="w-full text-left">
                            <thead>
                              <tr className="bg-slate-50 dark:bg-slate-800/50">
                                {['ID Pieza', 'SKU', '% Tono', '% Luz', 'Estado'].map(h => (
                                  <th key={h} className="px-6 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-widest">{h}</th>
                                ))}
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                              {analyzed.slice(0, 6).map(p => (
                                <tr key={p.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors">
                                  <td className="px-6 py-4 text-sm font-mono font-bold">{p.id}</td>
                                  <td className="px-6 py-4 text-sm text-slate-500">{p.sku}</td>
                                  <td className="px-6 py-4 text-sm font-semibold">
                                    <span className={p.porc_tono >= 90 ? 'text-emerald-600' : 'text-red-500'}>{p.porc_tono.toFixed(1)}%</span>
                                  </td>
                                  <td className="px-6 py-4 text-sm font-semibold">
                                    <span className={p.porc_luz >= 90 ? 'text-emerald-600' : 'text-red-500'}>{p.porc_luz.toFixed(1)}%</span>
                                  </td>
                                  <td className="px-6 py-4">
                                    <span className={`px-2 py-0.5 text-[10px] font-bold uppercase rounded-full ${p.pasa ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'}`}>
                                      {p.pasa ? 'Homogéneo' : 'Riesgo Tonal'}
                                    </span>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>

                    {/* Right: metrics sidebar */}
                    <div className="space-y-6">
                      {/* Coincidencia general */}
                      <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200 dark:border-slate-800">
                        <p className="text-sm font-medium text-slate-500">Coincidencia General</p>
                        <div className="mt-2 flex items-baseline gap-2">
                          <span className="text-4xl font-black tracking-tight">
                            {analyzed.length > 0 ? avgTono.toFixed(1) : '—'}%
                          </span>
                          {analyzed.length > 0 && (
                            <span className={`text-sm font-semibold ${avgTono >= 90 ? 'text-emerald-500' : 'text-red-500'}`}>
                              {avgTono >= 90 ? '✓ OK' : '⚠ Revisar'}
                            </span>
                          )}
                        </div>
                        {analyzed.length > 0 && (
                          <div className="mt-4 w-full bg-slate-100 dark:bg-slate-800 rounded-full h-2">
                            <div className={`h-2 rounded-full ${avgTono >= 90 ? 'bg-emerald-500' : 'bg-amber-500'}`} style={{ width: `${Math.min(avgTono, 100)}%` }} />
                          </div>
                        )}
                      </div>

                      {/* Verdict card */}
                      {analyzed.length > 0 ? (
                        <div className={`p-6 rounded-2xl border ${batchPasa ? 'bg-emerald-50 dark:bg-emerald-950/20 border-emerald-100 dark:border-emerald-900/30' : 'bg-amber-50 dark:bg-amber-950/20 border-amber-100 dark:border-amber-900/30'}`}>
                          <div className="flex items-center gap-3 mb-4">
                            <div className={`size-10 rounded-full flex items-center justify-center text-white ${batchPasa ? 'bg-emerald-500' : 'bg-amber-500'}`}>
                              <span className="material-symbols-outlined">{batchPasa ? 'check_circle' : 'warning'}</span>
                            </div>
                            <h4 className={`text-lg font-bold ${batchPasa ? 'text-emerald-900 dark:text-emerald-400' : 'text-amber-900 dark:text-amber-400'}`}>
                              {batchPasa ? 'Lote Homogéneo' : 'Requiere Revisión'}
                            </h4>
                          </div>
                          <p className={`text-sm leading-relaxed ${batchPasa ? 'text-emerald-800 dark:text-emerald-500/80' : 'text-amber-800 dark:text-amber-500/80'}`}>
                            {batchPasa
                              ? 'El análisis confirma que el lote cumple todos los estándares de calidad. Sin desviaciones críticas detectadas.'
                              : 'Se han detectado variaciones de tono o brillo que superan el umbral del 90%. Se recomienda revisión manual.'}
                          </p>
                        </div>
                      ) : (
                        <div className="p-6 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
                          <p className="text-sm text-slate-500">Sin piezas para analizar.</p>
                        </div>
                      )}

                      {/* Control points */}
                      <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200 dark:border-slate-800">
                        <h4 className="text-sm font-bold mb-4">Puntos de Control</h4>
                        <div className="space-y-3 text-sm">
                          <div className="flex justify-between">
                            <span className="text-slate-500">Delta E Promedio</span>
                            <span className="font-semibold">{analyzed.length > 0 ? avgDeltaE.toFixed(2) : '—'}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-slate-500">% Tono Promedio</span>
                            <span className={`font-semibold ${avgTono >= 90 ? 'text-emerald-500' : 'text-red-500'}`}>
                              {analyzed.length > 0 ? `${avgTono.toFixed(1)}%` : '—'}
                            </span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-slate-500">% Luz Promedio</span>
                            <span className={`font-semibold ${avgLuz >= 90 ? 'text-emerald-500' : 'text-red-500'}`}>
                              {analyzed.length > 0 ? `${avgLuz.toFixed(1)}%` : '—'}
                            </span>
                          </div>
                          <div className="flex justify-between border-t border-slate-100 dark:border-slate-800 pt-3">
                            <span className="font-bold">Piezas Analizadas</span>
                            <span className="font-bold text-[--color-primary]">
                              {analyzed.length > 0 ? `${approved} OK / ${rejected} ⚠` : '—'}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* ══════════════════════════════════════ TAB: CALIDAD */}
                {activeTab === 'calidad' && (
                  <div className="space-y-8">

                    {/* KPI row */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      {[
                        { label: 'Piezas Analizadas', value: String(analyzed.length), color: 'text-slate-900 dark:text-slate-100' },
                        { label: 'Homogéneas', value: String(approved), color: 'text-emerald-500' },
                        { label: 'Riesgo Tonal', value: String(rejected), color: 'text-amber-500' },
                        { label: 'Delta E Promedio', value: analyzed.length ? avgDeltaE.toFixed(2) : '—', color: 'text-[--color-primary]' },
                      ].map(({ label, value, color }) => (
                        <div key={label} className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5">
                          <p className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">{label}</p>
                          <p className={`text-3xl font-black ${color}`}>{value}</p>
                        </div>
                      ))}
                    </div>

                    {/* Average bars */}
                    <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6">
                      <h4 className="text-sm font-bold uppercase tracking-wider text-slate-400 mb-6">
                        Promedios del Lote — Umbral de Aprobación: 90%
                      </h4>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                        <div className="space-y-4">
                          <ProgressBar value={avgTono} label="Similitud de Tono (% promedio)" />
                          <ProgressBar value={avgLuz} label="Similitud de Luz (% promedio)" />
                        </div>
                        <div className="bg-slate-50 dark:bg-slate-800 rounded-xl p-5 space-y-3">
                          <div className="flex items-center gap-2">
                            <span className="material-symbols-outlined text-[--color-primary] text-[20px]">info</span>
                            <span className="text-xs font-bold text-[--color-primary] uppercase">Criterio de Aprobación</span>
                          </div>
                          <p className="text-xs leading-relaxed text-slate-600 dark:text-slate-400">
                            El algoritmo CIELAB compara cada pieza contra patrones maestros. Una pieza es <strong>HOMOGÉNEA</strong> si tanto su porcentaje de Tono como el de Luz superan el <strong>90%</strong>.
                          </p>
                          <span className={`inline-block px-3 py-1 rounded-full text-xs font-bold ${batchPasa ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' : 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400'}`}>
                            {analyzed.length === 0 ? 'Sin datos' : batchPasa ? '✓ LOTE HOMOGÉNEO' : '⚠ LOTE CON RIESGO TONAL'}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Per-piece table */}
                    {analyzed.length > 0 && (
                      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden">
                        <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
                          <h4 className="text-sm font-bold uppercase tracking-wider text-slate-500">
                            Análisis Individual por Pieza — Algoritmo CIELAB
                          </h4>
                          <span className="text-xs text-slate-400">{analyzed.length} piezas</span>
                        </div>
                        <div className="overflow-x-auto">
                          <table className="w-full text-left">
                            <thead>
                              <tr className="bg-slate-50 dark:bg-slate-800/50">
                                {['ID Pieza', 'SKU', 'Dimensiones', 'Pulido', '% Tono', '% Luz', 'Delta E', 'Estado', 'Recomendación IA'].map(h => (
                                  <th key={h} className="px-5 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-widest whitespace-nowrap">{h}</th>
                                ))}
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                              {analyzed.map((p, i) => {
                                const raw = pieces[i];
                                return (
                                  <tr key={p.id} className={`transition-colors ${!p.pasa ? 'bg-amber-50/40 dark:bg-amber-900/5 hover:bg-amber-50 dark:hover:bg-amber-900/10' : 'hover:bg-slate-50 dark:hover:bg-slate-800/30'}`}>
                                    <td className="px-5 py-4 text-sm font-mono font-bold">{p.id}</td>
                                    <td className="px-5 py-4 text-sm text-slate-500">{p.sku}</td>
                                    <td className="px-5 py-4 text-sm text-slate-500">{raw?.dimensions ?? '—'}</td>
                                    <td className="px-5 py-4 text-sm text-slate-500">{raw?.polishing_grade ?? '—'}</td>
                                    <td className="px-5 py-4 text-sm">
                                      <span className={`font-bold ${p.porc_tono >= 90 ? 'text-emerald-600' : 'text-red-500'}`}>
                                        {p.porc_tono.toFixed(1)}%{p.porc_tono < 90 && <span className="ml-1 text-[10px]">(⚠)</span>}
                                      </span>
                                    </td>
                                    <td className="px-5 py-4 text-sm">
                                      <span className={`font-bold ${p.porc_luz >= 90 ? 'text-emerald-600' : 'text-red-500'}`}>
                                        {p.porc_luz.toFixed(1)}%{p.porc_luz < 90 && <span className="ml-1 text-[10px]">(⚠)</span>}
                                      </span>
                                    </td>
                                    <td className="px-5 py-4 text-sm font-semibold text-slate-700 dark:text-slate-300">
                                      {p.delta_e.toFixed(2)}
                                    </td>
                                    <td className="px-5 py-4">
                                      <span className={`px-2.5 py-1 text-[10px] font-bold uppercase rounded-full whitespace-nowrap ${p.pasa ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' : 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400'}`}>
                                        {p.pasa ? 'HOMOGÉNEO' : 'RIESGO TONAL'}
                                      </span>
                                    </td>
                                    <td className="px-5 py-4 text-xs text-slate-500 max-w-[180px] truncate" title={p.ai_recommendation ?? ''}>
                                      {p.ai_recommendation ?? '—'}
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                        {/* Footer averages */}
                        <div className="px-6 py-4 bg-slate-50 dark:bg-slate-800/50 border-t border-slate-200 dark:border-slate-800 grid grid-cols-3 gap-4">
                          <div>
                            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Delta E Promedio</p>
                            <p className="text-lg font-black text-[--color-primary]">{avgDeltaE.toFixed(2)}</p>
                          </div>
                          <div>
                            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Similitud Tonal Media</p>
                            <p className={`text-lg font-black ${avgTono >= 90 ? 'text-emerald-500' : 'text-amber-500'}`}>{avgTono.toFixed(2)}%</p>
                          </div>
                          <div>
                            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Similitud de Luz Media</p>
                            <p className={`text-lg font-black ${avgLuz >= 90 ? 'text-emerald-500' : 'text-amber-500'}`}>{avgLuz.toFixed(2)}%</p>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* CIELAB averages visual */}
                    {analyzed.length > 0 && (
                      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6">
                        <h4 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-6">
                          Métricas Promedio del Lote — Espacio CIELAB
                        </h4>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                          <ProgressBar value={avgTono} label="Homogeneidad de Tono (tone_homogeneity)" />
                          <ProgressBar value={avgLuz} label="Brillo de Superficie (surface_brightness)" />
                        </div>
                        <p className="text-xs text-slate-400 mt-4">
                          Datos obtenidos directamente de los campos <code className="bg-slate-100 dark:bg-slate-800 px-1 rounded">surface_brightness</code> y <code className="bg-slate-100 dark:bg-slate-800 px-1 rounded">tone_homogeneity</code> de la colección <code className="bg-slate-100 dark:bg-slate-800 px-1 rounded">pieces</code> en Strapi.
                        </p>
                      </div>
                    )}

                  </div>
                )}
              </>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}
