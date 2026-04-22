# SPEC — reThink: Auto-Capture de Interacciones desde WhatsApp & LinkedIn

**Date:** 2026-03-20
**Status:** ready-to-plan
**Reviewed codebase:** yes
**Scope:** Browser extension que detecta automáticamente mensajes enviados/recibidos en WhatsApp Web y LinkedIn, aplica lógica de ventana temporal (6 horas), y registra interacciones en Supabase para actualizar health scores.

---

## Context

reThink ya tiene un módulo People/Outreach completo con:
- Tabla `outreach_logs` (almacena contactos con `name`, `phone`, `linkedin_url`, `health_score`, `last_interaction_at`)
- Tabla `interactions` (almacena interacciones con `contact_id`, `type`, `direction`, `notes`, `interaction_date`)
- Health score que se recalcula automáticamente en cada interacción (`useInteractions.ts:81-86`)
- Habit tracking de "networking" (contactos distintos por día) y "prospecting" (contactos nuevos agregados)

**Problema actual:** Logging manual de interacciones es fricción. Usuario habla con gente en WhatsApp y LinkedIn pero no registra interacciones → health scores se vuelven stale → pierde visibilidad de relaciones.

**Objetivo de negocio:** Hablar con al menos 5 personas al día. Necesitamos tracking automático para:
1. Eliminar fricción de logging manual
2. Mantener health scores actualizados en tiempo real
3. Hacer visible el progreso hacia la meta de 5 personas/día

**Experiencia deseada:**
1. Usuario instala extension de Chrome
2. Usuario se loguea en la extension (Supabase OAuth)
3. Extension detecta automáticamente cuando envía/recibe mensajes en WhatsApp Web o LinkedIn
4. Si el contacto ya existe en reThink → registra interacción automáticamente
5. Si es un número/perfil nuevo → muestra popup para asociar con contacto existente o crear nuevo
6. Health scores y habit counts se actualizan en tiempo real
7. Usuario ve su progreso en el People tab sin hacer nada manual

---

## Business rationale

**Core value:** Esta feature sirve al propósito central de reThink (focus + accountability) porque:
- Visibilidad de relaciones = visibilidad de progreso hacia metas de networking/business dev
- Automatización reduce fricción → más uso consistente → mejores datos → mejores insights
- Health scores actualizados = señales tempranas de relaciones que necesitan atención

**Descoped de este SPEC:**
- Integración con iMessage/SMS (requiere permisos de macOS, fuera de scope de browser extension)
- Detección de likes/comments en LinkedIn (solo DMs cuentan como interacciones)
- WhatsApp Desktop app (solo WhatsApp Web en browser)
- Análisis de sentimiento de mensajes (nice-to-have futuro)
- Auto-categorización de contactos basado en conversaciones (nice-to-have futuro)

---

## Technical notes

**Stack de la extension:**
- Manifest V3 (Chrome/Firefox compatible)
- TypeScript + Vite para build
- Supabase JS client v2 (para auth + DB operations)
- Content scripts para inyección en WhatsApp Web + LinkedIn
- Service Worker para background processing y ventana temporal

**Arquitectura:**
```
┌─────────────────────────────────────────────────┐
│  WhatsApp Web / LinkedIn (DOM)                  │
│  ├─ Content Script (message detection)          │
│  └─ Sends message events → Background SW        │
└─────────────────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────────────────┐
│  Background Service Worker                      │
│  ├─ Window logic (6-hour grouping)              │
│  ├─ Contact matching (phone/LinkedIn → DB)      │
│  ├─ Supabase operations (insert interactions)   │
│  └─ Opens popup for unknown contacts            │
└─────────────────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────────────────┐
│  Supabase (amvezbymrnvrwcypivkf)                │
│  ├─ outreach_logs (contacts)                    │
│  ├─ interactions (interaction logs)             │
│  └─ contact_phone_mappings (new table)          │
└─────────────────────────────────────────────────┘
```

**Patrones existentes a seguir:**
- Auth: igual que reThink Tauri app (`supabase.auth.signInWithOAuth({ provider: 'google' })`)
- Interaction logging: usar `logInteraction()` de `useInteractions.ts` como referencia para el formato
- Health score: NO recalcular en extension — el trigger de Supabase lo hace automáticamente

**Dependency:** Extension necesita acceso a Supabase con las mismas credenciales que la app principal. Usar mismo proyecto `amvezbymrnvrwcypivkf`.

---

## Database migrations required

### Migration 1: contact_phone_mappings table

```sql
-- Mapeo de números de teléfono a contactos (para WhatsApp)
-- Un contacto puede tener múltiples números (cell, work, etc)
-- Un número solo puede estar asociado a un contacto por user

CREATE TABLE contact_phone_mappings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  contact_id UUID NOT NULL REFERENCES outreach_logs(id) ON DELETE CASCADE,
  phone_number TEXT NOT NULL, -- normalizado: sin espacios, con +52 country code
  label TEXT NULL, -- 'mobile', 'work', 'home', NULL
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Un número solo puede estar asociado a un contacto por usuario
  UNIQUE(user_id, phone_number)
);

CREATE INDEX idx_contact_phone_mappings_user_contact
  ON contact_phone_mappings(user_id, contact_id);

CREATE INDEX idx_contact_phone_mappings_phone
  ON contact_phone_mappings(phone_number);

-- RLS policies
ALTER TABLE contact_phone_mappings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own phone mappings"
  ON contact_phone_mappings FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own phone mappings"
  ON contact_phone_mappings FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own phone mappings"
  ON contact_phone_mappings FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own phone mappings"
  ON contact_phone_mappings FOR DELETE
  USING (auth.uid() = user_id);

-- Trigger para updated_at
CREATE TRIGGER update_contact_phone_mappings_updated_at
  BEFORE UPDATE ON contact_phone_mappings
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
```

