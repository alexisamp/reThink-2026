# reThink 2026 — Product Requirements Document

> Versión 1.0 · Reconstrucción completa desde cero · Marzo 2026

---

## 1. Visión del Producto

**reThink** es una app de escritorio para macOS que implementa el sistema de planificación anual de Farnam Street (Shane Parrish). Convierte el workbook de revisión anual en un sistema operativo de productividad: desde la reflexión anual → estrategia → planificación mensual → ejecución diaria → monitoreo de desempeño.

**Propósito central:** Que el usuario sepa exactamente qué hacer cada día para cumplir sus 3 metas más importantes del año.

---

## 2. Tech Stack

| Capa | Tecnología |
|------|-----------|
| Desktop wrapper | **Tauri v2** (Rust + WKWebView nativo macOS) |
| Frontend | **React 18 + Vite + TypeScript** |
| Estilos | **TailwindCSS v3** |
| Iconos | **Phosphor Icons** (`@phosphor-icons/react`) |
| Fuentes | Inter (sans), Lora (serif), JetBrains Mono (mono) |
| Backend | **Supabase** (PostgreSQL + Auth + RLS) |
| Estado global | React Context + custom hooks |
| Routing | React Router v6 |

### Por qué Tauri v2
- Usa WebKit nativo de macOS (mismo engine que Safari) → ~10x más liviano que Electron
- El frontend React/Vite no requiere cambios
- Soporta: ventana completa, modo compacto flotante (como Granola), menu bar, auto-updater
- Mejor rendimiento y menor footprint a largo plazo

---

## 3. Arquitectura de la App

```
reThink.app (Tauri v2)
├── Ventana principal (fullscreen)
│   └── React SPA
│       ├── /assessment    → Wizard anual (10 niveles)
│       ├── /strategy      → Strategy War Map
│       ├── /monthly       → Planificación mensual por goal
│       ├── /today         → Ejecución diaria
│       └── /dashboard     → Monitoreo de desempeño
│           └── /dashboard/goal/:id → Goal Detail Audit
└── Ventana compacta (flotante, como Granola)
    └── Vista Today sin sidebar derecho (colapsado por defecto)
```

**Supabase** (siempre conectado):
- Auth con magic link / email
- RLS habilitado en todas las tablas
- Un usuario → múltiples años de workbooks

---

## 4. Design System

### Paleta de colores

```css
--burnham:      #003720;  /* verde oscuro, color principal */
--pastel-green: #79D65E;  /* verde pastel, accent/success */
--gossip:       #E5F9BD;  /* verde claro, highlight/background accent */
--mercury:      #E3E3E3;  /* gris claro, borders y separadores */
--shuttle:      #536471;  /* gris medio, texto secundario */
--white:        #FFFFFF;  /* fondo principal */
--midnight:     #1A1A1A;  /* checkboxes completados */
```

### Tipografía

```css
font-sans:  Inter (body, UI, default)
font-serif: Lora (citas, textos editoriales, firma)
font-mono:  JetBrains Mono (números, fechas, métricas)
```

### Reglas de diseño
- **Sin dark mode** en v1
- **Border radius mínimo**: 0.25rem default, 0.5rem lg, 9999px para pills/docks
- **Sin sombras** agresivas — `border border-mercury` es el separador principal
- **Selection color**: `background: gossip (#E5F9BD), color: burnham`
- **Sin scrollbars** visibles: `scrollbar-width: none`
- **Custom checkboxes**: `appearance: none` + clip-path checkmark, completed = `background: #1A1A1A`
- **Navigation dock**: fijo en `bottom-8`, centrado, `bg-white/90 backdrop-blur-md border border-mercury rounded-full`

---

## 5. Navegación y Flujo Principal

```
Primera apertura ──────────────────────────────────────────────►  Assessment Wizard
                                                                        │
                                                              Completado (L1-L10)
                                                                        │
                                                                        ▼
Nav Dock: [ Today ] [ Monthly ] [ Strategy ] [ Dashboard ]
              │          │           │              │
              ▼          ▼           ▼              ▼
           Diario     Mensual    War Map         Métricas
                                    │              │
                                    ▼              ▼
                            Systematize       Goal Detail
                            Goal Modal         Audit View
```

### Assessment (Wizard anual)
- Se lanza automáticamente en primera apertura
- También accesible desde Strategy → botón "Annual Review [año]"
- Si ya existe workbook para el año actual, muestra el resultado (War Map strategy)
- Progresión: paso 1 de 10, barra de progreso en header

### Today (modo compacto = ventana flotante)
- En fullscreen: panel izquierdo 70% + sidebar derecho 30% (Daily Overview)
- En compacto (como Granola): solo panel izquierdo, sidebar colapsado, ventana flotante

---

## 6. Especificaciones por Pantalla

---

### 6.1 Assessment Wizard (Annual Review)

