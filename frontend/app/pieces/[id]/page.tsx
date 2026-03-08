'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Sidebar from '../../components/Sidebar';
import Header from '../../components/Header';

interface Piece {
  id: number;
  attributes: {
    sku: string;
    piece_number: string;
    dimensions: string;
    thickness: string;
    polishing_grade: string;
    surface_brightness: number;
    tone_homogeneity: number;
    quality_status: string;
    inspection_date: string;
    ai_recommendation: string;
    defects: {
      data: Array<{
        id: number;
        attributes: {
          defect_type: string;
          severity: string;
          location_x: number;
          location_y: number;
          image: any;
        }
      }>
    };
  };
}

export default function PieceDetailPage() {
  const params = useParams();
  const router = useRouter();
  const [piece, setPiece] = useState<Piece | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (params.id) {
      fetchPiece(params.id as string);
    }
  }, [params.id]);

  const fetchPiece = async (id: string) => {
    try {
      const response = await fetch(`http://localhost:1337/api/pieces/${id}?populate=*`);
      const data = await response.json();
      setPiece(data.data);
    } catch (error) {
      console.error('Error fetching piece:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="bg-[--color-background-light] dark:bg-[--color-background-dark] min-h-screen flex">
        <Sidebar />
        <main className="flex-1 ml-64 flex items-center justify-center">
          <p className="text-slate-500">Cargando...</p>
        </main>
      </div>
    );
  }

  if (!piece) {
    return (
      <div className="bg-[--color-background-light] dark:bg-[--color-background-dark] min-h-screen flex">
        <Sidebar />
        <main className="flex-1 ml-64 flex items-center justify-center">
          <p className="text-slate-500">Pieza no encontrada</p>
        </main>
      </div>
    );
  }

  const defect = piece.attributes.defects?.data?.[0];

  return (
    <div className="bg-[--color-background-light] dark:bg-[--color-background-dark] min-h-screen flex">
      <Sidebar />
      <main className="flex-1 ml-64 flex flex-col overflow-y-auto">
        <Header />
        <div className="p-8 space-y-8">
          <div className="flex flex-wrap justify-between items-end gap-4">
            <div>
              <button 
                onClick={() => router.back()}
                className="flex items-center gap-2 text-slate-500 hover:text-slate-700 mb-2"
              >
                <span className="material-symbols-outlined">arrow_back</span>
                Volver
              </button>
              <h2 className="text-3xl font-black tracking-tight text-slate-900 dark:text-slate-100">
                Detalle de Pieza: {piece.attributes.sku}
              </h2>
              <p className="text-slate-500 dark:text-slate-400">
                Última actualización: {new Date(piece.attributes.inspection_date).toLocaleString('es-ES')}
              </p>
            </div>
            <div className="flex gap-3">
              <button className="flex items-center gap-2 px-4 py-2 border border-slate-200 dark:border-slate-700 rounded-lg text-sm font-semibold hover:bg-slate-50 dark:hover:bg-slate-800">
                <span className="material-symbols-outlined text-lg">download</span>
                Exportar Reporte
              </button>
              <button className="flex items-center gap-2 px-4 py-2 bg-[--color-primary]/10 text-[--color-primary] border border-[--color-primary]/20 rounded-lg text-sm font-semibold hover:bg-[--color-primary]/20">
                <span className="material-symbols-outlined text-lg">psychology</span>
                Analizar Causa Raíz (IA)
              </button>
              <button className="flex items-center gap-2 px-4 py-2 bg-[--color-primary] text-white rounded-lg text-sm font-semibold hover:bg-[--color-primary]/90">
                <span className="material-symbols-outlined text-lg">check_circle</span>
                Aprobar Pieza
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            <div className="lg:col-span-2 space-y-8">
              <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-6 shadow-sm">
                <h3 className="text-slate-900 dark:text-white font-bold mb-6 flex items-center gap-2">
                  <span className="material-symbols-outlined text-[--color-primary]">info</span>
                  Especificaciones Técnicas
                </h3>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-y-6 gap-x-8">
                  <div>
                    <p className="text-slate-500 dark:text-slate-400 text-xs uppercase tracking-wider font-bold mb-1">Número de Pieza</p>
                    <p className="text-slate-900 dark:text-slate-100 font-medium">{piece.attributes.piece_number}</p>
                  </div>
                  <div>
                    <p className="text-slate-500 dark:text-slate-400 text-xs uppercase tracking-wider font-bold mb-1">Dimensiones</p>
                    <p className="text-slate-900 dark:text-slate-100 font-medium">{piece.attributes.dimensions}</p>
                  </div>
                  <div>
                    <p className="text-slate-500 dark:text-slate-400 text-xs uppercase tracking-wider font-bold mb-1">Grosor</p>
                    <p className="text-slate-900 dark:text-slate-100 font-medium">{piece.attributes.thickness}</p>
                  </div>
                  <div>
                    <p className="text-slate-500 dark:text-slate-400 text-xs uppercase tracking-wider font-bold mb-1">Grado de Pulido</p>
                    <p className="text-slate-900 dark:text-slate-100 font-medium">{piece.attributes.polishing_grade}</p>
                  </div>
                  <div>
                    <p className="text-slate-500 dark:text-slate-400 text-xs uppercase tracking-wider font-bold mb-1">Estado de Calidad</p>
                    <p className="text-slate-900 dark:text-slate-100 font-medium">{piece.attributes.quality_status}</p>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-6 shadow-sm">
                  <h3 className="text-slate-900 dark:text-white font-bold mb-8 text-center">Brillo de Superficie</h3>
                  <div className="relative flex justify-center">
                    <svg className="w-48 h-48 -rotate-90">
                      <circle className="text-slate-100 dark:text-slate-800" cx="96" cy="96" fill="transparent" r="88" stroke="currentColor" strokeWidth="12"></circle>
                      <circle 
                        className="text-[--color-primary]" 
                        cx="96" 
                        cy="96" 
                        fill="transparent" 
                        r="88" 
                        stroke="currentColor" 
                        strokeDasharray="553" 
                        strokeDashoffset={553 - (553 * (piece.attributes.surface_brightness || 0) / 100)} 
                        strokeLinecap="round" 
                        strokeWidth="12"
                      ></circle>
                    </svg>
                    <div className="absolute inset-0 flex flex-col items-center justify-center">
                      <span className="text-3xl font-black text-slate-900 dark:text-white">{piece.attributes.surface_brightness || 0}%</span>
                      <span className="text-xs text-slate-500 font-bold uppercase tracking-widest">Nivel GU</span>
                    </div>
                  </div>
                  <p className="mt-6 text-center text-sm text-slate-500">Objetivo: 80% - 85% GU</p>
                </div>
                <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-6 shadow-sm">
                  <h3 className="text-slate-900 dark:text-white font-bold mb-8 text-center">Homogeneidad de Tono</h3>
                  <div className="relative flex justify-center">
                    <svg className="w-48 h-48 -rotate-90">
                      <circle className="text-slate-100 dark:text-slate-800" cx="96" cy="96" fill="transparent" r="88" stroke="currentColor" strokeWidth="12"></circle>
                      <circle 
                        className="text-emerald-500" 
                        cx="96" 
                        cy="96" 
                        fill="transparent" 
                        r="88" 
                        stroke="currentColor" 
                        strokeDasharray="553" 
                        strokeDashoffset={553 - (553 * (piece.attributes.tone_homogeneity || 0) / 100)} 
                        strokeLinecap="round" 
                        strokeWidth="12"
                      ></circle>
                    </svg>
                    <div className="absolute inset-0 flex flex-col items-center justify-center">
                      <span className="text-3xl font-black text-slate-900 dark:text-white">{piece.attributes.tone_homogeneity || 0}%</span>
                      <span className="text-xs text-slate-500 font-bold uppercase tracking-widest">Similitud</span>
                    </div>
                  </div>
                  <p className="mt-6 text-center text-sm text-slate-500">Objetivo: &gt;95% ΔE Standard</p>
                </div>
              </div>
            </div>

            <div className="space-y-8">
              {defect && (
                <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-sm">
                  <div className="p-4 bg-red-50 dark:bg-red-900/10 border-b border-red-100 dark:border-red-900/20 flex justify-between items-center">
                    <span className="text-red-600 dark:text-red-400 text-sm font-bold flex items-center gap-1">
                      <span className="material-symbols-outlined text-sm">warning</span> Defecto Registrado
                    </span>
                    <span className="text-xs text-red-500 font-medium">{defect.attributes.defect_type}</span>
                  </div>
                  <div className="aspect-square bg-slate-200 dark:bg-slate-800 flex items-center justify-center relative group">
                    <span className="text-slate-400">Imagen del defecto</span>
                    <div className="absolute top-1/3 left-1/4 w-8 h-8 border-2 border-red-500 rounded-sm"></div>
                  </div>
                  <div className="p-4 bg-slate-50 dark:bg-slate-800/50">
                    <div className="flex justify-between items-center mb-2">
                      <span className="text-xs font-bold text-slate-500 dark:text-slate-400">
                        Ubicación: (X: {defect.attributes.location_x}, Y: {defect.attributes.location_y})
                      </span>
                      <span className="text-xs font-bold text-slate-500 dark:text-slate-400">
                        Gravedad: {defect.attributes.severity}
                      </span>
                    </div>
                  </div>
                </div>
              )}
              {piece.attributes.ai_recommendation && (
                <div className="bg-[--color-primary]/5 dark:bg-[--color-primary]/10 rounded-xl border border-[--color-primary]/10 p-6">
                  <h4 className="text-[--color-primary] font-bold mb-4 flex items-center gap-2">
                    <span className="material-symbols-outlined">auto_awesome</span>
                    Recomendación IA
                  </h4>
                  <p className="text-slate-700 dark:text-slate-300 text-sm leading-relaxed mb-6">
                    {piece.attributes.ai_recommendation}
                  </p>
                  <button className="w-full py-3 bg-white dark:bg-slate-800 border border-[--color-primary]/20 text-[--color-primary] text-sm font-bold rounded-lg hover:shadow-md transition-shadow">
                    Ver historial de fallos similares
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
