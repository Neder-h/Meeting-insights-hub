# Guide de soutenance technique - SalesAI / Meeting Insights Hub

Ce fichier sert a preparer la soutenance technique. Il explique le projet, les dossiers, les fonctions importantes, les choix d'architecture, les limites, et les questions probables du jury.

## 1. Reponse courte du projet

SalesAI transforme une reunion commerciale en information exploitable. L'utilisateur enregistre ou importe un audio, obtient une transcription, une traduction vers le francais quand la reunion contient du derja/arabe, une analyse commerciale, puis un brouillon d'e-mail de suivi.

La plateforme repond a trois problemes principaux :

- Les commerciaux perdent des informations quand ils prennent des notes manuellement.
- Les reunions tunisiennes melangent souvent derja, arabe, francais et anglais, ce qui complique la transcription et l'analyse.
- Le suivi apres reunion prend du temps : resume, objections, prochaines actions, e-mail de suivi.

La solution combine React, Express, MongoDB, IndexedDB, Whisper, NLLB-200, Gemini, et une file de traitement Redis/BullMQ optionnelle.

## 2. Pitch oral en 90 secondes

SalesAI est une application web d'aide au suivi commercial. Elle permet d'enregistrer une reunion client, de transcrire l'audio avec un service Whisper local, de nettoyer le texte, de traduire les segments arabes avec un service NLLB-200 local, puis d'analyser la reunion avec Gemini pour extraire le resume, le sentiment, les objections, les risques, les prochaines actions, le stade de vente et la probabilite de conversion.

Le frontend est construit avec React, Vite, TypeScript, TanStack Query et Dexie. Il fonctionne en mode Local-First : si le reseau est instable, les reunions, clients et brouillons restent dans IndexedDB et sont synchronises plus tard.

Le backend est une API Express connectee a MongoDB. Il gere l'authentification JWT, les utilisateurs, les reunions, les clients, les uploads audio, les analyses, les brouillons d'e-mail, l'audit trail et la file de traitement. La file utilise BullMQ avec Redis quand Redis est disponible, sinon le backend passe en traitement local de secours.

La partie IA est decoupee en services locaux : `local-whisper` pour la transcription et l'analyse Gemini, `local-translate` pour la traduction segmentee. Cette separation rend le systeme plus modulaire, plus simple a tester, et plus adapte a un contexte tunisien avec code-switching.

## 3. Carte du code source

| Chemin | Role |
| --- | --- |
| `src/` | Frontend React et logique Local-First |
| `src/App.tsx` | Definition des routes principales |
| `src/pages/RecordPage.tsx` | Enregistrement/import audio, transcription, traduction, creation de reunion |
| `src/pages/MeetingDetailPage.tsx` | Detail reunion, analyse, audio, transcript, e-mail draft |
| `src/pages/MeetingsListPage.tsx` | Liste, filtres, pagination, recherche de reunions |
| `src/pages/ClientsPage.tsx` | Portefeuille client |
| `src/pages/ClientDetailPage.tsx` | Fiche client et vue 360 |
| `src/pages/PerformancePage.tsx` | Performance commerciale, revenus, coaching analytics |
| `src/pages/AdminPage.tsx` | Gestion utilisateurs et diagnostics de traitement |
| `src/contexts/AuthContext.tsx` | Session, login, logout, verification `/auth/me`, synchronisation au login |
| `src/components/auth/ProtectedRoute.tsx` | Protection des routes authentifiees et admin |
| `src/integrations/local/client.ts` | Base IndexedDB Dexie et migrations locales |
| `src/lib/api.ts` | API metier frontend, fallback local, transformation des donnees |
| `src/lib/apiClient.ts` | Client HTTP avec token JWT, upload chunked, redirection 401 |
| `src/services/syncService.ts` | Synchronisation des donnees locales vers le backend |
| `src/services/emailDraftService.ts` | Brouillons e-mail, cache local, conflits, fallback local |
| `src/hooks/useMeetings.ts` | Hooks React Query pour reunions et polling |
| `src/hooks/useEmailDraft.ts` | Hooks React Query pour brouillons d'e-mail |
| `src/hooks/useAudioRecorder.ts` | MediaRecorder, permissions micro, pause/reprise |
| `src/hooks/useAudioRecorderWithTranscription.ts` | Enregistrement/import avec transcription et traduction |
| `server/` | Backend Express/MongoDB |
| `server/index.js` | Entree backend, middleware, routes, MongoDB, queue |
| `server/config.js` | Variables d'environnement et valeurs par defaut |
| `server/middleware/auth.js` | JWT, `authenticate`, `requireAdmin` |
| `server/routes/auth.js` | Login et recuperation utilisateur courant |
| `server/routes/users.js` | Administration utilisateurs |
| `server/routes/clients.js` | CRUD clients, soft delete, sync depuis reunions |
| `server/routes/meetings/` | Routes reunions decoupees par domaine |
| `server/services/meetingProcessor.js` | Pipeline backend transcription, traduction, analyse |
| `server/services/emailDraftGenerationService.js` | Generation Gemini + fallback des e-mails |
| `server/queue/meetingQueue.js` | BullMQ/Redis et fallback sans Redis |
| `server/models/` | Schemas MongoDB |
| `local-whisper/app.py` | Service FastAPI Whisper + analyse Gemini |
| `local-translate/app.py` | Service FastAPI NLLB-200 pour traduction segmentee |
| `report.md` | Rapport LaTeX-style du projet |
| `whisperfinetune.md` | Rapport technique de fine-tuning Whisper |

## 4. Architecture globale

Flux principal :

1. L'utilisateur se connecte dans `LoginPage`.
2. `AuthContext` stocke le JWT dans `localStorage` et verifie la session via `/api/auth/me`.
3. L'utilisateur enregistre ou importe un audio dans `RecordPage`.
4. Le frontend peut appeler le service Whisper local pour afficher une transcription rapide.
5. L'utilisateur cree une reunion. Le frontend upload l'audio, cree la reunion backend, puis declenche le traitement.
6. Le backend met la reunion en file via `queueMeetingProcessing`.
7. `processMeetingPipeline` transcrit si necessaire, traduit si necessaire, analyse, puis sauvegarde `MeetingAnalysis`.
8. Le frontend poll la reunion toutes les 3 secondes pendant le traitement.
9. `MeetingDetailPage` affiche transcript, analyse, timeline, audio et module e-mail.
10. L'utilisateur genere, modifie, approuve ou marque comme envoye un e-mail de suivi.

