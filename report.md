\documentclass[12pt,a4paper]{report}
\usepackage[utf8]{inputenc}
\usepackage[T1]{fontenc}
\usepackage[french]{babel}
\usepackage{graphicx}
\usepackage{hyperref}
\usepackage{geometry}
\usepackage{titlesec}
\usepackage{tabularx}
\usepackage{array}
\usepackage{enumitem}
\usepackage{float}
\usepackage{booktabs}
\usepackage{longtable}
\usepackage{listings}
\usepackage{xcolor}

\geometry{a4paper, margin=2.5cm}

\titleformat{\chapter}[display]
  {\normalfont\huge\bfseries}{\chaptertitlename\ \thechapter}{20pt}{\Huge}
\titlespacing*{\chapter}{0pt}{-50pt}{40pt}

\newcolumntype{Y}{>{\raggedright\arraybackslash}X}
\newcolumntype{P}[1]{>{\raggedright\arraybackslash}p{#1}}

\hypersetup{
    colorlinks=true,
    linkcolor=blue,
    filecolor=magenta,
    urlcolor=cyan,
    pdftitle={Rapport de PFE - SalesAI},
}

\lstset{
  basicstyle=\small\ttfamily,
  backgroundcolor=\color{gray!10},
  frame=single,
  breaklines=true,
  columns=fullflexible
}

\begin{document}

\begin{titlepage}
    \centering
    \vspace*{1cm}

    \Large
    \textbf{République Tunisienne}\\
    \textbf{Ministère de l'Enseignement Supérieur et de la Recherche Scientifique}

    \vspace{2.5cm}

    \Huge
    \textbf{Rapport de Projet de Fin d'Études}

    \vspace{1.5cm}

    \LARGE
    \textbf{Sujet :}\\
    Conception et développement d'une plateforme d'intelligence conversationnelle pour l'analyse automatisée des réunions commerciales\\
    \vspace{0.5cm}
    \textit{SalesAI --- Meeting Insights Hub}

    \vspace{2cm}

    \Large
    \textbf{Filière :} Génie Logiciel

    \vspace{1cm}

    \textbf{Établissement :}\\
    [À compléter]

    \vspace{0.5cm}

    \textbf{Entreprise d'accueil :}\\
    [À compléter]

    \vspace{1cm}

    \textbf{Réalisé par :}\\
    Neder Hassan

    \vspace{1cm}

    \textbf{Encadrant académique :}\\
    [À compléter]

    \vspace{0.5cm}

    \textbf{Encadrant professionnel :}\\
    [À compléter]

    \vfill

    \large
    \textbf{Année universitaire : 2025 -- 2026}
\end{titlepage}

\chapter*{Remerciements}
\addcontentsline{toc}{chapter}{Remerciements}
\textit{[À personnaliser : remercier l'encadrant académique, l'encadrant professionnel, les membres du jury, l'établissement d'accueil ainsi que les proches ayant soutenu le projet.]}

\chapter*{Résumé}
\addcontentsline{toc}{chapter}{Résumé}
Nous avons conçu et développé \textbf{SalesAI --- Meeting Insights Hub}, une plateforme web qui aide les équipes commerciales à exploiter leurs réunions. Le projet répond à trois contraintes concrètes : la prise de notes manuelle, une connectivité instable et le \textit{code-switching} entre dialecte tunisien et français. La plateforme couvre toute la chaîne, de la capture audio à la préparation d'un brouillon d'e-mail de suivi.

L'architecture repose sur une approche \textbf{Local-First} avec un frontend React et IndexedDB, un backend Express.js, un microservice de transcription basé sur \textit{faster-whisper}, un microservice de traduction fondé sur NLLB-200 et un module d'analyse sémantique appuyé sur Gemini. Nous avons aussi constitué un corpus adapté, préparé les données et fine-tuné Whisper Large-v3 pour l'arabe tunisien avec \textit{code-switching}. Le dépôt inclut enfin des modules de gestion client, de diagnostics de traitement, de versionnement des brouillons d'e-mail et d'analytique commerciale.

Le mémoire présente le cadre du projet, les besoins, les choix de conception, la réalisation technique et la validation. La version remise au jury devra encore ajouter les résultats expérimentaux finaux, les figures et les métriques issues des campagnes de test exécutées.

\textbf{Mots-clés :} intelligence conversationnelle, local-first, transcription automatique, dialecte tunisien, traduction, analyse de réunions, génie logiciel.

\chapter*{Abstract}
\addcontentsline{toc}{chapter}{Abstract}
This final-year project presents \textbf{SalesAI --- Meeting Insights Hub}, a web platform for commercial meeting analysis. The platform answers three concrete constraints: manual note-taking, unstable network connectivity, and frequent code-switching between Tunisian Arabic and French in professional conversations. It covers the workflow from audio capture to follow-up email drafting.

The architecture combines a \textbf{Local-First} frontend, an Express.js backend, a \textit{faster-whisper} transcription service, an NLLB-200 translation service, and a semantic analysis layer supported by Gemini. We also built a suitable speech dataset and fine-tuned Whisper Large-v3 for Tunisian Arabic speech recognition with frequent French and English code-switching. The platform adds operational features such as client management, processing diagnostics, email draft history, and analytics dashboards.

The report documents the project context, requirements, design decisions, implementation details, and validation strategy. The submitted version must add final metrics and figures from executed test campaigns.

\textbf{Keywords:} conversation intelligence, local-first, speech transcription, Tunisian dialect, translation, meeting analysis, software engineering.

\chapter*{Liste des acronymes}
\addcontentsline{toc}{chapter}{Liste des acronymes}
\begin{longtable}{p{3cm}p{11cm}}
AI / IA & Intelligence artificielle \\
API & Interface de programmation applicative \\
ASR & Automatic Speech Recognition \\
CER & Character Error Rate \\
CRUD & Create, Read, Update, Delete \\
GPU & Graphics Processing Unit \\
JWT & JSON Web Token \\
LLM & Large Language Model \\
RBAC & Role-Based Access Control \\
REST & Representational State Transfer \\
UI & User Interface \\
UX & User Experience \\
WER & Word Error Rate \\
\end{longtable}

\tableofcontents
\listoffigures
\listoftables
\newpage

\chapter*{Introduction Générale}
\addcontentsline{toc}{chapter}{Introduction Générale}

Les équipes commerciales accumulent un volume croissant d'échanges avec leurs clients. Les réunions de vente, en présentiel comme à distance, contiennent des informations utiles pour qualifier une opportunité, comprendre un besoin, repérer une objection et préparer le suivi. La prise de notes manuelle laisse pourtant des angles morts et produit des comptes rendus hétérogènes.

En Tunisie, cette difficulté augmente avec le \textit{code-switching} entre dialecte tunisien (Derja), français et parfois anglais. Une même phrase peut mêler une grammaire arabe et un vocabulaire métier francophone. Les solutions généralistes de transcription et d'analyse gèrent mal ce mélange et dégradent les traitements qui suivent.

Avec \textbf{SalesAI --- Meeting Insights Hub}, nous automatisons une partie du traitement d'une réunion commerciale, de l'enregistrement à la préparation des actions de suivi. Nous combinons transcription, traduction, analyse métier et génération d'e-mail dans une architecture exploitable avec des contraintes réseau et linguistiques locales.

Nous retenons six objectifs principaux :
\begin{enumerate}
    \item \textbf{Capturer et centraliser les réunions commerciales} à partir d'un enregistrement navigateur ou d'un import de fichier audio.
    \item \textbf{Produire une transcription exploitable} malgré le mélange linguistique franco-tunisien.
    \item \textbf{Uniformiser linguistiquement le contenu lorsque nécessaire} par traduction ciblée des segments arabophones vers le français.
    \item \textbf{Extraire des informations métier utiles} telles qu'un résumé, des objections, des actions à mener et une estimation qualitative de l'état de l'affaire.
    \item \textbf{Faciliter le suivi post-réunion} via la génération d'un brouillon d'e-mail révisable par l'utilisateur.
    \item \textbf{Conserver une continuité d'usage hors-ligne} grâce à une architecture local-first.
\end{enumerate}

Nous avons intégré la capture audio, une transcription spécialisée, un corpus pour le fine-tuning, une traduction segmentée, l'analyse sémantique, la gestion des brouillons, la synchronisation locale et des tableaux de bord. Ce choix place le travail dans le champ du génie logiciel : nous justifions l'architecture, nous documentons les compromis techniques et nous validons le comportement obtenu.

Le mémoire suit ce parcours en six chapitres. Nous présentons d'abord le cadre du projet et l'existant. Nous détaillons ensuite les besoins, la conception architecturale, la modélisation des données et les pipelines IA. Nous décrivons enfin la constitution du corpus, la réalisation technique, puis la validation et les limites de l'évaluation.

\chapter{Cadre du Projet et Étude de l'Existant}

\section{Présentation du cadre général}
Nous plaçons ce projet dans le domaine de l'\textbf{intelligence conversationnelle} (\textit{Conversation Intelligence}), au croisement du traitement automatique de la parole, de l'analyse de texte et de l'aide à la décision commerciale. Les équipes de vente utilisent ce type de plateforme pour transformer la parole de leurs échanges en informations structurées.

La littérature académique et les offres industrielles montrent un intérêt croissant pour ces outils. Dans la version finale, ajoutez une référence datée et vérifiable pour chaque donnée chiffrée sur le marché ou l'adoption de ces solutions.

\section{Problématique}
Les équipes commerciales, surtout en Tunisie et en Afrique du Nord, butent encore sur cinq contraintes :

\begin{itemize}
    \item \textbf{La charge cognitive et la perte d'information :} La prise de notes manuelle durant les réunions commerciales est chronophage, hétérogène et susceptible de laisser échapper des informations importantes.
    \item \textbf{La barrière du code-switching :} Les commerciaux échangent en dialecte tunisien tout en employant un lexique technique et métier en français. Les moteurs de reconnaissance vocale standard gèrent mal ce mélange, ce qui limite l'analyse sémantique en aval.
    \item \textbf{La résilience de l'infrastructure :} Les commerciaux opérant sur le terrain subissent souvent une connectivité Internet instable. Une application purement cloud dépendante s'avère frustrante et parfois inutilisable dans ces conditions.
    \item \textbf{L'inertie du suivi post-réunion :} La rédaction d'e-mails de suivi pertinents et personnalisés représente un coût temporel non négligeable et peut retarder la reprise de contact avec le client.
    \item \textbf{Le manque de pilotage structuré :} Sans centralisation des réunions, des analyses et des indicateurs commerciaux, le coaching et le suivi des opportunités restent partiels.
\end{itemize}

\section{Étude de l'existant}

\subsection{Analyse des solutions sur le marché}
Plusieurs solutions d'intelligence conversationnelle sont couramment citées sur le marché mondial, mais elles présentent des limites importantes dans notre contexte cible :

\begin{table}[H]
\centering
\small
\setlength{\tabcolsep}{4pt}
\renewcommand{\arraystretch}{1.15}
\begin{tabularx}{\linewidth}{|P{2.6cm}|Y|Y|}
\hline
\textbf{Solution} & \textbf{Forces} & \textbf{Faiblesses majeures} \\ \hline
\textbf{Gong.io} & Solution largement adoptée, analyse conversationnelle avancée, intégration CRM poussée. & Absence de prise en charge explicite du dialecte tunisien/Derja, tarification élevée, architecture fortement orientée cloud. \\ \hline
\textbf{Chorus.ai} & Transcription en temps réel, fonctionnalités puissantes de coaching IA. & Conçu principalement pour la langue anglaise, forte dépendance à la connectivité. \\ \hline
\textbf{Otter.ai} & Transcription générique automatique de bonne qualité, résumés IA abordables. & Pas de support pour l'arabe tunisien, focalisation limitée sur l'analyse commerciale B2B. \\ \hline
\textbf{Fireflies.ai} & Support multilingue de base, nombreuses intégrations tierces. & Les dialectes arabes ne sont pas réellement ciblés, et le code-switching est mal géré. \\ \hline
\end{tabularx}
\caption{Comparatif synthétique de solutions d'intelligence conversationnelle}
\label{tab:comparatif-existant}
\end{table}

\noindent\textit{Remarque : sourcer les informations du Tableau~\ref{tab:comparatif-existant} avec des documentations officielles, des fiches produit ou des études comparatives datées.}

\subsection{Limites identifiées}
Aucune solution existante ne couvre en même temps les trois exigences suivantes dans notre contexte :
\begin{enumerate}
    \item \textbf{La maîtrise du code-switching tunisien :} comprendre une phrase mêlant grammaire arabe et vocabulaire d'entreprise francophone.
    \item \textbf{Le fonctionnement hors-ligne (Local-First) :} assurer la continuité du travail sans connexion stable.
    \item \textbf{L'intégration verticale de l'analyse commerciale :} associer la transcription à la génération automatisée d'e-mails contextualisés, à la gestion client et à des vues de pilotage.
\end{enumerate}

\section{Solution proposée : SalesAI}
Nous avons développé \textbf{SalesAI --- Meeting Insights Hub} pour couvrir ces lacunes. La plateforme repose sur une architecture \textbf{Local-First} et réunit :
\begin{itemize}
    \item un \textbf{moteur de transcription asynchrone} basé sur \textit{faster-whisper}, capable d'exécuter soit le modèle de base, soit une variante \textit{fine-tunée par nos soins} sur un corpus adapté au contexte tunisien, afin de mieux tolérer le dialecte local et préserver les terminologies françaises ;
    \item un \textbf{service de traduction segmentée} s'appuyant sur NLLB-200, capable d'isoler les segments arabophones pour les traduire en français ;
    \item un \textbf{agent d'analyse sémantique} appuyé sur Gemini pour produire des KPI commerciaux et générer des brouillons d'e-mails ;
    \item un \textbf{socle applicatif local-first} assurant le stockage local, la synchronisation, la gestion client et des tableaux de bord opérationnels.
\end{itemize}

\chapter{Spécification des Besoins}

Les exigences fonctionnelles et techniques ci-dessous ont guidé le développement de SalesAI.

\section{Identification des acteurs}
Le système interagit avec trois catégories d'acteurs :
\begin{itemize}
    \item \textbf{Le Commercial (utilisateur principal) :} il enregistre ou importe ses réunions, consulte les transcriptions et les analyses générées, gère son portefeuille de clients, et valide les brouillons d'e-mails proposés par l'IA avant expédition.
    \item \textbf{L'Administrateur (ou directeur commercial) :} il bénéficie d'une vue d'ensemble sur l'organisation. Il gère les comptes utilisateurs, suit les traitements asynchrones et accède aux tableaux de bord analytiques globaux.
    \item \textbf{Le Système IA (acteur autonome) :} il exécute de manière asynchrone les tâches lourdes : traitement audio, transcription, traduction contextuelle, analyse sémantique et génération de contenu textuel.
\end{itemize}

Ajoutez le diagramme de cas d'utilisation dans la Figure~\ref{fig:usecase-placeholder} pour synthétiser ces interactions.

\begin{figure}[H]
\centering
\fbox{\parbox{0.85\textwidth}{
\centering
\vspace{0.5cm}
Emplacement réservé au diagramme de cas d'utilisation.\\
Acteurs attendus : Commercial, Administrateur, Système IA.\\
Cas d'utilisation attendus : enregistrer une réunion, importer un audio, consulter l'analyse, gérer un client, valider un brouillon d'e-mail, administrer les utilisateurs, superviser les traitements.
\vspace{0.5cm}
}}
\caption{Emplacement réservé au diagramme de cas d'utilisation}
\label{fig:usecase-placeholder}
\end{figure}

\section{Besoins fonctionnels}

\subsection{BF1 --- Gestion de l'enregistrement et de l'audio}
\begin{itemize}
    \item \textbf{Enregistrement in-app :} permettre l'enregistrement vocal directement depuis le navigateur Web avec des contrôles de pause et de reprise.
    \item \textbf{Importation de fichiers :} supporter le téléversement de fichiers audio et vidéo existants (WebM, WAV, MP3, M4A).
    \item \textbf{Gestion des gros fichiers :} implémenter un mécanisme d'\textit{upload} par morceaux (\textit{chunked upload}) pour garantir la stabilité du transfert des longues réunions.
\end{itemize}

\subsection{BF2 --- Pipeline de transcription et de traduction}
\begin{itemize}
    \item \textbf{Transcription optimisée :} intégrer le modèle \textit{Whisper} exécuté localement via \textit{faster-whisper} pour transformer l'audio en texte.
    \item \textbf{Adaptation au domaine :} permettre l'utilisation d'une variante de Whisper Large-v3 fine-tunée pour l'arabe tunisien avec \textit{code-switching} franco-anglophone.
    \item \textbf{Gestion du bilinguisme :} appliquer des \textit{prompts} et heuristiques adaptés afin de conserver l'arabe en script arabe et le français en alphabet latin.
    \item \textbf{Post-traitement heuristique :} corriger automatiquement certains mots français transcrits en caractères arabes et produire une version nettoyée de la sortie.
    \item \textbf{Traduction segmentée conditionnelle :} utiliser NLLB-200 pour détecter les portions de texte en arabe, les traduire en français, puis les fusionner avec les segments déjà francophones lorsqu'une uniformisation est requise.
    \item \textbf{Diagnostics de transcription :} exposer les segments à faible confiance, le profil de nettoyage et les différences entre texte brut et texte corrigé.
\end{itemize}

\subsection{BF3 --- Analyse intelligente des réunions}
À partir de la transcription disponible --- brute bilingue si Gemini est configuré, ou version uniformisée en français sinon --- le système doit invoquer un modèle LLM pour extraire une structure de données métier :
\begin{itemize}
    \item \textbf{Résumé exécutif} synthétisant l'échange.
    \item \textbf{Étape de vente (\textit{Sales Stage})} : classification de la réunion (Contact initial, Proposition de valeur, Négociation, Closing, etc.).
    \item \textbf{Sentiment global} de l'acheteur (Positif, Neutre, Négatif).
    \item \textbf{Objections et risques} soulevés par le prospect.
    \item \textbf{Prochaines actions (\textit{Next Actions})} à entreprendre.
    \item \textbf{Probabilité de réussite (\textit{Win Probability})} estimée de 0 à 100\%.
\end{itemize}

\subsection{BF4 --- Génération d'e-mails de suivi}
\begin{itemize}
    \item \textbf{Rédaction assistée par IA :} générer un brouillon d'e-mail contextualisé à partir des faits extraits de la réunion.
    \item \textbf{Mécanisme de secours (\textit{fallback}) :} utiliser des gabarits dynamiques si l'API de génération est indisponible.
    \item \textbf{Workflow d'approbation :} gérer le cycle de vie de l'e-mail (Brouillon $\rightarrow$ Approuvé $\rightarrow$ Envoyé).
    \item \textbf{Transparence et explicabilité :} exposer visuellement les \textit{inferred fields} ayant servi à la rédaction, avec leur niveau de confiance.
    \item \textbf{Historique et versionning :} permettre la comparaison sémantique (\textit{Word Diff}) entre différentes versions d'un même brouillon.
    \item \textbf{Capitalisation et télémetrie :} mettre en cache les faits extraits d'une réunion et conserver un historique d'usage (génération, édition, approbation, envoi).
\end{itemize}

\subsection{BF5 --- Mode hors-ligne et synchronisation (Local-First)}
\begin{itemize}
    \item \textbf{Stockage local persistant :} sauvegarder les réunions, clients, analyses, brouillons et données utiles dans IndexedDB pour une consultation instantanée, même sans réseau.
    \item \textbf{Synchronisation asynchrone :} détecter le retour de la connexion et synchroniser automatiquement les modifications locales vers le serveur central.
    \item \textbf{Gestion de conflits :} identifier les états \texttt{local-only}, \texttt{pending} et \texttt{conflicted} afin d'assister la reprise de synchronisation après travail hors-ligne.
\end{itemize}

\subsection{BF6 --- Gestion du portefeuille client}
\begin{itemize}
    \item \textbf{Référentiel client :} créer, modifier, archiver et restaurer des fiches clients liées aux réunions commerciales.
    \item \textbf{Liaison réunion-client :} associer chaque réunion à un client, à un commercial, et éventuellement à des informations d'opportunité (valeur, devise, statut).
    \item \textbf{Vue client 360 :} restituer l'historique des réunions, le revenu gagné, la tendance de sentiment et les actions ouvertes par client.
\end{itemize}

\subsection{BF7 --- Administration et pilotage commercial}
\begin{itemize}
    \item \textbf{Administration des utilisateurs :} permettre à un administrateur de gérer les comptes et de superviser le périmètre global.
    \item \textbf{Diagnostics de traitement :} exposer la santé de la file d'attente, les échecs récents et les événements de traitement.
    \item \textbf{Supervision transverse :} consolider les informations nécessaires au pilotage global de l'activité commerciale et au suivi des modules applicatifs.
\end{itemize}

\subsection{BF8 --- Suivi du chiffre d'affaires et des performances}
\begin{itemize}
    \item \textbf{Tableau de bord du chiffre d'affaires global :} fournir une vue synthétique du revenu annuel global de l'entreprise et de ses principales tendances.
    \item \textbf{Objectifs individuels par commercial :} définir pour chaque commercial des objectifs annuels et trimestriels, avec conservation de la devise et des mises à jour successives.
    \item \textbf{Suivi de progression :} comparer le revenu réellement enregistré au revenu cible, calculer la progression YTD et identifier les situations \textit{on-track}, \textit{at-risk} ou \textit{behind}.
    \item \textbf{Indicateurs de performance :} exposer des mesures complémentaires telles que le taux de conversion entre étapes commerciales, le revenu moyen gagné, les objections récurrentes et des signaux de coaching.
    \item \textbf{Vue client 360 enrichie :} rattacher à chaque client l'historique des réunions, le revenu gagné ou encore en cours, les actions ouvertes, la tendance de sentiment et un indicateur de santé relationnelle dérivé de la récence du contact et du taux de gain.
\end{itemize}

\section{Besoins non fonctionnels}
\begin{itemize}
    \item \textbf{Performance de traitement :} viser une latence compatible avec un usage opérationnel, avec comme objectif de référence une réunion de 30 minutes traitée en quelques minutes sur une machine équipée d'un GPU.
    \item \textbf{Scalabilité :} utiliser un gestionnaire de files d'attente (Redis + BullMQ) pour traiter plusieurs fichiers audio simultanément sans bloquer le serveur.
    \item \textbf{Résilience :} conserver un mode de traitement inline lorsque Redis est indisponible, et préserver les données de travail côté navigateur en mode hors-ligne.
    \item \textbf{Sécurité et confidentialité :} garantir l'authentification des utilisateurs via JWT et implémenter un contrôle d'accès basé sur les rôles (RBAC).
    \item \textbf{Traçabilité :} maintenir un journal d'audit immuable pour les réunions, analyses et clients, complété par un historique de versions et d'événements dédié au module e-mail.
\end{itemize}

\chapter{Conception}

Nous avons retenu une architecture microservices pour séparer l'interface utilisateur, la logique métier centralisée et les calculs intensifs des modules d'intelligence artificielle.

\section{Architecture globale}
Le système est structuré autour de quatre composants majeurs interdépendants :

\begin{itemize}
    \item \textbf{Frontend (client React local-first) :} développé avec React et Vite. Il intègre une base de données locale IndexedDB via Dexie.js, qui sert de point d'accès principal aux données côté utilisateur et permet de conserver une expérience fluide même en cas de latence réseau.
    \item \textbf{Backend (serveur Express.js) :} cœur transactionnel du système. Il expose une API REST sécurisée par JWT, gère la persistance globale dans MongoDB, centralise la gestion des utilisateurs, clients, réunions et brouillons, et orchestre les traitements lourds via BullMQ/Redis avec un mode inline de repli.
    \item \textbf{Microservice de transcription (Python / FastAPI) :} serveur dédié hébergeant \textit{faster-whisper}. Il prend en charge le prétraitement audio, la transcription bilingue et la génération de diagnostics associés.
    \item \textbf{Microservice de traduction (Python / FastAPI) :} serveur spécialisé chargeant NLLB-200. Il exécute la logique de découpage linguistique et de traduction sélective.
\end{itemize}

Remplacez la Figure~\ref{fig:architecture-globale-placeholder} par un schéma final montrant les flux entre le frontend, le backend, MongoDB, Redis et les deux microservices Python.

\begin{figure}[H]
\centering
\fbox{\parbox{0.88\textwidth}{
\centering
\vspace{0.5cm}
Emplacement réservé au schéma d'architecture globale.\\
Flux à représenter : navigateur $\rightarrow$ API Express $\rightarrow$ MongoDB ;\\
API Express $\leftrightarrow$ BullMQ / Redis ;\\
API Express $\rightarrow$ microservice Whisper ;\\
API Express $\rightarrow$ microservice NLLB-200 ;\\
navigateur $\leftrightarrow$ IndexedDB / Dexie pour le mode local-first.
\vspace{0.5cm}
}}
\caption{Emplacement réservé au schéma d'architecture globale}
\label{fig:architecture-globale-placeholder}
\end{figure}

\section{Modélisation des données}

\subsection{Schéma global MongoDB}
Le backend s'appuie sur MongoDB, organisée autour de collections typées via Mongoose :

\begin{itemize}
    \item \textbf{Collection \texttt{users} :} gère l'authentification, les profils commerciaux et les rôles (\textit{admin}, \textit{user}).
    \item \textbf{Collection \texttt{clients} :} maintient le référentiel des entreprises prospectées (secteur, taille, contact, statut, revenus, suppression logique).
    \item \textbf{Collection \texttt{meetings} :} entité centrale stockant les métadonnées de l'enregistrement, l'URL du fichier audio, les transcriptions, les liens client/commercial, la machine à états de traitement et les métadonnées d'exécution (\texttt{processing\_meta}).
    \item \textbf{Collection \texttt{meetinganalyses} :} stocke les résultats structurés de l'analyse (résumé, sentiment, objections, risques, sujets clés, prochaines actions, probabilité de gain).
    \item \textbf{Collection \texttt{emaildrafts} :} maintient les brouillons courants de suivi, leur contenu texte/HTML, leur statut de workflow et leurs champs inférés.
    \item \textbf{Collection \texttt{emaildraftversions} :} conserve l'historique des versions d'un brouillon.
    \item \textbf{Collection \texttt{emaildraftfeedbacks} :} journalise les événements d'usage du module e-mail (génération, édition, approbation, envoi, suppression).
    \item \textbf{Collection \texttt{meetingemailfacts} :} met en cache la phase factuelle extraite d'une réunion afin d'éviter des réexécutions inutiles.
    \item \textbf{Collection \texttt{auditevents} :} registre \textit{append-only} documentant les altérations de réunions, d'analyses et de clients ; la traçabilité e-mail est portée par les collections spécialisées ci-dessus.
\end{itemize}

\begin{figure}[H]
\centering
\fbox{\parbox{0.85\textwidth}{
\centering
\vspace{0.5cm}
Emplacement réservé au schéma de données principal.\\
Entités à représenter : User, Client, Meeting, MeetingAnalysis, EmailDraft, EmailDraftVersion, EmailDraftFeedback, MeetingEmailFacts, AuditEvent.\\
Relations attendues : un client possède plusieurs réunions ; une réunion peut posséder une analyse, plusieurs brouillons, plusieurs versions et un cache de faits.
\vspace{0.5cm}
}}
\caption{Emplacement réservé au schéma de données principal}
\label{fig:data-model-placeholder}
\end{figure}

\subsection{Architecture de données Local-First (IndexedDB / Dexie)}
Le frontend réplique sélectivement cette structure dans le navigateur. Les tables locales couvrent notamment les réunions, analyses, clients, brouillons d'e-mail, événements d'audit et indicateurs de performance commerciale. Chaque enregistrement synchronisable contient un objet de métadonnées de synchronisation :

\begin{lstlisting}[language=JavaScript]
syncMeta: {
  version: 1,
  lastSyncedAt: "2026-04-20T...",
  dirty: true,
  syncState: "pending",      // local-only | synced | pending | conflicted
  deletedAt: null,
  remoteId: null
}
\end{lstlisting}

Grâce à cette couche locale, l'utilisateur peut créer des réunions avec des identifiants temporaires, synchroniser les brouillons plus tard et détecter les conflits au retour en ligne.

\section{Conception des pipelines d'Intelligence Artificielle}

\subsection{Le pipeline de transcription heuristique}
Le plus grand défi architectural consiste à amener le modèle Whisper à mieux comprendre le mélange franco-tunisien. Le microservice de transcription implémente la séquence suivante :
\begin{enumerate}
    \item \textbf{Nettoyage acoustique :} utilisation de FFmpeg pour réduire les fréquences parasites et améliorer le signal d'entrée.
    \item \textbf{Prompt initial contraint :} injection d'un \textit{prompt} court en dialecte tunisien incluant des termes techniques français en alphabet latin.
    \item \textbf{Réglages de décodage :} ajustement de paramètres de recherche pour limiter les répétitions et les dérives sur les silences prolongés.
    \item \textbf{Post-traitement déterministe :} application de dictionnaires de correction tels que \texttt{ARABIZED\_FRENCH\_MAP} et \texttt{DERJA\_POSTPROCESS\_MAP}.
    \item \textbf{Diagnostics de fiabilité :} production d'une version brute, d'une version nettoyée, d'un diff de nettoyage et d'une liste de segments à faible confiance.
\end{enumerate}

Nous avons conçu le service pour charger deux variantes du moteur de transcription : une variante \textit{base} reposant sur \textit{openai/whisper-large-v3}, et une variante \textit{fine-tunée} destinée à mieux couvrir l'arabe tunisien parlé. Nous séparons ainsi l'expérimentation sur le modèle de son intégration opérationnelle, tout en gardant une API unique côté backend.

\subsection{Le pipeline de traduction segmentée}
Un modèle de traduction standard déforme souvent les termes techniques d'un texte bilingue. Nous ne lançons donc cette étape que lorsqu'une uniformisation française s'impose. Si Gemini est disponible, l'analyse travaille directement sur la transcription brute bilingue. Quand nous activons la \textbf{traduction segmentée}, le pipeline suit les étapes suivantes :
\begin{enumerate}
    \item \textbf{Analyse lexicale :} le texte est parcouru caractère par caractère.
    \item \textbf{Clustering de script :} le texte est scindé en blocs homogènes distinguant script arabe et segments non arabes.
    \item \textbf{Routage sélectif :} seuls les blocs strictement arabes, suffisamment longs pour être stables, sont envoyés au modèle de traduction.
    \item \textbf{Recomposition (\textit{passthrough}) :} les segments déjà francophones contournent le modèle et sont recollés aux traductions générées.
\end{enumerate}

\subsection{Le pipeline d'analyse et de génération (LLM)}
Le backend interagit avec l'API Google Gemini via une ingénierie de \textit{prompt} rigoureuse. Dans la configuration actuelle, l'analyse peut consommer soit la transcription brute bilingue, soit la version traduite selon l'état du microservice Gemini.

La génération des e-mails suit un pipeline en deux étapes :
\begin{enumerate}
    \item \textbf{Phase d'extraction (factuelle) :} un premier appel au LLM analyse la transcription et la matrice d'analyse pour en extraire des faits purs, dénués de style rédactionnel.
    \item \textbf{Phase de composition (créative) :} un second appel au LLM reçoit ces faits, les consignes de ton et la langue souhaitée pour rédiger le contenu final du brouillon.
\end{enumerate}

Nous séparons ces deux phases pour réduire les risques d'hallucination du modèle. Le backend ajoute un cache des faits extraits (\texttt{MeetingEmailFacts}), un suivi des variantes de prompt et un historique de versions de brouillons.

\begin{figure}[H]
\centering
\fbox{\parbox{0.88\textwidth}{
\centering
\vspace{0.5cm}
Emplacement réservé à un diagramme de séquence du pipeline IA.\\
Étapes attendues : upload audio $\rightarrow$ transcription $\rightarrow$ [traduction segmentée si nécessaire] $\rightarrow$ analyse métier $\rightarrow$ génération du brouillon d'e-mail.
\vspace{0.5cm}
}}
\caption{Emplacement réservé au diagramme de séquence du pipeline IA}
\label{fig:sequence-ai-placeholder}
\end{figure}

\chapter{Adaptation et Fine-Tuning du Modèle Whisper}
Whisper couvre mal le tunisien et le \textit{code-switching}. Nous avons donc constitué un jeu de données adapté, mis en place un pipeline d'entraînement reproductible, stabilisé plusieurs environnements d'exécution et intégré le modèle finetuné dans le service de transcription de la plateforme.

Le fine-tuning constitue l'apport propre du PFE, à côté de la réalisation applicative.

\subsection{Objectif et périmètre}
Nous avons adapté \textit{openai/whisper-large-v3} à un usage métier précis :
\begin{itemize}
    \item améliorer la transcription de l'arabe tunisien parlé ;
    \item préserver les séquences en français et en anglais présentes dans les réunions ;
    \item construire une chaîne reproductible allant du jeu de données brut au modèle exporté ;
    \item garantir une exécution stable malgré les contraintes matérielles et logicielles des environnements de notebook.
\end{itemize}

\subsection{Constitution du corpus et prétraitement}
Nous sommes partis d'un corpus de parole adapté au cas tunisien pour obtenir des données plus pertinentes que celles du modèle de base. Le corpus retenu provient du projet \textbf{Linto} (\texttt{linagora/linto-dataset-audio-ar-tn}), sous licence Apache 2.0 (voir réf. [10]). Nous avons retenu trois sous-ensembles complémentaires :
\begin{itemize}
    \item \textbf{TunSwitchCS (10h)} : corpus majoritairement constitué de code-switching ;
    \item \textbf{MASC (2.8h)} : corpus de qualité pour la diversité phonétique ;
    \item \textbf{Youtube\_DiwanFM (5.4h)} : parole naturelle extraite de contenus médiatiques.
\end{itemize}

Après prétraitement et rééchantillonnage à 16 kHz, nous avons combiné ces données, soit environ \textbf{18 heures d'audio}, puis nous les avons séparées en ensembles d'entraînement et de test. Le jeu traité contient environ :
\begin{itemize}
    \item \textbf{5\,451 exemples d'entraînement} ;
    \item \textbf{309 exemples de test} ;
    \item un petit sous-ensemble auxiliaire d'environ \textbf{20 segments audio} utilisé pour des vérifications qualitatives et quantitatives rapides après entraînement.
\end{itemize}

Nous avons retenu les décisions de prétraitement suivantes :
\begin{itemize}
    \item normalisation de l'audio à \textbf{16 kHz} ;
    \item extraction des \textit{input features} Whisper (log-Mel) ;
    \item tokenisation des labels sans forcer une langue de décodage unique ;
    \item contrôle systématique de la longueur des labels afin de détecter les exemples dépassant la limite du décodeur Whisper.
\end{itemize}

Whisper impose une longueur maximale stricte de \textbf{448 tokens} côté décodeur. Tout batch qui dépasse cette limite échoue pendant l'entraînement. Nous avons donc \textbf{tronqué les labels au niveau du data collator}, ce qui stabilise l'entraînement au prix d'une légère perte possible sur les exemples les plus longs.

\subsection{Stratégies d'entraînement explorées}
Deux pistes d'entraînement ont été étudiées :
\begin{itemize}
    \item une piste \textbf{Kaggle multi-GPU} sur \textbf{2$\times$ NVIDIA T4}, orientée compromis mémoire/stabilité\footnote{Note importante : la configuration \texttt{device\_map="balanced"} répartit les couches du modèle sur les deux GPU, ce qui correspond à du \textbf{parallélisme de modèle} et non à du parallélisme de données. Le \textit{Trainer} perçoit donc un seul dispositif logique. Le batch effectif est calculé comme suit : $batch_{\mathrm{effectif}} = batch_{\mathrm{per\_device}} \times 1 \times gradient\_accumulation$, soit ici $2 \times 1 \times 4 = 8$, et non $2 \times 2 \times 4 = 16$.} ;
    \item une piste \textbf{Lightning.ai mono-GPU} sur \textbf{NVIDIA H200}, retenue comme configuration recommandée pour les entraînements rapides et stables.
\end{itemize}

Le parcours Kaggle a surtout servi à résoudre des problèmes de stabilité :
\begin{itemize}
    \item suppression de l'optimiseur \textit{bitsandbytes} après des erreurs \textit{CUDA illegal memory access} ;
    \item passage temporaire en chargement \textbf{fp32} pour éviter des gradients infinis ;
    \item adoption d'\textbf{Adafactor} afin de réduire l'empreinte mémoire des états d'optimisation.
\end{itemize}

Nous avons retenu le parcours Lightning.ai pour la configuration finale d'entraînement :
\begin{itemize}
    \item entraînement \textbf{bf16} ;
    \item \textbf{TF32} activé lorsque disponible ;
    \item optimiseur \textbf{Fused AdamW} (\texttt{adamw\_torch\_fused}) ;
    \item \textbf{gradient checkpointing} activé ;
    \item entraînement \textbf{mono-GPU} ;
    \item \texttt{dataloader\_num\_workers=0} pour éviter les blocages observés dans les environnements notebook managés ;
    \item recours à \textbf{SDPA} lorsque l'installation de Flash Attention 2 n'était pas possible.
\end{itemize}

\subsection{Contraintes d'ingénierie rencontrées}
Le document technique de fine-tuning recense plusieurs incidents réels et leurs correctifs :
\begin{itemize}
    \item erreurs d'accès mémoire CUDA avec certaines combinaisons d'optimiseur et de distribution ;
    \item dépassement mémoire à l'étape \texttt{optimizer.step()} ;
    \item blocages liés aux \textit{DataLoader workers} dans des conteneurs notebook ;
    \item échecs après redémarrage de noyau, corrigés par des \textit{auto-recovery guards} ;
    \item surcharge de certaines étapes d'export ou de scan de dataset, résolue par des accès colonnes/batch et des logs de progression.
\end{itemize}

Le fine-tuning a demandé un travail d'ingénierie orienté vers la \textbf{stabilité}, la \textbf{reproductibilité} et l'\textbf{exploitabilité}.

\subsection{Résolution d'incidents techniques critiques}
Plusieurs incidents bloquants ont nécessité des corrections ciblées :
\begin{itemize}
    \item \textbf{Échantillons de test sauvegardés avant rééchantillonnage :} les fichiers audio de référence étaient initialement conservés à leur fréquence d'origine (48 kHz), ce qui provoquait une perception de l'audio environ trois fois plus lente lors des tests. La correction a consisté à inverser l'ordre des cellules afin d'effectuer le rééchantillonnage avant la sauvegarde des échantillons de test.
    \item \textbf{Configuration \texttt{suppress\_tokens=[]} :} cette configuration provoquait l'apparition de tokens temporels dans le texte transcrit. Elle a été retirée de la configuration finale.
    \item \textbf{Option \texttt{load\_best\_model\_at\_end=True} :} cette option s'est révélée incompatible avec la reprise multi-session, car le chemin du meilleur checkpoint devenait invalide entre deux sessions. Elle a été remplacée par une sélection manuelle du checkpoint optimal.
    \item \textbf{Absence de \texttt{decoder\_start\_token\_id} dans le data collator :} ce manque entraînait des incohérences de tokenisation. Le champ a été ajouté conformément aux recommandations de la documentation Hugging Face.
\end{itemize}

Nous documentons ces corrections dans les notebooks finaux déposés en annexe. La qualité du résultat final dépend autant de ces correctifs d'implémentation que du choix du modèle.

\subsection{Configuration finale retenue}
Nous retenons la configuration suivante pour le modèle finetuné :
\begin{itemize}
    \item modèle de base : \texttt{openai/whisper-large-v3} ;
    \item tâche : transcription (\textit{speech-to-text}), et non traduction ;
    \item plan d'entraînement cible : jusqu'à \textbf{3000 steps} ;
    \item durée attendue sur H200 : environ \textbf{1.7 à 2.0 heures} selon le débit observé ;
    \item évaluation post-entraînement via \textbf{WER} et \textbf{CER}, en brut puis après normalisation adaptée à l'arabe.
\end{itemize}

\subsection{Intégration dans la plateforme}
Nous avons intégré le résultat du fine-tuning au microservice de transcription déjà utilisé par la plateforme. Le service local Whisper supporte :
\begin{itemize}
    \item une \textbf{variante base} ;
    \item une \textbf{variante fine-tunée} chargée via configuration (\texttt{WHISPER\_VARIANT=finetuned}) ;
    \item une source de modèle depuis un dépôt Hugging Face ou depuis un chemin local converti au format CTranslate2.
\end{itemize}

Nous pouvons donc \textbf{déployer} le modèle finetuné dans le service de transcription réel de l'application.

\begin{figure}[H]
\centering
\fbox{\parbox{0.84\textwidth}{
\centering
\vspace{0.5cm}
Emplacement réservé à un schéma du pipeline de fine-tuning Whisper.\\
Étapes à représenter : dataset brut $\rightarrow$ prétraitement $\rightarrow$ dataset traité $\rightarrow$ entraînement $\rightarrow$ évaluation WER/CER $\rightarrow$ export $\rightarrow$ intégration dans le microservice local-whisper.
\vspace{0.5cm}
}}
\caption{Emplacement réservé au pipeline de fine-tuning Whisper}
\label{fig:whisper-finetuning-placeholder}
\end{figure}

\chapter{Réalisation}

L'environnement technologique et l'implémentation des composants clés de SalesAI apparaissent dans les sections suivantes.

\section{Environnement technologique}
Nous avons choisi une \textit{stack} adaptée au développement web, au traitement asynchrone et à l'intégration de services d'intelligence artificielle :

\begin{itemize}
    \item \textbf{Frontend :}
    \begin{itemize}
        \item \textbf{React 18} avec \textbf{TypeScript 5.x} pour le typage statique.
        \item \textbf{Vite} comme outil de bundling et de développement.
        \item \textbf{Tailwind CSS}, \textbf{shadcn/ui} et \textbf{Radix UI} pour la construction de l'interface.
        \item \textbf{TanStack React Query} pour la gestion de l'état serveur.
        \item \textbf{Dexie.js} pour l'encapsulation d'IndexedDB.
    \end{itemize}
    \item \textbf{Backend Node.js :}
    \begin{itemize}
        \item \textbf{Express.js} pour l'infrastructure REST.
        \item \textbf{Mongoose} pour l'ODM vers MongoDB.
        \item \textbf{BullMQ} couplé à \textbf{Redis} pour la gestion distribuée des files d'attente.
    \end{itemize}
    \item \textbf{Intelligence artificielle (Python) :}
    \begin{itemize}
        \item \textbf{FastAPI} pour exposer les services de transcription et de traduction.
        \item \textbf{faster-whisper} pour la transcription locale.
        \item \textbf{Transformers} et \textbf{PyTorch} pour NLLB-200.
        \item \textbf{Google GenAI SDK} pour l'intégration avec Gemini.
    \end{itemize}
\end{itemize}

\section{Architecture du code source}
Le dépôt suit une structure monorepo organisée autour des modules fonctionnels suivants :

\begin{lstlisting}
meeting-insights-hub-main/
|-- src/                          # Application Web Frontend (React)
|   |-- components/               # Composants React (dashboard, email, UI...)
|   |-- hooks/                    # Logique metier encapsulee
|   |-- integrations/local/       # IndexedDB / Dexie
|   |-- services/                 # Synchronisation, brouillons e-mail
|   |-- pages/                    # Vues applicatives
|-- server/                       # Serveur Backend (Node.js)
|   |-- models/                   # Schemas MongoDB
|   |-- routes/                   # API (auth, clients, meetings)
|   |-- services/                 # Orchestration metier
|   |-- queue/                    # Configuration BullMQ
|   |-- tests/                    # Tests backend
|-- local-whisper/                # Microservice IA Transcription
|   |-- tests/                    # Tests Python transcription
|-- local-translate/              # Microservice IA Traduction
|   |-- tests/                    # Tests Python traduction
\end{lstlisting}

\section{Captures et artefacts à insérer}
Ajoutez une capture ou un diagramme court pour chaque fonctionnalité centrale. Le chapitre gagnera en crédibilité.

\begin{figure}[H]
\centering
\fbox{\parbox{0.82\textwidth}{
\centering
\vspace{0.5cm}
Capture à insérer : tableau de bord principal ou liste des réunions.
\vspace{0.5cm}
}}
\caption{Emplacement réservé à une capture du tableau de bord}
\label{fig:dashboard-placeholder}
\end{figure}

\begin{figure}[H]
\centering
\fbox{\parbox{0.82\textwidth}{
\centering
\vspace{0.5cm}
Capture à insérer : fiche détaillée d'une réunion avec transcription, analyse et statut de traitement.
\vspace{0.5cm}
}}
\caption{Emplacement réservé à une capture de la fiche réunion}
\label{fig:meeting-detail-placeholder}
\end{figure}

\begin{figure}[H]
\centering
\fbox{\parbox{0.82\textwidth}{
\centering
\vspace{0.5cm}
Capture à insérer : panneau de brouillon d'e-mail avec \textit{inferred fields}, historique et comparaison de versions.
\vspace{0.5cm}
}}
\caption{Emplacement réservé à une capture du module e-mail}
\label{fig:email-module-placeholder}
\end{figure}

\begin{figure}[H]
\centering
\fbox{\parbox{0.82\textwidth}{
\centering
\vspace{0.5cm}
Capture à insérer : fiche client 360 avec statistiques, tendances de sentiment et actions ouvertes.
\vspace{0.5cm}
}}
\caption{Emplacement réservé à une capture de la vue client 360}
\label{fig:client-360-placeholder}
\end{figure}

\begin{figure}[H]
\centering
\fbox{\parbox{0.82\textwidth}{
\centering
\vspace{0.5cm}
Capture à insérer : page d'administration avec diagnostics de queue et erreurs récentes.
\vspace{0.5cm}
}}
\caption{Emplacement réservé à une capture des diagnostics d'administration}
\label{fig:admin-diagnostics-placeholder}
\end{figure}

\begin{figure}[H]
\centering
\fbox{\parbox{0.82\textwidth}{
\centering
\vspace{0.5cm}
Capture à insérer : page de performance commerciale avec objections récurrentes, coaching et suivi d'objectifs.
\vspace{0.5cm}
}}
\caption{Emplacement réservé à une capture des tableaux de bord analytiques}
\label{fig:performance-placeholder}
\end{figure}

\section{Implémentations remarquables}

\subsection{Le gestionnaire de file d'attente}
Pour éviter la saturation des ressources GPU lors de l'envoi simultané de multiples réunions, le backend implémente une file d'attente via \textbf{BullMQ}. Le cycle de vie d'un travail gère les échecs transitoires :
\begin{itemize}
    \item configuration d'un maximum de 2 \textit{workers} concurrents ;
    \item stratégie de répétition exponentielle avec 3 tentatives ;
    \item persistance des états \texttt{queued}, \texttt{transcribing}, \texttt{translating}, \texttt{analyzing}, \texttt{completed} et \texttt{error} ;
    \item mode de secours inline lorsque Redis n'est pas disponible ;
    \item exposition de diagnostics de queue et d'événements de traitement pour l'administration.
\end{itemize}

\subsection{Le système de synchronisation asynchrone}
Le moteur Local-First développé (\texttt{syncService.ts}) tourne en arrière-plan dans le navigateur. Il surveille la base IndexedDB, tente la synchronisation des réunions, clients et brouillons marqués comme modifiés, puis gère la réconciliation avec l'API REST, les suppressions logiques et les états \texttt{local-only}, \texttt{pending} et \texttt{conflicted}.

\subsection{Algorithme de comparaison textuelle (Word Diff)}
Nous avons développé un composant de différence de mots (\texttt{WordDiff}) pour permettre aux commerciaux d'analyser visuellement les modifications apportées par l'IA lors de la régénération d'un brouillon d'e-mail. Il repose sur l'algorithme de la \textbf{plus longue sous-séquence commune} (LCS - \textit{Longest Common Subsequence}) appliqué à des jetons lexicaux.

\subsection{Traçabilité du module e-mail}
Le module e-mail repose sur trois mécanismes complémentaires :
\begin{itemize}
    \item \textbf{Versionnement :} chaque action importante crée un instantané dans \texttt{EmailDraftVersion}.
    \item \textbf{Télémetrie d'usage :} les événements de génération, édition, approbation, acceptation et envoi sont enregistrés dans \texttt{EmailDraftFeedback}.
    \item \textbf{Cache factuel :} les faits extraits d'une réunion sont stockés dans \texttt{MeetingEmailFacts} afin de limiter les appels redondants au LLM.
\end{itemize}

\subsection{Fonctions analytiques de pilotage}
Le dépôt contient aussi des vues supplémentaires utiles à la soutenance :
\begin{itemize}
    \item une page de \textbf{performance commerciale} regroupant le chiffre d'affaires saisi, les objectifs annuels et trimestriels par commercial, la progression YTD, ainsi que des indicateurs de conversion et de coaching ;
    \item une \textbf{vue client 360} consolidant l'historique des réunions, le revenu gagné, le revenu en cours, la date du dernier contact, la tendance de sentiment, les actions ouvertes et des indicateurs exploitables pour apprécier la santé de la relation ;
    \item une \textbf{page d'administration} affichant les utilisateurs, la santé de la queue et les incidents récents.
\end{itemize}

\chapter{Tests et Validation}

Nous séparons la validation logicielle de l'évaluation des traitements d'intelligence artificielle pour montrer ce que nous avons réellement testé.

\section{Stratégie générale de validation}
Nous retenons trois niveaux de validation complémentaires :
\begin{itemize}
    \item \textbf{Tests techniques automatisés :} vérifier le comportement du backend, des services métier et des helpers Python.
    \item \textbf{Tests fonctionnels manuels :} vérifier les scénarios utilisateur de bout en bout, en particulier l'enregistrement, l'import audio, la consultation d'une réunion et la génération d'un brouillon.
    \item \textbf{Évaluation expérimentale des pipelines IA :} mesurer la qualité et la latence des étapes de transcription, traduction et génération de contenu.
\end{itemize}

Nous évitons ainsi un écueil fréquent des rapports de PFE : mélanger observations qualitatives, impressions d'usage et métriques expérimentales dans une même section sans protocole clair.

Dans le dépôt actuel, nous avons déjà obtenu les résultats automatisés suivants :
\begin{itemize}
    \item \textbf{Build frontend :} \texttt{npm run build} exécuté avec succès.
    \item \textbf{Tests backend :} \texttt{npm run test:server} exécuté avec succès (3 fichiers, 6 tests passés).
    \item \textbf{Tests Python :} \texttt{npm run test:python} exécuté avec succès (6 tests passés).
    \item \textbf{Tests frontend unitaires :} \texttt{npm run test:web} ne trouve actuellement aucun fichier de test, ce qui constitue un écart de couverture à signaler honnêtement.
\end{itemize}

\section{Validation de l'infrastructure logicielle}

\subsection{Campagnes de vérification}
Nous appuyons la validation de l'infrastructure logicielle sur des campagnes identifiées, chacune liée à une commande ou à un scénario reproductible. Le Tableau~\ref{tab:validation-logicielle} synthétise l'état actuel du dépôt.

\begin{table}[H]
\centering
\small
\setlength{\tabcolsep}{4pt}
\renewcommand{\arraystretch}{1.15}
\begin{tabularx}{\linewidth}{|P{2.9cm}|P{3.1cm}|Y|P{2.2cm}|}
\hline
\textbf{Campagne} & \textbf{Outil} & \textbf{Objectif} & \textbf{Résultat} \\ \hline
Build frontend & \texttt{npm run build} & Vérifier l'intégration du frontend et la génération d'un artefact de production. & Succès \\ \hline
Tests backend & \texttt{vitest} \newline \texttt{npm run test:server} & Valider le cycle de vie des réunions, le traitement asynchrone et la génération d'e-mails. & Succès (6 tests) \\ \hline
Tests microservice Whisper & \texttt{pytest} \newline \texttt{npm run test:python} & Vérifier les helpers, le post-traitement textuel et le calcul de confiance du service de transcription. & Succès (3 tests) \\ \hline
Tests microservice Traduction & \texttt{pytest} \newline \texttt{npm run test:python} & Vérifier la logique de segmentation et de préservation des segments non traduits. & Succès (3 tests) \\ \hline
Tests frontend unitaires & \texttt{npm run test:web} & Vérifier la présence d'une couverture de tests dédiée au frontend. & Aucun test détecté \\ \hline
Tests manuels offline & Chrome DevTools \newline scénario métier & Vérifier la création, la modification et la synchronisation différée des données en mode déconnecté. & À compléter \\ \hline
\end{tabularx}
\caption{Synthèse de la campagne de validation logicielle}
\label{tab:validation-logicielle}
\end{table}

\subsection{Scénarios fonctionnels critiques}
Présentez au moins cinq scénarios fonctionnels critiques pendant la soutenance et indiquez le résultat observé pour chacun. Le Tableau~\ref{tab:tests-fonctionnels} fournit une structure simple à renseigner.

\begin{table}[H]
\centering
\small
\setlength{\tabcolsep}{4pt}
\renewcommand{\arraystretch}{1.15}
\begin{tabularx}{\linewidth}{|P{1.1cm}|Y|Y|P{2.2cm}|}
\hline
\textbf{ID} & \textbf{Scénario de test} & \textbf{Résultat attendu} & \textbf{Statut} \\ \hline
TF1 & Enregistrer une réunion depuis le navigateur et sauvegarder le fichier associé. & La réunion est créée avec un statut initial cohérent et l'audio est accessible pour traitement. & À jouer manuellement \\ \hline
TF2 & Importer un fichier audio existant puis lancer le traitement. & Le fichier est accepté, mis en file d'attente et visible dans l'interface. & À jouer manuellement \\ \hline
TF3 & Consulter une réunion traitée avec transcription, analyse et résumé. & Les informations sont restituées sans incohérence de structure. & À jouer manuellement \\ \hline
TF4 & Générer puis réviser un brouillon d'e-mail de suivi. & Le brouillon est créé, modifiable et son statut d'approbation évolue correctement. & Couvert partiellement \\ \hline
TF5 & Modifier des données en mode hors-ligne puis se reconnecter. & Les changements locaux sont conservés et la synchronisation s'effectue au retour du réseau. & À compléter \\ \hline
\end{tabularx}
\caption{Exemple de scénarios fonctionnels à présenter au jury}
\label{tab:tests-fonctionnels}
\end{table}

\noindent Le dépôt ne couvre pas ces scénarios de bout en bout avec une suite E2E. Jouez-les donc manuellement pendant la campagne finale de validation et illustrez-les, si possible, avec des captures d'écran ou de courtes vidéos.

\section{Évaluation des pipelines d'intelligence artificielle}

\subsection{Description du jeu de test}
Décrivez le jeu de test utilisé. Précisez au minimum :
\begin{itemize}
    \item le nombre d'enregistrements testés ;
    \item leur durée moyenne et cumulée ;
    \item la nature des réunions (simulation, démonstration, cas réel anonymisé) ;
    \item le degré de bruit ambiant ;
    \item la proportion estimée de dialecte tunisien, de français et d'anglais.
\end{itemize}

\begin{table}[H]
\centering
\small
\setlength{\tabcolsep}{4pt}
\renewcommand{\arraystretch}{1.15}
\begin{tabularx}{\linewidth}{|P{5.5cm}|Y|}
\hline
\textbf{Caractéristique} & \textbf{Valeur} \\ \hline
Nombre d'enregistrements & [À compléter] \\ \hline
Durée totale & [À compléter] \\ \hline
Durée moyenne par réunion & [À compléter] \\ \hline
Origine des données & [À compléter] \\ \hline
Part estimée de Derja / arabe & [À compléter] \\ \hline
Part estimée de français & [À compléter] \\ \hline
Conditions acoustiques & [À compléter] \\ \hline
\end{tabularx}
\caption{Caractéristiques du jeu de test expérimental}
\label{tab:jeu-test}
\end{table}

\subsection{Critères d'évaluation retenus}
Nous évaluons les pipelines IA selon les critères suivants :
\begin{itemize}
    \item \textbf{Fidélité de transcription :} qualité globale de la sortie textuelle et préservation des termes techniques.
    \item \textbf{Préservation des segments non traduits :} capacité du pipeline de traduction à ne pas détériorer les segments déjà en français.
    \item \textbf{Utilité métier de l'analyse :} pertinence du résumé, des objections et des prochaines actions proposées.
    \item \textbf{Qualité rédactionnelle du brouillon :} clarté, ton, cohérence avec le contenu de la réunion et absence d'informations inventées.
    \item \textbf{Latence :} temps de réponse des différentes étapes sur l'environnement matériel retenu.
\end{itemize}

\subsection{Évaluation spécifique du modèle Whisper fine-tuné}
Le volet fine-tuning demande une méthodologie distincte de la validation applicative. Le document technique associé retient :
\begin{itemize}
    \item \textbf{WER (Word Error Rate)} pour mesurer les erreurs au niveau mot ;
    \item \textbf{CER (Character Error Rate)} pour une mesure plus robuste sur l'arabe dialectal ;
    \item des scores \textbf{bruts} et \textbf{normalisés} ;
    \item une \textbf{comparaison explicite entre Whisper de base et Whisper fine-tuné}, afin de justifier le gain apporté par l'adaptation du modèle.
\end{itemize}

Avant de calculer les métriques, nous appliquons la normalisation textuelle suivante :
\begin{itemize}
    \item normalisation Unicode (\texttt{NFKC}) ;
    \item suppression des diacritiques arabes ;
    \item normalisation de certaines variantes de lettres arabes ;
    \item suppression de la ponctuation ;
    \item réduction des espaces multiples ;
    \item passage en minuscules pour les segments latins.
\end{itemize}

Dans la version finale du mémoire, ajoutez :
\begin{itemize}
    \item les valeurs \textbf{WER brut / WER normalisé} ;
    \item les valeurs \textbf{CER brut / CER normalisé} ;
    \item quelques prédictions qualitatives représentatives (référence vs hypothèse) ;
    \item la taille exacte de l'échantillon d'évaluation utilisé pour ces calculs.
\end{itemize}

\subsection{Résultats à documenter}
Présentez les valeurs numériques finales dans des tableaux. Le Tableau~\ref{tab:performances-systeme} donne un format adapté pour la soutenance.

\begin{table}[H]
\centering
\small
\setlength{\tabcolsep}{4pt}
\renewcommand{\arraystretch}{1.15}
\begin{tabularx}{\linewidth}{|P{3.4cm}|Y|P{2.8cm}|}
\hline
\textbf{Mesure} & \textbf{Description} & \textbf{Valeur observée} \\ \hline
Temps de transcription & Durée nécessaire pour transcrire une réunion de référence sur la machine de test. & [À compléter] \\ \hline
Temps de traduction & Durée moyenne de traduction d'un segment ou d'un document court. & [À compléter] \\ \hline
Temps d'analyse Gemini & Délai de retour du JSON d'analyse. & [À compléter] \\ \hline
Temps de génération e-mail & Délai de production d'un brouillon exploitable. & [À compléter] \\ \hline
WER brut (fine-tuning) & Taux d'erreur mot sur l'échantillon d'évaluation avant normalisation. & [À compléter] \\ \hline
WER normalisé (fine-tuning) & Taux d'erreur mot après normalisation adaptée à l'arabe. & [À compléter] \\ \hline
CER brut (fine-tuning) & Taux d'erreur caractère avant normalisation. & [À compléter] \\ \hline
CER normalisé (fine-tuning) & Taux d'erreur caractère après normalisation. & [À compléter] \\ \hline
Taux de préservation des termes français & Part des segments ou termes techniques restitués correctement. & [À compléter] \\ \hline
\end{tabularx}
\caption{Mesures de performance et de qualité à renseigner}
\label{tab:performances-systeme}
\end{table}

\subsection{Analyse qualitative}
Ajoutez aussi une analyse qualitative courte sur plusieurs extraits représentatifs :
\begin{itemize}
    \item un extrait où le \textit{code-switching} est correctement géré ;
    \item un extrait bruité ou ambigu révélant les limites du système ;
    \item un exemple de brouillon d'e-mail jugé satisfaisant ;
    \item un exemple d'erreur ou de sortie à corriger manuellement.
\end{itemize}

Le jury verra ainsi la valeur concrète de la solution et les limites qui restent ouvertes.

\section{Limites de validité}
Ce projet comporte plusieurs limites qu'il faut nommer clairement :
\begin{itemize}
    \item la taille potentiellement réduite du jeu d'essai ;
    \item le fait qu'une partie de l'évaluation du modèle fine-tuné repose sur un petit échantillon auxiliaire, utile pour les \textit{smoke tests} mais insuffisant pour un benchmark définitif ;
    \item la difficulté d'obtenir des données réelles de réunion pour des raisons de confidentialité ;
    \item la variabilité des performances selon la qualité du microphone, le bruit et le matériel GPU disponible ;
    \item la dépendance partielle à un service externe pour l'analyse sémantique et la génération d'e-mails ;
    \item la troncature des labels longs à 448 tokens pendant l'entraînement, nécessaire pour respecter la contrainte du décodeur Whisper ;
    \item l'absence, à la date d'audit, d'une suite automatisée de tests unitaires frontend ou de tests E2E navigateur.
\end{itemize}

Nommez ces limites clairement. Des formulations trop larges fragilisent le mémoire pendant les questions du jury.

\chapter*{Conclusion Générale et Perspectives}
\addcontentsline{toc}{chapter}{Conclusion Générale et Perspectives}

Avec \textbf{SalesAI --- Meeting Insights Hub}, nous avons construit une plateforme située à la croisée du génie logiciel, du traitement automatique de la parole et de l'assistance commerciale. Dans le périmètre de ce PFE, la plateforme capture des réunions, traite des contenus bilingues, produit une analyse exploitable, prépare un brouillon d'e-mail de suivi et fournit des vues de gestion client et de pilotage.

Le projet apporte quatre éléments principaux :
\begin{enumerate}
    \item \textbf{L'intégration d'une chaîne de traitement complète} allant de la capture audio jusqu'à la production d'un contenu de suivi.
    \item \textbf{La prise en compte d'un contexte linguistique local} à travers la constitution d'un corpus adapté, un fine-tuning Whisper réalisé pour l'arabe tunisien et le code-switching, puis une stratégie de traduction segmentée.
    \item \textbf{L'adoption d'une architecture local-first} permettant d'améliorer la continuité d'usage en contexte de connectivité instable.
    \item \textbf{L'encadrement logiciel des sorties IA} grâce à des mécanismes de validation utilisateur, de versionnement, de cache factuel et d'explicabilité partielle.
\end{enumerate}

Ce projet nous a obligés à mobiliser plusieurs compétences : analyse des besoins, conception d'architecture, développement full-stack, intégration de microservices, gestion de traitements asynchrones, synchronisation locale et validation. La version finale du document devra encore consolider les preuves expérimentales, les figures, les références bibliographiques et les démonstrations manuelles.

\section*{Perspectives d'évolution}

La plateforme peut évoluer dans plusieurs directions :
\begin{itemize}
    \item \textbf{Diarisation des locuteurs :} séparer automatiquement la parole du commercial de celle du client afin de produire des indicateurs de coaching plus fins.
    \item \textbf{Transcription en temps réel :} migrer le pipeline post-réunion vers une architecture de streaming pour fournir des suggestions en direct.
    \item \textbf{Intégrations CRM bidirectionnelles :} développer des connecteurs natifs vers Salesforce, HubSpot ou Microsoft Dynamics.
    \item \textbf{Version mobile native :} proposer une application compagnon orientée commerciaux terrain.
\end{itemize}

\chapter*{Bibliographie et Webographie}
\addcontentsline{toc}{chapter}{Bibliographie et Webographie}

Harmonisez les références avec un style unique et ajoutez une date de consultation pour chaque ressource web.

\section*{Ouvrages et Articles de Recherche}
\begin{enumerate}[label={[\arabic*]}]
    \item Radford, A., Kim, J. W., Xu, T., Brockman, G., McLeavey, C., \& Sutskever, I. (2023). \textit{Robust Speech Recognition via Large-Scale Weak Supervision}. ICML.
    \item Costa-jussà, M. R., Cross, J., Çelebi, O., Elbayad, M., et al. (2022). \textit{No Language Left Behind: Scaling Human-Centered Machine Translation}. Meta AI Research.
    \item Google DeepMind. (2024). \textit{Gemini: A Family of Highly Capable Multimodal Models}. Technical Report.
    \item Kleppmann, M., Wiggins, A., van Hardenberg, P., \& McGranaghan, M. (2019). \textit{Local-First Software: You Own Your Data, in Spite of the Cloud}. Onward!.
\end{enumerate}

\section*{Ressources Technologiques et Documentaires}
\begin{enumerate}[label={[\arabic*]}, resume]
    \item \textbf{React \& TypeScript} : documentations officielles de React (\url{https://react.dev}) et TypeScript (\url{https://www.typescriptlang.org}).
    \item \textbf{Écosystème local-first} : documentation de Dexie.js (\url{https://dexie.org}) et TanStack Query (\url{https://tanstack.com/query}).
    \item \textbf{Design System} : documentations de Tailwind CSS (\url{https://tailwindcss.com}) et shadcn/ui (\url{https://ui.shadcn.com}).
    \item \textbf{Backend et file d'attente} : documentations d'Express.js (\url{https://expressjs.com}) et de BullMQ (\url{https://docs.bullmq.io}).
    \item \textbf{Services applicatifs} : documentation de FastAPI (\url{https://fastapi.tiangolo.com}) et Google GenAI SDK (\url{https://ai.google.dev}).
    \item Linto Project. (2023). \textit{Linto Tunisian Arabic Speech Dataset}. Linagora. \url{https://huggingface.co/datasets/linagora/linto-dataset-audio-ar-tn}.
    \item Hugging Face. (2024). \textit{Fine-tuning Whisper for Multilingual ASR}. \url{https://huggingface.co/blog/fine-tune-whisper}.
    \item OpenAI. (2023). \textit{Whisper: Robust Speech Recognition via Large-Scale Weak Supervision}. Technical Documentation. \url{https://github.com/openai/whisper}.
    \item SYSTRAN. (2024). \textit{faster-whisper: Faster Whisper transcription with CTranslate2}. \url{https://github.com/SYSTRAN/faster-whisper}.
    \item Kaggle. (2024). \textit{Kaggle Notebooks Documentation}. \url{https://www.kaggle.com/docs/notebooks}.
\end{enumerate}

\end{document}
