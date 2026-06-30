# Diagnostico Attio Objects: estado actual y brechas UX/UI

Fecha: 2026-06-29  
Base de comparacion: `docs/attio-clone-spec.md`

## Resumen ejecutivo

La app ya tiene una capa CRM util para trabajar con People, Companies, Opportunities y Lists, y visualmente algunas piezas se acercan a Attio: sidebar con CRM/Listas, tabla densa reutilizable, kanban basico, chips, popovers y record peek lateral.

Pero todavia no tenemos "Objects" como sistema Attio. Tenemos pantallas y tablas hardcodeadas por entidad. Eso significa que hoy el producto funciona mas como un CRM vertical de relaciones que como una plataforma de objetos configurable.

Estado general frente al objetivo Attio:

- Objects como entidad configurable: bajo.
- Records por objeto: medio para People/Companies/Opportunities, bajo para objetos genericos.
- Attributes como metadata configurable: bajo.
- Relationship attributes: bajo-medio, hay relaciones reales pero no administrables como atributos.
- Enriched data: medio en datos, bajo en UI Attio.
- UX/UI de object pages: medio-bajo; hay buena base, pero todavia no se ve como Attio en settings, record pages y tablas.

La prioridad no deberia ser pulir iconos o colores. La prioridad es crear una capa de metadata de objetos/atributos/vistas que alimente las pantallas actuales.

## Lo que Attio espera de Objects

Segun la spec levantada, un Object en Attio es un tipo de entidad con:

- Standard objects: People, Companies, Deals, Users, Workspaces.
- Custom objects: entidades creadas por usuario con plural noun, singular noun y slug interno.
- Object settings page con tabla de objetos: Object, Type, Records, Attributes y boton `New custom object`.
- Object-level attributes, system attributes, enriched attributes, relationship attributes y permisos.
- Object appearance: record image y record text.
- Object access separado de list access.
- Record pages consistentes generadas por metadata, no pantallas distintas por objeto.
- Views guardadas por object/list: table, kanban, filtros, sorts, columnas visibles, labels por vista.

## Implementacion actual

### Objetos reales que existen

Actualmente hay tres objetos CRM principales:

- People: fuente de datos `outreach_logs`, tipo TS `Contact`, pantalla `src/screens/People.tsx`, detalle `src/screens/PersonDetail.tsx`.
- Companies: fuente de datos `companies`, tipo TS `Company`, pantalla `src/screens/PeopleCompanies.tsx`, detalle `src/screens/CompanyDetail.tsx`.
- Opportunities: fuente de datos `opportunities`, tipo TS `Opportunity`, pantalla `src/screens/PeopleOpportunities.tsx`, detalle `src/screens/OpportunityDetail.tsx`.

Tambien hay Lists:

- `lists` y `list_memberships`, con list-specific data en `list_memberships.attributes`.
- Pero hoy las listas son solo sobre People porque `list_memberships.contact_id` referencia `outreach_logs`.

### Donde esta hardcodeado el sistema

- `src/lib/crmObjects.ts` define solo `person`, `company`, `opportunity` via `TodoMentionKind`.
- `src/App.tsx` define rutas fijas: `/people`, `/people/companies`, `/people/opportunities`, `/lists`.
- `src/components/layout/AppShell.tsx` renderiza manualmente CRM > People/Companies/Opportunities y Lists.
- `src/components/crm/CrmTable.tsx` recibe columnas ya construidas por pantalla; no conoce objetos ni atributos.
- `src/screens/People.tsx`, `src/screens/PeopleCompanies.tsx` y `src/screens/ListDetail.tsx` definen columnas localmente.
- `src/screens/CompanyDetail.tsx`, `src/screens/OpportunityDetail.tsx` y `src/screens/PersonDetail.tsx` son record pages distintas, no una record page generica.

Esto es entendible para una app vertical, pero limita mucho la clonacion de Attio.