### Migration 2: extension_interaction_windows table

```sql
-- Ventanas temporales de 6 horas para agrupar mensajes
-- Se usa para decidir si un mensaje nuevo es parte de una conversación existente
-- o inicia una nueva interacción

CREATE TABLE extension_interaction_windows (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  contact_id UUID NOT NULL REFERENCES outreach_logs(id) ON DELETE CASCADE,
  interaction_id UUID NOT NULL REFERENCES interactions(id) ON DELETE CASCADE,
  channel TEXT NOT NULL, -- 'whatsapp' | 'linkedin_msg'
  window_start TIMESTAMPTZ NOT NULL, -- timestamp del primer mensaje
  window_end TIMESTAMPTZ NOT NULL,   -- window_start + 6 hours
  direction TEXT NOT NULL,            -- 'inbound' | 'outbound' (del primer mensaje)
  message_count INTEGER NOT NULL DEFAULT 1, -- contador de mensajes en esta ventana
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_extension_windows_user_contact
  ON extension_interaction_windows(user_id, contact_id);

CREATE INDEX idx_extension_windows_active
  ON extension_interaction_windows(user_id, contact_id, window_end)
  WHERE window_end > now(); -- solo ventanas activas

-- RLS policies
ALTER TABLE extension_interaction_windows ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own windows"
  ON extension_interaction_windows FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own windows"
  ON extension_interaction_windows FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own windows"
  ON extension_interaction_windows FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own windows"
  ON extension_interaction_windows FOR DELETE
  USING (auth.uid() = user_id);

-- Trigger para updated_at
CREATE TRIGGER update_extension_windows_updated_at
  BEFORE UPDATE ON extension_interaction_windows
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Auto-cleanup de ventanas expiradas (opcional, para no acumular filas viejas)
-- Se puede correr como cron job o llamar desde extension periódicamente
CREATE OR REPLACE FUNCTION cleanup_expired_windows()
RETURNS void AS $$
BEGIN
  DELETE FROM extension_interaction_windows
  WHERE window_end < now() - INTERVAL '7 days';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

### Migration 3: Índices en interactions para performance

```sql
-- La extension hace queries frecuentes por contact_id + interaction_date
-- Agregar índice compuesto para optimizar

CREATE INDEX idx_interactions_contact_date
  ON interactions(user_id, contact_id, interaction_date DESC);
```

---

## Phase 1 — Extension Scaffold + Auth

*Why first: Foundation necesaria antes de cualquier feature*

### F01 · Extension project setup

**What it does:** Crea el proyecto de la extension con TypeScript, Vite, manifest.json, estructura de carpetas.

**File structure:**
```
/Users/alexi/Documents/reThink-2026/extension/
├── manifest.json
├── package.json
├── tsconfig.json
├── vite.config.ts
├── src/
│   ├── background/
│   │   └── service-worker.ts
│   ├── content-scripts/
│   │   ├── whatsapp.ts
│   │   └── linkedin.ts
│   ├── popup/
│   │   ├── index.html
│   │   ├── App.tsx
│   │   └── main.tsx
│   ├── lib/
│   │   ├── supabase.ts
│   │   ├── phoneNormalizer.ts
│   │   └── windowLogic.ts
│   └── types.ts
└── dist/ (build output)
```

**manifest.json** (exact content):
```json
{
  "manifest_version": 3,
  "name": "reThink Auto-Capture",
  "version": "0.1.0",
  "description": "Automatically capture interactions from WhatsApp Web and LinkedIn",
  "permissions": [
    "storage",
    "tabs",
    "activeTab"
  ],
  "host_permissions": [
    "https://web.whatsapp.com/*",
    "https://www.linkedin.com/*"
  ],
  "background": {
    "service_worker": "src/background/service-worker.ts",
    "type": "module"
  },
  "content_scripts": [
    {
      "matches": ["https://web.whatsapp.com/*"],
      "js": ["src/content-scripts/whatsapp.ts"],
      "run_at": "document_idle"
    },
    {
      "matches": ["https://www.linkedin.com/messaging/*"],
      "js": ["src/content-scripts/linkedin.ts"],
      "run_at": "document_idle"
    }
  ],
  "action": {
    "default_popup": "src/popup/index.html",
    "default_icon": {
      "16": "icons/icon-16.png",
      "48": "icons/icon-48.png",
      "128": "icons/icon-128.png"
    }
  },
  "icons": {
    "16": "icons/icon-16.png",
    "48": "icons/icon-48.png",
    "128": "icons/icon-128.png"
  }
}
```

**package.json dependencies:**
```json
{
  "dependencies": {
    "@supabase/supabase-js": "^2.39.0",
    "react": "^19.0.0",
    "react-dom": "^19.0.0"
  },
  "devDependencies": {
    "@types/chrome": "^0.0.258",
    "@types/react": "^19.0.0",
    "@types/react-dom": "^19.0.0",
    "@vitejs/plugin-react": "^4.2.1",
    "typescript": "^5.3.3",
    "vite": "^5.0.0",
    "vite-plugin-web-extension": "^4.1.0"
  }
}
```

**vite.config.ts** (exact content):
```typescript
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import webExtension from 'vite-plugin-web-extension'

