# UEP · Gestión de Proyectos

Aplicación web para la gestión integral del ciclo de ejecución de programas y proyectos de una
Unidad Ejecutora (SND Paraguay), conectada a Supabase (`uepdb`) **sin modificar la estructura de la base de datos**.

## El concepto: la cadena de ejecución

Toda la app está organizada alrededor del flujo real de trabajo:

```
Actividad → Programa → Componente → Proyecto → Plan financiero (adendas)
        → CDP → Documentación → Actas → Resoluciones → Convenios
        → STR (pagos) → Devoluciones → Rendiciones de cuentas (CGR)
```

- **Menú lateral por fases numeradas**: 1·Planificación, 2·Ejecución, 3·Pagos, 4·Rendición + Mesa de entrada y Catálogos.
- **Panel de control**: KPIs, cadena de ejecución con contadores por etapa y % desembolsado vs. planificado.
- **Estructura programática**: árbol interactivo de 6 niveles (Programa → Componente → Subcomponente → Ítem → Subítem → Presupuesto anual) con montos consolidados hacia arriba y ABM en cada nivel.
- **Proyecto 360°** (`/proyectos/:id`): la ficha estrella. Pipeline visual con las 8 etapas del ciclo
  (cada casilla muestra cantidad y monto acumulado, y navega a su pestaña), embudo financiero
  (Plan → CDP → Aprobado → Desembolsado → Rendido) y pestañas con ABM contextual:
  el proyecto queda fijado automáticamente al crear registros, y los selectores (actas, planes, STR)
  se filtran a ese proyecto.
- **Listas globales** (Actas, Resoluciones, Convenios, STR, Devoluciones, Rendiciones): las mismas
  configuraciones de módulo reutilizadas en modo global, con columna y selector de proyecto.

## Stack

Vite + React 18 + TypeScript + Tailwind CSS v4 + React Router + `@supabase/supabase-js` + lucide-react.

## Arquitectura

| Ruta | Rol |
|---|---|
| `src/components/CrudModule.tsx` | Motor CRUD genérico dirigido por configuración (tabla + búsqueda + formulario modal con FKs buscables, inyección de `user_id`, filtros embebidos `!inner`) |
| `src/config/modules.tsx` | Configuraciones de cada módulo del flujo; cada builder acepta `proyectoId` opcional (modo embebido vs. global) |
| `src/pages/proyectos/ProyectoDetail.tsx` | Ficha 360° con pipeline y pestañas |
| `src/pages/planificacion/ProgramasExplorer.tsx` | Árbol jerárquico de la estructura programática |
| `src/layout/AppLayout.tsx` | Sidebar por fases del flujo + topbar |

## Ejecutar

```bash
npm install
npm run dev      # http://localhost:5180
npm run build    # verificación de tipos + build de producción
```

Credenciales en `.env` (URL y anon key del proyecto Supabase `uepdb`).

## Notas de seguridad (RLS)

Las políticas usan `get_my_role()` que lee `user_metadata.role` del JWT
(`administrador` / `usuario` / `desarrollador`). Varias tablas (p. ej. `programas`) solo son
visibles para administradores; tras cambiar el rol de un usuario hay que **volver a iniciar sesión**
para renovar el JWT.