## 5. Technologies principales

| Couche | Technologies |
| --- | --- |
| Frontend | React 18, TypeScript, Vite, Tailwind, shadcn/Radix, TanStack Query |
| Local-First | IndexedDB via Dexie |
| Backend | Node.js, Express, Mongoose |
| Base serveur | MongoDB |
| Authentification | JWT, bcryptjs |
| Upload | Multer, upload en chunks |
| Queue | BullMQ + Redis optionnel |
| Transcription | Faster-Whisper, Whisper Large-v3 ou modele fine-tune |
| Traduction | NLLB-200 distilled 600M |
| Analyse et e-mails | Gemini |
| Tests | Vitest cote frontend, Node test runner cote backend, pytest cote Python |

## 6. Backend Express

### 6.1 Point d'entree

Le backend demarre dans `server/index.js`.

Ce fichier fait quatre choses :

- Configure `cors` et `express.json({ limit: '50mb' })`.
- Sert les fichiers audio via `/uploads`.
- Monte les routes `/api/auth`, `/api/users`, `/api/meetings`, `/api/clients`.
- Se connecte a MongoDB puis initialise la queue avec `initMeetingQueue()`.

### 6.2 Configuration

La configuration est dans `server/config.js`.

Variables importantes :

- `MONGODB_URI` : connexion MongoDB.
- `JWT_SECRET` : signature des tokens.
- `PORT` : port backend, par defaut `3001`.
- `GEMINI_API_KEY` : obligatoire pour Gemini.
- `GEMINI_MODEL` : par defaut `gemini-2.5-flash`.
- `REDIS_ENABLED` et `REDIS_URL` : activent BullMQ.
- `WHISPER_API_URL` : par defaut `http://127.0.0.1:9000`.
- `TRANSLATE_API_URL` : par defaut `http://127.0.0.1:9100`.
- `UPLOAD_CHUNK_SIZE_BYTES` : taille des chunks, par defaut 5 MB.

### 6.3 Authentification

L'authentification est dans `server/middleware/auth.js`.

- `authenticate` lit le header `Authorization: Bearer <token>`.
- Il verifie le JWT avec `JWT_SECRET`.
- Il charge l'utilisateur depuis MongoDB.
- Il met l'utilisateur dans `req.user`.
- `requireAdmin` bloque l'acces si `req.user.role !== 'admin'`.

Le modele utilisateur est dans `server/models/User.js`.

- Le mot de passe est hash avec bcrypt dans le hook `pre('save')`.
- `comparePassword` compare un mot de passe clair avec le hash.
- `toJSON` supprime le champ `password`.

### 6.4 Routes principales

| Route | Fichier | Role |
| --- | --- | --- |
| `POST /api/auth/login` | `server/routes/auth.js` | Connexion et emission du JWT |
| `GET /api/auth/me` | `server/routes/auth.js` | Verification session |
| `GET /api/users` | `server/routes/users.js` | Liste utilisateurs admin |
| `POST /api/users` | `server/routes/users.js` | Creation utilisateur admin |
| `DELETE /api/users/:id` | `server/routes/users.js` | Suppression utilisateur admin |
| `GET /api/clients` | `server/routes/clients.js` | Liste clients |
| `POST /api/clients` | `server/routes/clients.js` | Creation client |
| `PATCH /api/clients/:id` | `server/routes/clients.js` | Mise a jour client |
| `DELETE /api/clients/:id` | `server/routes/clients.js` | Soft delete client |
| `POST /api/clients/:id/restore` | `server/routes/clients.js` | Restauration client |
| `POST /api/clients/sync-from-meetings` | `server/routes/clients.js` | Creation de clients depuis les reunions |

### 6.5 Routes reunions

Toutes les routes reunions passent par `server/routes/meetings/index.js`, qui applique `authenticate`.

| Route | Fichier | Role |
| --- | --- | --- |
| `GET /api/meetings` | `core.js` | Liste paginee avec filtres |
| `GET /api/meetings/:id` | `core.js` | Detail d'une reunion |
| `POST /api/meetings` | `core.js` | Creation d'une reunion |
| `PATCH /api/meetings/:id` | `core.js` | Mise a jour |
| `POST /api/meetings/:id/analysis` | `core.js` | Sauvegarde d'une analyse |
| `POST /api/meetings/upload/init` | `uploads.js` | Demarre un upload chunked |
| `POST /api/meetings/upload/chunk` | `uploads.js` | Recoit un chunk |
| `POST /api/meetings/upload/complete` | `uploads.js` | Assemble le fichier |
| `POST /api/meetings/upload/cancel` | `uploads.js` | Annule l'upload |
| `POST /api/meetings/upload` | `uploads.js` | Upload legacy en un seul fichier |
| `POST /api/meetings/:id/process` | `processing.js` | Lance le pipeline IA |
| `GET /api/meetings/:id/events` | `lifecycle.js` | Audit events de la reunion |
| `DELETE /api/meetings/:id` | `lifecycle.js` | Soft delete reunion |
| `POST /api/meetings/:id/restore` | `lifecycle.js` | Restauration reunion |
| `GET /api/meetings/diagnostics/processing` | `diagnostics.js` | Diagnostics admin |
| `GET /api/meetings/clients/summary` | `summaries.js` | Resume clients |
| `GET /api/meetings/analytics/trends` | `summaries.js` | Tendances commerciales |
| `GET /api/meetings/analytics/coaching` | `summaries.js` | Insights coaching |
| `GET /api/meetings/clients/:clientId/360` | `summaries.js` | Vue client 360 |
| `GET /api/meetings/search` | `summaries.js` | Recherche keyword |

### 6.6 Modeles MongoDB

| Modele | Fichier | Donnees |
| --- | --- | --- |
| `User` | `server/models/User.js` | Email, mot de passe hash, nom, role |
| `Meeting` | `server/models/Meeting.js` | Audio, transcript, statut, client, commercial, meta de traitement |
| `MeetingAnalysis` | `server/models/MeetingAnalysis.js` | Resume, stade, objections, risques, actions, sentiment, win probability |
| `Client` | `server/models/Client.js` | Client, contact, statut, tags, revenu, sync meta |
| `EmailDraft` | `server/models/EmailDraft.js` | Sujet, corps, statut, variante, soft delete |
| `EmailDraftVersion` | `server/models/EmailDraftVersion.js` | Historique des versions |
| `EmailDraftFeedback` | `server/models/EmailDraftFeedback.js` | Feedback utilisateur sur les brouillons |
| `MeetingEmailFacts` | `server/models/MeetingEmailFacts.js` | Faits extraits et caches pour e-mail |
| `AuditEvent` | `server/models/AuditEvent.js` | Journal append-only des actions |