export default defineConfig({
  plugins: [
    react(),
    webExtension({
      manifest: './manifest.json',
      watchFilePaths: ['src/**/*'],
    }),
  ],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
})
```

**Validation:** `npm run build` produces `dist/` folder with extension files ready to load in Chrome.

---

### F02 · Supabase auth in extension

**What it does:** Usuario puede loguearse en la extension usando Google OAuth (mismo flow que reThink app).

**Trigger:** User clicks extension icon → opens popup → clicks "Sign in with Google"

**UI component:** `extension/src/popup/App.tsx`

**UI markup:**
```tsx
// Login state
<div className="w-80 h-96 bg-white p-6 flex flex-col items-center justify-center gap-4">
  <h1 className="text-lg font-semibold text-[#003720]">reThink Auto-Capture</h1>
  <p className="text-sm text-[#536471] text-center">
    Sign in to automatically track your WhatsApp and LinkedIn conversations.
  </p>
  <button
    onClick={handleGoogleSignIn}
    className="bg-[#003720] text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-[#003720]/90"
  >
    Sign in with Google
  </button>
</div>

// Logged in state
<div className="w-80 h-96 bg-white p-6 flex flex-col gap-4">
  <div className="flex items-center justify-between">
    <h1 className="text-lg font-semibold text-[#003720]">reThink Auto-Capture</h1>
    <button onClick={handleSignOut} className="text-xs text-[#536471]">Sign out</button>
  </div>
  <div className="flex items-center gap-2 p-3 bg-[#E3E3E3]/40 rounded-lg">
    <div className="w-8 h-8 rounded-full bg-[#79D65E] flex items-center justify-center text-white text-xs font-bold">
      {user.email?.[0].toUpperCase()}
    </div>
    <div className="flex-1 min-w-0">
      <p className="text-sm font-medium text-[#003720] truncate">{user.email}</p>
      <p className="text-xs text-[#536471]">Connected</p>
    </div>
  </div>
  <div className="flex-1 flex items-center justify-center text-[#536471] text-xs">
    <p>Auto-capture is active on WhatsApp Web and LinkedIn.</p>
  </div>
