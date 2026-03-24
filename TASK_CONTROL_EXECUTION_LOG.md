# Task Control - Execution Log Operativo

## 1) Scopo del file
Questo file e la guida operativa principale per:
- tracciare cosa e stato fatto;
- tracciare cosa resta da fare;
- decidere la prossima azione senza perdere contesto;
- mantenere uno storico tecnico verificabile.

Questo documento va consultato e aggiornato periodicamente durante tutta l'esecuzione dei lavori.

---

## 2) Regole operative obbligatorie (uso del log)

### 2.1 Frequenza di consultazione
- Prima di iniziare una nuova attivita.
- Ogni 20-30 minuti durante il lavoro.
- Subito dopo ogni ticket completato o bloccato.
- Prima di chiudere la sessione.

### 2.2 Frequenza di aggiornamento
- Aggiornare lo stato ticket immediatamente dopo un cambiamento reale.
- Aggiornare il Change Log appena finisce una modifica concreta.
- Aggiornare "Prossime 3 azioni" ogni volta che cambia la priorita.

### 2.3 Formato stato ticket
Usare solo questi stati:
- `TODO`
- `IN_PROGRESS`
- `BLOCKED`
- `DONE`

### 2.4 Regola di verita
Questo file deve riflettere lo stato reale del codice, non il piano teorico.
Se c'e divergenza tra file e codice, correggere subito questo file.

---

## 3) Procedura pratica di utilizzo

### 3.1 Inizio sessione
1. Aprire questo file.
2. Leggere:
   - "Snapshot corrente"
   - "Prossime 3 azioni"
   - eventuali "Blocchi aperti".
3. Impostare un solo ticket `IN_PROGRESS`.

### 3.2 Durante sessione
1. Eseguire lavoro tecnico.
2. Ogni 20-30 minuti:
   - riaprire questo file;
   - verificare se priorita/stato sono ancora corretti;
   - aggiornare se necessario.
3. Dopo ogni cambiamento importante:
   - aggiungere una riga al Change Log;
   - aggiornare stato ticket.

### 3.3 Fine sessione
1. Nessun ticket deve restare ambiguo: solo `DONE`, `BLOCKED` o `TODO`.
2. Scrivere:
   - cosa e stato completato;
   - cosa manca;
   - prossima azione esatta.
3. Aggiornare data/ora ultimo aggiornamento.

---

## 4) Snapshot corrente

- Data snapshot: `2026-03-24`
- Ultimo aggiornamento: `2026-03-24`
- Stato generale: `STABILIZZAZIONE + POLICY WORKSPACE COMPLETATE - TC-01..TC-09 COMPLETATI`

### 4.1 Cosa e gia stato fatto
- Analisi completa architettura frontend/backend/database.
- Audit route API Google Calendar.
- Verifica migrazioni Supabase + policy RLS.
- Definizione backlog tecnico priorizzato (TC-01 ... TC-12).
- Esecuzione tecnica completata:
  - `TC-01` dipendenze ripristinate (`npm ci`, check `npm ls` ok).
  - `TC-02` lint scope corretto (esclusa `.claude/**` da ESLint).
  - `TC-03` errori hook/purity risolti.
  - `TC-04` fix leakage fallback colleghi (query domain filtrata per `accessibleUserIds`).
  - `TC-05` fix stato `syncing` in auto-sync pagina Calls (reset garantito in `finally`).
  - `TC-06` status code API evento Google normalizzati (`400/404/401/403/502/500`).
  - `TC-07` naming progetto uniformato su creazione inline Inbox.
  - `TC-08` migration policy collaborative workspace aggiunta (`projects`/`tasks`).
  - `TC-09` emissione `emitTasksUpdated()` aggiunta su scheduling Inbox.
- Verifiche correnti:
  - `npm run lint` ok.
  - `npm run build` ok.

### 4.2 Cosa NON e ancora stato fatto
- Ticket `P1/P2` ancora da eseguire.
- Nessun test automatico ancora introdotto nel progetto.

---

## 5) Registro ticket dettagliato

## P0 - Bloccanti