### 6.7 Statuts d'une reunion

Le champ `status` du modele `Meeting` peut prendre ces valeurs :

- `uploading` : fichier en cours d'envoi.
- `queued` : reunion en file d'attente.
- `transcribing` : transcription en cours.
- `translating` : traduction en cours.
- `analyzing` : analyse IA en cours.
- `completed` : traitement termine.
- `error` : traitement echoue.

Le champ `processing_meta` garde les details : job id, tentatives, dates, erreurs par etape, fallback de traduction, timings.

## 7. Pipeline IA backend

Le pipeline central est `processMeetingPipeline` dans `server/services/meetingProcessor.js`.

Etapes :

1. Charge la reunion depuis MongoDB.
2. Met `status = queued` puis demarre les metadonnees de traitement.
3. Si la reunion n'a pas encore de transcript, passe en `transcribing`.
4. Telecharge l'audio depuis `meeting.audio_url`.
5. Envoie l'audio a `local-whisper` via `/transcribe?mode=bilingual`.
6. Sauvegarde `raw_transcript`, `transcript`, `transcript_engine`, `transcript_language`.
7. Verifie `/analyze/health` cote Whisper/Gemini.
8. Si Gemini n'est pas configure dans le service Whisper, passe par `local-translate` pour obtenir un transcript francais.
9. Passe en `analyzing`.
10. Envoie le transcript a `/analyze`.
11. Parse le JSON de Gemini avec `parseAnalysisJson`.
12. Remplace l'ancienne analyse par une nouvelle `MeetingAnalysis`.
13. Met la reunion en `completed`.
14. En cas d'erreur, met la reunion en `error` et enregistre `error_message`.

Point important : le frontend peut deja fournir un transcript edite. Dans ce cas, le backend peut eviter une nouvelle transcription et utiliser le texte existant pour l'analyse.

## 8. Queue de traitement

La queue est dans `server/queue/meetingQueue.js`.

Si Redis est disponible :

- BullMQ cree une queue `meeting-processing`.
- Les jobs ont 3 tentatives.
- Le backoff est exponentiel.
- La concurrence par defaut est 2.
- Les anciens jobs completes ou echoues sont nettoyes avec des limites.

Si Redis n'est pas disponible :

- Le backend ne bloque pas.
- `enqueueMeetingProcessing` met la reunion en `queued`.
- Le traitement est lance en arriere-plan dans le processus Node.

Reponse a donner au jury : Redis ameliore la robustesse et les retries, mais le projet garde un mode degrade pour faciliter le developpement local et la demonstration.

## 9. Service Whisper local

Le service est dans `local-whisper/app.py`.

Endpoints importants :

- `GET /health` : etat du modele Whisper.
- `POST /transcribe` : transcription audio.
- `GET /analyze/health` : verification Gemini.
- `POST /analyze` : analyse commerciale via Gemini.

Fonctionnement :

- Le service utilise FastAPI.
- Le modele principal est Faster-Whisper.
- Le modele par defaut est `large-v3`.
- Le device par defaut est CUDA, avec fallback CPU ou precision reduite si necessaire.
- L'audio est converti en WAV 16 kHz mono via ffmpeg.
- Le mode `bilingual` force une meilleure prise en charge du derja/francais.
- Le post-traitement corrige des formes hybrides et detecte le melange de langues.
- Les segments ont un score de confiance et un indicateur `low_confidence`.

Modes de transcription :

| Mode | Role |
| --- | --- |
| `bilingual` | Mode principal pour derja/francais |
| `auto` | Detection automatique, ancien comportement |
| `force_ar` | Force l'arabe |
| `force_fr` | Force le francais |

La fonction `/analyze` construit un prompt Gemini qui demande un JSON avec resume, stade de vente, objections, risques, prochaines actions, sentiment, probabilite de conversion et confiance.

## 10. Service traduction local

Le service est dans `local-translate/app.py`.

Endpoints :

- `GET /health`.
- `POST /translate`.
- `POST /clear-cache`.
- `GET /cache-info`.

Le service utilise NLLB-200 distilled 600M.

Choix technique important : il ne traduit pas tout le texte aveuglement. Il decoupe le transcript par lignes et par scripts. Les segments en arabe sont traduits, les segments latins/francais sont conserves.

Fonctions utiles a connaitre :

- `split_by_script_runs` : separe arabe et non-arabe.
- `should_translate_segment` : evite de traduire des fragments trop courts.
- `translate_mixed_segment` : traduit seulement les runs arabes.
- `cached_translate` : evite de retraduire les memes segments.

Reponse a donner au jury : ce choix evite de degrader les mots francais deja corrects, comme "budget", "contrat", "CRM", "devis" ou "client".

## 11. Gemini : analyse et e-mail

Gemini intervient a deux niveaux :

- Analyse commerciale dans `local-whisper/app.py`, endpoint `/analyze`.
- Generation des e-mails dans `server/services/emailDraftGenerationService.js`.

Le service e-mail suit une logique prudente :

1. Il normalise le transcript.
2. Il extrait ou reutilise des faits caches dans `MeetingEmailFacts`.
3. Il choisit une variante de prompt.
4. Il demande a Gemini un brouillon structure.
5. Il repare le JSON si la sortie contient des fences Markdown ou du texte autour.
6. Il verifie que le corps n'est pas trop court ou incomplet.
7. Il utilise un fallback local si Gemini echoue.

Fonctions importantes :

- `generateEmailDraftPayload` : fonction principale.
- `parseJsonLenient` : parsing robuste des sorties Gemini.
- `computeTranscriptAnalysisConfidence` : estime la coherence entre transcript et analyse.
- `buildFallbackEmailContent` : genere un e-mail de secours.
- `enforceRecipientGreeting` : evite une salutation incorrecte.
- `isLikelyIncompleteEmailBody` : detecte un brouillon tronque.

## 12. Frontend React

### 12.1 Routes

Les routes sont dans `src/App.tsx`.