</div>
```

**State variables added:**
- `user: User | null` — Supabase user object
- `loading: boolean` — auth check in progress

**Supabase operations:**
- Auth flow uses OAuth redirect (not popup) porque Chrome extensions no pueden abrir OAuth popups directamente
- Workaround: `chrome.identity.launchWebAuthFlow()` con Supabase OAuth URL
- On success: store session in `chrome.storage.local` (persiste entre browser restarts)
- INSERT/UPDATE: none (auth only)

**Functions / hooks:**
- `handleGoogleSignIn()` — llama `chrome.identity.launchWebAuthFlow()` con Supabase OAuth URL
- `handleSignOut()` — llama `supabase.auth.signOut()`, limpia storage
- `useEffect(() => { checkSession() }, [])` — on mount, lee session de chrome.storage

**Edge cases:**
- User is not logged in → show login screen
- User is logged in but session expired → auto-refresh via Supabase client
- User denies OAuth permissions → show error "Sign in required to use extension"
- User signs out in reThink app → extension session persists (independent) — acceptable, user can sign out in extension separately

**Assumptions:**
- Extension usa el mismo Supabase project (`amvezbymrnvrwcypivkf`) con misma Google OAuth client ID
- No necesitamos crear un OAuth client separado para la extension

---

### F03 · Phone number normalizer utility

**What it does:** Convierte números de teléfono en formato consistente para matching.

**File:** `extension/src/lib/phoneNormalizer.ts`

**Function signature:**
```typescript
export function normalizePhoneNumber(raw: string): string | null
```

**Logic:**
- Remove todos los caracteres que no sean dígitos o `+`
- Si empieza con `00`, reemplazar con `+`
- Si NO empieza con `+`, asumir México y agregar `+52`
- Retornar string normalizado o `null` si inválido

**Examples:**
```typescript
normalizePhoneNumber('+52 1 555 1234 5678') // → '+5215551234567'
normalizePhoneNumber('555 1234 5678')       // → '+5255512345678' (asume MX)
normalizePhoneNumber('0052 555 1234')       // → '+52555234'
normalizePhoneNumber('invalid')             // → null
```

**Edge cases:**
- Empty string → `null`
- Only symbols → `null`
- Country code already present → keep as-is
- Different country codes (US +1, etc) → keep as-is, solo defaults to MX si no hay `+`

**Validation:** Unit tests (no UI, pure function).

---

## Phase 2 — WhatsApp Web Detection

*Depends on: Phase 1 · F01, F02*

### F04 · WhatsApp Web message observer

**What it does:** Content script detecta cuando usuario envía o recibe mensajes en WhatsApp Web, extrae número de teléfono y contenido, envía evento al background service worker.

**Trigger:** User sends/receives message in WhatsApp Web chat window

**File:** `extension/src/content-scripts/whatsapp.ts`

**Logic:**
1. On script load, attach `MutationObserver` al DOM de WhatsApp Web
2. Observar cambios en el div que contiene mensajes (selector: `div[data-testid="conversation-panel-messages"]`)
3. Cuando aparece un nuevo mensaje (clase `message-in` o `message-out`):
   - Detectar dirección: `message-out` = outbound, `message-in` = inbound
   - Extraer número de teléfono del header de la conversación actual (selector: `header span[data-testid="conversation-info-header-chat-title"]`)
   - WhatsApp Web muestra números como "+52 1 555 1234" — normalizar con `phoneNormalizer`
   - Enviar mensaje a background SW:
     ```typescript
     chrome.runtime.sendMessage({
       type: 'whatsapp_message',
       phone: normalizePhoneNumber(rawPhone),
       direction: 'outbound' | 'inbound',
       timestamp: Date.now(),
     })
     ```

**State variables added:** None (stateless content script)

**Edge cases:**
- User is in group chat → skip (check if header contains "group" or participant count > 1)
- WhatsApp Web layout changes → selector breaks → extension stops working (acceptable, requiere update)
- Message is deleted → ignore (MutationObserver ya disparó, no hay rollback)
- Multiple messages in rapid succession → cada uno dispara evento separado, background SW maneja deduplication

**Assumptions:**
- WhatsApp Web DOM structure remains stable (selectors válidos al 2026-03-20)
- User has WhatsApp Web open en una tab activa (content script solo corre en tabs activas)

**Validation:**
- Abrir WhatsApp Web, enviar mensaje → console.log en background SW muestra evento
- Recibir mensaje → console.log muestra evento inbound

---

### F05 · Window logic en background service worker

**What it does:** Recibe eventos de mensajes desde content scripts, aplica lógica de ventana de 6 horas, decide si crear nueva interacción o extender existente.

**Trigger:** Background SW recibe mensaje `whatsapp_message` desde content script

**File:** `extension/src/background/service-worker.ts`

**Logic:**
```typescript
async function handleWhatsAppMessage(event: {
  phone: string
  direction: 'inbound' | 'outbound'
  timestamp: number
}) {
  const userId = await getCurrentUserId() // from chrome.storage
  if (!userId) return // not logged in

  // 1. Find or create contact by phone
  const contact = await findContactByPhone(userId, event.phone)
  if (!contact) {
    // Unknown number → open popup for user to map
    await openContactMappingPopup(event.phone)
    return
  }

  // 2. Check if there's an active window (window_end > now)
  const activeWindow = await findActiveWindow(userId, contact.id, 'whatsapp')

  if (activeWindow) {
    // Extend existing window: increment message_count
    await supabase
      .from('extension_interaction_windows')
      .update({
        message_count: activeWindow.message_count + 1,
        updated_at: new Date().toISOString()
      })
      .eq('id', activeWindow.id)
  } else {
    // Create new interaction + window
    const interactionDate = new Date(event.timestamp).toISOString().split('T')[0]
    const { data: interaction } = await supabase
      .from('interactions')
      .insert({
        user_id: userId,
        contact_id: contact.id,
        type: 'whatsapp',
        direction: event.direction,
        notes: null,
        interaction_date: interactionDate,
      })
      .select()
      .single()

    if (!interaction) return

    // Create window (6 hours from now)
    const windowStart = new Date(event.timestamp)
    const windowEnd = new Date(event.timestamp)
    windowEnd.setHours(windowEnd.getHours() + 6)

    await supabase
      .from('extension_interaction_windows')
      .insert({
        user_id: userId,
        contact_id: contact.id,
        interaction_id: interaction.id,
        channel: 'whatsapp',
        window_start: windowStart.toISOString(),
        window_end: windowEnd.toISOString(),
        direction: event.direction,
        message_count: 1,
      })
  }
}
```

**Functions / hooks:**
- `getCurrentUserId(): Promise<string | null>` — lee session de chrome.storage
- `findContactByPhone(userId: string, phone: string): Promise<Contact | null>` — query `contact_phone_mappings` JOIN `outreach_logs`
- `findActiveWindow(userId: string, contactId: string, channel: string): Promise<Window | null>` — query `extension_interaction_windows` WHERE `window_end > now()`
- `openContactMappingPopup(phone: string): Promise<void>` — abre popup con UI para asociar contacto

**Supabase operations:**
- SELECT on `contact_phone_mappings` WHERE `user_id` = X AND `phone_number` = Y
- SELECT on `extension_interaction_windows` WHERE `user_id` = X AND `contact_id` = Y AND `channel` = Z AND `window_end > now()`
- INSERT on `interactions` (if new window)
- INSERT on `extension_interaction_windows` (if new window)
- UPDATE on `extension_interaction_windows` (if extending window)

**Edge cases:**
- Contact exists but phone mapping is missing → treat as unknown number (open popup)
- Multiple tabs with WhatsApp Web open → each tab sends events, background SW deduplicates by timestamp (if 2 events within 1 second, skip duplicate)
- User sends message, immediately closes tab → event already sent, procesamiento continúa en background
- Supabase insert fails (network error, auth expired) → log error, show notification to user "Failed to log interaction, please check your connection"

**Assumptions:**
- Clock del usuario está sincronizado (timestamp confiable)
- Ventanas de 6 horas NO overlappan para el mismo contacto en el mismo canal (lógica garantiza esto)

---

## Phase 3 — LinkedIn DM Detection

*Depends on: Phase 2 · F05*

### F06 · LinkedIn message observer

**What it does:** Content script detecta cuando usuario envía o recibe DMs en LinkedIn, extrae LinkedIn profile URL, envía evento al background SW.

**Trigger:** User sends/receives DM in LinkedIn messaging panel

**File:** `extension/src/content-scripts/linkedin.ts`

**Logic:**
1. On script load, attach `MutationObserver` al messaging panel (selector: `div.msg-convo-wrapper`)
2. Observar cambios en la lista de mensajes
3. Cuando aparece nuevo mensaje:
   - Detectar dirección: si el mensaje tiene clase `msg-s-event-listitem--other` = inbound, sino = outbound
   - Extraer LinkedIn profile URL del header de la conversación (selector: `a[data-control-name="view_profile"]` → href)
   - LinkedIn URLs son formato `https://www.linkedin.com/in/username/` — extraer pathname `/in/username/`
   - Enviar mensaje a background SW:
     ```typescript
     chrome.runtime.sendMessage({
       type: 'linkedin_message',
       linkedinUrl: 'https://www.linkedin.com/in/username/',
       direction: 'outbound' | 'inbound',
       timestamp: Date.now(),
     })
     ```