### TC-01 - Ripristino dipendenze mancanti e lock allineato
- Stato: `DONE`
- Priorita: `P0`
- Obiettivo:
  - allineare install locale con dipendenze dichiarate.
- Task tecnici:
  - [x] Eseguire install coerente (`npm ci` o `npm install`).
  - [x] Verificare presenza `@tanstack/react-virtual`.
  - [x] Verificare presenza `@vercel/functions`.
  - [x] Rieseguire `npm run build`.
- Done criteria:
  - `npm ls @tanstack/react-virtual @vercel/functions --depth=0` ok.

### TC-02 - Esclusione worktree/tooling dal lint
- Stato: `DONE`
- Priorita: `P0`
- Obiettivo:
  - evitare che ESLint processi cartelle non sorgente (es. `.claude/worktrees`).
- Task tecnici:
  - [x] Aggiornare ignore in eslint config.
  - [x] Verificare allineamento con `.gitignore`.
  - [x] Rieseguire `npm run lint`.
- Done criteria:
  - lint gira solo sui file del progetto principale.

### TC-03 - Fix errori React hooks/purity
- Stato: `DONE`
- Priorita: `P0`
- Obiettivo:
  - portare `npm run lint` in verde su errori bloccanti.
- Task tecnici:
  - [x] Rimuovere `setState` sincroni dentro `useEffect` dove richiesto.
  - [x] Sistemare uso impuro di `Date.now()` in render path.
  - [x] Eliminare warning inutilizzati principali.
  - [x] Rieseguire lint completo.
- Done criteria:
  - `npm run lint` senza errori.

### TC-04 - Fix leakage email cross-tenant su colleghi
- Stato: `DONE`
- Priorita: `P0`
- Obiettivo:
  - limitare suggerimenti email ai soli utenti consentiti.
- Task tecnici:
  - [x] Rivedere fallback query per dominio.
  - [x] Applicare filtro su `accessibleUserIds` anche nel path domain-based.
  - [x] Verificare che non emergano email fuori scope.
- Done criteria:
  - nessuna esposizione email oltre perimetro autorizzato.

---

## P1 - Alta priorita

### TC-05 - Fix stato syncing bloccato in UI Calls
- Stato: `DONE`
- Priorita: `P1`
- Task tecnici:
  - [x] garantire reset `syncing` anche in catch/finally.
  - [x] verificare UX in errore sync.
- Done criteria:
  - spinner/stato non resta bloccato.

### TC-06 - Normalizzazione status code API
- Stato: `DONE`
- Priorita: `P1`
- Task tecnici:
  - [x] mappare errori validazione -> `400`.
  - [x] mappare not found -> `404`.
  - [x] mantenere `500` solo per errori interni.
  - [x] allineare payload errore.
- Done criteria:
  - contract errori consistente su endpoint Google.

### TC-07 - Uniformare naming progetto (case handling)
- Stato: `DONE`
- Priorita: `P1`
- Task tecnici:
  - [x] scegliere regola unica (es. uppercase canonical).
  - [x] applicarla in tutti i punti create/rename.
  - [x] prevenire duplicati solo casing.
- Done criteria:
  - inserimenti/rename coerenti in tutta l'app.

### TC-08 - Allineare RLS ai workspace
- Stato: `DONE`
- Priorita: `P1`
- Task tecnici:
  - [x] definire policy accesso task/progetti per workspace member.
  - [x] aggiungere migrazione SQL.
  - [x] validare regressioni owner-only.
- Done criteria:
  - model workspace realmente operativo su task/project.

---

## P2 - Miglioramenti strutturali

### TC-09 - Emit event mancante su schedule inbox
- Stato: `DONE`
- Priorita: `P2`
- Task tecnici:
  - [x] emettere `emitTasksUpdated()` dopo pianificazione da inbox.
- Done criteria:
  - nav/summary sempre coerenti.

### TC-10 - Estrazione util comuni Google routes
- Stato: `DONE`
- Priorita: `P2`
- Task tecnici:
  - [x] centralizzare mapping evento/meeting/date helper.
  - [x] ridurre duplicazione tra route.
- Done criteria:
  - funzioni duplicate ridotte e testabili.

