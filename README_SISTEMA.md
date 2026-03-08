# Cosentino Quality Tracker

Sistema de control de calidad para la producción de materiales Cosentino (Dekton, Silestone, Sensa).

## 🏗️ Arquitectura

- **Backend**: Strapi (Headless CMS)
- **Frontend**: Next.js 14 con App Router
- **Base de datos**: SQLite (desarrollo) / PostgreSQL (producción recomendado)
- **Estilos**: Tailwind CSS v4

## 📦 Estructura del Proyecto

```
cosentino/
├── src/api/              # Content Types de Strapi
│   ├── batch/           # Lotes de producción
│   ├── piece/           # Piezas individuales
│   ├── defect/          # Defectos de calidad
│   ├── material/        # Tipos de materiales
│   └── production-line/ # Líneas de producción
├── my-app/              # Frontend Next.js
│   └── app/
│       ├── batches/     # Listado de lotes
│       ├── pieces/      # Detalle de piezas
│       ├── defects/     # Registro de defectos
│       └── components/  # Componentes reutilizables
└── prototipos/          # Prototipos HTML originales
```

## 🚀 Instalación

### 1. Instalar dependencias del backend (Strapi)

```bash
cd /ruta/al/proyecto/cosentino
npm install
```

### 2. Instalar dependencias del frontend (Next.js)

```bash
cd my-app
npm install
```

### 3. Configurar variables de entorno

Copia el archivo `.env.example` a `.env` y configura las variables necesarias:

```bash
cp .env.example .env
```

## 🎯 Ejecutar el Proyecto

### Iniciar Strapi (Backend)

```bash
cd /ruta/al/proyecto/cosentino
npm run develop
```

El panel de administración de Strapi estará disponible en: `http://localhost:1337/admin`

**Primera vez**: Crea un usuario administrador cuando te lo solicite.

### Iniciar Next.js (Frontend)

```bash
cd my-app
npm run dev
```

La aplicación frontend estará disponible en: `http://localhost:3000`

## 📊 Modelos de Datos

### Material
- Nombre
- Código
- Tipo (Dekton, Silestone, Sensa)
- Descripción
- Imagen de textura

### Production Line
- Nombre
- Número de línea
- Ubicación de planta
- Tipo de proceso
- Estado

### Batch (Lote)
- ID de lote
- Material (relación)
- Línea de producción (relación)
- Fecha de creación
- Estado IA
- Estado general
- Contador de piezas

### Piece (Pieza)
- SKU
- Número de pieza
- Lote (relación)
- Dimensiones
- Grosor
- Grado de pulido
- Brillo superficial
- Homogeneidad de tono
- Estado de calidad
- Recomendación IA

### Defect (Defecto)
- Pieza (relación)
- Tipo de defecto
- Severidad
- Ubicación (X, Y)
- Imagen
- Detección IA
- Confianza IA
- Estado

## 🔧 Configuración de Strapi

1. Accede al panel de administración: `http://localhost:1337/admin`
2. Ve a **Settings** → **Users & Permissions** → **Roles** → **Public**
3. Habilita los permisos necesarios para los endpoints de la API:
   - batches: find, findOne
   - pieces: find, findOne
   - defects: find, findOne, create
   - materials: find, findOne
   - production-lines: find, findOne

## 📱 Funcionalidades Implementadas

### ✅ Backend (Strapi)
- [x] Content Types (Batch, Piece, Defect, Material, Production Line)
- [x] Relaciones entre modelos
- [x] API REST automática
- [x] Controllers y Services básicos

### ✅ Frontend (Next.js)
- [x] Layout con Sidebar y Header
- [x] Listado de lotes con filtros
- [x] Detalle de pieza con métricas de calidad
- [x] Formulario de registro de defectos
- [x] Integración con API de Strapi
- [x] Diseño responsive
- [x] Tema claro/oscuro preparado

## 🎨 Páginas Principales

1. **Dashboard** (`/`) - Redirige a Batches
2. **Listado de Lotes** (`/batches`) - Vista general de todos los lotes
3. **Detalle de Pieza** (`/pieces/[id]`) - Información técnica y métricas de calidad
4. **Registro de Defectos** (`/defects`) - Formulario para registrar nuevos defectos

## 🔜 Próximos Pasos

- [ ] Implementar autenticación de usuarios
- [ ] Agregar dashboard con estadísticas
- [ ] Implementar sistema de reportes
- [ ] Integrar sistema de análisis IA real
- [ ] Agregar carga de imágenes para defectos
- [ ] Implementar filtros avanzados
- [ ] Agregar paginación real
- [ ] Implementar búsqueda en tiempo real

## 📝 Notas

- Los datos de ejemplo se encuentran en los prototipos HTML originales
- Se recomienda usar PostgreSQL para producción
- El sistema está preparado para integración con IA de visión por computadora
- Todos los textos están en español

## 🤝 Contribuir

Este es un proyecto interno de Cosentino para control de calidad en la producción de materiales.

---

**Desarrollado para Cosentino Quality Control System**
