# Pane — demo de workspace en "liquid glass"

Proyecto demo hecho desde cero con **React 19 + Vite + TypeScript**, inspirado en el diseño de
[Pane](https://demo.codeandchill.store/pane/): un espacio de trabajo para equipos pequeños con
superficies de vidrio, modo claro y oscuro, fondos intercambiables y animaciones con resorte.

El código, los iconos, las ilustraciones de avatares y los datos son propios. No se copió el código,
las imágenes ni las fotos de la plantilla original, que tiene licencia comercial.

## Cómo ejecutarlo

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # genera dist/ (rutas relativas, se puede servir desde cualquier carpeta)
npm run preview
```

## Páginas

| Ruta | Contenido |
| --- | --- |
| `#/home` | Saludo, anillos del día, "Up next", temporizador de focus, mis tareas, gráfico semanal, proyectos y "Right now" (equipo/actividad) |
| `#/tasks` | Tablero Kanban con **drag & drop**, vista lista agrupada y ordenable, filtros por proyecto, "Mine only", prioridad y texto |
| `#/calendar` | Vista mes y semana, panel del día con línea de "ahora", tareas que vencen y creación de eventos al hacer clic en un hueco |
| `#/projects` | Tarjetas con anillo de progreso, siguiente hito, favoritos y filtros |
| `#/projects/:id` | Detalle: resumen, personas, gráfico burn-up, hitos y tareas. Se puede fijar en la barra lateral |
| `#/insights` | Throughput (gráfico o tabla), donut por proyecto, horas de focus, carga de trabajo, puntualidad y exportación CSV (7D/30D/90D) |
| `#/team` | Tarjetas por persona con estado, hora local y carga. Filtro por equipo, perfil e invitaciones |
| `#/settings` | Perfil, notificaciones, apariencia (tema, 10 fondos, 6 acentos, vidrio claro/tintado, reducir transparencia), focus y datos |

## Acceso (simulado)

| Ruta | Contenido |
| --- | --- |
| `#/signin` | Inicio de sesión: Google/Apple simulados, email y contraseña con mostrar/ocultar, "Forgot?", "Keep me signed in" y cuentas demo de un clic |
| `#/signup` | Registro: nombre, email, contraseña con medidor de fortaleza, equipo, rol y aceptación de términos |
| `#/signedout` | Confirmación tras cerrar sesión, con "Continue as …" o "Use another account" |

- Cualquier persona del equipo de ejemplo entra con su email (por ejemplo `lin@pane.app`) y la contraseña **`pane1234`**.
- Las cuentas nuevas se guardan en `localStorage`, contraseña incluida. Es solo una demo, sin servidor.
- Sin sesión, cualquier página redirige a Sign in. Se cierra sesión desde el menú del perfil → **Sign out**.

## Interacciones globales

- **Búsqueda ⌘K / Ctrl+K o `/`**: páginas, acciones, tareas, proyectos y personas, con navegación por teclado.
- **Isla**: una píldora negra arriba que cambia de forma entre temporizador compacto, controles completos y notificaciones con "Deshacer".
- **Drawers** para tarea, evento y persona. **Modales** para nueva tarea, evento, proyecto o invitación.
- **Atajos**: `N` nueva tarea, `E` nuevo evento, `F` focus, `T` cambiar tema, `G` y luego `H/T/C/P/I/M/S` para ir a una página.
- Luz que sigue al cursor sobre el vidrio, lente deslizante en la navegación y en los controles segmentados, entrada escalonada de tarjetas, anillos y barras animados.
- Diseño adaptable: barra lateral completa, solo iconos en pantallas medianas y barra de pestañas flotante en el teléfono.

## Datos

Todo se guarda en `localStorage` del navegador (`pane-demo:data` y `pane-demo:look`). Las fechas se generan
relativas al día actual. La demo usa un reloj propio que empieza a las 10:40 AM, para que "Up next" y la línea
de "ahora" siempre tengan contenido. Para volver al estado inicial: **Settings → Data → Reset demo data**.

## Estructura

```
src/
  App.tsx              rutas por hash, atajos y efecto de luz
  store.tsx            estado global (datos, apariencia, overlays, focus, notificaciones)
  data/                tipos y datos de ejemplo
  lib/                 fechas, métricas, router y CSV
  components/          shell, isla, buscador, overlays, gráficos, iconos y piezas de UI
  pages/               una página por ruta
  styles/              tokens (temas, acentos, fondos), base, vidrio y estilos por página
```
