'use client';

import { useEffect, useState, useMemo, useRef } from 'react';
import Sidebar from '../components/Sidebar';
import Link from 'next/link';

// ─── Types ───────────────────────────────────────────────────────────────────

interface Material {
  id: number;
  documentId: string;
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

type TabType = 'all' | 'pending' | 'flagged' | 'archived';

const FLAGGED_STATUSES = ['Alerta de Tono', 'Alerta de Brillo', 'Defecto Crítico'];

// ─── Modal "Nuevo Lote" ───────────────────────────────────────────────────────

function NewBatchModal({
  onClose,
  onCreated,
  batches,
}: {
  onClose: () => void;
  onCreated: () => void;
  batches: Batch[];
}) {
  const [materials, setMaterials] = useState<Material[]>([]);
  const [form, setForm] = useState({
    materialId: '',
    date_created: new Date().toISOString().split('T')[0],
    piece_count: '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const overlayRef = useRef<HTMLDivElement>(null);

  const nextSequence = useMemo(() => {
    let maxSeq = 0;
    batches.forEach(b => {
      if (b.idBatch && b.idBatch.includes('-L')) {
        const parts = b.idBatch.split('-L');
        const num = parseInt(parts[parts.length - 1], 10);
        if (!isNaN(num) && num > maxSeq) {
          maxSeq = num;
        }
      }
    });
    // Si no hay ninguno todavía, usa 1
    return maxSeq + 1;
  }, [batches]);

  const generatedIdBatch = useMemo(() => {
    const dateStr = form.date_created || new Date().toISOString().split('T')[0];
    const [year, month] = dateStr.split('-');
    const seqStr = nextSequence.toString().padStart(4, '0');
    return `LOTE-${year}-${month}-L${seqStr}`;
  }, [form.date_created, nextSequence]);

  useEffect(() => {
    fetch('http://localhost:1337/api/materials')
      .then((r) => r.json())
      .then((d) => setMaterials(d.data || []));
  }, []);

  // Close on backdrop click
  const handleOverlayClick = (e: React.MouseEvent) => {
    if (e.target === overlayRef.current) onClose();
  };

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!form.materialId) {
      setError('Por favor selecciona un material.');
      return;
    }

    setSaving(true);
    try {
      const payload: Record<string, unknown> = {
        idBatch: generatedIdBatch,
        piece_count: form.piece_count ? Number(form.piece_count) : 0,
        date_created: form.date_created || null,
        material: Number(form.materialId),
      };

      const res = await fetch('http://localhost:1337/api/batches', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data: payload }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err?.error?.message || 'Error al crear el lote');
      }

      onCreated();
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Error desconocido');
    } finally {
      setSaving(false);
    }
  };

  const selectedMaterial = materials.find((m) => String(m.id) === form.materialId);

  return (
    <div
      ref={overlayRef}
      onClick={handleOverlayClick}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
    >
      <div className="relative bg-white dark:bg-slate-900 w-full max-w-lg rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-700 flex flex-col overflow-hidden animate-in fade-in slide-in-from-bottom-4 duration-200">
        {/* Modal header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-slate-100 dark:border-slate-800">
          <div className="flex items-center gap-3">
            <div className="size-9 rounded-lg bg-[--color-primary]/10 flex items-center justify-center">
              <span className="material-symbols-outlined text-[--color-primary] text-[20px]">add_box</span>
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">Nuevo Lote</h3>
              <p className="text-xs text-slate-500">Registra un nuevo lote de producción</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="size-8 flex items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-600 transition-colors"
          >
            <span className="material-symbols-outlined text-[20px]">close</span>
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="flex flex-col gap-5 p-6">

          {/* ID Batch */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-bold uppercase tracking-wider text-slate-500">
              ID Lote (Autogenerado)
            </label>
            <div className="relative">
              <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-[18px]">
                tag
              </span>
              <input
                type="text"
                value={generatedIdBatch}
                disabled
                className="w-full pl-9 pr-4 py-2.5 bg-slate-100 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-lg text-sm text-slate-500 dark:text-slate-400 focus:outline-none cursor-not-allowed font-mono font-bold"
              />
            </div>
          </div>

          {/* Material */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-bold uppercase tracking-wider text-slate-500">
              Material <span className="text-red-500">*</span>
            </label>
            <div className="relative">
              <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-[18px]">
                category
              </span>
              <select
                value={form.materialId}
                onChange={(e) => setForm({ ...form, materialId: e.target.value })}
                className="w-full pl-9 pr-10 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-sm text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-2 focus:ring-[--color-primary]/30 appearance-none"
                required
              >
                <option value="">Selecciona un material...</option>
                {materials.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name} — {m.code}
                  </option>
                ))}
              </select>
              <span className="material-symbols-outlined absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 text-[18px] pointer-events-none">
                expand_more
              </span>
            </div>
            {selectedMaterial && (
              <div className="flex items-center gap-2 mt-1 p-2.5 bg-slate-50 dark:bg-slate-800/60 rounded-lg">
                <span className="material-symbols-outlined text-[--color-primary] text-[16px]">info</span>
                <span className="text-xs text-slate-500">
                  <strong>{selectedMaterial.type}</strong> · {selectedMaterial.code}
                </span>
              </div>
            )}
          </div>

          {/* Date */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-bold uppercase tracking-wider text-slate-500">
              Fecha de producción
            </label>
            <div className="relative">
              <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-[18px]">
                calendar_today
              </span>
              <input
                type="date"
                value={form.date_created}
                onChange={(e) => setForm({ ...form, date_created: e.target.value })}
                className="w-full pl-9 pr-4 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-sm text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-2 focus:ring-[--color-primary]/30"
              />
            </div>
          </div>

          {/* Piece count */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-bold uppercase tracking-wider text-slate-500">
              N.º de piezas
            </label>
            <div className="relative">
              <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-[18px]">
                widgets
              </span>
              <input
                type="number"
                min="0"
                placeholder="0"
                value={form.piece_count}
                onChange={(e) => setForm({ ...form, piece_count: e.target.value })}
                className="w-full pl-9 pr-4 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-sm text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-2 focus:ring-[--color-primary]/30"
              />
            </div>
          </div>

          {error && (
            <div className="flex items-center gap-2 p-3 bg-red-50 dark:bg-red-900/20 border border-red-100 dark:border-red-800 rounded-lg">
              <span className="material-symbols-outlined text-red-500 text-[18px]">error</span>
              <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
            </div>
          )}

          {/* Actions */}
          <div className="flex justify-end gap-3 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="px-5 py-2.5 rounded-lg text-sm font-semibold text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-semibold bg-[--color-primary] text-white hover:bg-[--color-primary]/90 disabled:opacity-60 disabled:cursor-not-allowed transition-colors shadow-lg shadow-[--color-primary]/20"
            >
              {saving ? (
                <>
                  <span className="material-symbols-outlined text-[18px] animate-spin">progress_activity</span>
                  Creando...
                </>
              ) : (
                <>
                  <span className="material-symbols-outlined text-[18px]">add</span>
                  Crear Lote
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function BatchesPage() {
  const [batches, setBatches] = useState<Batch[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<TabType>('all');
  const [showModal, setShowModal] = useState(false);

  // Search
  const [searchQuery, setSearchQuery] = useState('');

  // Filter state
  const [showFilters, setShowFilters] = useState(false);
  const [filterMaterial, setFilterMaterial] = useState('');
  const [filterDateFrom, setFilterDateFrom] = useState('');
  const [filterDateTo, setFilterDateTo] = useState('');

  useEffect(() => {
    fetchBatches();
  }, []);

  const fetchBatches = async () => {
    setLoading(true);
    try {
      const response = await fetch(
        'http://localhost:1337/api/batches?populate=material&pagination[pageSize]=200&sort=createdAt:desc'
      );
      const data = await response.json();
      setBatches(data.data || []);
    } catch (error) {
      console.error('Error fetching batches:', error);
    } finally {
      setLoading(false);
    }
  };

  // Unique materials for filter dropdown
  const uniqueMaterials = useMemo(() => {
    const seen = new Set<string>();
    const mats: { id: number; name: string }[] = [];
    batches.forEach((b) => {
      if (b.material && !seen.has(b.material.name)) {
        seen.add(b.material.name);
        mats.push({ id: b.material.id, name: b.material.name });
      }
    });
    return mats;
  }, [batches]);

  // Filtered + searched batches
  const filteredBatches = useMemo(() => {
    let result = [...batches];

    // Tab filter
    switch (activeTab) {
      case 'pending':
        result = result.filter((b) => !b.ai_status || b.ai_status === 'Pendiente');
        break;
      case 'flagged':
        result = result.filter((b) => b.ai_status && FLAGGED_STATUSES.includes(b.ai_status));
        break;
      case 'archived':
        result = result.filter((b) => b.ai_status === 'Archivado');
        break;
    }

    // Search query (id, material name, status)
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        (b) =>
          (b.idBatch || '').toLowerCase().includes(q) ||
          (b.material?.name || '').toLowerCase().includes(q) ||
          (b.material?.type || '').toLowerCase().includes(q) ||
          (b.material?.code || '').toLowerCase().includes(q) ||
          (b.ai_status || 'pendiente').toLowerCase().includes(q)
      );
    }

    // Material filter
    if (filterMaterial) {
      result = result.filter((b) => b.material?.name === filterMaterial);
    }

    // Date from
    if (filterDateFrom) {
      const from = new Date(filterDateFrom);
      result = result.filter((b) => new Date(b.date_created || b.createdAt) >= from);
    }

    // Date to
    if (filterDateTo) {
      const to = new Date(filterDateTo);
      to.setHours(23, 59, 59, 999);
      result = result.filter((b) => new Date(b.date_created || b.createdAt) <= to);
    }

    return result;
  }, [batches, activeTab, searchQuery, filterMaterial, filterDateFrom, filterDateTo]);

  // Tab counts (only tab filter, no search/advanced filters)
  const tabCounts = useMemo(
    () => ({
      all: batches.length,
      pending: batches.filter((b) => !b.ai_status || b.ai_status === 'Pendiente').length,
      flagged: batches.filter((b) => b.ai_status && FLAGGED_STATUSES.includes(b.ai_status)).length,
      archived: batches.filter((b) => b.ai_status === 'Archivado').length,
    }),
    [batches]
  );

  const activeFiltersCount = [filterMaterial, filterDateFrom, filterDateTo].filter(Boolean).length;

  const clearFilters = () => {
    setFilterMaterial('');
    setFilterDateFrom('');
    setFilterDateTo('');
  };

  const getStatusColor = (status: string | null) => {
    switch (status) {
      case 'Homogéneo':
        return 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400';
      case 'Alerta de Tono':
      case 'Alerta de Brillo':
        return 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400';
      case 'Defecto Crítico':
        return 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400';
      case 'Archivado':
        return 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400';
      default:
        return 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400';
    }
  };

  const formatDate = (dateString: string | null) => {
    if (!dateString) return '—';
    return new Date(dateString).toLocaleDateString('es-ES', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  // CSV Export
  const exportToCSV = () => {
    const headers = ['ID de Lote', 'Material', 'Tipo', 'Código', 'Fecha de Creación', 'Estado', 'Piezas'];
    const rows = filteredBatches.map((b) => [
      b.idBatch || `#${b.id}`,
      b.material?.name || 'N/A',
      b.material?.type || 'N/A',
      b.material?.code || 'N/A',
      b.date_created || b.createdAt,
      b.ai_status || 'Pendiente',
      String(b.piece_count ?? 0),
    ]);
    const csv = [headers, ...rows]
      .map((r) => r.map((c) => `"${c.replace(/"/g, '""')}"`).join(','))
      .join('\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `lotes_cosentino_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const TabButton = ({ tab, label }: { tab: TabType; label: string }) => (
    <button
      onClick={() => setActiveTab(tab)}
      className={`pb-3 text-sm transition-colors whitespace-nowrap ${activeTab === tab
        ? 'font-bold border-b-2 border-[--color-primary] text-[--color-primary]'
        : 'font-medium text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
        }`}
    >
      {label}{' '}
      <span
        className={`ml-1 px-1.5 py-0.5 rounded text-[11px] font-bold ${activeTab === tab
          ? 'bg-[--color-primary]/10 text-[--color-primary]'
          : 'bg-slate-100 dark:bg-slate-800 text-slate-500'
          }`}
      >
        {tabCounts[tab]}
      </span>
    </button>
  );

  return (
    <>
      {/* New Batch Modal */}
      {showModal && (
        <NewBatchModal
          onClose={() => setShowModal(false)}
          onCreated={fetchBatches}
          batches={batches}
        />
      )}

      <div className="bg-[--color-background-light] dark:bg-[--color-background-dark] min-h-screen flex">
        <Sidebar />
        <main className="flex-1 ml-64 flex flex-col">
          {/* Inline Header with search + Nuevo Lote */}
          <header className="h-16 border-b border-slate-200 dark:border-slate-800 bg-white/80 dark:bg-slate-900/80 backdrop-blur-md sticky top-0 z-10 px-8 flex items-center justify-between">
            {/* Search bar */}
            <div className="relative w-full max-w-md">
              <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-xl">
                search
              </span>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-10 py-2 bg-slate-100 dark:bg-slate-800 border-none rounded-lg text-sm focus:ring-2 focus:ring-[--color-primary]/50 transition-all outline-none placeholder:text-slate-400"
                placeholder="Buscar por ID de lote, material, estado..."
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

            {/* Right actions */}
            <div className="flex items-center gap-3">
              <button
                onClick={() => setShowModal(true)}
                className="flex items-center gap-2 bg-[--color-primary] text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-[--color-primary]/90 transition-colors shadow-lg shadow-[--color-primary]/20"
              >
                <span className="material-symbols-outlined text-sm">add</span>
                Nuevo Lote
              </button>
            </div>
          </header>

          <div className="p-8">
            <div className="flex flex-col gap-6">

              {/* Page title row */}
              <div className="flex items-end justify-between">
                <div className="flex flex-col gap-1">
                  <h2 className="text-3xl font-black tracking-tight text-slate-900 dark:text-slate-100">
                    Listado de Lotes
                  </h2>
                  <p className="text-slate-500 dark:text-slate-400">
                    Monitorea y gestiona el estado de calidad de los lotes de todas las líneas de producción.
                  </p>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={exportToCSV}
                    className="flex items-center gap-2 px-4 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-sm font-medium hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
                  >
                    <span className="material-symbols-outlined text-[20px]">file_download</span>
                    Exportar CSV
                    {filteredBatches.length > 0 && (
                      <span className="ml-0.5 text-xs text-slate-400">({filteredBatches.length})</span>
                    )}
                  </button>
                  <button
                    onClick={() => setShowFilters((v) => !v)}
                    className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors border ${showFilters || activeFiltersCount > 0
                      ? 'bg-[--color-primary] text-white border-[--color-primary]'
                      : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700'
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

              {/* Active search hint */}
              {searchQuery && (
                <div className="flex items-center gap-2 px-4 py-2.5 bg-[--color-primary]/5 border border-[--color-primary]/20 rounded-lg">
                  <span className="material-symbols-outlined text-[--color-primary] text-[18px]">search</span>
                  <span className="text-sm text-slate-600 dark:text-slate-400">
                    Resultados para <strong>&quot;{searchQuery}&quot;</strong>:{' '}
                    <strong className="text-[--color-primary]">{filteredBatches.length}</strong> lote
                    {filteredBatches.length !== 1 ? 's' : ''}
                  </span>
                  <button
                    onClick={() => setSearchQuery('')}
                    className="ml-auto text-xs font-semibold text-[--color-primary] hover:underline"
                  >
                    Limpiar búsqueda
                  </button>
                </div>
              )}

              {/* Filter Panel */}
              {showFilters && (
                <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 flex flex-col gap-4 shadow-sm">
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
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    {/* Material */}
                    <div className="flex flex-col gap-1.5">
                      <label className="text-xs font-bold uppercase tracking-wider text-slate-500">Material</label>
                      <div className="relative">
                        <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-[18px]">
                          category
                        </span>
                        <select
                          value={filterMaterial}
                          onChange={(e) => setFilterMaterial(e.target.value)}
                          className="w-full pl-9 pr-10 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-sm text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-2 focus:ring-[--color-primary]/30 appearance-none"
                        >
                          <option value="">Todos los materiales</option>
                          {uniqueMaterials.map((m) => (
                            <option key={m.id} value={m.name}>{m.name}</option>
                          ))}
                        </select>
                        <span className="material-symbols-outlined absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 text-[18px] pointer-events-none">
                          expand_more
                        </span>
                      </div>
                    </div>

                    {/* Date from */}
                    <div className="flex flex-col gap-1.5">
                      <label className="text-xs font-bold uppercase tracking-wider text-slate-500">Desde</label>
                      <div className="relative">
                        <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-[18px]">
                          calendar_today
                        </span>
                        <input
                          type="date"
                          value={filterDateFrom}
                          onChange={(e) => setFilterDateFrom(e.target.value)}
                          className="w-full pl-9 pr-4 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-sm text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-2 focus:ring-[--color-primary]/30"
                        />
                      </div>
                    </div>

                    {/* Date to */}
                    <div className="flex flex-col gap-1.5">
                      <label className="text-xs font-bold uppercase tracking-wider text-slate-500">Hasta</label>
                      <div className="relative">
                        <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-[18px]">
                          event
                        </span>
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
                        <strong className="text-[--color-primary]">{filteredBatches.length}</strong> de{' '}
                        <strong>{batches.length}</strong> lotes con filtros aplicados.
                      </span>
                    </div>
                  )}
                </div>
              )}

              {/* Tabs */}
              <div className="border-b border-slate-200 dark:border-slate-800 flex gap-8">
                <TabButton tab="all" label="Todos los Lotes" />
                <TabButton tab="pending" label="Pendientes de Revisión" />
                <TabButton tab="flagged" label="Marcados" />
                <TabButton tab="archived" label="Archivados" />
              </div>

              {/* Table */}
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-slate-50 dark:bg-slate-800/50">
                        <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider text-slate-500 border-b border-slate-200 dark:border-slate-800">ID de Lote</th>
                        <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider text-slate-500 border-b border-slate-200 dark:border-slate-800">Nombre del Material</th>
                        <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider text-slate-500 border-b border-slate-200 dark:border-slate-800">Fecha de Creación</th>
                        <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider text-slate-500 border-b border-slate-200 dark:border-slate-800">Piezas</th>
                        <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider text-slate-500 border-b border-slate-200 dark:border-slate-800 text-center">Estado</th>
                        <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider text-slate-500 border-b border-slate-200 dark:border-slate-800 text-right">Acciones</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                      {loading ? (
                        <tr>
                          <td colSpan={6} className="px-6 py-12 text-center">
                            <div className="flex flex-col items-center gap-3 text-slate-400">
                              <span className="material-symbols-outlined text-4xl animate-spin">progress_activity</span>
                              <span className="text-sm">Cargando lotes...</span>
                            </div>
                          </td>
                        </tr>
                      ) : filteredBatches.length === 0 ? (
                        <tr>
                          <td colSpan={6} className="px-6 py-16 text-center">
                            <div className="flex flex-col items-center gap-3 text-slate-400">
                              <span className="material-symbols-outlined text-5xl">inventory_2</span>
                              <div>
                                <p className="text-sm font-semibold text-slate-500">
                                  {batches.length === 0
                                    ? 'No hay lotes disponibles'
                                    : searchQuery
                                      ? `Sin resultados para "${searchQuery}"`
                                      : 'No hay lotes que coincidan con los filtros'}
                                </p>
                                {(activeFiltersCount > 0 || activeTab !== 'all' || searchQuery) && (
                                  <button
                                    onClick={() => { clearFilters(); setActiveTab('all'); setSearchQuery(''); }}
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
                        filteredBatches.map((batch) => (
                          <tr key={batch.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors group">
                            <td className="px-6 py-4">
                              <span className="text-sm font-mono font-bold text-slate-900 dark:text-slate-100">
                                {batch.idBatch || `#${batch.id}`}
                              </span>
                            </td>
                            <td className="px-6 py-4">
                              <div className="flex items-center gap-3">
                                <div className="size-8 rounded bg-gradient-to-br from-slate-200 to-slate-300 dark:from-slate-700 dark:to-slate-600 flex items-center justify-center">
                                  <span className="material-symbols-outlined text-slate-500 dark:text-slate-400 text-[14px]">layers</span>
                                </div>
                                <div>
                                  <span className="text-sm font-medium text-slate-900 dark:text-slate-100">
                                    {batch.material?.name || 'N/A'}
                                  </span>
                                  {batch.material?.type && (
                                    <p className="text-xs text-slate-400">{batch.material.type}</p>
                                  )}
                                </div>
                              </div>
                            </td>
                            <td className="px-6 py-4 text-sm text-slate-500 dark:text-slate-400">
                              {formatDate(batch.date_created || batch.createdAt)}
                            </td>
                            <td className="px-6 py-4 text-sm font-semibold text-slate-700 dark:text-slate-300">
                              {batch.piece_count ?? '—'}
                            </td>
                            <td className="px-6 py-4 text-center">
                              <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold ${getStatusColor(batch.ai_status)}`}>
                                {batch.ai_status || 'Pendiente'}
                              </span>
                            </td>
                            <td className="px-6 py-4 text-right">
                              <Link
                                href={`/batches/${batch.id}/diagnosis`}
                                className="text-[--color-primary] text-sm font-bold hover:underline inline-flex items-center gap-1 group-hover:gap-2 transition-all"
                              >
                                Ver Detalles
                                <span className="material-symbols-outlined text-[16px]">arrow_forward</span>
                              </Link>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>

                {/* Footer */}
                <div className="px-6 py-4 bg-slate-50 dark:bg-slate-800/50 flex items-center justify-between border-t border-slate-200 dark:border-slate-800">
                  <span className="text-sm text-slate-500 dark:text-slate-400">
                    {filteredBatches.length > 0
                      ? `Mostrando ${filteredBatches.length} de ${batches.length} lotes`
                      : '0 lotes'}
                  </span>
                  <div className="flex gap-2">
                    <button className="p-2 border border-slate-200 dark:border-slate-700 rounded-lg hover:bg-white dark:hover:bg-slate-700 disabled:opacity-40 transition-colors" disabled>
                      <span className="material-symbols-outlined text-sm">chevron_left</span>
                    </button>
                    <button className="p-2 border border-slate-200 dark:border-slate-700 rounded-lg hover:bg-white dark:hover:bg-slate-700 transition-colors">
                      <span className="material-symbols-outlined text-sm">chevron_right</span>
                    </button>
                  </div>
                </div>
              </div>

            </div>
          </div>
        </main>
      </div>
    </>
  );
}
