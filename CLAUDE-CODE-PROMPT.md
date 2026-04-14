# Prompt para Claude Code — reThink v2 Redesign

## Prompt para copiar y pegar en Claude Code:

```
Estoy rediseñando reThink 2026, mi app personal (Tauri + React + Supabase). Antes de tocar código necesito que planifiques todo.

Lee estos archivos en este orden:
1. RETHINK-V2-SPEC.md — spec completo del producto (screens, objetos, DB schema, fases)
2. UI-REFERENCE-ATTIO.md — referencia visual basada en Attio CRM (layout, componentes, field mappings)
3. TECHNICAL.md — arquitectura técnica actual
4. PRODUCT.md — features actuales que estamos simplificando
5. CONTEXT.md — índice del codebase
6. tailwind.config.js + src/index.css — design tokens actuales (fonts, colores). TODO el styling usa estos tokens, NO los de Attio.

Reglas clave:
- Fonts y colores siempre de reThink actual, nunca de Attio. Attio solo define patrones de layout.
- Sidebar izquierdo global (Attio-style) en TODA la app, colapsable a icon-only con ⌘\
- Today mantiene su sidebar derecho de journaling (coexiste con el nav izquierdo)
- Detail views siguen el layout de Attio (Highlights cards + Activity + right sidebar) pero con los campos de reThink (ver Section 9 del UI reference)
- Multi-channel identity resolution es crítico (WhatsApp, LinkedIn, Exit5, X → una persona)
- Opportunities tienen secciones condicionales por stage (active → Interview Prep/CLOSER, negotiating → Negotiation Prep/GAINS)
- No borrar data existente, migrar

Después de leer todo, usa /ultraplan para crear el plan completo de implementación cubriendo las 8 fases del spec. NO escribas código hasta que yo apruebe el plan.
```

---

## Prompt para NetworkHub (App 2) — copiar y pegar en Claude Code:

```
Estoy construyendo NetworkHub, una app Tauri separada que es el workspace de networking de reThink 2026. Comparte el mismo backend Supabase.

Lee estos archivos:
1. RETHINK-V2-SPEC.md — busca la sección "App 2: NetworkHub" y todo lo relacionado (identity resolution, contact_channels, keyboard shortcuts, auto-logging)
2. UI-REFERENCE-ATTIO.md — la estética visual debe ser consistente con reThink
3. TECHNICAL.md — arquitectura actual
4. tailwind.config.js + src/index.css — design tokens (fonts, colores de reThink)

También revisa el código de la extensión Chrome existente que NetworkHub hereda:
- extension/src/content-scripts/ — auto-logging por canal (linkedin.ts, linkedin-profile.ts, linkedin-dm.ts, whatsapp.ts)
- extension/src/sidebar/ — UI de captura (LinkedInNewScreen.tsx, LinkedInKnownScreen.tsx, WhatsAppMappedScreen.tsx, WhatsAppUnmappedScreen.tsx)
- extension/src/lib/ — normalizers (phoneNormalizer.ts, linkedinNormalizer.ts, supabase.ts)
- extension/src/background/ — service worker
- chrome-extension/ — versión legacy (background.js, content.js, popup.html/js)

Contexto clave:
- NetworkHub NO es un rewrite from scratch. Hereda toda la lógica de la Chrome extension (auto-log, contact capture, detección de conversaciones no capturadas) y la porta a un frame Tauri nativo.
- 4 paneles webview: WhatsApp Web (⌘1) | LinkedIn (⌘2) | Exit5 (⌘3) | X/Twitter (⌘4)
- Keyboard-first: ⌘1-4 switch canales, ⌘N nuevo contacto, ⌘L log conversación, ⌘M merge/link contacto, ⌘P abrir People, ⌘K command palette
- Multi-Channel Identity Resolution es la feature más crítica:
  - Tabla contact_channels con unique constraint (channel, channel_identifier)
  - 4 niveles de matching: exact match → fuzzy match (nombre+empresa) → manual link → bulk reconciliation
  - Sidebar unificado que muestra todas las interacciones cross-channel de un contacto
  - KPIs cuentan personas únicas, no mensajes
- Captura por canal:
  - LinkedIn: sidebar "Add to reThink" con datos auto-capturados del perfil
  - WhatsApp: auto-detect chats activos + captura de conversaciones no capturadas (hereda extensión)
  - Exit5: captura de miembros de la comunidad
  - X/Twitter: captura desde perfiles + DMs
- Auto-logging: al interactuar en cualquier canal → crear/actualizar contacto en outreach_logs → crear interacción → incrementar weekly_kpis → intentar identity resolution
- UI/UX consistente con reThink v2 (mismas fonts, colores, patrones de componentes)
- Supabase compartido: escribe en outreach_logs, interactions, contact_channels, weekly_kpis

Después de leer todo, usa /ultraplan para crear el plan completo de implementación de NetworkHub. Incluye:
1. Setup del proyecto Tauri separado con shared Supabase config
2. Port del capture engine desde la Chrome extension
3. Implementación de los 4 webview panels
4. Sistema de identity resolution (contact_channels + matching engine)
5. Sidebar unificado de contacto con vista cross-channel
6. Keyboard navigation completa
7. Auto-logging pipeline
8. Testing de edge cases de identity resolution

NO escribas código hasta que yo apruebe el plan.
```
