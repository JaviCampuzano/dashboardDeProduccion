'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import Sidebar from '../components/Sidebar';
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
  material?: Material | null;
}

interface Defect {
  id: number;
  defect_type?: string;
  severity?: string;
  stat?: string;
  description?: string;
  aiConfidence?: string | number | null;
}

interface Piece {
  id: number;
  documentId?: string;
  sku?: string;           // primary piece identifier
  idPiece?: string;       // legacy
  quality_status?: string | null;
  createdAt: string;
  batch?: Batch | null;
  defects?: Defect[];
}

const PAGE_SIZE = 10;

// ─── Helpers ─────────────────────────────────────────────────────────────────

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:1337';

function getAuthHeaders(): HeadersInit {
  if (typeof window !== 'undefined') {
    const token = localStorage.getItem('authToken');
    if (token) return { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };
  }
  return { 'Content-Type': 'application/json' };
}

/** Derive a human-readable status from the piece fields */
function getPieceStatus(piece: Piece): string {
  const defects = piece.defects ?? [];
  // Always derive from defects first — quality_status in DB can be stale
  if (defects.length > 0) {
    const hasCritical = defects.some((d) => d.severity === 'Critical' || d.severity === 'High');
    return hasCritical ? 'Rechazado' : 'En Revisión';
  }
  // No defects in this response — fall back to stored quality_status
  if (piece.quality_status) return piece.quality_status;
  return 'Aprobado';
}

function getStatusColor(status: string) {
  switch (status) {
    case 'Rechazado':
      return 'px-2.5 py-1 rounded-full bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400 text-xs font-bold';
    case 'En Revisión':
      return 'px-2.5 py-1 rounded-full bg-amber-100 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400 text-xs font-bold';
    case 'Aprobado':
      return 'px-2.5 py-1 rounded-full bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400 text-xs font-bold';
    default:
      return 'px-2.5 py-1 rounded-full bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400 text-xs font-bold';
  }
}