**Edge cases:**
- User is in group message → skip (check if conversation participants > 1)
- LinkedIn layout changes → selector breaks → requiere update
- Profile URL is /company/ instead of /in/ → skip (not a person)

**Validation:**
- Abrir LinkedIn messaging, enviar DM → background SW recibe evento
- Recibir DM → background SW recibe evento inbound

---

### F07 · LinkedIn window logic en background SW

**What it does:** Similar a F05 pero para LinkedIn, usando `linkedin_url` en vez de `phone` para matching.

**File:** `extension/src/background/service-worker.ts` (extend existing handler)

**Logic:**
```typescript
async function handleLinkedInMessage(event: {
  linkedinUrl: string
  direction: 'inbound' | 'outbound'
  timestamp: number
}) {
  const userId = await getCurrentUserId()
  if (!userId) return

  // 1. Find contact by linkedin_url
  const { data: contact } = await supabase
    .from('outreach_logs')
    .select('*')
    .eq('user_id', userId)
    .eq('linkedin_url', event.linkedinUrl)
    .maybeSingle()

  if (!contact) {
    // Unknown LinkedIn profile → open popup for user to map
    await openContactMappingPopup(null, event.linkedinUrl)
    return
  }

  // 2. Same window logic as WhatsApp but with channel='linkedin_msg'
  const activeWindow = await findActiveWindow(userId, contact.id, 'linkedin_msg')

  if (activeWindow) {
    await supabase
      .from('extension_interaction_windows')
      .update({
        message_count: activeWindow.message_count + 1,
        updated_at: new Date().toISOString()
      })
      .eq('id', activeWindow.id)
  } else {
    // Create new interaction + window (same logic as F05)
    const interactionDate = new Date(event.timestamp).toISOString().split('T')[0]
    const { data: interaction } = await supabase
      .from('interactions')
      .insert({
        user_id: userId,
        contact_id: contact.id,
        type: 'linkedin_msg',
        direction: event.direction,
        notes: null,
        interaction_date: interactionDate,
      })
      .select()
      .single()

    if (!interaction) return

    const windowStart = new Date(event.timestamp)
    const windowEnd = new Date(event.timestamp)
    windowEnd.setHours(windowEnd.getHours() + 6)

    await supabase
      .from('extension_interaction_windows')
      .insert({
        user_id: userId,
        contact_id: contact.id,
        interaction_id: interaction.id,
        channel: 'linkedin_msg',
        window_start: windowStart.toISOString(),
        window_end: windowEnd.toISOString(),
        direction: event.direction,
        message_count: 1,
      })
  }
}
```

**Supabase operations:**
- SELECT on `outreach_logs` WHERE `linkedin_url` = X
- Same INSERT/UPDATE as F05 but with `type: 'linkedin_msg'`

**Edge cases:**
- Contact has linkedin_url but it's slightly different (trailing slash, query params) → normalize URLs before comparing (strip query params, ensure trailing slash)

---

## Phase 4 — Contact Matching UI

*Depends on: Phase 2 · F05, Phase 3 · F07*

### F08 · Unknown contact popup

**What it does:** Cuando extension detecta un número/LinkedIn profile que no existe en DB, abre popup para que usuario busque y asocie a un contacto existente o cree uno nuevo.

**Trigger:** Background SW calls `openContactMappingPopup(phone?, linkedinUrl?)`

**UI component:** Nueva tab en `extension/src/popup/App.tsx` (routing: `mode === 'map-contact'`)