**Diseño de referencia**: `Strategic Onboarding Level 1`

**Header (fijo en todos los pasos):**
- Breadcrumb: `🏠 / Annual Review {año}`
- Link "Auto-Fill (Dev)" (solo en development)
- Progress bar: línea horizontal, la porción completada en `pastel-green`
- Progreso: `width: (paso_actual / 10) * 100%`

**Footer (fijo en todos los pasos):**
- Botón izquierdo: "Cancel" (text, shuttle)
- Botón derecho: "Next →" (burnham, flecha en pastel-green)

**Estructura de cada paso:**
```
RETHINK WORKBOOK  ← label xxs uppercase shuttle
[Título del nivel]  ← 4xl/5xl font-semibold burnham
[Subtítulo/cita]    ← lg italic font-serif shuttle
[Pregunta/instrucción]  ← 2xl font-bold burnham
[Inputs]
```

---

#### L1 — The Key to Success

**Sección**: "Rethink Workbook" / "The Key to Success"
**Subtítulo**: *"Every breakthrough starts from knowing what you want to achieve."*
**Pregunta**: "What I really want is..."

**Input**: Lista de 3 líneas (expandible a más) con:
- Número de línea a la izquierda en `font-mono text-mercury` (turns `pastel-green` on focus)
- Input `text-xl` placeholder "I want to..."
- Dot indicador a la derecha: `w-1.5 h-1.5 rounded-full bg-gossip` (visible cuando hay texto)
- Línea `border-b border-mercury` que se vuelve `border-black border-b-[1.5px]` en focus
- Primer input con `autofocus`

**Guardado en DB**: `workbook_entries` con `section_key: 'L1_KEY_SUCCESS'`, `list_order: 0..n`

---

#### L2 — An Honest Audit

**Sección**: "Rethink Workbook" / "An Honest Audit"
**Cita prompt**: *"Imagine a world-class CEO just took over your life..."*

**3 sub-secciones, cada una con 3 inputs tipo L1:**

1. **Time** — "If they looked at your calendar, where are you spending your time?"
   - `section_key: 'L2_TIME_AUDIT'`

2. **Not Working** — "What's not working for you that needs to be eliminated?"
   - `section_key: 'L2_NOT_WORKING'`

3. **Working** — "What is working and needs more energy and focus?"
   - `section_key: 'L2_WORKING'`

---

#### L3 — Map Your Horizon

**Sección**: "Map Your Horizon"
**Instrucción**: "List your top 10 goals for 2026:"

**Input**: Lista numerada 1-10 con misma UI que L1
- `section_key: 'L3_TOP_TEN'`, `list_order: 0..9`

---

#### L4 — Do Less, Better

**Sección**: "Do Less, Better"
**Instrucción**: Texto sobre el Warren Buffett quote + instrucciones para seleccionar top 3.

**UI**: 3 bloques de goal (uno por cada meta crítica):
Para cada goal (position 1, 2, 3):

```
Goal:
[Input text-xl — título del goal]

Success metric(s):         Key Metric
[Input — cómo medir]       [Input — metric breve]

Next 30 days:              Key support:
[Textarea — 1-3 steps]     [Input — quién/qué necesita]
```

Este paso **crea los 3 registros en tabla `goals`** con:
- `text`, `metric`, `next_30_days`, `key_support`, `status: 'ACTIVE'`, `position: 1|2|3`
- `workbook_id` del workbook actual

Los goals 4-10 del L3 se guardan como backlog (máximo 7, `status: 'BACKLOG'`, `position: 1..7`).

---

#### L5 — Small Steps for Momentum

**Sección**: "Small Steps for Momentum"
**Cita**: *"A marathoner who hits the wall at mile 4 doesn't think about the finish line..."*

**Input**: 3 pares:
- "I'm putting off": input text
- "Smallest first step": input text

`section_key: 'L5_MOMENTUM_BLOCK_{n}'` y `'L5_MOMENTUM_STEP_{n}'`
O simplemente como JSON pairs: `section_key: 'L5_MOMENTUM'`, `answer: JSON.stringify({block, step})`

---

#### L6 — Play to Your Strengths

**Sección**: "Play to Your Strengths"
**Cita**: *"Do what you do best and outsource the rest." — Peter Drucker*

**Input**: 3 pares (weakness / workaround)
`section_key: 'L6_WEAKNESSES'`, `answer: JSON.stringify({weakness, workaround})`

---

#### L7 — Find Your Easy Mode

**Sección**: "Find Your Easy Mode"
**Cita**: *"Invent and simplify." — Jeff Bezos*

**Input**: 3 pares (hard mode / easy mode)
`section_key: 'L7_EASY_MODE'`, `answer: JSON.stringify({hard, easy})`

---

#### L8 — The Inner Circle

**Sección**: "The Inner Circle"

