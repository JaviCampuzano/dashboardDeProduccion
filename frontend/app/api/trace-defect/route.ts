import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';

const genai = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');

// ─── Production process stages ────────────────────────────────────────────────
const PRODUCTION_STAGES = [
    {
        id: 'mezcla',
        name: 'Mezcla y dosificación',
        machines: ['Dosificadora de cuarzo', 'Mezcladora de resina', 'Báscula de precisión'],
        failSigns: ['burbuja', 'poro', 'heterogéneo', 'mezcla', 'dosificación', 'composición'],
    },
    {
        id: 'prensado',
        name: 'Prensado y compactación',
        machines: ['Prensa hidráulica', 'Sistema de vacío', 'Mesa vibratoria'],
        failSigns: ['fisura', 'grieta', 'crack', 'fissure', 'presión', 'deformación', 'rotura', 'compactación'],
    },
    {
        id: 'curado',
        name: 'Curado en horno',
        machines: ['Horno de curado', 'Sistema de control de temperatura', 'Transportador de horno'],
        failSigns: ['grieta', 'decoloración', 'térm', 'temperatura', 'curado', 'color', 'tono', 'brightness'],
    },
    {
        id: 'corte',
        name: 'Corte y calibrado',
        machines: ['Cortadora CNC', 'Cortadora de disco diamantado', 'Calibradora de espesor'],
        failSigns: ['rotura', 'canto', 'borde', 'corte', 'calibre', 'espesor', 'dimensión'],
    },
    {
        id: 'pulido',
        name: 'Pulido y acabado superficial',
        machines: ['Pulidora automática', 'Línea de pulido', 'Abrasivos de acabado'],
        failSigns: ['rayadura', 'brillo', 'brightness', 'pulido', 'acabado', 'superficial', 'mancha', 'moteado', 'aspecto'],
    },
    {
        id: 'inspeccion',
        name: 'Inspección y control de calidad',
        machines: ['Cámara de visión artificial', 'Mesa de luz', 'Sensor de color'],
        failSigns: ['detect', 'patrón', 'clasificación', 'homogeneidad', 'tone'],
    },
];

// ─── Derive affected stages from defect text ──────────────────────────────────
function getAffectedStages(defectType: string, description: string, severity: string) {
    const text = `${defectType} ${description} ${severity}`.toLowerCase();
    const affected: typeof PRODUCTION_STAGES = [];
    for (const stage of PRODUCTION_STAGES) {
        if (stage.failSigns.some((sign) => text.includes(sign))) {
            affected.push(stage);
        }
    }
    // Always include at least one stage
    if (affected.length === 0) {
        const fallbackIdx = text.includes('brillo') || text.includes('brightness') ? 4
            : text.includes('grieta') || text.includes('fissure') || text.includes('crack') ? 1
                : text.includes('color') || text.includes('tono') ? 2
                    : text.includes('corte') || text.includes('canto') ? 3
                        : 0;
        affected.push(PRODUCTION_STAGES[fallbackIdx]);
    }
    return affected;
}