## Diagnostico por area

### 1. Object registry y settings

Estado: no implementado.

No existe una tabla `objects`, ni un registry formal con slug, singular/plural, tipo standard/custom, icono, record count, attribute count, appearance, access o system attributes.

Lo que tenemos:

- Sidebar con seccion CRM y tres objetos fijos.
- Tipos TS separados.
- Helpers para mention/search/create de tres entidades.

Brecha frente a Attio:

- Falta pantalla `Objects` tipo settings.
- Falta `New custom object`.
- Falta distinguir Standard vs Custom.
- Falta conteo de records/attributes por object.
- Falta editar apariencia del record.
- Falta access control por object.
- Falta slug estable no editable.
- Falta ruta generica tipo `/objects/:objectSlug` o equivalente.

Impacto UX/UI:

- El usuario no entiende que People/Companies/Opportunities son "objects" configurables.
- El producto se ve como navegacion fija, no como workspace Attio.
- No hay lugar natural para administrar atributos, integraciones, imports, templates o permisos por object.

Recomendacion:

Crear un `crm_objects` registry, aunque al principio sea seed/config local, con:

- `key`: `people`, `companies`, `opportunities`.
- `slug`: URL estable.
- `singularName`, `pluralName`.
- `type`: `standard` o `custom`.
- `sourceTable`.
- `primaryAttribute`.
- `imageAttribute`.
- `defaultViews`.
- `systemAttributes`.
- `recordCount` y `attributeCount` calculados.

Luego mover la UI de CRM a leer de ese registry.

### 2. Standard objects

Estado: parcial.

Attio espera People, Companies, Deals, Users, Workspaces como standard objects. Hoy:

- People existe.
- Companies existe.
- Opportunities funciona como Deals, pero la nomenclatura no coincide.
- Users y Workspaces no existen como CRM objects.

Brecha:

- Si queremos clonar Attio "igual", Opportunities deberia poder presentarse como Deals o al menos mapearse formalmente a Deal object.
- Users/Workspaces solo deben entrar si la app realmente necesita producto/account usage; si no, documentar que quedan fuera de alcance inicial.

UX/UI:

- Companies y People estan en sidebar bajo CRM, pero Attio los presenta bajo Records con iconos de objeto.
- Opportunities podria confundirse con una app-specific pipeline, no con un objeto standard.

Recomendacion:

Adoptar labels de Attio en la capa de object metadata:

- `People`
- `Companies`
- `Deals` como display opcional para `opportunities`, o decidir explicitamente conservar `Opportunities` por dominio reThink.

### 3. Custom objects

Estado: no implementado.

No hay forma de crear objetos custom como Projects, Events, Subscriptions, Products, etc.

Brecha funcional:

- Falta metadata de object.
- Falta storage generico de records o migrations dinamicas.
- Falta schema de atributos custom.
- Falta UI de creacion y destruccion de custom object.

Riesgo:

Implementar custom objects reales implica una decision de arquitectura: tabla generica `crm_records` + `crm_record_values`, o crear tablas fisicas por objeto. Para clonar Attio, la opcion generica suele ser mas viable.

Recomendacion:

No intentar custom objects completos antes de cerrar object registry + attributes. Primero hacer que los tres objetos actuales se rendericen desde metadata.

### 4. Attributes

Estado: bajo.

Hoy los atributos son columnas fisicas o JSON suelto:

- People: campos de `outreach_logs`.
- Companies: campos de `companies`.
- Opportunities: campos de `opportunities`.
- Lists: `list_memberships.attributes` para datos especificos.

Lo que falta:

- Tabla/config de attributes por object/list.
- Tipos de atributo Attio: Status, User, Select, Multi-select, Text, Date, Timestamp, Number, Currency, Checkbox, Rating, Record, Relationship, Location, Phone.
- Constraints required/unique.
- Attribute settings page.
- Create/edit attribute modal.
- Option manager para select/multi-select.
- AI Autofill settings.
- Attribute edit history.
- System/enriched/custom flags.