| Route | Page |
| --- | --- |
| `/login` | Connexion |
| `/` | Enregistrement |
| `/dashboard` | Dashboard |
| `/clients` | Liste clients |
| `/clients/:clientId` | Detail client |
| `/meetings` | Liste reunions |
| `/meeting/:id` | Detail reunion |
| `/performance` | Performance commerciale |
| `/analytics` | Analytics |
| `/settings` | Parametres |
| `/admin` | Admin uniquement |

### 12.2 Authentification frontend

`src/contexts/AuthContext.tsx` gere :

- Le token dans `localStorage`.
- L'appel `/auth/me`.
- `signIn`.
- `signOut`.
- La synchronisation au login.
- La synchronisation quand l'application revient en ligne.

`src/components/auth/ProtectedRoute.tsx` bloque :

- Les utilisateurs non connectes.
- Les utilisateurs non-admin sur `/admin`.

### 12.3 Appel API

`src/lib/apiClient.ts` est le client HTTP bas niveau.

Il ajoute automatiquement :

- `Authorization: Bearer <token>`.
- La redirection vers `/login` en cas de 401.
- L'upload chunked avant fallback legacy.

`src/lib/api.ts` contient les fonctions metier :

- `transcribeAudioWithWhisper`.
- `translateText`.
- `createMeeting`.
- `processMeeting`.
- `getMeetings`.
- `getMeetingsPaginated`.
- `getMeeting`.
- `deleteMeeting`.
- `restoreMeeting`.
- `getMeetingAuditEvents`.
- `getProcessingDiagnostics`.
- `getAnalyticsTrends`.
- `getCoachingInsights`.
- `getClient360`.
- `searchMeetingsKeyword`.
- `transformMeeting`.

### 12.4 Hooks importants

| Hook | Fichier | Role |
| --- | --- | --- |
| `useAudioRecorder` | `src/hooks/useAudioRecorder.ts` | Enregistrement micro via MediaRecorder |
| `useAudioRecorderWithTranscription` | `src/hooks/useAudioRecorderWithTranscription.ts` | Enregistrement/import + Whisper + traduction |
| `useMeetings` | `src/hooks/useMeetings.ts` | Liste reunions avec polling si traitement actif |
| `useMeeting` | `src/hooks/useMeetings.ts` | Detail reunion avec polling |
| `useCreateMeeting` | `src/hooks/useMeetings.ts` | Upload, creation, lancement du traitement |
| `useEmailDraft` | `src/hooks/useEmailDraft.ts` | Generation et mutations e-mail |

## 13. Local-First et synchronisation

Le mode Local-First repose sur IndexedDB via Dexie dans `src/integrations/local/client.ts`.

Tables principales :

- `meetings`.
- `meeting_analyses`.
- `clients`.
- `emailDrafts`.
- `auditEvents`.
- `revenue`.
- `monthly_revenue`.
- `commercials`.
- `commercial_targets`.
- `commercial_revenue`.

Chaque entite synchronisable contient un `syncMeta` :

- `synced` : identique au serveur.
- `local-only` : cree localement et pas encore pousse.
- `pending` : modification locale en attente.
- `conflicted` : conflit a resoudre.

`src/services/syncService.ts` gere :

- Les reunions creees hors ligne.
- Les soft deletes locales.
- Les patchs locaux.
- Les clients en attente.
- Les brouillons d'e-mail via `emailDraftService.syncPendingDrafts`.

Reponse a donner au jury : Local-First est adapte au contexte de terrain parce qu'un commercial peut continuer a travailler meme avec une connexion faible. La synchronisation reprend quand le reseau revient.

## 14. Clients, performance et revenus

La gestion client existe cote serveur et cote local.

Backend :

- `server/routes/clients.js` gere le CRUD client.
- `Client` contient identite, contact, statut, tags, revenu estime, commercial assigne, soft delete.
- `sync-from-meetings` peut creer des fiches clients depuis les reunions existantes.

Frontend :

- `ClientsPage` affiche la liste avec recherche, filtre et pagination.
- `ClientDetailPage` affiche les reunions d'un client et la vue 360.
- `src/lib/clientService.ts` gere le cache local client.

Performance commerciale :

- `PerformancePage` affiche les commerciaux, objectifs, revenus et coaching.
- `src/lib/commercialService.ts` gere les commerciaux et objectifs dans IndexedDB.
- `src/lib/revenueService.ts` gere les revenus annuels et mensuels dans IndexedDB.
- Les analytics backend viennent de `server/routes/meetings/summaries.js`.

Point a dire clairement : les revenus et objectifs commerciaux sont surtout locaux dans cette version. Les analyses commerciales viennent du backend a partir des reunions.

## 15. Module e-mail

Objectif : transformer l'analyse d'une reunion en e-mail de suivi modifiable.

Backend :

- Routes dans `server/routes/meetings/emailDrafts.js`.
- Generation via `generateEmailDraftPayload`.
- Persistance dans `EmailDraft`.
- Historique dans `EmailDraftVersion`.
- Feedback dans `EmailDraftFeedback`.
- Events d'audit pour tracer les actions.

Frontend :

- `src/components/EmailDraftPanel.tsx` affiche et modifie les brouillons.
- `src/hooks/useEmailDraft.ts` encapsule les mutations.
- `src/services/emailDraftService.ts` gere cache local, fallback, conflits, variantes.
- `WordDiffView` sert a comparer les versions.

Fonctions utilisateur :

- Generer un brouillon.
- Regenerer une variante.
- Modifier le contenu.
- Sauvegarder comme variante.
- Approuver.
- Marquer comme envoye.
- Restaurer une ancienne version.
- Supprimer en soft delete.

## 16. Securite et controle d'acces

Elements implementes :

- JWT obligatoire pour les routes protegees.
- Hash bcrypt des mots de passe.
- Role `admin`.
- `requireAdmin` pour users et diagnostics.
- `hasMeetingAccess` pour verifier qu'un utilisateur accede seulement a ses reunions, sauf admin.
- Filtrage par `user_id` dans les listes.
- Soft delete au lieu de suppression brutale pour clients/reunions/e-mails.
- Audit events append-only.

Limites a reconnaitre :

- Il faut configurer un `JWT_SECRET` fort en production.
- Les fichiers audio sont servis depuis `/uploads`, donc il faut durcir l'acces en production.
- Gemini est un service externe : il faut gerer les donnees sensibles selon la politique de l'entreprise.
- Le chiffrement au repos n'est pas implemente directement dans le code.

## 17. Tests

