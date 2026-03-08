import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';

const genai = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');

const STRAPI = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:1337';
const STRAPI_TOKEN = process.env.NEXT_PUBLIC_API_TOKEN;

// ─── Fetch historical defects from Strapi ─────────────────────────────────────
async function fetchHistoricalContext(): Promise<string> {
    try {
        const headers: HeadersInit = { 'Content-Type': 'application/json' };
        if (STRAPI_TOKEN) headers['Authorization'] = `Bearer ${STRAPI_TOKEN}`;

        const res = await fetch(
            `${STRAPI}/api/defects?sort=createdAt:desc&pagination[pageSize]=50&publicationState=preview&fields[0]=type&fields[1]=severity&fields[2]=description&fields[3]=defect_type`,
            { headers }
        );
        if (!res.ok) return '';

        const data = await res.json();
        const defects: any[] = data.data || [];
        if (defects.length === 0) return '';

        // Count frequencies per defect type
        const freq: Record<string, { count: number; severities: string[]; samples: string[] }> = {};
        for (const d of defects) {
            const type = (d.type || d.defect_type || '').trim();
            const severity = (d.severity || '').trim();
            const desc = (d.description || '').trim();
            if (!type) continue;
            if (!freq[type]) freq[type] = { count: 0, severities: [], samples: [] };
            freq[type].count++;
            if (severity) freq[type].severities.push(severity);
            if (desc && freq[type].samples.length < 2) freq[type].samples.push(desc);
        }

        const total = defects.length;
        const sorted = Object.entries(freq).sort((a, b) => b[1].count - a[1].count);

        const lines = sorted.map(([type, info]) => {
            const pct = ((info.count / total) * 100).toFixed(0);
            const mainSeverity = info.severities.length > 0
                ? mostCommon(info.severities)
                : 'desconocida';
            const example = info.samples[0] ? ` Ejemplo: "${info.samples[0]}"` : '';
            return `  - "${type}": ${info.count} casos (${pct}%), severidad más común: ${mainSeverity}.${example}`;
        });

        return `
HISTORIAL REAL DE DEFECTOS DE ESTA PLANTA (últimos ${total} registros):
${lines.join('\n')}

Usa este historial como referencia principal al clasificar el tipo de defecto.
Si la imagen muestra un patrón similar a los defectos más frecuentes de la planta,
prioriza esa clasificación y ajusta tu confianza al alza.`;
    } catch (e) {
        console.warn('[AI] Could not fetch historical defects:', e);
        return '';
    }
}

function mostCommon(arr: string[]): string {
    const freq: Record<string, number> = {};
    for (const v of arr) freq[v] = (freq[v] || 0) + 1;
    return Object.entries(freq).sort((a, b) => b[1] - a[1])[0]?.[0] ?? arr[0];
}

// ─── Machine diagnosis map ────────────────────────────────────────────────────
const MACHINE_DIAGNOSIS: Record<string, { machines: string[]; instructions: string[] }> = {
    fisura: {
        machines: ['Prensa hidráulica', 'Cortadora de disco'],
        instructions: [
            'Verificar la presión de compactación (debe estar entre 80–100 bar).',
            'Revisar el estado de las matrices y moldes por desgaste.',
            'Comprobar la humedad del compuesto antes del prensado.',
            'Inspeccionar el sistema de enfriamiento post-prensado.',
        ],
    },
    grieta: {
        machines: ['Prensa hidráulica', 'Horno de curado'],
        instructions: [
            'Revisar los ciclos de temperatura del horno (gradiente máximo: 5°C/min).',
            'Verificar la uniformidad de la presión en toda la superficie.',
            'Controlar el tiempo de curado y la rampa de enfriamiento.',
        ],
    },
    rotura: {
        machines: ['Cortadora CNC', 'Cortadora de disco'],
        instructions: [
            'Inspeccionar el estado del disco de corte (cambiar si desgaste > 20%).',
            'Verificar la velocidad de avance y de giro del husillo.',
            'Comprobar la fijación de la pieza al sistema de vacío.',
            'Revisar la refrigeración del sistema de corte.',
        ],
    },
    mancha: {
        machines: ['Sistema de pulido', 'Línea de aplicación de resina'],
        instructions: [
            'Verificar la concentración y calidad del producto de pulido.',
            'Revisar las almohadillas de pulido por contaminación.',
            'Comprobar la dosificación del sistema de resina.',
            'Limpiar los rodillos de la línea de aplicación.',
        ],
    },
    poro: {
        machines: ['Prensa hidráulica', 'Sistema de vacío'],
        instructions: [
            'Revisar el nivel de vacío durante el prensado (< -0.8 bar).',
            'Comprobar sellos y juntas del sistema de vacío.',
            'Verificar la mezcla de cuarzo y resina (proporción y homogeneidad).',
        ],
    },
    rayaduras: {
        machines: ['Sistema de pulido', 'Línea de transporte'],
        instructions: [
            'Inspeccionar las correas y rodillos de la línea de transporte.',
            'Verificar la secuencia de granos abrasivos del pulido.',
            'Revisar los sistemas de sujeción y apoyo de piezas.',
        ],
    },
    burbuja: {
        machines: ['Prensa hidráulica', 'Sistema de vacío', 'Horno de curado'],
        instructions: [
            'Revisar el tiempo de desgasificación antes del prensado.',
            'Ajustar el ciclo de vacío (mínimo 5 min de mantenimiento).',
            'Verificar la viscosidad de la resina en el momento de la mezcla.',
        ],
    },
    default: {
        machines: ['Revisar toda la línea de producción'],
        instructions: [
            'Realizar inspección visual de toda la línea.',
            'Contactar con el técnico de mantenimiento.',
            'Registrar el defecto con fotografías para análisis posterior.',
        ],
    },
};