### TC-11 - Refactor pagina Calls
- Stato: `TODO`
- Priorita: `P2`
- Task tecnici:
  - [ ] estrarre hook/data layer.
  - [ ] estrarre componenti modali e blocchi UI.
  - [ ] ridurre responsabilita nel file pagina.
- Done criteria:
  - file principale drasticamente piu piccolo e leggibile.

### TC-12 - Setup test automatici minimi
- Stato: `TODO`
- Priorita: `P2`
- Task tecnici:
  - [ ] aggiungere script test.
  - [ ] coprire endpoint critici (status/sync/events/rsvp/profile).
  - [ ] integrare test smoke su flussi principali.
- Done criteria:
  - suite minima eseguibile in CI locale.

---

## 6) Prossime 3 azioni (sempre aggiornate)
1. TC-11 - refactor strutturale pagina Calls.
2. TC-12 - introdurre test automatici minimi.
3. Hardening vulnerabilita npm (`npm audit`) con fix non distruttivi.

---

## 7) Blocchi aperti
- Nessuno al momento.

---

## 8) Decision log
- `2026-03-24`: deciso ordine esecuzione `P0 stabilizzazione` prima di refactor/ottimizzazioni.
- `2026-03-24`: deciso di mantenere questo file come singola fonte di verita operativa.
- `2026-03-24`: completare prima hardening/stabilizzazione (`TC-01..TC-06`) e poi workspace/test/refactor.
- `2026-03-24`: completati anche `TC-07` e `TC-09`; prossimo blocco critico = `TC-08`.
- `2026-03-24`: `TC-08` completato con migration additiva (nessuna policy esistente rimossa).
- `2026-03-24`: `TC-10` completato con nuovo modulo condiviso `src/app/api/integrations/google/utils.ts`.

---

## 9) Change log operativo

### Entry template (copia/incolla)
```
Data:
Ticket:
Stato prima:
Azione eseguita:
File toccati:
Verifica eseguita:
Esito:
Prossimo passo:
```

### Log attuale
#### 2026-03-24
- Ticket: `ANALISI PRELIMINARE`
- Stato prima: `N/A`
- Azione eseguita:
  - audit completo progetto;
  - raccolta findings;
  - definizione backlog tecnico.
- File toccati: `nessuno (solo analisi)`
- Verifica eseguita:
  - `npm run lint` (fallito);
  - `npm run build` (fallito);
  - controllo dipendenze installate.
- Esito: `pronto per fase esecutiva`
- Prossimo passo: `iniziare TC-01`

#### 2026-03-24
- Ticket: `TC-01`
- Stato prima: `TODO`
- Azione eseguita:
  - reinstall dipendenze con `npm ci`;
  - verifica package critici;
  - build completa.
- File toccati: `node_modules` (runtime locale)
- Verifica eseguita:
  - `npm ls @tanstack/react-virtual @vercel/functions --depth=0` (ok);
  - `npm run build` (ok).
- Esito: `DONE`
- Prossimo passo: `TC-02`

#### 2026-03-24
- Ticket: `TC-02`
- Stato prima: `TODO`
- Azione eseguita:
  - esclusione `.claude/**` da lint globale.
- File toccati:
  - `eslint.config.mjs`
- Verifica eseguita:
  - `npm run lint` (scope corretto).
- Esito: `DONE`
- Prossimo passo: `TC-03`

#### 2026-03-24
- Ticket: `TC-03`
- Stato prima: `TODO`
- Azione eseguita:
  - fix hook lint in `src/app/page.tsx`;
  - fix `useCompletionOverlay`, `usePlanningData`, `useContextHint`.
- File toccati:
  - `src/app/page.tsx`
  - `src/hooks/useCompletionOverlay.ts`
  - `src/hooks/usePlanningData.ts`
  - `src/hooks/useContextHint.ts`
- Verifica eseguita:
  - `npm run lint` (ok);
  - `npm run build` (ok).
- Esito: `DONE`
- Prossimo passo: `TC-04`

#### 2026-03-24
- Ticket: `TC-04`
- Stato prima: `TODO`
- Azione eseguita:
  - filtro `accessibleUserIds` applicato anche su fallback domain lookup.