Tests backend :

- `server/tests/meetingProcessor.test.js` verifie le pipeline de traitement, le fallback de traduction, le parsing JSON et les erreurs audio.
- `server/tests/emailDraftGenerationService.test.js` verifie le cache de faits et le fallback d'e-mail.
- `server/tests/meetingsLifecycle.test.js` verifie soft delete, restore et controle d'acces events.

Tests Python :

- `local-whisper/tests/test_text_helpers.py` teste le decoupage, le post-traitement et la confiance segment.
- `local-translate/tests/test_mixed_script_helpers.py` teste la traduction segmentee et la preservation du francais.

Commandes utiles :

```bash
npm run build
npm run test:server
npm run test:python
npm run test:web
npm test
```

Point important : les tests frontend unitaires ne couvrent pas encore toutes les pages. Si le jury pose la question, dire que la validation frontend repose surtout sur build, tests manuels et scenarios fonctionnels, et que l'ajout de tests Playwright/Testing Library est une perspective.

## 18. Rapport `report.md`

`report.md` est un document LaTeX-style, pas un simple Markdown classique.

Chapitres principaux :

- Remerciements, resume, abstract, acronymes.
- Introduction generale.
- Cadre du projet et etude de l'existant.
- Specification des besoins.
- Conception.
- Adaptation et fine-tuning du modele Whisper.
- Realisation.
- Tests et validation.
- Conclusion et perspectives.
- Bibliographie.

Ce que le rapport defend :

- Le probleme est concret : notes manuelles, code-switching, suivi commercial lent, connectivite instable.
- Les besoins couvrent l'audio, la transcription, la traduction, l'analyse, les e-mails, le Local-First, les clients, l'administration et la performance.
- L'architecture separe frontend, backend, base serveur, base locale et services IA.
- Le fine-tuning Whisper repond au contexte tunisien.
- La validation couvre le backend, les services Python et les scenarios fonctionnels.

Questions probables sur le rapport :

- Pourquoi le rapport parle de Local-First ? Parce que l'application vise des commerciaux sur terrain avec connectivite instable.
- Pourquoi un service de traduction separe ? Parce que la traduction segmentee garde le francais intact et traduit seulement l'arabe.
- Pourquoi Gemini ? Parce que l'objectif n'est pas seulement transcrire, mais produire une analyse commerciale structuree et un e-mail exploitable.
- Pourquoi fine-tuner Whisper ? Parce que le modele general gere mal certains accents, melanges derja/francais, termes commerciaux locaux.
- Quelles limites restent ? Donnees de validation limitees, tests frontend incomplets, dependance Gemini, securisation production a renforcer.

## 19. Fine-tuning Whisper

Le document technique est `whisperfinetune.md`.

Objectif : adapter Whisper Large-v3 a la parole tunisienne et au code-switching.

Corpus mentionne dans le rapport :

- TunSwitchCS : environ 10 h.
- MASC : environ 2,8 h.
- Youtube_DiwanFM : environ 5,4 h.
- Total : environ 18 h.
- Split mentionne : 5451 exemples train, 309 exemples test.

Travail technique :

- Notebook 1 : preparation dataset, resampling 16 kHz, features Whisper, labels.
- Notebook 2 : entrainement Kaggle 2xT4, stabilisation sous VRAM limitee.
- Notebook 3 : entrainement Lightning.ai H200, workflow final plus stable.

Problemes resolus :

- Contrainte Whisper de 448 tokens decoder.
- OOM et instabilite CUDA.
- `grad_norm = inf` en fp16.
- Fallback SDPA si Flash Attention ne compile pas.
- Dataloader qui bloque dans un environnement manage.
- Export de gros modeles.

Configuration finale :

- Modele de base : `openai/whisper-large-v3`.
- Tache : transcription.
- Entrainement jusqu'a 3000 steps.
- GPU final : H200.
- Evaluation : WER et CER, avec normalisation arabe.
- Integration : le service `local-whisper` peut charger le modele fine-tune via les options de variante et les chemins de modele.

Reponse courte si le jury demande : le fine-tuning n'est pas une decoration. Il sert a rapprocher le systeme du terrain tunisien, surtout pour le derja, le bruit, l'accent et le melange de langues.

## 20. Demo technique a repeter

Scenario de demonstration :

1. Lancer MongoDB, backend, frontend, service Whisper, service Translate, et Redis si disponible.
2. Se connecter avec un utilisateur.
3. Aller sur la page d'enregistrement.
4. Importer ou enregistrer un audio court.
5. Montrer le mode Whisper et le transcript.
6. Creer la reunion.
7. Montrer le statut `queued`, `transcribing`, `translating`, `analyzing`, `completed`.
8. Ouvrir le detail reunion.
9. Expliquer resume, sentiment, stade, objections, risques, actions et win probability.
10. Generer un e-mail de suivi.
11. Modifier l'e-mail, sauvegarder une variante, montrer l'historique.
12. Ouvrir l'admin et montrer les diagnostics si le compte est admin.

Commandes courantes :

```bash
npm run dev
```

```bash
npm --prefix server start
```

```bash
npm run test:server
```

```bash
npm run test:python
```

Le README mentionne aussi un compte admin de seed : `admin@admin.com` / `admin123`. Ne pas presenter ce mot de passe comme un choix production ; c'est seulement un compte local de demonstration.

## 21. Questions et reponses probables

### 21.1 Questions generales

**Q1. C'est quoi SalesAI ?**  
SalesAI est une plateforme qui transforme des reunions commerciales audio en transcript, traduction, analyse commerciale et e-mail de suivi.

**Q2. Quel probleme concret le projet resout ?**  
Il reduit la perte d'information apres reunion, accelere le suivi commercial, et gere les reunions tunisiennes avec melange derja/francais.

**Q3. Qui sont les acteurs ?**  
Commercial, administrateur, et systeme IA. Le commercial enregistre et exploite les reunions. L'admin gere les utilisateurs et surveille les diagnostics. Le systeme IA transcrit, traduit, analyse et genere des e-mails.

**Q4. Pourquoi ne pas utiliser une simple application de notes ?**  
Une application de notes ne transcrit pas l'audio, ne gere pas le code-switching, ne produit pas une analyse commerciale structuree, et ne genere pas de brouillon d'e-mail.

**Q5. Quelle est la valeur metier ?**  
Le commercial gagne du temps, garde un historique client, detecte les risques, suit les prochaines actions et produit rapidement un e-mail coherent.