function getMachineDiagnosis(defectType: string, description: string) {
    const text = `${defectType} ${description}`.toLowerCase();
    for (const [key, value] of Object.entries(MACHINE_DIAGNOSIS)) {
        if (key !== 'default' && text.includes(key)) return value;
    }
    return MACHINE_DIAGNOSIS.default;
}

// ─── POST handler ─────────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
    try {
        const apiKey = process.env.GEMINI_API_KEY;
        if (!apiKey || apiKey === 'PEGA_AQUI_TU_API_KEY') {
            return NextResponse.json(
                { error: 'GEMINI_API_KEY no configurada. Añádela en .env.local' },
                { status: 500 }
            );
        }

        const body = await req.json();
        const { imageBase64, mimeType = 'image/jpeg' } = body;

        if (!imageBase64) {
            return NextResponse.json({ error: 'No se proporcionó imagen' }, { status: 400 });
        }

        // 1️⃣ Fetch historical context from the plant's own defect records
        const historicalContext = await fetchHistoricalContext();

        // 2️⃣ Build the few-shot enhanced prompt
        const prompt = `Actúa como un experto en control de calidad de materiales de superficie (Silestone, Dekton, Sensa) especializado en esta planta de producción.

Analiza esta imagen buscando defectos visibles como: fisuras, grietas, roturas de canto, manchas químicas, poros, burbujas, rayaduras o decoloración.
${historicalContext}

Responde ÚNICAMENTE con un JSON válido con esta estructura exacta:
{
  "detectado": true o false,
  "tipo": "nombre del defecto principal en español (usa exactamente los mismos nombres del historial si coincide)",
  "severidad": "bajo" | "medio" | "alto",
  "confianza": número entre 0 y 100,
  "descripcion": "descripción breve y clara del defecto en una sola frase",
  "coincidencia_historica": true o false
}

"coincidencia_historica" debe ser true si el defecto detectado coincide con alguno del historial de la planta.
Si no detectas ningún defecto evidente, pon "detectado": false y el resto en null.
No incluyas markdown, solo el JSON puro.`;

        // 3️⃣ Call Gemini with fallback models
        const MODELS = ['gemini-2.5-flash', 'gemini-2.0-flash-lite'];
        let result: any;
        let lastError: any;

        for (const modelName of MODELS) {
            try {
                const model = genai.getGenerativeModel({ model: modelName });
                result = await model.generateContent([
                    prompt,
                    { inlineData: { data: imageBase64, mimeType } },
                ]);
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
                        ? 'Cuota de la API de Gemini agotada. Espera unos minutos o habilita la facturación en https://ai.dev/rate-limit'
                        : lastError?.message || 'No se pudo contactar con la IA',
                    rateLimited: is429,
                },
                { status: is429 ? 429 : 500 }
            );
        }

        const text = result.response.text().trim();

        const jsonMatch = text.match(/\{[\s\S]*\}/);
        if (!jsonMatch) {
            return NextResponse.json({ error: 'No se pudo parsear la respuesta de la IA', raw: text }, { status: 500 });
        }

        const analysis = JSON.parse(jsonMatch[0]);

        // 4️⃣ Machine diagnosis based on detected defect
        let machineDiagnosis = null;
        if (analysis.detectado && analysis.tipo) {
            machineDiagnosis = getMachineDiagnosis(analysis.tipo, analysis.descripcion || '');
        }

        return NextResponse.json({
            ...analysis,
            machineDiagnosis,
            usedHistoricalData: historicalContext.length > 0,
        });
    } catch (err: any) {
        console.error('[AI Analyze] Error:', err);
        return NextResponse.json({ error: err.message || 'Error interno del servidor' }, { status: 500 });
    }
}