UX/UI:

- `CrmTable` muestra columnas como atributos, pero no son administrables como atributos.
- `View settings` solo permite ocultar/reordenar columnas existentes en la pantalla.
- `Add column` solo muestra columnas ocultas; no permite crear atributo ni escoger relationship paths.
- Menus de header solo tienen Manage columns / Hide column; faltan sort asc/desc, move left/right, edit column label, footer con attribute original.

Recomendacion:

Introducir `crm_attributes` o un registry inicial en codigo con:

- `id`, `objectKey`, `scope`, `name`, `type`, `source`, `isSystem`, `isEnriched`, `isCustom`.
- `renderCell`, `editCell`, `filterOperators`, `sortAccessor`.
- `path` para relationship attributes.

Despues conectar `CrmTable` a `ViewColumn[]` en vez de columnas hardcodeadas por pantalla.

### 5. Relationship attributes

Estado: bajo-medio.

Hay relaciones de datos reales:

- Contact -> Company via `company_id` y tambien string `company`.
- Opportunity -> Company via `company_id`.
- Opportunity -> Contacts via `opportunity_contacts`.
- Lists -> Contact via `list_memberships.contact_id`.
- Introductions conectan personas parcialmente por ids/nombres.

Pero no son relationship attributes administrables.

Brechas:

- No existe relationship type como attribute.
- No hay cardinalidad configurable.
- No hay UI para crear relaciones bidireccionales.
- No hay picker de paths tipo `Company > Team > LinkedIn`.
- No hay columnas relationship-derived editables/view-only segun path.
- No hay filtros/sorts por relationship paths.

UX/UI:

- Companies muestra `Who you know`, pero no como columna relationship path formal.
- RecordPeek muestra linked people en Companies, pero separado de un sistema de attributes.
- Lists/person detail muestran membership, pero no con el patron Attio de "relationship pills" consistente.

Recomendacion:

Formalizar relaciones del dominio actual primero:

- `company.team` <-> `person.company`
- `company.associated_opportunities` <-> `opportunity.company`
- `opportunity.associated_people` <-> `person.associated_opportunities`
- `person.list_entries` <-> `list_entry.record`

Luego exponer esas relaciones en el attribute picker antes de permitir custom relationships.

### 6. Records y record pages

Estado: medio.

Puntos fuertes:

- Hay creacion de People, Companies y Opportunities.
- `RecordPeek` se acerca al record drawer de Attio: panel izquierdo, acciones, detalles, listas, tabs, activity/docs.
- Detail pages tienen edicion inline para varios campos.
- People tiene merge de contactos.
- Companies y Opportunities tienen relaciones visibles.

Brechas:

- No hay record page generica por object.
- No hay `View all values` ni search attributes en Record Details.
- No hay tabs consistentes por objeto generadas desde metadata.
- Actions no estan conectadas de forma universal: compose email, add to list, note, task, workflow.
- Activity timeline no agrega todas las fuentes esperadas: attribute updates, list updates, record creation, tasks, emails, meetings.
- No hay record identity/dedupe consistente por email/domain.
- Merge solo existe para People.
- Delete/merge semantics no estan alineadas a Attio.

UX/UI:

- `RecordPeek` es una buena base, pero tiene un sabor mas "dashboard/detail card" que Attio por highlights/cards internas.
- `CompanyDetail` y `OpportunityDetail` usan muchas cards redondeadas y se alejan del lenguaje Attio denso.
- Attio record page prioriza record details + activity/tabs con menos decoracion.

Recomendacion:

Convertir `RecordPeek` en shell generico y dejar que cada object aporte:

- identity header,
- quick actions,
- detail attribute set,
- relationship tabs,
- activity sources,
- list summaries.