### 21.2 Architecture

**Q6. De quoi se compose l'architecture ?**  
Elle contient un frontend React, un backend Express, MongoDB, IndexedDB cote navigateur, un service Whisper, un service NLLB-200, Gemini, et une queue BullMQ/Redis optionnelle.

**Q7. Pourquoi separer les services IA du backend ?**  
Parce que la transcription et la traduction ont des dependances Python lourdes. Les isoler dans FastAPI simplifie le backend Node et rend les services IA remplaçables.

**Q8. Pourquoi utiliser MongoDB ?**  
Les donnees sont naturellement documentaires : reunions, analyses, clients, brouillons, metadonnees de traitement. MongoDB permet aussi des aggregations pour les analytics.

**Q9. Pourquoi utiliser IndexedDB ?**  
IndexedDB permet de stocker des donnees dans le navigateur. C'est la base du mode Local-First et du travail hors ligne.

**Q10. Pourquoi utiliser BullMQ ?**  
Le traitement audio peut etre long. BullMQ decouple la requete HTTP du traitement IA, ajoute retries, backoff et diagnostics.

**Q11. Que se passe-t-il si Redis est indisponible ?**  
`meetingQueue.js` bascule en mode fallback. Le backend lance le traitement en arriere-plan sans BullMQ.

### 21.3 Backend

**Q12. Ou est le point d'entree backend ?**  
Dans `server/index.js`. Il configure Express, les routes, MongoDB, les uploads statiques et la queue.

**Q13. Ou sont les variables de configuration ?**  
Dans `server/config.js`.

**Q14. Comment l'authentification marche ?**  
`POST /api/auth/login` verifie l'email et le mot de passe, puis renvoie un JWT. Les routes protegees utilisent `authenticate` pour verifier ce token.

**Q15. Ou est le hash du mot de passe ?**  
Dans `server/models/User.js`, avec un hook Mongoose `pre('save')` et bcrypt.

**Q16. Comment un admin est-il reconnu ?**  
Par le champ `role` dans `User`. Le middleware `requireAdmin` exige `role === 'admin'`.

**Q17. Comment empecher un utilisateur de lire les reunions d'un autre ?**  
Les routes filtrent par `user_id`, et `hasMeetingAccess` autorise seulement le proprietaire ou un admin.

**Q18. Pourquoi soft delete ?**  
Pour eviter la perte definitive, garder l'audit trail, permettre la restauration, et reduire les erreurs utilisateur.

**Q19. Ou sont les soft deletes reunion ?**  
Dans `server/routes/meetings/lifecycle.js`, avec `DELETE /:id` et `POST /:id/restore`.

**Q20. Ou sont les diagnostics de traitement ?**  
Dans `server/routes/meetings/diagnostics.js`, endpoint `GET /api/meetings/diagnostics/processing`, admin-only.

### 21.4 Pipeline de traitement

**Q21. Ou est la fonction principale du pipeline ?**  
`processMeetingPipeline` dans `server/services/meetingProcessor.js`.

**Q22. Quelles sont les etapes du pipeline ?**  
Chargement reunion, transcription si besoin, traduction si besoin, analyse Gemini, sauvegarde `MeetingAnalysis`, statut `completed` ou `error`.

**Q23. Pourquoi le frontend fait aussi une transcription ?**  
Pour donner un retour rapide et permettre a l'utilisateur d'editer le texte avant sauvegarde. Le backend reste responsable du traitement final et de la persistance.

**Q24. Que fait `parseAnalysisJson` ?**  
Il extrait et parse la reponse JSON de l'analyse, meme si le LLM renvoie des fences Markdown ou du texte autour.

**Q25. Que se passe-t-il si la transcription echoue ?**  
Le pipeline met la reunion en `error`, stocke `error_message`, enregistre l'erreur dans `processing_meta` et log un audit event.

**Q26. Que se passe-t-il si Gemini n'est pas configure ?**  
Le pipeline peut traduire le transcript avec `local-translate`, et certaines fonctions e-mail utilisent un fallback local.

**Q27. Pourquoi garder `raw_transcript` et `transcript` ?**  
`raw_transcript` conserve la sortie brute. `transcript` peut contenir une version nettoyee ou exploitable. Cela aide au debuggage et a la qualite.

**Q28. A quoi sert `processing_meta` ?**  
A tracer les etapes, dates, tentatives, erreurs, fallback et informations de queue.

### 21.5 Whisper

**Q29. Ou est le service Whisper ?**  
Dans `local-whisper/app.py`.

**Q30. Quel modele est utilise ?**  
Par defaut Whisper Large-v3 via Faster-Whisper, avec possibilite de charger une variante fine-tunee.

**Q31. Pourquoi Faster-Whisper ?**  
Il est optimise pour l'inference et plus adapte a un service local performant que l'implementation brute.

**Q32. Pourquoi convertir l'audio en WAV 16 kHz mono ?**  
Whisper attend un signal audio standardise. La conversion reduit les erreurs dues aux formats et frequences variables.

**Q33. Quel est le role du mode `bilingual` ?**  
Il adapte la transcription aux reunions qui melangent derja/arabe et francais.

**Q34. Comment detecter les segments incertains ?**  
Le service calcule une confiance par segment et renvoie `low_confidence` quand la qualite est faible.

**Q35. Pourquoi faire du post-traitement du transcript ?**  
Pour corriger des formes hybrides, separer certains scripts, et ameliorer la lisibilite avant traduction ou analyse.

### 21.6 Traduction

**Q36. Ou est le service de traduction ?**  
Dans `local-translate/app.py`.

**Q37. Quel modele est utilise pour traduire ?**  
NLLB-200 distilled 600M.

**Q38. Pourquoi traduire par segments ?**  
Pour traduire seulement les segments arabes et garder le francais intact.

**Q39. Quel probleme resout `split_by_script_runs` ?**  
Il separe les morceaux arabes des morceaux latins afin d'eviter de passer tout le texte au traducteur.

**Q40. Pourquoi garder des termes proteges ?**  
Pour eviter que des termes commerciaux comme CRM, budget ou contrat soient modifies inutilement.

### 21.7 Gemini et analyse

**Q41. Que produit l'analyse commerciale ?**  
Un resume, un stade de vente, des objections, risques, prochaines actions, sujets cles, sentiment, probabilite de gain et confiance.