- File toccati:
  - `src/app/api/integrations/google/colleagues/route.ts`
- Verifica eseguita:
  - `npm run lint` (ok);
  - `npm run build` (ok).
- Esito: `DONE`
- Prossimo passo: `TC-05`

#### 2026-03-24
- Ticket: `TC-05`
- Stato prima: `TODO`
- Azione eseguita:
  - auto-sync in `/calls` protetto con `try/finally` su stato `syncing`.
- File toccati:
  - `src/app/calls/page.tsx`
- Verifica eseguita:
  - `npm run lint` (ok);
  - `npm run build` (ok).
- Esito: `DONE`
- Prossimo passo: `TC-06`

#### 2026-03-24
- Ticket: `TC-06`
- Stato prima: `TODO`
- Azione eseguita:
  - introdotti errori HTTP espliciti sulle route evento Google;
  - validazione -> `400`, not found -> `404`;
  - mapping `GoogleApiError` su status client o `502` per upstream failure.
- File toccati:
  - `src/app/api/integrations/google/events/route.ts`
  - `src/app/api/integrations/google/events/[externalEventId]/route.ts`
- Verifica eseguita:
  - `npm run lint` (ok);
  - `npm run build` (ok).
- Esito: `DONE`
- Prossimo passo: `TC-07`

#### 2026-03-24
- Ticket: `TC-07`
- Stato prima: `TODO`
- Azione eseguita:
  - creazione progetto inline in Inbox allineata a naming canonical uppercase.
- File toccati:
  - `src/app/inbox/page.tsx`
- Verifica eseguita:
  - `npm run lint` (ok);
  - `npm run build` (ok).
- Esito: `DONE`
- Prossimo passo: `TC-09`

#### 2026-03-24
- Ticket: `TC-09`
- Stato prima: `TODO`
- Azione eseguita:
  - aggiunta emissione evento globale dopo scheduling task da Inbox.
- File toccati:
  - `src/app/inbox/page.tsx`
- Verifica eseguita:
  - `npm run lint` (ok);
  - `npm run build` (ok).
- Esito: `DONE`
- Prossimo passo: `TC-08`

#### 2026-03-24
- Ticket: `TC-08`
- Stato prima: `TODO`
- Azione eseguita:
  - aggiunta migration SQL con policy collaborative workspace su `projects` e `tasks`;
  - approccio additivo (owner policy esistenti mantenute).
- File toccati:
  - `supabase/migrations/010_enable_workspace_collaboration_policies.sql`
- Verifica eseguita:
  - `npm run lint` (ok);
  - `npm run build` (ok).
- Esito: `DONE`
- Prossimo passo: `TC-10`

#### 2026-03-24
- Ticket: `TC-10`
- Stato prima: `TODO`
- Azione eseguita:
  - creato modulo condiviso `src/app/api/integrations/google/utils.ts` per:
    - mapping evento Google -> payload DB (`external_calendar_events`);
    - helper date/email parsing riusabili;
    - class `ApiRouteError`;
    - parsing dettaglio errori Google e normalizzazione status upstream.
  - route refattorizzate per usare utility comuni:
    - `events/route.ts`
    - `events/[externalEventId]/route.ts`
    - `sync/route.ts`
    - `rsvp/route.ts`
- File toccati:
  - `src/app/api/integrations/google/utils.ts`
  - `src/app/api/integrations/google/events/route.ts`
  - `src/app/api/integrations/google/events/[externalEventId]/route.ts`
  - `src/app/api/integrations/google/sync/route.ts`
  - `src/app/api/integrations/google/rsvp/route.ts`
- Verifica eseguita:
  - `npm run lint` (ok);
  - `npm run build` (ok).
- Esito: `DONE`
- Prossimo passo: `TC-11`

---

## 10) Checklist rapida prima di ogni commit (quando iniziano le modifiche codice)
- [ ] Ticket corretto impostato `IN_PROGRESS`.
- [ ] Change log aggiornato.
- [ ] Verifica locale minima eseguita (lint/build/test rilevanti).
- [ ] Stato ticket aggiornato (`DONE` o `BLOCKED`).
- [ ] "Prossime 3 azioni" riallineate.