**Input**: Lista de 5 personas (nombres)
`section_key: 'L8_INNER_CIRCLE'`, `list_order: 0..4`

---

#### L9 — Score the Inner Circle

**Sección**: "The Inner Circle" (continuación)

**UI**: Para cada persona del L8, mostrar su nombre + tabla de scoring:
- Information quality (+1/0/-1)
- Growth catalyst (+1/0/-1)
- Energy impact (+1/0/-1)
- Future alignment (+1/0/-1)
- Values and ethics (+1/0/-1)
- Score total (calculado)

`section_key: 'L9_SCORES'`, `answer: JSON.stringify({person, scores: {...}, total})`

---

#### L10 — Set the Rules + Commitment

**Sección**: "Set the Rules" + "Commit to Your Path"

**3 secciones de reglas, 3 inputs cada una:**
- Rules that propel (automate progress): `section_key: 'L10_RULES_PROSPER'`
- Rules that protect (guard priorities): `section_key: 'L10_RULES_PROTECT'`
- Rules that limit (retire): `section_key: 'L10_RULES_LIMIT'`

**Commitment section:**
- "What 3 insights from this review will most transform your next year?" (3 inputs): `section_key: 'L10_INSIGHTS'`
- "What one change will you implement immediately?" (1 input): `section_key: 'L10_IMMEDIATE'`
- "When will you revisit?" (date): `section_key: 'L10_REVISIT'`
- Texto del pledge (static)
- Firma: input cursive (font-serif italic grande) + lugar/fecha

**Al completar L10**: Marcar workbook `completed_at = now()`. Redirigir a Strategy.

---

### 6.2 Strategy — War Map

**Diseño de referencia**: `Full-Width Strategy War Map`

**Layout**: Full-width, `max-w-[1400px] mx-auto px-6 md:px-12 lg:px-16 py-12`

**Header:**
- Breadcrumb: `🏠 / Today / Strategy`
- Botón trash (eliminar workbook del año, con confirmación)
- Título: "Strategy War Map" + icono edit
- Year selector (pill con dropdown, `2026`)

---

**Tabla de Goals Activos (2/3 del ancho):**

Headers: `ACTIVE GOALS | MILESTONES | HABITS | (status)`

Por cada goal activo (3 máximo):
- **Col 1 (3/12)**: Nombre del goal + sub-metric. Icono edit on hover.
- **Col 2 (4/12)**: Lista de milestones con bullets (verde = completado, gris = pendiente). "+ N remaining" si hay más de 3.
- **Col 3 (3/12)**: Lista de habits con frecuencia (DAILY/WEEKLY/etc.) — separado por `border-l border-mercury`
- **Col 4 (2/12)**: Badge de status (`Active` en gossip/burnham, `Planned` en border/shuttle)

Si un goal no está sistematizado (sin milestones/habits):
- Mostrar botón dashed "Systematize Goal" → abre el **Systematize Goal Modal**

Separador `h-px bg-mercury` entre cada goal.

---

**Backlog / Not Doing (1/3 del ancho):**

`border-l border-mercury pl-8` — columna derecha

Header: `NOT DOING / BACKLOG`

Lista de goals en backlog: cada uno con:
- Nombre en `line-through decoration-mercury text-shuttle`
- Razón en texto más pequeño italic shuttle/60

---

**Manifesto 2026 (sección debajo de goals):**

`border-t border-mercury pt-12 mt-8`

Header: `MANIFESTO 2026` en uppercase tracking-widest shuttle

Timeline vertical (L1-L11):
- Número en círculo blanco con border mercury
- Label: `L{n} • {Nombre del nivel}` en uppercase xxs shuttle
- Contenido: `text-sm text-burnham border-b border-mercury/50` con hover edit button
- Editable inline (click → edit, save on blur)

**Firma al final:**
- Nombre en `font-serif italic text-3xl`
- "Committed Owner" en uppercase tiny shuttle

---

### 6.3 Systematize Goal Modal

**Diseño de referencia**: `Systematize Goal Modal View`

**Trigger**: Click en "Systematize Goal" en Strategy War Map, o en "Initialize System" en el modal.

**Layout**: Modal fullscreen overlay con backdrop blur. Grid `30% / 70%`, `h-[85vh]`, `rounded-lg border border-mercury`.

---

**Panel izquierdo (Workbook Context) — `bg-[#F8F9F9]`:**

`WORKBOOK CONTEXT` header

3 secciones del workbook del año:
- **Original Goal**: texto de L4 para este goal
- **Support**: texto de `key_support` del L4
- **Initial Step**: texto del `next_30_days` del L4

Botón fijo abajo: "Initialize System" → guarda todos los datos y cierra modal

---

**Panel derecho (Formulario):**

Header: "Systematize Goal" + badge "Synced" en pastel-green