**UI markup:**
```tsx
<div className="w-96 min-h-[400px] bg-white p-6">
  <h2 className="text-lg font-semibold text-[#003720] mb-2">Unknown Contact</h2>
  <p className="text-sm text-[#536471] mb-4">
    {phone
      ? `WhatsApp number: ${phone}`
      : `LinkedIn: ${linkedinUrl}`
    }
  </p>

  {/* Search existing contacts */}
  <div className="mb-4">
    <label className="text-xs font-medium text-[#536471] mb-1 block">
      Search in reThink
    </label>
    <input
      type="text"
      value={searchQuery}
      onChange={e => setSearchQuery(e.target.value)}
      placeholder="Type name to search..."
      className="w-full px-3 py-2 text-sm border border-[#E3E3E3] rounded-lg focus:outline-none focus:border-[#003720]"
    />
  </div>

  {/* Search results */}
  {searchResults.length > 0 && (
    <ul className="mb-4 max-h-48 overflow-y-auto border border-[#E3E3E3] rounded-lg divide-y divide-[#E3E3E3]">
      {searchResults.map(contact => (
        <li
          key={contact.id}
          onClick={() => handleSelectContact(contact.id)}
          className="p-3 hover:bg-[#E3E3E3]/20 cursor-pointer"
        >
          <p className="text-sm font-medium text-[#003720]">{contact.name}</p>
          {contact.company && (
            <p className="text-xs text-[#536471]">{contact.company}</p>
          )}
        </li>
      ))}
    </ul>
  )}

  {/* Or create new */}
  <div className="pt-4 border-t border-[#E3E3E3]">
    <p className="text-xs text-[#536471] mb-2">Or create a new contact:</p>
    <input
      type="text"
      value={newContactName}
      onChange={e => setNewContactName(e.target.value)}
      placeholder="Full name"
      className="w-full px-3 py-2 text-sm border border-[#E3E3E3] rounded-lg mb-3 focus:outline-none focus:border-[#003720]"
    />
    <button
      onClick={handleCreateNewContact}
      disabled={!newContactName.trim()}
      className="w-full bg-[#003720] text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-[#003720]/90 disabled:opacity-50 disabled:cursor-not-allowed"
    >
      Create & Link
    </button>
  </div>

  {/* Skip */}
  <button
    onClick={handleSkip}
    className="w-full mt-3 text-sm text-[#536471] hover:text-[#003720]"
  >
    Skip for now
  </button>
</div>
```

**State variables added:**
- `mode: 'default' | 'map-contact'` — routing state
- `pendingPhone: string | null` — número pendiente de mapear
- `pendingLinkedInUrl: string | null` — LinkedIn URL pendiente
- `searchQuery: string` — texto de búsqueda
- `searchResults: Contact[]` — resultados de búsqueda
- `newContactName: string` — nombre del nuevo contacto