// ─── POST handler ─────────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
    try {
        const apiKey = process.env.GEMINI_API_KEY;
        if (!apiKey || apiKey.startsWith('PEGA_')) {
            return NextResponse.json(
                { error: 'GEMINI_API_KEY no configurada en .env.local' },
                { status: 500 }
            );
        }

        const body = await req.json();
        const {
            pieceId,
            defects = [],        // array of { defect_type, severity, description, aiConfidence }
            batchId,
            material,
            createdAt,
        } = body;

        if (!defects || defects.length === 0) {
            return NextResponse.json({ error: 'No se proporcionaron defectos para analizar' }, { status: 400 });
        }

        // Build defect summary for the prompt
        const defectSummary = defects
            .map((d: any, i: number) =>
                `  ${i + 1}. Tipo: "${d.defect_type || 'Desconocido'}" | Severidad: ${d.severity || 'N/A'} | Descripción: "${d.description || 'Sin descripción'}" | Confianza IA: ${d.aiConfidence ?? 'N/A'}%`
            )
            .join('\n');

        const prompt = `Eres un experto en control de calidad de superficies de piedra (Silestone, Dekton, Sensa) y procesos de producción de materiales compuestos de cuarzo y resina.

Analiza los siguientes defectos detectados en una pieza de producción y realiza un ANÁLISIS DE TRAZABILIDAD HACIA ATRÁS para determinar:
1. En qué etapas del proceso productivo se originó el defecto
2. Qué máquinas o equipos específicos son los más probables causantes
3. Qué parámetros de proceso revisar con prioridad
4. Cómo prevenir recurrencia

DATOS DE LA PIEZA:
- ID: ${pieceId || 'N/A'}
- Lote: ${batchId || 'N/A'}
- Material: ${material || 'N/A'}
- Fecha de producción: ${createdAt ? new Date(createdAt).toLocaleDateString('es-ES') : 'N/A'}

DEFECTOS DETECTADOS:
${defectSummary}

PROCESO PRODUCTIVO (en orden):
1. Mezcla y dosificación (dosificadora, mezcladora, báscula)
2. Prensado y compactación (prensa hidráulica, sistema de vacío, mesa vibratoria)
3. Curado en horno (horno de curado, control de temperatura)
4. Corte y calibrado (cortadora CNC, cortadora de disco, calibradora)
5. Pulido y acabado superficial (pulidora, línea de pulido, abrasivos)
6. Inspección y control de calidad (cámara de visión, mesa de luz)

Responde ÚNICAMENTE con un JSON válido con esta estructura exacta (sin markdown, sin explicaciones extra):
{
  "resumen": "Descripción breve en 1-2 frases del diagnóstico global",
  "probabilidadOrigen": "alto" | "medio" | "bajo",
  "etapasPrincipales": [
    {
      "id": "identificador_etapa",
      "nombre": "Nombre de la etapa",
      "probabilidad": número del 0 al 100,
      "razon": "Explicación de por qué esta etapa es sospechosa (max 2 frases)",
      "maquinas": ["lista", "de", "máquinas", "afectadas"],
      "acciones": ["Lista de acciones correctivas concretas"]
    }
  ],
  "maquinasPrioritarias": ["Máquina 1", "Máquina 2"],
  "parametrosCriticos": ["Parámetro 1 a revisar", "Parámetro 2 a revisar"],
  "patronRepeticion": true o false,
  "alertaEscalado": true o false,
  "recomendacionFinal": "Recomendación de acción inmediata en una frase"
}

Ordena "etapasPrincipales" de mayor a menor probabilidad. Incluye al menos 2 etapas. Sé específico con las máquinas y parámetros.`;

        // Call Gemini with fallback
        const MODELS = ['gemini-2.5-flash', 'gemini-2.0-flash-lite', 'gemini-1.5-flash'];
        let result: any;
        let lastError: any;

        for (const modelName of MODELS) {
            try {
                const model = genai.getGenerativeModel({ model: modelName });
                result = await model.generateContent([prompt]);
                break;
            } catch (err: any) {
                lastError = err;
                if (err.message?.includes('429') || err.message?.includes('quota')) continue;
                throw err;
            }
        }

        if (!result) {
            const is429 = lastError?.message?.includes('429') || lastError?.message?.includes('quota');
            return NextResponse.json(
                {
                    error: is429
                        ? 'Cuota de la API de Gemini agotada. Espera unos minutos o habilita la facturación.'
                        : lastError?.message || 'No se pudo contactar con la IA',
                    rateLimited: is429,
                    // Fallback: rule-based analysis
                    fallback: buildFallbackAnalysis(defects),
                },
                { status: is429 ? 429 : 500 }
            );
        }

        const text = result.response.text().trim();
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        if (!jsonMatch) {
            return NextResponse.json(
                { error: 'No se pudo parsear la respuesta de la IA', fallback: buildFallbackAnalysis(defects) },
                { status: 500 }
            );
        }

        const analysis = JSON.parse(jsonMatch[0]);
        return NextResponse.json({ ...analysis, aiGenerated: true });

    } catch (err: any) {
        console.error('[Trace Defect] Error:', err);
        return NextResponse.json({ error: err.message || 'Error interno del servidor' }, { status: 500 });
    }
}

// ─── Rule-based fallback (no AI needed) ──────────────────────────────────────
function buildFallbackAnalysis(defects: any[]) {
    const combined = defects.map((d) => `${d.defect_type || ''} ${d.description || ''} ${d.severity || ''}`).join(' ');
    const stages = getAffectedStages('', combined, '');

    return {
        resumen: `Se detectaron ${defects.length} defecto(s). Análisis basado en reglas de mantenimiento. Se recomienda revisión manual de las etapas identificadas.`,
        probabilidadOrigen: defects.some((d) => d.severity === 'Critical' || d.severity === 'High') ? 'alto' : 'medio',
        etapasPrincipales: stages.map((s, i) => ({
            id: s.id,
            nombre: s.name,
            probabilidad: Math.max(45, 85 - i * 20),
            razon: 'Identificado por coincidencia de palabras clave con parámetros de proceso.',
            maquinas: s.machines,
            acciones: ['Realizar inspección visual completa del equipo.', 'Verificar registros de mantenimiento del último turno.', 'Contactar con el técnico de mantenimiento.'],
        })),
        maquinasPrioritarias: stages[0]?.machines.slice(0, 2) || ['Revisar toda la línea'],
        parametrosCriticos: ['Registros de mantenimiento preventivo', 'Parámetros del último turno de producción'],
        patronRepeticion: false,
        alertaEscalado: defects.some((d) => d.severity === 'Critical'),
        recomendacionFinal: 'Detener producción de la pieza y realizar inspección de la línea con el técnico de planta.',
        aiGenerated: false,
    };
}
