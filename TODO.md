# TODO — SalesAI / Meeting Insights Hub

## Architecture — État actuel

| Couche | Technologie | Statut |
|--------|-------------|--------|
| Frontend | React 18 + Vite + TypeScript | ✅ Production |
| UI | Tailwind CSS + shadcn/ui + Radix | ✅ Production |
| Cache local | Dexie.js (IndexedDB, 11 migrations) | ✅ Production |
| Backend API | Express.js + MongoDB + JWT | ✅ Production |
| File d'attente | BullMQ + Redis | ✅ Production |
| Transcription | faster-whisper (FastAPI, port 9000) | ✅ Production |
| Traduction | NLLB-200 (FastAPI, port 9100) | ✅ Production |
| Analyse IA | Google Gemini 2.5 Flash | ✅ Production |
| E-mail IA | Gemini + local fallback | ✅ Production |

## Fonctionnalités complétées

### Cœur métier
- [x] Enregistrement audio dans le navigateur (MediaRecorder API)
- [x] Upload fichiers audio existants (chunked upload)
- [x] Transcription locale via Whisper (mode bilingue FR/AR-TN)
- [x] Traduction automatique arabe tunisien → français (NLLB-200, segment mode)
- [x] Pipeline de traitement asynchrone : `uploading → queued → transcribing → translating → analyzing → completed`
- [x] Analyse IA via Gemini (résumé, sentiment, objections, risques, next actions, win probability)

### Gestion des réunions
- [x] CRUD réunions (création, lecture, modification, suppression douce)
- [x] Restauration de réunions supprimées
- [x] Recherche plein texte (titre, transcription, client)
- [x] Filtrage par étape de vente, sentiment, statut
- [x] Pagination côté serveur
- [x] Audit trail (événements immutables)

### Gestion des clients
- [x] CRUD clients (backend + Dexie)
- [x] Fiche client 360° (backend endpoint)
- [x] Synchronisation automatique clients depuis les réunions
- [x] Tableau de bord clients avec résumé agrégé
- [x] Tendances de sentiment par client
- [x] Suivi des actions ouvertes

### Module E-mail de suivi
- [x] Génération IA (backend Gemini + fallback local)
- [x] Workflow d'approbation (Draft → Approved → Sent)
- [x] Versionning des brouillons (historique + restauration)
- [x] Comparaison Word Diff (algorithme LCS)
- [x] Champs inférés transparents (source + confiance)
- [x] Timeline des événements de brouillon
- [x] Variantes multiples par réunion

### Performance commerciale
- [x] Suivi des objectifs par commercial (trimestriel + annuel)
- [x] Revenus par commercial
- [x] Analytics : tendances, objections récurrentes
- [x] Coaching insights par commercial

### Architecture Local-First
- [x] Dexie.js (IndexedDB) comme cache local pour toutes les entités
- [x] syncMeta sur meetings, clients, emailDrafts (version, dirty, syncState)
- [x] Fallback local automatique si le backend est inaccessible
- [x] Synchronisation en arrière-plan (syncService)

## Prochaines étapes

### Priorité haute
- [ ] Speaker diarization (identification des locuteurs)
- [ ] Transcription en temps réel via WebSocket streaming
- [ ] Intégration CRM (Salesforce, HubSpot)

### Priorité moyenne
- [ ] Notification push quand le traitement est terminé
- [ ] Export PDF des analyses de réunion
- [ ] Dashboard exécutif avec KPIs agrégés
- [ ] Tests end-to-end (Playwright)

### Priorité basse
- [ ] Application mobile (React Native)
- [ ] Multi-tenancy (organisations)
- [ ] Résolution de conflits field-level pour la sync