**Supabase operations:**
- SELECT on `outreach_logs` WHERE `user_id` = X AND `name ILIKE %searchQuery%` LIMIT 10
- INSERT on `outreach_logs` (if creating new contact)
- INSERT on `contact_phone_mappings` (if mapping phone)
- UPDATE on `outreach_logs` SET `linkedin_url` (if mapping LinkedIn and contact doesn't have one)

**Functions / hooks:**
- `handleSelectContact(contactId: string)` — crea mapping y cierra popup
- `handleCreateNewContact()` — crea contacto nuevo, crea mapping, cierra popup
- `handleSkip()` — cierra popup sin guardar, evento se pierde
- `useEffect(() => { searchContacts() }, [searchQuery])` — debounced search (500ms)

**Edge cases:**
- User skips → interaction no se registra (acceptable, usuario decidió no mapear)
- User creates new contact without company/category → defaults (status='PROSPECT', category=null)
- User selects contact that already has different phone mapped → agregar como segundo número (tabla permite múltiples phones per contact)
- Search returns 0 results → show "No matches, create new contact below"

**Assumptions:**
- Popup opens in new Chrome tab (not inline popup) para tener más espacio
- Background SW pasa `phone` o `linkedinUrl` via chrome.storage temporal (no via URL params por seguridad)

---

### F09 · Auto-trigger networking habit on new interaction

**What it does:** Cuando se registra una interacción (automática o desde popup), actualizar el habit count de "networking" en reThink.

**Trigger:** After successful `INSERT` en `interactions` table

**File:** `extension/src/background/service-worker.ts` (extend existing logic)

**Logic:**
```typescript
async function updateNetworkingHabit(userId: string, interactionDate: string) {
  // 1. Get the user's networking habit
  const { data: habit } = await supabase
    .from('habits')
    .select('id')
    .eq('user_id', userId)
    .eq('tracks_outreach', 'networking')
    .eq('is_active', true)
    .maybeSingle()

  if (!habit) return // user doesn't have networking habit configured

  // 2. Count distinct contacts talked to today
  const { data: todayInteractions } = await supabase
    .from('interactions')
    .select('contact_id')
    .eq('user_id', userId)
    .eq('interaction_date', interactionDate)

  const distinctContacts = new Set(
    (todayInteractions ?? []).map(i => i.contact_id)
  ).size

  // 3. Upsert habit_log
  const { data: existingLog } = await supabase
    .from('habit_logs')
    .select('id, value')
    .eq('user_id', userId)
    .eq('habit_id', habit.id)
    .eq('log_date', interactionDate)
    .maybeSingle()

  if (existingLog) {
    await supabase
      .from('habit_logs')
      .update({ value: distinctContacts })
      .eq('id', existingLog.id)
  } else {
    await supabase
      .from('habit_logs')
      .insert({
        user_id: userId,
        habit_id: habit.id,
        log_date: interactionDate,
        value: distinctContacts,
      })
  }
}
```

**Supabase operations:**
- SELECT on `habits` WHERE `tracks_outreach = 'networking'`
- SELECT on `interactions` GROUP BY `contact_id` (para count distinct)
- UPSERT on `habit_logs`

**Edge cases:**
- User doesn't have networking habit → skip silently (no error)
- Multiple interactions with same contact on same day → count as 1 (distinct contacts)
- Interaction date is in the past (not today) → still update, but habit log is for that date

**Assumptions:**
- Habit count updates in real-time (user sees updated count in reThink without refresh)
- Extension NO actualiza "prospecting" habit (ese solo se actualiza cuando se AGREGA un contacto nuevo, no cuando se detecta interacción)

---

## Phase 5 — Polish & Error Handling

*Depends on: Phase 4 · F08, F09*

### F10 · Extension settings in reThink app

**What it does:** Nueva sección en Settings screen para que usuario vea status de la extension, reinstale si es necesario, vea últimas interacciones auto-capturadas.

**Trigger:** User navigates to `/settings` (new route) in reThink app

**UI component:** Nueva screen `src/screens/Settings.tsx`

**UI location:** Accessible via CommandPalette (⌘K → "Settings") o desde AppShell menu (nuevo item)

**UI markup:**
```tsx
<div className="min-h-screen bg-white px-4 pt-6 pb-32 max-w-2xl mx-auto">
  <h1 className="text-xl font-semibold text-[#003720] mb-5">Settings</h1>

  {/* Extension section */}
  <section className="mb-6">
    <h2 className="text-base font-semibold text-[#003720] mb-2">Browser Extension</h2>
    <p className="text-sm text-[#536471] mb-3">
      Auto-capture interactions from WhatsApp Web and LinkedIn.
    </p>

    {/* Install instructions if not installed */}
    {!extensionInstalled && (
      <div className="p-4 bg-[#E3E3E3]/40 rounded-lg mb-3">
        <p className="text-sm text-[#003720] font-medium mb-2">Extension not installed</p>
        <p className="text-xs text-[#536471] mb-3">
          Install the Chrome extension to automatically log your conversations.
        </p>
        <a
          href="https://github.com/alexisamp/reThink-2026/releases/latest/download/extension.zip"
          className="inline-block bg-[#003720] text-white px-3 py-1.5 rounded-lg text-xs font-medium hover:bg-[#003720]/90"
        >
          Download Extension
        </a>
      </div>
    )}

    {/* Status if installed */}
    {extensionInstalled && (
      <div className="p-4 bg-[#79D65E]/10 rounded-lg">
        <div className="flex items-center gap-2 mb-2">
          <span className="text-[#79D65E] text-lg">●</span>
          <p className="text-sm text-[#003720] font-medium">Extension active</p>
        </div>
        <p className="text-xs text-[#536471]">
          Logged {todayInteractionsCount} interactions today across {todayContactsCount} contacts.
        </p>
      </div>
    )}
  </section>

  {/* Recent auto-captured interactions */}
  {recentInteractions.length > 0 && (
    <section>
      <h2 className="text-base font-semibold text-[#003720] mb-2">Recent Auto-Captured</h2>
      <ul className="divide-y divide-[#E3E3E3]">
        {recentInteractions.map(int => (
          <li key={int.id} className="py-3 flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-[#003720]">{int.contact_name}</p>
              <p className="text-xs text-[#536471]">
                {int.type === 'whatsapp' ? 'WhatsApp' : 'LinkedIn'} ·
                {int.direction === 'inbound' ? 'Inbound' : 'Outbound'} ·
                {formatAgo(int.interaction_date)}
              </p>
            </div>
          </li>
        ))}
      </ul>
    </section>
  )}
</div>
```

**State variables added:**
- `extensionInstalled: boolean` — detecta si extension está instalada (via ping message)
- `todayInteractionsCount: number` — count de interacciones de hoy
- `todayContactsCount: number` — count de contactos distintos hoy
- `recentInteractions: Array<{id, contact_name, type, direction, interaction_date}>` — últimas 10 interacciones

**Supabase operations:**
- SELECT COUNT(*) on `interactions` WHERE `user_id` = X AND `interaction_date` = today
- SELECT COUNT(DISTINCT contact_id) on `interactions` WHERE `user_id` = X AND `interaction_date` = today
- SELECT on `interactions` JOIN `outreach_logs` ORDER BY `created_at` DESC LIMIT 10

**Functions / hooks:**
- `checkExtensionInstalled()` — envía mensaje a extension via `chrome.runtime.sendMessage` con un ID conocido, si responde = installed
- `fetchStats()` — queries a Supabase para poblar counts

**Edge cases:**
- Extension installed pero usuario no logueado en extension → show "Extension installed but not signed in"
- Extension installed en Firefox (no Chrome) → detection falla → show "not installed" (acceptable)

**Assumptions:**
- Extension ID es conocido (hardcoded en reThink app) para poder hacer ping
- Alternativamente: extension NO es detectable desde Tauri app (cross-origin) → entonces esta screen solo muestra download link + stats (no status check)

---

### F11 · Error handling & notifications

**What it does:** Manejo robusto de errores + notificaciones al usuario cuando algo falla.

**Scenarios:**

1. **Supabase insert fails (network error)**
   - Extension muestra Chrome notification: "Failed to log interaction. Check your connection."
   - Evento se guarda en `chrome.storage.local` como "pending"
   - Background SW reintenta cada 5 minutos (max 3 retries)
   - Después de 3 retries, descarta evento (acceptable)

2. **User is logged out (session expired)**
   - Extension detecta error 401 en Supabase call
   - Muestra Chrome notification: "Session expired. Please sign in to the extension."
   - Opens popup automáticamente para que usuario se re-loguee

3. **WhatsApp/LinkedIn DOM selector fails**
   - Content script no encuentra el elemento esperado
   - Log silent error (no notification, no disruption)
   - Send telemetry event a Supabase (opcional): tabla `extension_errors` con `{ user_id, error_type: 'selector_not_found', url, timestamp }`
   - Usuario no nota nada, eventos simplemente no se capturan hasta que extension se actualice

4. **Contact mapping popup takes too long (user doesn't respond)**
   - Popup abierto >5 minutos → auto-close
   - Evento se descarta (no hay manera de mapear sin usuario)

**Implementation:**
- Agregar try/catch en todos los async handlers de background SW
- Usar `chrome.notifications.create()` para mostrar errores críticos
- Usar `chrome.storage.local` para queue de eventos pendientes

**Edge cases:**
- Múltiples errores simultáneos → batch notifications (max 1 por minuto)
- Usuario cierra notification sin leer → no hay follow-up (user debe checkear extension popup)

---

### F12 · Phone field in ContactDetailDrawer

**What it does:** Mostrar y editar el número de teléfono en el drawer de contacto en reThink app.

**Trigger:** User opens contact detail drawer in People screen

**UI component:** `src/components/ContactDetailDrawer.tsx`

**UI location:** Agregar campo `phone` en la sección de "Contact Info" (después de `email`)

**UI markup:** (insert after line ~150 en ContactDetailDrawer.tsx)
```tsx
{/* Phone */}
<div>
  <label className="text-xs font-medium text-shuttle mb-1 block">Phone</label>
  <input
    type="tel"
    value={editedContact.phone ?? ''}
    onChange={e => setEditedContact(prev => prev ? { ...prev, phone: e.target.value } : prev)}
    placeholder="+52 555 1234 5678"
    className="w-full px-3 py-2 text-sm border border-mercury rounded-lg focus:outline-none focus:border-burnham"
  />
</div>
```

**State variables added:** None (ya existe `editedContact` state)

**Supabase operations:**
- UPDATE on `outreach_logs` SET `phone` = X WHERE `id` = Y (ya existe en `handleUpdateContact`)

**Edge cases:**
- User edits phone to invalid format → no validation, just save as-is (extension normaliza en background)
- User clears phone → set to `null`

**Assumptions:**
- Campo `phone` ya existe en tabla `outreach_logs` (confirmed en types line 275)
- No necesitamos crear nueva migración para esto

---

## Descoped

Las siguientes ideas del input original NO están en este SPEC:

1. **"Refine" como producto separado** — Confirmed que es solo el módulo People dentro de reThink, no requiere branding separado
2. **Algoritmo de health score** — Ya está implementado en `computeHealthScore()`, no necesita cambios
3. **Timeline de interacciones en el perfil** — Ya existe en ContactDetailDrawer (muestra lista de interactions), no necesita cambios
4. **Captura de texto específico de mensajes** — Descoped por complejidad (requiere content editable + selection API), puede agregarse en futuro como Phase 6
5. **iMessage/SMS integration** — Requiere permisos de macOS fuera de scope de browser extension
6. **Auto-categorización de contactos** — Nice-to-have futuro, no blocker para MVP

---

## Open questions

None — spec is complete. All ambiguities resolved via user Q&A.

---

## Implementation Dependencies

**External:**
- Chrome Web Store account (para publicar extension, opcional para MVP — se puede cargar unpacked)
- Supabase project `amvezbymrnvrwcypivkf` con acceso (ya existe)
- Google OAuth client ID (ya existe, mismo que reThink app)

**Internal:**
- Migration 1, 2, 3 deben correrse ANTES de Phase 2 (extension necesita las tablas)
- Phase 1 debe completarse ANTES de Phase 2, 3, 4, 5 (foundation)
- Phase 2 y 3 son independientes (pueden hacerse en paralelo)
- Phase 4 depende de 2 o 3 (necesita events para testear)
- Phase 5 es polish, puede hacerse al final

**Recommended order:**
1. Phase 1 (F01, F02, F03)
2. Database migrations (antes de continuar)
3. Phase 2 (F04, F05) — WhatsApp first (más fácil de testear)
4. Phase 4 (F08, F09) — testear con WhatsApp
5. Phase 3 (F06, F07) — LinkedIn second
6. Phase 5 (F10, F11, F12) — polish

**Testing strategy:**
- Manual testing en cada phase (no automated tests por ahora)
- Phase 1: verificar login funciona
- Phase 2: enviar/recibir mensaje en WhatsApp Web, verificar interacción en Supabase
- Phase 3: enviar/recibir DM en LinkedIn, verificar interacción
- Phase 4: testear con número/LinkedIn desconocido, verificar popup de mapping
- Phase 5: testear errores (disconnect internet, expire session)

**Time estimate:** ~3-4 semanas de trabajo (assuming full-time)
- Phase 1: 3 días
- Migrations: 1 día
- Phase 2: 5 días (WhatsApp DOM exploration + window logic)
- Phase 3: 3 días (LinkedIn más simple, similar pattern)
- Phase 4: 4 días (UI + matching logic)
- Phase 5: 4 días (error handling + polish)

**Critical path:** Phase 1 → Migrations → Phase 2 → Phase 4 (LinkedIn es nice-to-have después de validar WhatsApp funciona)