---

## 11) Promemoria operativo permanente
Devo consultare questo file periodicamente e aggiornarlo durante il lavoro.
Non devo procedere "a memoria".
Ogni avanzamento tecnico deve comparire qui in modo puntuale.

---

## 12) Troubleshooting Operativo (ambiente locale)

### 12.1 Errore Tailwind "Can't resolve 'tailwindcss'" con path sulla cartella padre
- Data: `2026-03-24`
- Sintomo:
  - errore di build con risoluzione su `/Users/riccardogiglio/Desktop/_dev_/Task Control`
  - messaggio: `No description file found ...`
- Causa:
  - comando lanciato fuori dalla root del progetto (`task-control_gpt`), quindi il resolver non trova `package.json`/`node_modules` corretti.
- Verifica rapida:
  - `pwd` deve terminare con `.../Task Control/task-control_gpt`
  - `npm ls tailwindcss @tailwindcss/postcss` deve restituire dipendenze risolte.
- Procedura standard di fix:
  1. `cd "/Users/riccardogiglio/Desktop/_dev_/Task Control/task-control_gpt"`
  2. `npm ci`
  3. `npm run dev` (oppure `npm run build`)
- Nota:
  - nel comando Supabase `--project-ref` non usare `<` `>`; sostituire solo il valore reale.

### 12.2 Fix strutturale applicato per eliminare il warning runtime
- Data: `2026-03-24`
- Problema osservato:
  - anche con `cwd` corretto il server `next dev` loggava sporadicamente:
    `Can't resolve 'tailwindcss' in '/Users/riccardogiglio/Desktop/_dev_/Task Control'`
  - il warning appariva al primo `GET /`.
- Correzione implementata:
  - sostituito import modulare Tailwind in CSS globale:
    - da `@import "tailwindcss";`
    - a `@import "../../node_modules/tailwindcss/index.css";`
- File toccati:
  - `src/app/globals.css`
- Verifica eseguita:
  - `npm run dev` + apertura `/` (nessun warning tailwind nel log);
  - `npm run build` (ok).

### 12.3 Errore RLS "infinite recursion detected in policy for relation workspaces"
- Data: `2026-03-24`
- Sintomo:
  - errore runtime su query con workspace access:
    `infinite recursion detected in policy for relation "workspaces"`.
- Root cause:
  - policy `workspaces_owner_or_member_access` consultava `workspace_members`;
  - policy `workspace_members_access` consultava `workspaces`;
  - dipendenza circolare in valutazione RLS.
- Correzione implementata:
  - nuova migration `011_fix_workspace_policy_recursion.sql`;
  - introdotte funzioni `SECURITY DEFINER`:
    - `public.is_workspace_owner(uuid)`
    - `public.is_workspace_member(uuid)`
  - policy `workspaces` e `workspace_members` riscritte usando le funzioni (idempotente con `drop policy if exists ...`).
- File toccati:
  - `supabase/migrations/011_fix_workspace_policy_recursion.sql`
- Azione richiesta:
  - applicare migration su progetto Supabase (`npx supabase db push` oppure SQL Editor).

### 12.4 Freeze UI con badge "Rendering..." e click bloccati
- Data: `2026-03-24`
- Sintomo:
  - UI apribile ma navigazione apparentemente bloccata;
  - badge `Rendering...` persistente in basso;
  - terminale con spam errori `Can't resolve 'tailwindcss' in '/Users/.../Task Control'` in dev.
- Root cause:
  - regressione Turbopack in `next dev` (path workspace con spazio), con loop di errori resolver Tailwind.
- Correzione implementata:
  - script dev spostato a Webpack:
    - `package.json`: `"dev": "next dev --webpack"`
    - aggiunto script alternativo `"dev:turbo": "next dev"`
  - ripristinato import Tailwind canonico:
    - `src/app/globals.css`: `@import "tailwindcss";`
- Verifica eseguita:
  - `npm run lint` (ok);
  - `npm run build` (ok);
  - `npm run dev` + smoke routes (`/`, `/calls`, `/all`, `/projects`, `/settings`, `/inbox`) tutte `200`, senza spam errori Tailwind.