**Q42. Ou est le prompt d'analyse ?**  
Dans `local-whisper/app.py`, fonction `build_gemini_prompt`.

**Q43. Pourquoi demander une reponse JSON a Gemini ?**  
Le frontend et le backend ont besoin de champs structurés. Un JSON facilite la validation et l'affichage.

**Q44. Comment eviter qu'une sortie Gemini casse le backend ?**  
Le code nettoie les fences, extrait le JSON et valide les enums et les bornes numeriques.

**Q45. Quels sont les stades de vente ?**  
Les stades actuels sont `contact_visits`, `value_proposition`, `offer_negotiation`, `closing`, `closed_lost`. Il n'y a pas encore de stade `closed_won` dans l'enum backend ; si le jury demande les ventes gagnees, il faut expliquer que cette metrique doit etre calculee autrement ou ajoutee dans une evolution.

### 21.8 E-mail draft

**Q46. Ou est la generation d'e-mails ?**  
Dans `server/services/emailDraftGenerationService.js`.

**Q47. Pourquoi extraire d'abord des faits ?**  
Pour eviter que le LLM invente trop d'informations. Les faits structurent le brouillon et sont caches.

**Q48. Pourquoi stocker `MeetingEmailFacts` ?**  
Pour reutiliser les faits si le transcript et l'analyse n'ont pas change, et eviter des appels Gemini inutiles.

**Q49. Que fait le fallback e-mail ?**  
Il genere un brouillon simple mais exploitable si Gemini echoue ou renvoie un contenu incomplet.

**Q50. Ou est l'historique des versions e-mail ?**  
Dans `EmailDraftVersion`, expose par les routes `/:id/email-drafts/:draftId/history`.

**Q51. Comment l'utilisateur compare deux versions ?**  
Via le composant de diff texte, utilise dans `EmailDraftPanel`.

### 21.9 Frontend

**Q52. Ou sont les routes frontend ?**  
Dans `src/App.tsx`.

**Q53. Quelle page gere l'enregistrement ?**  
`src/pages/RecordPage.tsx`.

**Q54. Quelle page affiche les resultats d'une reunion ?**  
`src/pages/MeetingDetailPage.tsx`.

**Q55. Comment le frontend sait qu'une reunion est encore en traitement ?**  
`useMeetings` et `useMeeting` pollent toutes les 3 secondes quand une reunion a un statut actif.

**Q56. Pourquoi TanStack Query ?**  
Pour gerer cache, invalidation, loading states et refetch automatique proprement.

**Q57. Pourquoi Dexie ?**  
Dexie simplifie IndexedDB avec une API plus lisible, des index et des migrations.

**Q58. Que fait `transformMeeting` ?**  
Il transforme les champs backend snake_case en structure frontend camelCase.

**Q59. Comment le frontend gere une erreur 401 ?**  
`apiClient` supprime le token et redirige vers `/login`.

### 21.10 Local-First

**Q60. C'est quoi Local-First dans ce projet ?**  
L'application garde les donnees localement dans IndexedDB et synchronise avec le backend quand le reseau est disponible.

**Q61. Ou est la base locale ?**  
Dans `src/integrations/local/client.ts`.

**Q62. Ou est la synchronisation ?**  
Dans `src/services/syncService.ts`.

**Q63. Comment identifier une reunion creee hors ligne ?**  
Elle peut avoir un id local prefixe par `local_` et un `syncMeta.syncState = 'local-only'`.

**Q64. Que se passe-t-il quand la connexion revient ?**  
`runBackgroundSync` pousse les reunions, clients et brouillons en attente vers le backend, puis met a jour le cache local.

**Q65. Comment gerer les conflits ?**  
Les entites peuvent passer en `conflicted`. Le module e-mail expose des actions pour garder la version locale ou reprendre la version serveur.

### 21.11 Clients et analytics

**Q66. Ou est la liste client backend ?**  
Dans `server/routes/clients.js`.

**Q67. Ou est le resume clients base sur les reunions ?**  
Dans `server/routes/meetings/summaries.js`, endpoint `/clients/summary`.

**Q68. Ou est la vue client 360 ?**  
Backend : `GET /api/meetings/clients/:clientId/360`. Frontend : `ClientDetailPage`.

**Q69. Que contiennent les tendances analytics ?**  
Des aggregations par periode : volume de reunions, sentiment, win probability, objections et stades.

**Q70. Ou est le coaching commercial ?**  
Backend : `GET /api/meetings/analytics/coaching`. Frontend : `PerformancePage`.

### 21.12 Rapport et conception

**Q71. Pourquoi le rapport contient une etude de l'existant ?**  
Pour montrer que les solutions du marche ne couvrent pas bien le contexte tunisien : code-switching, Local-First, analyse commerciale adaptee.

**Q72. Quelle est la contribution principale du projet ?**  
L'integration complete entre capture audio, ASR adapte au contexte tunisien, traduction segmentee, analyse commerciale, e-mail de suivi et synchronisation offline.

**Q73. Que dire sur la conception des donnees ?**  
Le serveur stocke les entites durables dans MongoDB. Le navigateur garde une copie locale synchronisable dans IndexedDB.

**Q74. Pourquoi le rapport parle de pipelines IA separes ?**  
Parce que transcription, traduction, analyse et generation ont des contraintes differentes et doivent rester modulaires.

**Q75. Quelle limite du rapport faut-il assumer ?**  
Certaines metriques finales de validation doivent etre completees avec les resultats definitifs et les captures de demonstration.

### 21.13 Fine-tuning

**Q76. Pourquoi fine-tuner Whisper ?**  
Pour ameliorer la reconnaissance du derja tunisien, de l'accent local et du code-switching.

**Q77. Quelle contrainte Whisper importante avez-vous rencontree ?**  
La limite de 448 tokens cote decoder. Les labels trop longs provoquent un crash, donc ils sont tronques dans le data collator.

**Q78. Pourquoi deux environnements Kaggle et Lightning ?**  
Kaggle 2xT4 a servi a explorer une configuration sous contrainte VRAM. Lightning H200 a servi au workflow final plus rapide et stable.

**Q79. Pourquoi WER et CER ?**  
WER mesure les erreurs par mots, CER par caracteres. CER est utile quand l'arabe dialectal et les variations orthographiques rendent le mot exact plus difficile.

**Q80. Comment integrer le modele fine-tune ?**  
Le service `local-whisper` supporte des variantes de modele et peut charger un depot ou un dossier fine-tune via configuration.