Reducir cards decorativas en detail pages y acercarlas a una estructura de record page.

### 7. Enriched data

Estado: medio en datos, bajo en representacion Attio.

Hay enriquecimiento real o semireal:

- Companies: LinkedIn/company fields, logo, headline, employees, followers, founded, HQ, last enriched.
- People: profile photo, connection strength, channels, enriched relationship facts.
- Some AI/contact facts/review queue.

Brechas:

- No hay atributo enriquecido como tipo/flag.
- No hay fondo lila/purple para enriched cells.
- No hay sparkle en headers.
- No hay atributo picker de communication intelligence.
- No hay diferenciacion clara entre manual, AI, enrichment y system en la UI de tabla/settings.
- No hay edit history/source timeline por enriched value.

UX/UI:

- Los datos enriquecidos aparecen como campos normales.
- El usuario no puede ver que algo fue enriquecido, de donde vino, ni si es editable.

Recomendacion:

Agregar metadata `isEnriched`, `source`, `lastEnrichedAt` y estilo de celda/header en `CrmTable`.

### 8. Object/list/view hierarchy en sidebar

Estado: parcial.

Puntos fuertes:

- Sidebar ya separa CRM y Lists.
- Lists creadas aparecen en sidebar.
- Quick actions existe via command palette.

Brechas:

- Attio usa `Records` y `Lists`; nosotros usamos `CRM`.
- No hay hover plus/settings en Lists section para crear una lista desde sidebar.
- No hay object settings/manage attributes desde sidebar o top menu.
- No hay favorites/views en sidebar.
- Hay presets legacy debajo de Lists que no son Attio-style y pueden confundir.

UX/UI:

- La estructura actual comunica producto reThink, no clon Attio.
- Para el area CRM/Listas, conviene que el sidebar cambie a:
  - Records
    - People
    - Companies
    - Deals/Opportunities
  - Lists
    - All lists
    - listas del usuario

Recomendacion:

Cambiar label `CRM` a `Records` para esta branch Attio, agregar plus en Lists, y mover settings/overflow por object/list.

## Evaluacion de `CrmTable`

`CrmTable` es el mejor punto de partida de UX/UI.

Ya soporta:

- Table shell con checkboxes.
- Columnas densas.
- View selector.
- View settings popover.
- Mostrar/ocultar/reordenar columnas.
- Add hidden column.
- Header menu basico.
- Kanban basico por stages.
- Drag/drop simple en kanban.
- Footer con `Add calculation` visual.

Falta para Attio:

- Tabla sin card externa: ahora `.crm` tiene border radius 14 y shadow; Attio es mas superficie blanca integrada.
- Header first-column plus para add record.
- Column resize.
- Inline cell edit desde la tabla.
- Multi-cell selection/copy/paste.
- Sort popover real.
- Filter builder real.
- Column header menu completo.
- View dropdown con search, overflow por view y create modal.
- Calculations funcionales.
- Active save/discard changes por vista.
- Kanban stage settings: visible columns, time in stage, confetti, hide/delete stage.
- Bulk action bar integrado para seleccion de filas.
- Attribute picker con relationship paths.

Recomendacion:

No reemplazar `CrmTable`. Convertirlo en un "Attio surface" real:

1. Pasar de columnas React hardcodeadas a `ViewColumn` basada en metadata.
2. Agregar control state de view: filters, sorts, visible columns, column labels, calculations.
3. Implementar popovers Attio completos sobre esa misma base.

## Prioridades sugeridas

### P0 - Fundacion Objects

- Crear registry/config `crmObjectDefinitions`.
- Mapear People/Companies/Opportunities como standard objects.
- Crear `crmAttributeDefinitions` inicial para esos tres objetos.
- Conectar sidebar Records a object definitions.
- Documentar decision `Opportunities` vs `Deals`.

### P1 - Object Settings UI