**Sección 1 — Datos básicos:**
- Refined Objective (input `text-xl`, border-bottom)
- Key Metric (input text)
- Motivation (input text)

**Sección 2 — Leading Indicators:**

Header con icono `ph-chart-line-up`

Tabla con columnas: `Indicator Name | Annual Target`
- Bullet verde como indicador de fila
- Inputs border-bottom
- Botón "+ Add Indicator"

Guardado en tabla `leading_indicators`.

**Sección 3 — Daily System (Habits):**

Header con icono `ph-arrows-clockwise`

Por cada hábito, card con `bg-[#F8F9F9] border-l-[2px] border-pastel-green`:
- **Habit Name**: input
- **Frequency**: select (Daily / Weekly / Weekdays)
- **Time**: input "08:00"
- **Reward**: `Reward: [nombre] · [descripción italic]`

Botón "+ Add Habit"

Guardado en tabla `habits`.

**Sección 4 — Milestones:**

Header con icono `ph-flag`

Timeline vertical (`pl-[22px]`, línea `left-0 bg-mercury`):
- Por cada milestone: bullet verde, select de mes, input de texto
- "+ Add Milestone" al final

Guardado en tabla `milestones`.

---

### 6.4 Monthly

**Diseño de referencia**: `Today Dashboard Overview (Strategy view)`

**Layout**: `h-screen overflow-hidden flex` — dos paneles fijos sin scroll de página.

**Bottom dock**: Tabs con los 3 goals activos (nombre corto o número) para filtrar el contenido.

---

**Panel izquierdo (70%) — scroll interno:**

`px-16 py-12`

Header:
- Breadcrumb: `🏠 / Strategy / {nombre del goal filtrado}`
- Título del goal: `text-2xl font-medium`
- Month/year selector (pill con dropdown): "January 2026"
- Botón edit (icono lápiz)

---

**Sección: Key Performance Indicators**

`text-[11px] font-bold uppercase tracking-[0.2em]` header + año en font-mono

Tabla con:
- **Header row**: `Metric | Jan | Feb | Mar | Apr | ... | Dec`
- **Lagging indicator** (destacado, `bg-mercury/10 -mx-4 px-4`):
  - Nombre del goal metric (ej. "Revenue (MRR)")
  - "Lagging Indicator" label
  - Por cada mes: actual (bold) + target (pequeño hover tooltip)
  - Meses pasados: valores reales. Meses futuros: `opacity-30` con solo target.
- **Leading indicators** (de `leading_indicators` tabla):
  - Misma estructura pero sin highlight especial
  - `border-b border-mercury/50 pb-4` entre cada fila

Datos: `monthly_kpi_entries` para actual, `leading_indicators.annual_target / 12` para target.
Inline editing: click en celda → input → blur para guardar.

---

**Sección: Supporting Habits**

`SUPPORTING HABITS | Consistency Score: {porcentaje}%`

Lista de habits del goal, por cada uno:
- Nombre + tag de categoría
- `{días_completados}/{días_del_mes} days` o `{semanas}/{semanas_del_mes} weeks`
- Progress bar `w-20 h-[1px]` en pastel-green
- Botón "+ Add habit..." al final (dashed)

Datos de `habits` + `habit_logs` del mes seleccionado.

---

**Sección: Milestones Timeline**

`MILESTONES TIMELINE | {Q actual}`

Lista de milestones del goal con:
- Custom checkbox (completed → `bg-midnight`)
- Nombre del milestone
- Tags: status badge (Overdue/Critical/Growth) + fecha

Completar un milestone → `milestones.status = 'COMPLETED'`, `completed_at = now()`

Botón "+ Add milestone..." al final (dashed)

---

**Panel derecho (30%) — Monthly Recap:**

`border-l border-mercury h-full flex flex-col`

Header: "Monthly Recap" + botón X (colapsar sidebar)

**Progress section:**
- To-Dos: `{completados}/{total}` con progress bar pastel-green
- Milestones: `{completados}/{total}` con progress bar
- Habits: `{porcentaje}%` con progress bar

**Energy Average:**
Esferas `w-10 h-10 rounded-full`:
- Completadas: `bg-gossip text-burnham`
- Parcial: gradiente gossip/white
- Vacías: `border border-mercury`

Calculado del promedio de `reviews.energy_level` del mes.

**Notes:**
`textarea` libre — guardado en `monthly_plans.notes`

**Footer**: Botón "CONFIRM & COMMIT" → guarda el monthly plan y marca como confirmado.

---

### 6.5 Today

**Diseño de referencia**: `Today Dashboard Overview (Today view)`

**Layout**: `h-screen overflow-hidden flex` — dos paneles.

**Compact mode (Granola-style)**: Ventana flotante con solo panel izquierdo, sidebar derecho colapsado. Opción de expandir sidebar.

---

