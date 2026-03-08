'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { logout } from '@/lib/api';
import Image from 'next/image';

export default function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();

  const isActive = (path: string) => {
    if (path === '/') return pathname === '/';
    return pathname.startsWith(path);
  };

  const handleLogout = async () => {
    try {
      await logout();
    } catch (error) {
      console.error('Error al cerrar sesión:', error);
      // Forzar cierre de sesión incluso si hay error
      window.location.href = '/login';
    }
  };

  return (
    <aside className="w-64 border-r border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex flex-col fixed h-full z-20">
      <div className="p-6 border-b border-slate-100 dark:border-slate-800">
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-center bg-white dark:bg-white p-3 rounded-lg">
            <Image
              src="/Cosentino-Logo.png"
              alt="Cosentino"
              width={160}
              height={40}
              className="object-contain"
              priority
            />
          </div>
          <p className="text-slate-500 dark:text-slate-400 text-xs font-medium text-center">COSENTINO QUALITY TRACKER</p>
        </div>
      </div>

      <nav className="flex-1 px-4 py-6 space-y-2 overflow-y-auto">
        <Link
          href="/"
          className={`flex items-center gap-3 px-4 py-2.5 rounded-lg font-medium transition-all ${isActive('/') && pathname === '/'
            ? 'bg-[#1173d4] text-white'
            : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
        >
          <span className="material-symbols-outlined">dashboard</span>
          <span className="text-sm">Dashboard</span>
        </Link>

        <Link
          href="/defects"
          className={`flex items-center gap-3 px-4 py-2.5 rounded-lg font-medium transition-all ${isActive('/defects')
            ? 'bg-[#1173d4] text-white'
            : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
        >
          <span className="material-symbols-outlined">report_problem</span>
          <span className="text-sm">Registrar Fallo</span>
        </Link>

        <Link
          href="/batches"
          className={`flex items-center gap-3 px-4 py-2.5 rounded-lg font-medium transition-all ${isActive('/batches')
            ? 'bg-[#1173d4] text-white'
            : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
        >
          <span className="material-symbols-outlined">inventory_2</span>
          <span className="text-sm">Lotes</span>
        </Link>

        <Link
          href="/history"
          className={`flex items-center gap-3 px-4 py-2.5 rounded-lg font-medium transition-all ${isActive('/history')
            ? 'bg-[#1173d4] text-white'
            : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
        >
          <span className="material-symbols-outlined">history</span>
          <span className="text-sm">Historial</span>
        </Link>
      </nav>

      <div className="p-4 border-t border-slate-100 dark:border-slate-800">
        <div className="flex items-center gap-3 p-2 mb-2">
          <div className="size-8 rounded-full bg-slate-200 dark:bg-slate-700 flex items-center justify-center">
            <span className="material-symbols-outlined text-slate-500 text-sm">person</span>
          </div>
          <div className="flex flex-col flex-1">
            <span className="text-xs font-bold text-slate-900 dark:text-slate-100">RICARDO</span>
            <span className="text-[10px] text-slate-500">Turno Indefinido</span>
          </div>
        </div>
        <button
          onClick={handleLogout}
          className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-slate-100 dark:bg-slate-800 hover:bg-red-50 dark:hover:bg-red-900/20 text-slate-600 dark:text-slate-400 hover:text-red-600 dark:hover:text-red-400 rounded-lg text-sm font-medium transition-all"
        >
          <span className="material-symbols-outlined text-[18px]">logout</span>
          Cerrar Sesión
        </button>
      </div>
    </aside>
  );
}