- Crear pantalla `Objects` con tabla Object/Type/Records/Attributes.
- Crear object settings page con tabs Configuration, Appearance, Attributes, Templates, Integrations, Imports.
- Implementar Attributes tab read-only primero.
- Agregar top-right object menu: Object settings, Manage attributes, Add integration.

### P2 - Table/View fidelity

- Completar column header menu.
- Hacer sort popover funcional.
- Hacer filter builder funcional, aunque sea basic first.
- Crear view dropdown con search y create new view.
- Persistir views por object/list.
- Agregar Add column con attribute picker real.

### P3 - Record page unificada

- Convertir `RecordPeek` en record shell generico.
- Generar Record Details desde attribute definitions.
- Agregar `View all values`, search attributes y list summary.
- Normalizar Activity tabs y relationship tabs.

### P4 - Relationship/enriched attributes

- Formalizar system relationships.
- Mostrar relationship paths en attribute picker y table headers.
- Marcar enriched attributes con sparkle + fondo lila.
- Agregar source/edit history popover.

### P5 - Custom objects

- Elegir storage generico.
- Crear custom object modal.
- Crear record storage/value storage.
- Permitir custom object views/listas.

## UX/UI mejoras concretas

### Cambios de alto impacto visual

- Bajar `.ppl-title` de 34px/30px a un estilo mas Attio para object/list views; Attio no usa encabezados tan editoriales en tablas.
- Reducir `.crm` border radius/shadow para que se sienta como superficie de trabajo, no card.
- Eliminar o reducir copy explicativo tipo subtitulos largos en object/list screens cuando se este clonando Attio.
- Usar top toolbar compacta con title + object badge + view selector, no encabezado editorial separado.
- Unificar labels: `Records`, `Lists`, `View settings`, `Add Company`, `Add Person`, etc.
- Agregar menus overflow reales en object/list headers.
- Hacer popovers mas row-based, con dividers y acciones destructivas rojas abajo.

### Cambios de interaccion

- Click en celda debe editar celda, no solo abrir peek.
- Click en primer/primary cell puede abrir record.
- Checkbox debe activar bulk action bar.
- `e` en list debe abrir add-record/search flow.
- `Add record` debe buscar existentes y permitir crear nuevos.
- `Add duplicate` debe existir en lists cuando el record ya esta en la lista, lo cual requiere cambiar schema.
- Drag/drop kanban debe mostrar placeholder y selected/lift state.

### Cambios de informacion

- Mostrar object badge en list detail: hoy siempre dice People; debe venir del parent object.
- Mostrar record count y attribute count por object.
- Mostrar system/custom/enriched pills en attribute settings.
- Mostrar relationship-derived labels con breadcrumb `>` en columnas.
- Mostrar enriched state en headers/cells.

## Riesgos tecnicos

- `list_memberships` esta limitado a People y bloquea duplicate entries con `UNIQUE (list_id, contact_id)`.
- Attributes como JSON en memberships no escalan a filtros/sorts/calculations tipadas.
- Detail pages separadas duplican comportamiento y haran dificil llegar a paridad Attio.
- Si se intenta custom objects sin metadata primero, se van a duplicar pantallas y deuda.
- La UI actual mezcla lenguaje reThink personal-CRM con Attio workspace CRM; hay que decidir por area si prima reThink o el clon Attio.

## Veredicto

Tenemos una buena base de presentacion para Records/Lists, pero no tenemos todavia la capa Objects de Attio. El siguiente paso correcto es construir metadata primero y usarla para renderizar People, Companies y Opportunities. Cuando esos tres objetos fijos se vean y funcionen como Attio desde una misma arquitectura, custom objects, attributes avanzados, relationship paths y enriched UI seran extensiones naturales.

Si seguimos agregando features directamente en `People.tsx`, `PeopleCompanies.tsx` y `ListDetail.tsx`, vamos a mejorar pantallas aisladas pero no vamos a llegar a "igual que Attio".