function formatDate(dateString: string | null | undefined) {
  if (!dateString) return '—';
  return new Date(dateString).toLocaleDateString('es-ES', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

function severityLabel(s: string | undefined | null): string | null {
  if (!s) return null;
  if (s === 'Critical') return 'Crítico';
  if (s === 'High') return 'Alto';
  if (s === 'Medium') return 'Medio';
  if (s === 'Low') return 'Bajo';
  return s;
}

function severityColorClass(s: string | undefined | null): string {
  if (s === 'Critical') return 'text-red-700 bg-red-100 dark:bg-red-900/30 dark:text-red-400';
  if (s === 'High') return 'text-red-600 bg-red-100 dark:bg-red-900/30 dark:text-red-400';
  if (s === 'Medium') return 'text-amber-600 bg-amber-100 dark:bg-amber-900/30 dark:text-amber-400';
  return 'text-green-600 bg-green-100 dark:bg-green-900/30 dark:text-green-400';
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function HistoryPage() {
  const [pieces, setPieces] = useState<Piece[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [showFilters, setShowFilters] = useState(false);
  const [filterStatus, setFilterStatus] = useState('');
  const [filterMaterial, setFilterMaterial] = useState('');
  const [filterBatch, setFilterBatch] = useState('');
  const [filterDateFrom, setFilterDateFrom] = useState('');
  const [filterDateTo, setFilterDateTo] = useState('');
  const [searchQuery, setSearchQuery] = useState('');

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);

  // ── Fetch all pieces ────────────────────────────────────────────────────────
  const fetchPieces = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // Strapi v5 nested populate with array notation
      const url =
        `${API_BASE}/api/pieces` +
        `?populate[0]=batch` +
        `&populate[1]=defects` +
        `&sort=createdAt:desc` +
        `&pagination[pageSize]=500` +
        `&publicationState=preview`;

      const response = await fetch(url, {
        headers: getAuthHeaders(),
        credentials: 'include',
      });

      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`Error ${response.status}: ${errText}`);
      }
      const data = await response.json();

      // Strapi v5: also try to populate material inside batch with a second call if needed
      const rawPieces: Piece[] = data.data || [];
      setPieces(rawPieces);
    } catch (err: unknown) {
      console.error('Error fetching pieces:', err);
      setError(err instanceof Error ? err.message : 'Error desconocido al cargar el historial');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchPieces(); }, [fetchPieces]);

  // ── Derived: computed status per piece ────────────────────────────────────
  const piecesWithStatus = useMemo(
    () => pieces
      .map((p) => ({ ...p, _status: getPieceStatus(p) }))
      .filter((p) => p._status !== 'Riesgo Tonal' && p._status !== 'Homogéneo'),
    [pieces]
  );

  // ── Derived: unique values for filter dropdowns ─────────────────────────────
  const uniqueMaterials = useMemo(() => {
    const seen = new Set<string>();
    const result: string[] = [];
    pieces.forEach((p) => {
      const name = p.batch?.material?.name;
      if (name && !seen.has(name)) { seen.add(name); result.push(name); }
    });
    return result.sort();
  }, [pieces]);

  const uniqueBatches = useMemo(() => {
    const seen = new Set<string>();
    const result: { id: number; label: string }[] = [];
    pieces.forEach((p) => {
      if (p.batch && !seen.has(String(p.batch.id))) {
        seen.add(String(p.batch.id));
        result.push({ id: p.batch.id, label: p.batch.idBatch || `Lote #${p.batch.id}` });
      }
    });
    return result.sort((a, b) => a.label.localeCompare(b.label));
  }, [pieces]);

  // ── Filtering ───────────────────────────────────────────────────────────────
  const filteredPieces = useMemo(() => {
    let result = [...piecesWithStatus];

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        (p) =>
          (p.sku || p.idPiece || String(p.id)).toLowerCase().includes(q) ||
          (p.batch?.idBatch || '').toLowerCase().includes(q) ||
          (p.batch?.material?.name || '').toLowerCase().includes(q) ||
          (p._status || '').toLowerCase().includes(q) ||
          (p.defects ?? []).some((d) =>
            (d.defect_type || '').toLowerCase().includes(q)
          )
      );
    }

    if (filterStatus) {
      result = result.filter((p) => p._status === filterStatus);
    }

    if (filterMaterial) {
      result = result.filter((p) => p.batch?.material?.name === filterMaterial);
    }

    if (filterBatch) {
      result = result.filter((p) => String(p.batch?.id) === filterBatch);
    }

    if (filterDateFrom) {
      const from = new Date(filterDateFrom);
      result = result.filter((p) => new Date(p.createdAt) >= from);
    }

    if (filterDateTo) {
      const to = new Date(filterDateTo);
      to.setHours(23, 59, 59, 999);
      result = result.filter((p) => new Date(p.createdAt) <= to);
    }

    return result;
  }, [piecesWithStatus, searchQuery, filterStatus, filterMaterial, filterBatch, filterDateFrom, filterDateTo]);

  // ── Stats (from ALL pieces) ─────────────────────────────────────────────────
  const stats = useMemo(() => {
    const total = piecesWithStatus.length;
    const aprobados = piecesWithStatus.filter((p) => p._status === 'Aprobado').length;
    const rechazados = piecesWithStatus.filter((p) => p._status === 'Rechazado').length;
    const revision = piecesWithStatus.filter((p) => p._status === 'En Revisión').length;
    const approvalRate = total > 0 ? Math.round((aprobados / total) * 100) : 0;
    return { total, aprobados, rechazados, revision, approvalRate };
  }, [piecesWithStatus]);

  // ── Pagination ──────────────────────────────────────────────────────────────
  const totalPages = Math.max(1, Math.ceil(filteredPieces.length / PAGE_SIZE));

  useEffect(() => { setCurrentPage(1); }, [searchQuery, filterStatus, filterMaterial, filterBatch, filterDateFrom, filterDateTo]);

  const paginatedPieces = useMemo(() => {
    const start = (currentPage - 1) * PAGE_SIZE;
    return filteredPieces.slice(start, start + PAGE_SIZE);
  }, [filteredPieces, currentPage]);

  const pageNumbers = useMemo(() => {
    const pages: (number | '…')[] = [];
    if (totalPages <= 7) {
      for (let i = 1; i <= totalPages; i++) pages.push(i);
    } else {
      pages.push(1);
      if (currentPage > 3) pages.push('…');
      for (let i = Math.max(2, currentPage - 1); i <= Math.min(totalPages - 1, currentPage + 1); i++) pages.push(i);
      if (currentPage < totalPages - 2) pages.push('…');
      pages.push(totalPages);
    }
    return pages;
  }, [totalPages, currentPage]);

  // ── Active filters count ────────────────────────────────────────────────────
  const activeFiltersCount = [filterStatus, filterMaterial, filterBatch, filterDateFrom, filterDateTo].filter(Boolean).length;

  const clearFilters = () => {
    setFilterStatus('');
    setFilterMaterial('');
    setFilterBatch('');
    setFilterDateFrom('');
    setFilterDateTo('');
  };

  // ── CSV Export ──────────────────────────────────────────────────────────────
  const exportToCSV = () => {
    const headers = ['ID Pieza', 'Lote', 'Material', 'Tipo Material', 'Fecha', 'Tipo Defecto', 'Severidad Defecto', 'Confianza IA', 'Estado'];
    const rows = filteredPieces.map((p) => {
      const firstDefect = (p.defects ?? [])[0];
      return [
        p.sku || p.idPiece || `#${p.id}`,
        p.batch?.idBatch || '—',
        p.batch?.material?.name || '—',
        p.batch?.material?.type || '—',
        p.createdAt ? new Date(p.createdAt).toLocaleDateString('es-ES') : '—',
        firstDefect?.defect_type || '—',
        firstDefect ? (severityLabel(firstDefect.severity) || '—') : '—',
        firstDefect?.aiConfidence != null ? `${firstDefect.aiConfidence}%` : '—',
        p._status || '—',
      ];
    });
    const csv = [headers, ...rows]
      .map((row) => row.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(','))
      .join('\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `historial_calidad_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // ─────────────────────────────────────────────────────────────────────────────

  return (
    <div className="bg-[--color-background-light] dark:bg-[--color-background-dark] font-display text-slate-900 dark:text-slate-100">
      <div className="flex h-screen overflow-hidden">
        <Sidebar />

        <main className="flex-1 ml-64 overflow-y-auto bg-[--color-background-light] dark:bg-[--color-background-dark] p-8">

          {/* ── Header ── */}
          <header className="mb-8">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
              <div>
                <h2 className="text-3xl font-black text-slate-900 dark:text-slate-100 tracking-tight">
                  Historial de Calidad
                </h2>
                <p className="text-slate-500 dark:text-slate-400 mt-1">
                  Registro completo de auditorías de calidad y piezas procesadas
                </p>
              </div>
              <div className="flex items-center gap-3">
                {/* Export CSV */}
                <button
                  onClick={exportToCSV}
                  disabled={loading || filteredPieces.length === 0}
                  className="flex items-center gap-2 px-4 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg text-sm font-medium hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <span className="material-symbols-outlined text-[20px]">file_download</span>
                  Exportar CSV
                  {filteredPieces.length > 0 && (
                    <span className="ml-0.5 text-xs text-slate-400">({filteredPieces.length})</span>
                  )}
                </button>

                {/* Filters toggle */}
                <button
                  onClick={() => setShowFilters((v) => !v)}
                  className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors border ${showFilters || activeFiltersCount > 0
                    ? 'bg-[--color-primary] text-white border-[--color-primary]'
                    : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700'
                    }`}
                >
                  <span className="material-symbols-outlined text-[20px]">filter_list</span>
                  Filtros
                  {activeFiltersCount > 0 && (
                    <span className="size-5 flex items-center justify-center rounded-full bg-white text-[--color-primary] text-[11px] font-bold">
                      {activeFiltersCount}
                    </span>
                  )}
                </button>
              </div>
            </div>

            {/* Search bar */}
            <div className="relative w-full max-w-lg">
              <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-xl">
                search
              </span>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-10 py-2.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg text-sm focus:ring-2 focus:ring-[--color-primary]/50 transition-all outline-none placeholder:text-slate-400"
                placeholder="Buscar por ID pieza, lote, material, estado, defecto..."
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors"
                >
                  <span className="material-symbols-outlined text-[18px]">close</span>
                </button>
              )}
            </div>
          </header>

          {/* ── Collapsible Filters Panel ── */}
          {showFilters && (
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 mb-6 flex flex-col gap-4 shadow-sm">
              <div className="flex items-center justify-between">
                <p className="text-sm font-bold text-slate-700 dark:text-slate-300 flex items-center gap-2">
                  <span className="material-symbols-outlined text-[18px] text-[--color-primary]">tune</span>
                  Filtros avanzados
                </p>
                {activeFiltersCount > 0 && (
                  <button
                    onClick={clearFilters}
                    className="text-xs font-semibold text-rose-500 hover:text-rose-600 flex items-center gap-1 transition-colors"
                  >
                    <span className="material-symbols-outlined text-[14px]">close</span>
                    Limpiar filtros
                  </button>
                )}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
                {/* Estado */}
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-bold uppercase tracking-wider text-slate-500">Estado</label>
                  <div className="relative">
                    <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-[18px]">flag</span>
                    <select
                      value={filterStatus}
                      onChange={(e) => setFilterStatus(e.target.value)}
                      className="w-full pl-9 pr-8 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-sm text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-2 focus:ring-[--color-primary]/30 appearance-none"
                    >
                      <option value="">Todos los estados</option>
                      <option value="Aprobado">✅ Aprobado</option>
                      <option value="Rechazado">❌ Rechazado</option>
                      <option value="En Revisión">🔄 En Revisión</option>
                    </select>
                    <span className="material-symbols-outlined absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 text-[18px] pointer-events-none">expand_more</span>
                  </div>
                </div>

                {/* Material */}
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-bold uppercase tracking-wider text-slate-500">Material</label>
                  <div className="relative">
                    <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-[18px]">category</span>
                    <select
                      value={filterMaterial}
                      onChange={(e) => setFilterMaterial(e.target.value)}
                      className="w-full pl-9 pr-8 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-sm text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-2 focus:ring-[--color-primary]/30 appearance-none"
                      disabled={uniqueMaterials.length === 0}
                    >
                      <option value="">Todos los materiales</option>
                      {uniqueMaterials.map((m) => (
                        <option key={m} value={m}>{m}</option>
                      ))}
                    </select>
                    <span className="material-symbols-outlined absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 text-[18px] pointer-events-none">expand_more</span>
                  </div>
                </div>

                {/* Lote */}
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-bold uppercase tracking-wider text-slate-500">Lote</label>
                  <div className="relative">
                    <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-[18px]">inventory_2</span>
                    <select
                      value={filterBatch}
                      onChange={(e) => setFilterBatch(e.target.value)}
                      className="w-full pl-9 pr-8 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-sm text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-2 focus:ring-[--color-primary]/30 appearance-none"
                      disabled={uniqueBatches.length === 0}
                    >
                      <option value="">Todos los lotes</option>
                      {uniqueBatches.map((b) => (
                        <option key={b.id} value={String(b.id)}>{b.label}</option>
                      ))}
                    </select>
                    <span className="material-symbols-outlined absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 text-[18px] pointer-events-none">expand_more</span>
                  </div>
                </div>

                {/* Desde */}
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-bold uppercase tracking-wider text-slate-500">Desde</label>
                  <div className="relative">
                    <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-[18px]">calendar_today</span>
                    <input
                      type="date"
                      value={filterDateFrom}
                      onChange={(e) => setFilterDateFrom(e.target.value)}
                      className="w-full pl-9 pr-4 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-sm text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-2 focus:ring-[--color-primary]/30"
                    />
                  </div>
                </div>

                {/* Hasta */}
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-bold uppercase tracking-wider text-slate-500">Hasta</label>
                  <div className="relative">
                    <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-[18px]">event</span>
                    <input
                      type="date"
                      value={filterDateTo}
                      onChange={(e) => setFilterDateTo(e.target.value)}
                      className="w-full pl-9 pr-4 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-sm text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-2 focus:ring-[--color-primary]/30"
                    />
                  </div>
                </div>
              </div>

              {activeFiltersCount > 0 && (
                <div className="flex items-center gap-2 pt-1 border-t border-slate-100 dark:border-slate-800">
                  <span className="text-xs text-slate-500">
                    Mostrando{' '}
                    <strong className="text-[--color-primary]">{filteredPieces.length}</strong> de{' '}
                    <strong>{pieces.length}</strong> piezas con filtros aplicados.
                  </span>
                </div>
              )}
            </div>
          )}

          {/* ── Search hint ── */}
          {searchQuery && !loading && (
            <div className="flex items-center gap-2 px-4 py-2.5 bg-[--color-primary]/5 border border-[--color-primary]/20 rounded-lg mb-6">
              <span className="material-symbols-outlined text-[--color-primary] text-[18px]">search</span>
              <span className="text-sm text-slate-600 dark:text-slate-400">
                Resultados para <strong>&quot;{searchQuery}&quot;</strong>:{' '}
                <strong className="text-[--color-primary]">{filteredPieces.length}</strong>{' '}
                pieza{filteredPieces.length !== 1 ? 's' : ''}
              </span>
              <button
                onClick={() => setSearchQuery('')}
                className="ml-auto text-xs font-semibold text-[--color-primary] hover:underline"
              >
                Limpiar búsqueda
              </button>
            </div>
          )}

          {/* ── Stats Cards ── */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
            {/* Total */}
            <div className="bg-white dark:bg-slate-900 p-5 rounded-xl border border-slate-200 dark:border-slate-800 relative overflow-hidden">
              <div className="absolute inset-0 bg-gradient-to-br from-slate-50 to-transparent dark:from-slate-800/20 pointer-events-none" />
              <div className="flex items-center gap-2.5 mb-3">
                <div className="size-8 rounded-lg bg-slate-100 dark:bg-slate-800 flex items-center justify-center">
                  <span className="material-symbols-outlined text-slate-500 text-[18px]">inventory_2</span>
                </div>
                <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Total Piezas</span>
              </div>
              {loading ? (
                <div className="h-9 w-20 bg-slate-200 dark:bg-slate-700 rounded animate-pulse" />
              ) : (
                <p className="text-3xl font-black text-slate-900 dark:text-slate-100">
                  {stats.total.toLocaleString('es-ES')}
                </p>
              )}
            </div>

            {/* Aprobados */}
            <div className="bg-white dark:bg-slate-900 p-5 rounded-xl border border-slate-200 dark:border-slate-800 relative overflow-hidden">
              <div className="absolute inset-0 bg-gradient-to-br from-green-50/50 to-transparent dark:from-green-900/10 pointer-events-none" />
              <div className="flex items-center gap-2.5 mb-3">
                <div className="size-8 rounded-lg bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
                  <span className="material-symbols-outlined text-green-600 dark:text-green-400 text-[18px]">check_circle</span>
                </div>
                <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Aprobados</span>
              </div>
              {loading ? (
                <div className="h-9 w-16 bg-slate-200 dark:bg-slate-700 rounded animate-pulse" />
              ) : (
                <div className="flex items-end gap-2">
                  <p className="text-3xl font-black text-green-500">
                    {stats.aprobados.toLocaleString('es-ES')}
                  </p>
                  {stats.total > 0 && (
                    <span className="text-xs text-slate-400 mb-1 font-medium">{stats.approvalRate}%</span>
                  )}
                </div>
              )}
            </div>

            {/* Rechazados */}
            <div className="bg-white dark:bg-slate-900 p-5 rounded-xl border border-slate-200 dark:border-slate-800 relative overflow-hidden">
              <div className="absolute inset-0 bg-gradient-to-br from-red-50/50 to-transparent dark:from-red-900/10 pointer-events-none" />
              <div className="flex items-center gap-2.5 mb-3">
                <div className="size-8 rounded-lg bg-red-100 dark:bg-red-900/30 flex items-center justify-center">
                  <span className="material-symbols-outlined text-red-600 dark:text-red-400 text-[18px]">cancel</span>
                </div>
                <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Rechazados</span>
              </div>
              {loading ? (
                <div className="h-9 w-16 bg-slate-200 dark:bg-slate-700 rounded animate-pulse" />
              ) : (
                <p className="text-3xl font-black text-red-500">
                  {stats.rechazados.toLocaleString('es-ES')}
                </p>
              )}
            </div>

            {/* En Revisión */}
            <div className="bg-white dark:bg-slate-900 p-5 rounded-xl border border-slate-200 dark:border-slate-800 relative overflow-hidden">
              <div className="absolute inset-0 bg-gradient-to-br from-amber-50/50 to-transparent dark:from-amber-900/10 pointer-events-none" />
              <div className="flex items-center gap-2.5 mb-3">
                <div className="size-8 rounded-lg bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
                  <span className="material-symbols-outlined text-amber-600 dark:text-amber-400 text-[18px]">pending</span>
                </div>
                <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">En Revisión</span>
              </div>
              {loading ? (
                <div className="h-9 w-16 bg-slate-200 dark:bg-slate-700 rounded animate-pulse" />
              ) : (
                <p className="text-3xl font-black text-amber-500">
                  {stats.revision.toLocaleString('es-ES')}
                </p>
              )}
            </div>
          </div>

          {/* ── Error State ── */}
          {error && !loading && (
            <div className="flex items-start gap-3 p-5 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl mb-6">
              <span className="material-symbols-outlined text-red-500 text-2xl flex-shrink-0">error</span>
              <div>
                <p className="font-bold text-red-700 dark:text-red-400 text-sm">Error al cargar el historial</p>
                <p className="text-sm text-red-600 dark:text-red-400 mt-0.5">{error}</p>
                <button
                  onClick={fetchPieces}
                  className="mt-3 text-sm font-bold text-red-600 dark:text-red-400 border border-red-400 px-3 py-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/30 flex items-center gap-2 transition-colors"
                >
                  <span className="material-symbols-outlined text-sm">refresh</span>
                  Reintentar
                </button>
              </div>
            </div>
          )}

          {/* ── Historical Table ── */}
          <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
              <h4 className="font-bold text-slate-900 dark:text-slate-100 uppercase text-xs tracking-widest">
                Registros Históricos
              </h4>
              <div className="flex items-center gap-3">
                {!loading && (
                  <span className="text-xs text-slate-500">
                    {filteredPieces.length > 0
                      ? `Mostrando ${(currentPage - 1) * PAGE_SIZE + 1}–${Math.min(currentPage * PAGE_SIZE, filteredPieces.length)} de ${filteredPieces.length}`
                      : '0 registros'}
                    {filteredPieces.length !== pieces.length && (
                      <span className="text-slate-400"> (de {pieces.length} totales)</span>
                    )}
                  </span>
                )}
                <button
                  onClick={fetchPieces}
                  disabled={loading}
                  className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-600 transition-colors disabled:opacity-40"
                  title="Actualizar datos"
                >
                  <span className={`material-symbols-outlined text-[18px] ${loading ? 'animate-spin' : ''}`}>refresh</span>
                </button>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50 dark:bg-slate-800/50">
                    <th className="px-6 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-wider">ID Pieza</th>
                    <th className="px-6 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-wider">Lote</th>
                    <th className="px-6 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-wider">Material</th>
                    <th className="px-6 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-wider">Fecha</th>
                    <th className="px-6 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-wider">Tipo Defecto</th>
                    <th className="px-6 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-wider">Severidad</th>
                    <th className="px-6 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-wider">Estado</th>
                    <th className="px-6 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-wider text-right">Detalle</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {loading ? (
                    // Skeleton loading rows
                    Array.from({ length: PAGE_SIZE }).map((_, i) => (
                      <tr key={i}>
                        {Array.from({ length: 7 }).map((_, j) => (
                          <td key={j} className="px-6 py-4">
                            <div
                              className="h-4 bg-slate-200 dark:bg-slate-700 rounded animate-pulse"
                              style={{ width: `${50 + (j * 13 + i * 7) % 50}%` }}
                            />
                          </td>
                        ))}
                      </tr>
                    ))
                  ) : paginatedPieces.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="px-6 py-16 text-center">
                        <div className="flex flex-col items-center gap-3 text-slate-400">
                          <span className="material-symbols-outlined text-5xl">search_off</span>
                          <div>
                            <p className="text-sm font-semibold text-slate-500">
                              {pieces.length === 0
                                ? 'No hay piezas registradas en el historial'
                                : searchQuery
                                  ? `Sin resultados para "${searchQuery}"`
                                  : 'No hay registros que coincidan con los filtros'}
                            </p>
                            {(activeFiltersCount > 0 || searchQuery) && (
                              <button
                                onClick={() => { clearFilters(); setSearchQuery(''); }}
                                className="mt-2 text-xs text-[--color-primary] hover:underline"
                              >
                                Limpiar filtros y búsqueda
                              </button>
                            )}
                          </div>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    paginatedPieces.map((piece) => {
                      const defects = piece.defects ?? [];
                      // Show most severe defect
                      const worstDefect = defects.sort((a, b) => {
                        const order: Record<string, number> = { Critical: 4, High: 3, Medium: 2, Low: 1 };
                        return (order[b.severity ?? ''] ?? 0) - (order[a.severity ?? ''] ?? 0);
                      })[0];

                      const defectType = worstDefect?.defect_type ?? null;
                      const defectSeverity = worstDefect?.severity ?? null;
                      const svLabel = severityLabel(defectSeverity);
                      const svColor = severityColorClass(defectSeverity);
                      const status = piece._status;

                      return (
                        <tr
                          key={piece.id}
                          className="hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors group cursor-pointer"
                          onClick={() => window.location.href = `/history/${piece.id}`}
                        >
                          <td className="px-6 py-4 text-sm font-medium font-mono text-slate-900 dark:text-slate-100">
                            <div className="flex items-center gap-1.5">
                              {piece.sku || piece.idPiece || `#${piece.id}`}
                              {defects.length > 1 && (
                                <span className="text-[10px] font-bold bg-slate-100 dark:bg-slate-800 text-slate-500 px-1.5 py-0.5 rounded-full">
                                  +{defects.length - 1}
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="px-6 py-4 text-sm text-slate-500 dark:text-slate-400 font-mono">
                            {piece.batch?.idBatch || <span className="text-slate-300 dark:text-slate-600">—</span>}
                          </td>
                          <td className="px-6 py-4">
                            {piece.batch?.material ? (
                              <div>
                                <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
                                  {piece.batch.material.name}
                                </p>
                                {piece.batch.material.type && (
                                  <p className="text-xs text-slate-400">{piece.batch.material.type}</p>
                                )}
                              </div>
                            ) : (
                              <span className="text-slate-300 dark:text-slate-600 text-sm">—</span>
                            )}
                          </td>
                          <td className="px-6 py-4 text-sm text-slate-500 dark:text-slate-400">
                            {formatDate(piece.createdAt)}
                          </td>
                          <td className="px-6 py-4 text-sm text-slate-600 dark:text-slate-400">
                            {defectType || <span className="text-slate-300 dark:text-slate-600">—</span>}
                          </td>
                          <td className="px-6 py-4">
                            {svLabel ? (
                              <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${svColor}`}>
                                {svLabel}
                              </span>
                            ) : (
                              <span className="text-slate-300 dark:text-slate-600 text-sm">—</span>
                            )}
                          </td>
                          <td className="px-6 py-4">
                            <span className={getStatusColor(status)}>
                              {status}
                            </span>
                          </td>
                          <td className="px-6 py-4 text-right" onClick={(e) => e.stopPropagation()}>
                            <Link
                              href={`/history/${piece.id}`}
                              className="inline-flex items-center gap-1 text-xs font-bold text-[--color-primary] hover:underline opacity-0 group-hover:opacity-100 transition-opacity"
                            >
                              Ver detalle
                              <span className="material-symbols-outlined text-[14px] group-hover:translate-x-0.5 transition-transform">arrow_forward</span>
                            </Link>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            {/* ── Pagination ── */}
            {!loading && totalPages > 1 && (
              <div className="px-6 py-4 bg-slate-50 dark:bg-slate-800/50 flex items-center justify-between border-t border-slate-200 dark:border-slate-800 flex-wrap gap-3">
                <span className="text-sm text-slate-500 dark:text-slate-400">
                  Página {currentPage} de {totalPages}
                </span>
                <div className="flex gap-1.5 flex-wrap">
                  <button
                    onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                    disabled={currentPage === 1}
                    className="p-2 border border-slate-200 dark:border-slate-700 rounded-lg hover:bg-white dark:hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  >
                    <span className="material-symbols-outlined text-sm">chevron_left</span>
                  </button>

                  {pageNumbers.map((page, i) =>
                    page === '…' ? (
                      <span key={`e-${i}`} className="px-3 py-2 text-slate-400 text-sm flex items-end">…</span>
                    ) : (
                      <button
                        key={page}
                        onClick={() => setCurrentPage(page as number)}
                        className={`px-3 py-2 rounded-lg text-sm font-semibold transition-colors ${currentPage === page
                          ? 'bg-[--color-primary] text-white'
                          : 'border border-slate-200 dark:border-slate-700 hover:bg-white dark:hover:bg-slate-700'
                          }`}
                      >
                        {page}
                      </button>
                    )
                  )}

                  <button
                    onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                    disabled={currentPage === totalPages}
                    className="p-2 border border-slate-200 dark:border-slate-700 rounded-lg hover:bg-white dark:hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  >
                    <span className="material-symbols-outlined text-sm">chevron_right</span>
                  </button>
                </div>
              </div>
            )}

            {/* Footer when 1 page */}
            {!loading && totalPages <= 1 && filteredPieces.length > 0 && (
              <div className="px-6 py-3 bg-slate-50 dark:bg-slate-800/50 border-t border-slate-200 dark:border-slate-800">
                <span className="text-sm text-slate-500">
                  {filteredPieces.length} registro{filteredPieces.length !== 1 ? 's' : ''} en total
                </span>
              </div>
            )}
          </div>

        </main>
      </div>
    </div>
  );
}