### 21.14 Tests et qualite

**Q81. Quels tests prouvent le pipeline backend ?**  
`meetingProcessor.test.js` verifie transcription, traduction fallback, analyse, statuts et gestion d'erreur.

**Q82. Quels tests prouvent le module e-mail ?**  
`emailDraftGenerationService.test.js` verifie le cache des faits et le fallback quand Gemini n'est pas disponible.

**Q83. Quels tests prouvent les helpers IA Python ?**  
Les tests dans `local-whisper/tests` et `local-translate/tests` couvrent post-traitement, confiance segment et traduction mixte.

**Q84. Quelle partie manque le plus de tests automatiques ?**  
Le frontend UI. Il faut ajouter des tests de composants et des tests end-to-end.

**Q85. Comment valider manuellement le projet ?**  
Par un scenario complet : login, upload audio, transcript, traitement, analyse, e-mail, modification, historique, sync, diagnostics.

### 21.15 Securite et production

**Q86. Le projet est-il pret pour production ?**  
Il a une base solide, mais il faut encore durcir le secret JWT, l'acces aux fichiers uploads, le chiffrement, les logs, le monitoring et les tests frontend.

**Q87. Quel risque pose Gemini ?**  
Les donnees envoyees a un service externe peuvent contenir des informations client. Il faut une politique de confidentialite et eventuellement un modele local selon le contexte.

**Q88. Comment auditer les actions ?**  
Avec `AuditEvent`, ecrit via `logAuditEvent`, `logSystemAuditEvent` et `logSystemMeetingEvent`.

**Q89. Pourquoi l'audit est append-only ?**  
Pour reduire le risque de modification ou suppression de l'historique d'actions.

**Q90. Comment gerer les fichiers audio en production ?**  
Il faut proteger `/uploads`, ajouter controle d'acces, nettoyage, limites de taille et eventuellement stockage objet prive.

### 21.16 Questions pieges

**Q91. Pourquoi ne pas tout faire dans le navigateur ?**  
La transcription Whisper, NLLB et Gemini demandent des ressources lourdes ou des secrets API. Le backend et les services locaux sont plus adaptes.

**Q92. Pourquoi ne pas tout faire dans le backend Node ?**  
Les bibliotheques IA Python sont plus matures pour Whisper et NLLB. FastAPI isole mieux ces charges.

**Q93. Est-ce que la traduction est toujours necessaire ?**  
Non. Si l'analyse Gemini peut traiter le transcript mixte, la traduction peut etre evitee. Le fallback de traduction sert surtout quand l'analyse directe n'est pas disponible ou moins fiable.

**Q94. Est-ce que le systeme remplace le commercial ?**  
Non. Il assiste le commercial. L'utilisateur peut corriger le transcript, modifier l'analyse indirectement via les donnees, editer l'e-mail et valider avant envoi.

**Q95. Est-ce que l'IA peut halluciner ?**  
Oui. Le projet reduit ce risque par des prompts structures, JSON attendu, cache de faits, champs a verifier, fallback, et validation humaine.

**Q96. Pourquoi garder un fallback local pour les e-mails ?**  
Pour que l'application reste utilisable meme si Gemini est indisponible.

**Q97. Pourquoi faire un audit trail pour les e-mails ?**  
Pour suivre les generations, modifications, validations et envois, ce qui aide la traçabilite commerciale.

**Q98. Pourquoi les objectifs/revenus sont-ils surtout locaux ?**  
C'est une fonctionnalite de pilotage interne dans cette version. Le coeur backend concerne les reunions, clients, analyses et e-mails.

**Q99. Quelle amelioration prioritaire proposer ?**  
Ajouter des tests end-to-end, proteger les uploads, completer les metriques ASR, et ajouter un monitoring de production.

**Q100. Si vous aviez plus de temps, que feriez-vous ?**  
Je renforcerais la securite production, ajouterais diarisation locuteur, meilleure evaluation ASR, tests frontend, dashboard de monitoring, et options de modele local pour reduire la dependance externe.

## 22. Reponses courtes a memoriser

**Architecture** : React pour l'interface, Express pour l'API, MongoDB pour la persistance serveur, IndexedDB pour le Local-First, FastAPI pour l'IA.

**Pipeline** : audio vers Whisper, transcript nettoye, traduction arabe vers francais si necessaire, analyse Gemini, sauvegarde MongoDB, affichage React.

**Local-First** : les donnees restent utilisables hors ligne et se synchronisent ensuite.

**Queue** : BullMQ evite de bloquer les requetes HTTP pendant les traitements audio longs.

**Whisper** : transcription adaptee au contexte tunisien avec mode bilingue et fine-tuning possible.

**NLLB** : traduction segmentee pour ne pas casser le francais deja present.

**Gemini** : analyse commerciale structuree et generation d'e-mails.

**Securite** : JWT, bcrypt, roles, controle d'acces par proprietaire, audit trail.

**Limites** : tests frontend incomplets, securisation uploads a renforcer, dependance Gemini, evaluation ASR a completer.

## 23. Ce qu'il ne faut pas dire

- Ne pas dire que l'IA est toujours correcte. Dire qu'elle assiste l'utilisateur et que la validation humaine reste necessaire.
- Ne pas dire que l'application est production-ready sans reserve. Dire qu'elle est fonctionnelle mais que certains durcissements production restent a faire.
- Ne pas dire que la traduction traduit tout. Dire qu'elle traduit les segments arabes et preserve le francais.
- Ne pas dire que Redis est obligatoire. Dire qu'il est optionnel avec fallback.
- Ne pas dire que `report.md` est un Markdown pur. Dire que c'est un document LaTeX-style stocke dans un fichier `.md`.

## 24. Checklist avant soutenance

- Savoir expliquer le flux complet audio -> analyse -> e-mail.
- Savoir pointer `server/services/meetingProcessor.js`.
- Savoir pointer `local-whisper/app.py` et `local-translate/app.py`.
- Savoir expliquer `src/integrations/local/client.ts` et `syncService.ts`.
- Savoir citer les modeles MongoDB principaux.
- Savoir expliquer pourquoi Local-First est important en Tunisie.
- Savoir expliquer pourquoi fine-tuner Whisper.
- Savoir assumer les limites sans perdre confiance.
- Savoir executer ou decrire `npm run build`, `npm run test:server`, `npm run test:python`.
- Savoir faire une demo courte sans se perdre dans les details.