**Panel izquierdo (70%) — scroll interno:**

`px-16 py-12`

Breadcrumb: `🏠 / Today`

---

**Quick Add (top):**

```
[ To-Do ▾ ] [ Input: "What needs to get done?" ]
              [ # Add Goal ] [ AM / PM ] [ ⚡ Deep ]
```

- Dropdown tipo: To-Do / Milestone / Habit
- Input `text-2xl font-medium placeholder-gray-300`
- Tags opcionales:
  - `# Add Goal` → selector del goal al que pertenece
  - `AM / PM` → time block
  - `⚡ Deep` → es deep work (background gossip/burnham)

---

**Sección: To-Dos**

Header: `TO-DOS | {N} Pending`

Lista pendientes:
- Custom checkbox
- Texto `text-base font-medium`
- Tags: Goal, AM/PM, Deep
- Hover: `bg-gray-50/50`
- Click checkbox → tacha + mueve a "Done"

Separador dashed → "Done" subheader → lista de completados con `line-through decoration-pastel text-shuttle opacity-60`

Botón "Add task..." dashed al final.

---

**Sección: Milestones**

Igual que To-Dos pero muestra milestones del mes actual.
- Al completar: actualiza `milestones.status = 'COMPLETED'`
- Tag: Goal + fecha del milestone

---

**Sección: Habits**

Header: `HABITS | {N} Pending`

Por cada hábito del día (según frecuencia):
- Custom checkbox
- Nombre + tag de Goal
- Hora programada en font-mono
- Botón edit (icono lápiz)
- Botón "**Commit**" en gossip (marcar sin checkbox) → crea `habit_logs` con `value = 1`

Done: `line-through`, muestra tiempo de log + reward si aplica (ícono `ph-gift`)

---

**Panel derecho (30%) — Daily Overview (colapsable):**

Header: "Daily Overview" + botón X (colapsar)
Cuando colapsado: mostrar solo un tab/botón para re-abrir.

**Today's Progress:**
Card `bg-gray-50 rounded-xl border border-mercury/50`:
- To-Dos: `{N}/{total}` + progress bar
- Milestones: `{N}/{total}` + progress bar
- Habits: `{N}/{total}` + progress bar

**Daily Energy (1-5):**
5 botones circulares `w-10 h-10 rounded-full`:
- Seleccionado: `border border-pastel bg-gossip text-burnham font-bold shadow-sm`
- Resto: `border border-mercury bg-white text-shuttle`
- Guardado en `reviews.energy_level` del día

**Daily Protocol:**
`DAILY PROTOCOL` header + tooltip "Email, Slack, y Discord clear?"

3 checkboxes:
- Inbox Zero → `reviews.protocol_inbox_zero`
- Update Time Logs → `reviews.protocol_time_logs`
- Review Tomorrow → `reviews.protocol_review_tomorrow`

**Notes / Journaling:**
`textarea` libre, `h-32`
- Placeholder: "Any blockers or quick thoughts?"
- Guardado en `reviews.text` del día

**Footer:**
Botón "All done for today. Let's plan tomorrow →"
→ Muestra resumen del día + opción de ver qué milestones/hábitos quedan para mañana

---

### 6.6 Dashboard

**Diseño de referencia**: `Annual Performance Dashboard View`

**Layout**: `max-w-[1200px] mx-auto px-6 flex flex-col gap-12`

**Nav**: breadcrumb + filter pills `[All Focus] [Goal 1] [Goal 2] [Goal 3]`

---

**Métricas globales (top row):**

4 métricas en grid `grid-cols-2 md:grid-cols-4`:
- **Avg Energy**: promedio de `reviews.energy_level` del año. Icono `ph-lightning`
- **Consistency**: % de días con al menos 1 hábito completado
- **Velocity**: días con alguna actividad / 365
- **Deep Work**: promedio de horas de deep work (todos con `effort = 'DEEP'`) — calculado

Formato: número grande + cambio porcentual (si hay año anterior)

**Barras de progreso (segunda fila):**
- Strategic Advance: % de milestones completados vs total
- Milestone Success: `{completados}/{total}`
- System Consistency: % de días con hábitos vs días planificados

---

**Active Strategic Goals:**

`border-b border-mercury pb-4` con título "Active Strategic Goals" + período

Por cada goal (1-3):

**Grid `lg:grid-cols-12`:**

*Col 1 (3/12) — Info del goal:*
- Nombre `text-lg font-bold`
- Sub-metric `text-xs text-secondary`
- Progress bar principal (lagging indicator del mes)
- Leading indicators secundarios (2 barras finas con porcentaje)

