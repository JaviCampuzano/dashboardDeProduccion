'use client';

export default function Header() {
  return (
    <header className="h-16 border-b border-slate-200 dark:border-slate-800 bg-white/80 dark:bg-slate-900/80 backdrop-blur-md sticky top-0 z-10 px-8 flex items-center justify-between">
      <div className="flex items-center gap-4 flex-1">
        <div className="relative w-full max-w-md">
          <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-xl">search</span>
          <input
            className="w-full pl-10 pr-4 py-2 bg-slate-100 dark:bg-slate-800 border-none rounded-lg text-sm focus:ring-2 focus:ring-[--color-primary]/50 transition-all outline-none"
            placeholder="Buscar lote, material o ID..."
            type="text"
          />
        </div>
      </div>
      <div className="flex items-center gap-4">
        <button className="flex items-center gap-2 bg-[--color-primary] text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-[--color-primary]/90 transition-colors">
          <span className="material-symbols-outlined text-sm">add</span>
          Nuevo Lote
        </button>
      </div>
    </header>
  );
}