*Col 2 (6/12) — Heatmap:*
- "X contributions in 2026"
- GitHub-style heatmap: grid 7 rows × 48 cols (semanas)
  - Colores: `level-0` (#EBEDF0), `level-1` (#9BE9A8), `level-2` (#79D65E), `level-4` (#216E39)
  - Un cuadrado = un día. Color = intensidad de actividad (hábitos completados ese día)
- Labels de meses arriba, días de semana a la izquierda
- Selector de año: 2026, 2025, 2024
- Debajo del heatmap: lista de habits vinculados al goal + frecuencia

*Col 3 (3/12) — Milestones próximos:*
`border-l border-mercury/50 pl-6`
- Timeline mini: bullet verde (completado) o gris (pendiente)
- Nombre + fecha
- Botón "VIEW DETAILS →" → navega a `/dashboard/goal/:id`

Separador `h-[0.5px] bg-mercury` entre goals.

---

**Sección: Productivity Window + Energy vs Output:**

Grid 2 columnas:

*Productivity Window:*
- Título + "Task completion intensity by hour"
- Gráfico de barras verticales (líneas de 1px): horas 6am-7pm
- Cada barra: `w-[1px] bg-primary/20` de altura proporcional a tareas completadas en esa hora
- Hover: `bg-primary`

*Energy vs Output:*
- Título + "Flow state correlation map"
- Scatter plot: eje X = energy level diario, eje Y = tareas completadas
- Puntos: círculos, coloreados por intensidad
- Línea de tendencia dashed

---

### 6.7 Goal Detail / Audit View

**Diseño de referencia**: `Master Goal Deep-Dive Audit View` (la versión con Phosphor icons)

**Ruta**: `/dashboard/goal/:id`

**Layout**: `max-w-[800px] px-6 py-12 flex flex-col gap-12`

---

**Header:**
- Breadcrumb: `Today / Dashboard / {nombre goal}` + botón "← BACK TO AUDIT"
- Título del goal `text-4xl font-bold`
- Sub-metric `text-base font-medium text-shuttle`

---

**Strategic Progress:**

`STRATEGIC PROGRESS` + `YTD Performance`

Por cada leading indicator:
- Grid `2fr 3fr 1fr`
- Nombre + tipo (Lagging/Leading Indicator)
- Sparkline: 12 barras verticales de `w-[4px]` coloreadas en pastel-green con opacidades progresivas
- Porcentaje `text-lg font-bold`

---

**Linked Habits Audit:**

Por cada hábito del goal:
- Nombre + badge de frecuencia (Daily/Weekly/etc.)
- **Full-year heatmap** (igual que Dashboard pero más grande):
  - Labels de meses arriba
  - Labels Mon/Wed/Fri a la izquierda
  - Grid 7 × 52 cuadrados `w-2.5 h-2.5 rounded-sm`
  - Verde completado, `bg-mercury/30` no completado
- Stats a la derecha: Current Streak + Success Rate

---

**Milestone Roadmap:**

Timeline vertical:
- Completados: círculo verde con checkmark, texto tachado, fecha
- Actual/activo: destacado en card `bg-today-gray rounded-md`, con subitems
- Pendientes: círculo blanco con borde mercury, opacidad 60%

---

**Execution Notes:**

`textarea` full-width, sin bordes laterales, solo `border-b border-mercury` (focus: `border-burnham`)
- Placeholder: "Log strategic blockers, pivots, or resource requirements here..."
- Markdown Supported label en esquina derecha
- Guardado en campo `notes` de `goals` (añadir column) o en `reviews` con `goal_id`

---

## 7. Database Schema

> **Estado:** Migraciones ya aplicadas al proyecto Supabase `amvezbymrnvrwcypivkf`.
> Todas las tablas tienen RLS habilitado con `(select auth.uid())` (optimizado).

### Schema completo (estado actual aplicado)

```
profiles
  id uuid PK → auth.users.id
  email text
  full_name text
  created_at timestamptz

workbooks
  id uuid PK
  user_id uuid → auth.users.id
  year integer                    ← INTEGER (no text)
  created_at, updated_at timestamptz

workbook_entries
  id uuid PK
  user_id uuid
  workbook_id uuid → workbooks.id
  section_key text
  answer text
  list_order integer DEFAULT 0
  created_at timestamptz

goals
  id uuid PK
  user_id uuid
  workbook_id uuid → workbooks.id
  text text                       ← nombre del goal
  metric text                     ← métrica de éxito
  motivation text
  status text DEFAULT 'ACTIVE'    ← lifecycle: ACTIVE | ARCHIVED | COMPLETED
  goal_type text DEFAULT 'ACTIVE' ← slot: ACTIVE | BACKLOG
  position integer DEFAULT 1      ← 1-3 en ACTIVE, 1-7 en BACKLOG
  year integer DEFAULT 2026
  next_30_days text               ← plan del próximo mes (actualizable)
  key_support text                ← quién te ayuda (del L4)
  notes text                      ← execution notes en Goal Detail
  leverage jsonb DEFAULT '[]'
  obstacles jsonb DEFAULT '[]'
  needs_config boolean DEFAULT false
  updated_at timestamptz
  created_at timestamptz

milestones
  id uuid PK
  user_id uuid
  goal_id uuid → goals.id
  text text
  target_date text                ← ej: "Q2 2026"
  status text DEFAULT 'PENDING'   ← PENDING | COMPLETED
  completed_at timestamptz
  created_at timestamptz

habits
  id uuid PK
  user_id uuid
  goal_id uuid → goals.id
  text text
  type text DEFAULT 'BINARY'      ← BINARY | NUMERIC
  frequency text DEFAULT 'DAILY'  ← DAILY | WEEKLY | WEEKDAYS
  default_time text               ← ej: "07:00"
  reward text                     ← reward del hábito
  target_value integer            ← para NUMERIC habits
  unit text                       ← ej: "km", "páginas"
  is_active boolean DEFAULT true
  last_scheduled_at timestamptz
  updated_at timestamptz
  created_at timestamptz

habit_logs
  id uuid PK
  user_id uuid
  habit_id uuid → habits.id
  log_date text                   ← 'YYYY-MM-DD'
  value integer DEFAULT 0         ← 0=no, 1=yes, o valor numérico
  created_at timestamptz

todos
  id uuid PK
  user_id uuid
  goal_id uuid → goals.id (nullable)
  milestone_id uuid → milestones.id (nullable)
  text text
  effort text DEFAULT 'SHALLOW'   ← SHALLOW | DEEP
  block text                      ← AM | PM
  completed boolean DEFAULT false
  completed_at timestamptz
  date text                       ← 'YYYY-MM-DD'
  created_at timestamptz

reviews
  id uuid PK
  user_id uuid
  date text                       ← 'YYYY-MM-DD'
  text text                       ← journal libre
  easy_mode boolean DEFAULT false
  energy_level integer DEFAULT 3  ← 1-5
  day_rating text DEFAULT 'GRAY'  ← GREEN | YELLOW | RED | GRAY
  protocol_inbox_zero boolean DEFAULT false
  protocol_time_logs boolean DEFAULT false
  protocol_review_tomorrow boolean DEFAULT false
  updated_at timestamptz
  created_at timestamptz

strategies
  id uuid PK
  user_id uuid
  goal_id uuid → goals.id (nullable) ← linkear a goal del War Map
  type text                       ← PROSPER | PROTECT | LIMIT | STRENGTH | WEAKNESS
  title text
  tactic text
  updated_at timestamptz
  created_at timestamptz

leading_indicators                ← KPIs/métricas de un goal
  id uuid PK
  user_id uuid
  goal_id uuid → goals.id
  name text                       ← ej: "Ventas cerradas"
  target numeric                  ← target mensual
  unit text                       ← ej: "clientes", "posts"
  frequency text DEFAULT 'MONTHLY' ← MONTHLY | WEEKLY
  is_active boolean DEFAULT true
  updated_at, created_at timestamptz

monthly_plans                     ← Reflexión mensual general (1 por usuario/mes)
  id uuid PK
  user_id uuid
  year integer
  month integer (1-12)
  reflection text                 ← cómo fue el mes anterior
  highlights text                 ← wins / celebraciones
  focus text                      ← intención para este mes
  updated_at, created_at timestamptz
  UNIQUE(user_id, year, month)

monthly_kpi_entries               ← Valores reales por KPI por mes
  id uuid PK
  user_id uuid
  leading_indicator_id uuid → leading_indicators.id
  year integer
  month integer (1-12)
  actual_value numeric
  notes text
  updated_at, created_at timestamptz
  UNIQUE(leading_indicator_id, year, month)
```

### Índices aplicados
```
idx_workbook_entries_workbook_id, idx_workbook_entries_user_id
idx_goals_workbook_id, idx_goals_user_id
idx_milestones_goal_id
idx_habits_goal_id
idx_habit_logs_habit_id, idx_habit_logs_user_date
idx_todos_goal_id, idx_todos_milestone_id, idx_todos_user_date
idx_reviews_user_date
idx_strategies_goal_id, idx_strategies_user_id
idx_leading_indicators_goal_id, idx_leading_indicators_user_id
idx_monthly_plans_user_id, idx_monthly_plans_year_month
idx_monthly_kpi_entries_indicator, idx_monthly_kpi_entries_user_id, idx_monthly_kpi_entries_year_month
```

### Pendiente (manual en Supabase Dashboard)
- Habilitar **Leaked Password Protection** en Auth → Settings → Password Security

### Workbook section_keys reference

```
L1_KEY_SUCCESS        → list (lo que quiero lograr)
L2_TIME_AUDIT         → list (donde gasto el tiempo)
L2_NOT_WORKING        → list (qué no funciona)
L2_WORKING            → list (qué funciona)
L3_TOP_TEN            → list[10] (top 10 goals)
L4_CRITICAL_THREE     → snapshot JSON de los 3 goals al momento del review
L4_BACKLOG            → snapshot JSON de los goals en backlog
L5_MOMENTUM           → list de JSON {block, step}
L6_WEAKNESSES         → list de JSON {weakness, workaround}
L7_EASY_MODE          → list de JSON {hard, easy}
L8_INNER_CIRCLE       → list[5] (personas)
L9_SCORES             → list de JSON {person, scores{...}, total}
L10_RULES_PROSPER     → list[3]
L10_RULES_PROTECT     → list[3]
L10_RULES_LIMIT       → list[3]
L10_INSIGHTS          → list[3]
L10_IMMEDIATE         → single text
L10_REVISIT           → single text (fecha)
L10_SIGNATURE_NAME    → single text
L10_SIGNATURE_PLACE   → single text
```

---

## 8. Flujos de Datos Críticos

### Primera apertura (onboarding)
1. App abre → check `supabase.auth.getUser()`
2. Si no hay sesión → pantalla de login (email magic link)
3. Si hay sesión → check `workbooks` para año actual
4. Si no hay workbook → redirigir a `/assessment`
5. Si hay workbook completo → redirigir a `/today`

### Completar Assessment
1. Usuario completa L1-L10
2. Cada paso guarda en `workbook_entries` con upsert
3. Al final del L10: crear `workbooks` record + guardar entries
4. Los goals de L4 se crean en tabla `goals` con `workbook_id`
5. Los goals 4-10 del L3 se crean como `status: 'BACKLOG'`
6. Redirigir a `/strategy`

### Systematize Goal (post-assessment)
1. Modal se abre con datos del workbook (original goal, support, initial step)
2. Usuario configura: leading indicators, habits, milestones
3. Al guardar: crear `leading_indicators[]`, `habits[]`, `milestones[]`
4. Actualizar `goals.needs_config = false`

### Today — Marcar hábito completado
1. User hace click en "Commit" o checkbox
2. Crear/upsert `habit_logs` con `log_date = today, value = 1`
3. Actualizar UI local inmediatamente (optimistic update)

### Monthly — Ingresar KPI actual
1. User hace click en celda del mes
2. Input aparece inline
3. Al blur: upsert `monthly_kpi_entries` con `actual_value`

### Dashboard — Calcular heatmap
1. Fetch `habit_logs` del año filtrado por `goal_id` (via habits)
2. Agrupar por fecha → contar logs por día
3. Mapear intensidad: 0=level-0, 1=level-1, 2=level-2, 3+=level-4

---

## 9. Tauri v2 — Configuración Desktop

### Ventana principal
```json
{
  "width": 1440,
  "height": 900,
  "minWidth": 1024,
  "minHeight": 700,
  "resizable": true,
  "decorations": true,
  "title": "reThink"
}
```

### Ventana compacta (modo Granola)
```json
{
  "width": 480,
  "height": 680,
  "alwaysOnTop": true,
  "decorations": false,
  "resizable": false,
  "transparent": true
}
```

### Funcionalidades Tauri requeridas
- `tauri-plugin-shell`: abrir links externos
- `tauri-plugin-updater`: auto-update desde GitHub releases
- `tauri-plugin-window`: toggle entre modo fullscreen y compacto
- Global shortcut: `Cmd+Shift+R` → toggle ventana compacta
- Menu bar: solo "Abrir reThink" y "Quit"

---

## 10. Pantallas / Rutas

```
/                     → redirect a /today o /assessment
/assessment           → Wizard anual (L1-L10)
/assessment/:step     → Paso específico (1-10)
/strategy             → Strategy War Map
/monthly              → Monthly planning (default: goal activo 1, mes actual)
/monthly/:goalId      → Monthly de un goal específico
/today                → Today view (fullscreen)
/today/compact        → Today view compacto (ventana flotante)
/dashboard            → Dashboard anual
/dashboard/goal/:id   → Goal Deep-Dive Audit
```

---

## 11. Prioridades de Implementación (v1)

### Fase 1 — Core (MVP)
1. Auth (magic link Supabase)
2. Assessment wizard L1-L10
3. Strategy War Map (sin Systematize modal)
4. Today view básico (todos + hábitos)
5. DB migrations

### Fase 2 — Sistema completo
6. Systematize Goal Modal
7. Monthly planning + KPI table
8. Dashboard con heatmaps
9. Goal Detail Audit

### Fase 3 — Desktop
10. Tauri v2 wrapper
11. Modo compacto (ventana flotante)
12. Global shortcut + auto-updater

---

## 12. Qué NO incluir en v1
- Dark mode
- Coach AI / Gemini
- Notificaciones push
- Múltiples usuarios / sharing
- Export a PDF
- Integración con calendarios
