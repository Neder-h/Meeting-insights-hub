import { useState, useEffect, type ChangeEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { Upload, CheckCircle, Edit3, Globe, Wifi, WifiOff, AlertCircle, Sparkles } from 'lucide-react';
import { MainLayout } from '@/components/layout/MainLayout';
import { RecordingButton } from '@/components/recording/RecordingButton';
import { RecordingTimer } from '@/components/recording/RecordingTimer';
import { AudioWaveform } from '@/components/recording/AudioWaveform';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useAudioRecorderWithTranscription } from '@/hooks/useAudioRecorderWithTranscription';
import { useToast } from '@/hooks/use-toast';
import { useCreateMeeting } from '@/hooks/useMeetings';
import { WhisperMode } from '@/lib/api';
import { checkGeminiConfigured } from '@/lib/geminiAnalysis';
import { Client } from '@/types/meeting';
import { ClientSelector } from '@/components/clients/ClientSelector';

export default function RecordPage() {
  const navigate = useNavigate();
  const { toast } = useToast();
  // Default to bilingual mode - best for French + Derja code-switching
  // Keeps French in Latin script, Derja in Arabic script
  const [whisperMode, setWhisperMode] = useState<WhisperMode>('bilingual');
  const [title, setTitle] = useState('');
  const [recordingComplete, setRecordingComplete] = useState(false);
  const [editableRawTranscript, setEditableRawTranscript] = useState('');
  const [editableCleanedTranscript, setEditableCleanedTranscript] = useState('');
  const [editableTranslatedTranscript, setEditableTranslatedTranscript] = useState('');
  const [inputMode, setInputMode] = useState<'record' | 'upload'>('record');
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [geminiActive, setGeminiActive] = useState(false);
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);
  const createMeeting = useCreateMeeting();

  const { state, startRecording, stopRecording, transcribeFile, pauseRecording, resumeRecording, error, detectedLanguage, transcribeError } = useAudioRecorderWithTranscription({ 
    mode: whisperMode,
    enableDiagnostics: true, // Enable diagnostics in dev mode
  });

  // Helper function to get mode display name
  const getModeDisplay = (mode: WhisperMode) => {
    switch (mode) {
      case 'bilingual': return 'Bilingue (FR Latin + Derja Arabe)';
      case 'auto': return 'Auto-detect';
      case 'force_ar': return 'Tout en Arabe';
      case 'force_fr': return 'Tout en Latin';
      default: return mode;
    }
  };

  // Helper function to get language display name
  const getLanguageDisplay = (langCode: string | null) => {
    if (!langCode) return '';
    if (langCode === 'ar') return 'العربية (Arabic Script)';
    if (langCode === 'fr') return 'Français/Derja (Latin)';
    if (langCode === 'auto') return 'Auto-detect';
    return langCode;
  };

  // Handle error display in useEffect to avoid re-render loop
  useEffect(() => {
    if (error) {
      toast({
        variant: "destructive",
        title: "Erreur",
        description: error,
      });
    }
  }, [error, toast]);

  // Check Gemini backend status on mount
  useEffect(() => {
    checkGeminiConfigured().then(setGeminiActive).catch(() => setGeminiActive(false));
  }, []);

  // Handle transcription error
  useEffect(() => {
    if (transcribeError) {
      toast({
        variant: "destructive",
        title: "Erreur de transcription",
        description: transcribeError,
      });
    }
  }, [transcribeError, toast]);

  // Populate editable fields when transcripts arrive
  useEffect(() => {
    if (state.rawTranscript && !editableRawTranscript) {
      setEditableRawTranscript(state.rawTranscript);
    }
  }, [state.rawTranscript, editableRawTranscript]);

  useEffect(() => {
    if (state.cleanedTranscript && !editableCleanedTranscript) {
      setEditableCleanedTranscript(state.cleanedTranscript);
    }
  }, [state.cleanedTranscript, editableCleanedTranscript]);

  useEffect(() => {
    if (state.transcript && !editableTranslatedTranscript) {
      setEditableTranslatedTranscript(state.transcript);
    }
  }, [state.transcript, editableTranslatedTranscript]);

  const handleStart = async () => {
    setRecordingComplete(false);
    setEditableRawTranscript('');
    setEditableCleanedTranscript('');
    setEditableTranslatedTranscript('');
    setUploadedFile(null);
    await startRecording();
  };

  const handleStop = async () => {
    const result = await stopRecording();
    if (result.blob) {
      setRecordingComplete(true);
      setEditableRawTranscript(result.rawTranscript);
      setEditableCleanedTranscript(result.cleanedTranscript);
      setEditableTranslatedTranscript(result.transcript);
      console.log('Recording completed, transcription:', result.transcript ? 'in progress' : 'failed');
    }
  };

  const handleFileSelected = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] || null;
    setUploadedFile(file);
    setRecordingComplete(false);
    setEditableRawTranscript('');
    setEditableCleanedTranscript('');
    setEditableTranslatedTranscript('');

    if (file && !title) {
      const baseName = file.name.replace(/\.[^/.]+$/, '');
      setTitle(baseName);
    }
  };

  const handleTranscribeUpload = async () => {
    if (!uploadedFile) return;
    setRecordingComplete(false);
    setEditableRawTranscript('');
    setEditableCleanedTranscript('');
    setEditableTranslatedTranscript('');

    const result = await transcribeFile(uploadedFile);
    setRecordingComplete(true);
    setEditableRawTranscript(result.rawTranscript);
    setEditableCleanedTranscript(result.cleanedTranscript);
    setEditableTranslatedTranscript(result.transcript);
  };

  // Map detected language to our type system
  const getTranscriptLanguage = (): 'fr-FR' | 'ar-TN' => {
    if (detectedLanguage === 'ar') return 'ar-TN';
    if (detectedLanguage === 'fr') return 'fr-FR';
    // Default based on selected mode
    if (whisperMode === 'force_ar') return 'ar-TN';
    // Bilingual mode produces mixed content, default to fr-FR for display
    return 'fr-FR';
  };

  const handleUpload = async () => {
    if (!state.audioBlob || !title || !selectedClient) return;

    const finalTranscript = editableTranslatedTranscript.trim() || editableCleanedTranscript.trim() || editableRawTranscript.trim();

    try {
      const result = await createMeeting.mutateAsync({
        title,
        audioBlob: state.audioBlob,
        durationSeconds: state.duration,
        transcript: finalTranscript, // Use translated transcript when available
        rawTranscript: editableRawTranscript, // Store raw Whisper transcript
        transcriptEngine: 'whisper',
        transcriptLanguage: getTranscriptLanguage(),
        clientId: selectedClient.id,
        clientName: selectedClient.name,
      });

      navigate(`/meeting/${result.meetingId}`);
    } catch (err) {
      // Error is handled in the mutation
      console.error('Upload failed:', err);
    }
  };

  return (
    <MainLayout>
      <div className="mx-auto max-w-3xl">
        <div className="text-center">
          <h1 className="text-3xl font-bold">
            <span className="gradient-text">Enregistrer</span> une réunion
          </h1>
          <p className="mt-2 text-muted-foreground">
            Capturez vos conversations commerciales et obtenez des insights IA instantanés
          </p>
        </div>

        <div className="mt-12 glass-card rounded-2xl p-8">
          {/* Title Input */}
          <div className="mb-8">
            <label htmlFor="title" className="mb-2 block text-sm font-medium">
              Titre de la réunion
            </label>
            <Input
              id="title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Ex: Discovery Call - Prospect ABC"
              className="bg-muted/50"
            />
          </div>

          {/* Mode Selector */}
          <div className="mb-8">
            <label htmlFor="mode" className="mb-2 block text-sm font-medium">
              Mode de transcription
            </label>
            <Select value={whisperMode} onValueChange={(value: WhisperMode) => setWhisperMode(value)}>
              <SelectTrigger className="bg-muted/50">
                <Globe className="h-4 w-4 mr-2" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="bilingual">
                  <div className="flex items-center gap-2">
                    <span>🇹🇳🇫🇷 Bilingue</span>
                    <span className="text-xs text-muted-foreground">FR Latin + Derja Arabe ✨</span>
                  </div>
                </SelectItem>
                <SelectItem value="auto">
                  <div className="flex items-center gap-2">
                    <span>🔄 Auto-detect</span>
                    <span className="text-xs text-muted-foreground">+ retry si romanisé</span>
                  </div>
                </SelectItem>
                <SelectItem value="force_ar">
                  <div className="flex items-center gap-2">
                    <span>🇹🇳 Tout en Arabe</span>
                    <span className="text-xs text-muted-foreground">Force script arabe</span>
                  </div>
                </SelectItem>
                <SelectItem value="force_fr">
                  <div className="flex items-center gap-2">
                    <span>🇫🇷 Tout en Latin</span>
                    <span className="text-xs text-muted-foreground">Derja romanisé</span>
                  </div>
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Gemini AI Status */}
          <div className="mb-8">
            {geminiActive ? (
              <div className="flex items-center gap-2 rounded-lg bg-green-500/10 px-4 py-2.5 text-sm">
                <Sparkles className="h-4 w-4 text-green-600" />
                <span className="text-green-700 dark:text-green-400">
                  <strong>Gemini AI actif</strong> — l'analyse comprend directement le tunisien, pas besoin de traduction
                </span>
              </div>
            ) : (
              <div className="flex items-center gap-2 rounded-lg bg-yellow-500/10 px-4 py-2.5 text-sm">
                <AlertCircle className="h-4 w-4 text-yellow-600" />
                <span className="text-yellow-700 dark:text-yellow-400">
                  Analyse par mots-clés (FR) —{' '}
                  <a href="/settings" className="underline hover:no-underline">
                    Configurer Gemini
                  </a>{' '}
                  pour l'analyse IA en tunisien
                </span>
              </div>
            )}
          </div>

          {/* Input Mode Selector */}
          <div className="mb-8 flex flex-wrap items-center gap-3">
            <span className="text-sm font-medium text-muted-foreground">Source audio</span>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant={inputMode === 'record' ? 'default' : 'outline'}
                onClick={() => setInputMode('record')}
              >
                🎙️ Enregistrer
              </Button>
              <Button
                type="button"
                variant={inputMode === 'upload' ? 'default' : 'outline'}
                onClick={() => setInputMode('upload')}
              >
                ⬆️ Importer un fichier
              </Button>
            </div>
          </div>

          {inputMode === 'record' && (
            <>
              {/* Waveform */}
              <div className="mb-8">
                <AudioWaveform
                  isRecording={state.isRecording}
                  isPaused={state.isPaused}
                />
              </div>

              {/* Timer */}
              <div className="mb-8">
                <RecordingTimer
                  duration={state.duration}
                  isRecording={state.isRecording}
                />
              </div>
            </>
          )}

          {inputMode === 'upload' && (
            <div className="mb-8 grid gap-4">
              <div>
                <label htmlFor="file" className="mb-2 block text-sm font-medium">
                  Fichier audio
                </label>
                <Input
                  id="file"
                  type="file"
                  accept="audio/*"
                  onChange={handleFileSelected}
                  className="bg-muted/50"
                />
                {uploadedFile && (
                  <p className="mt-2 text-xs text-muted-foreground">
                    Fichier sélectionné: {uploadedFile.name}
                  </p>
                )}
              </div>

              <Button
                type="button"
                onClick={handleTranscribeUpload}
                disabled={!uploadedFile || state.isTranscribing || state.isTranslating}
                variant="secondary"
              >
                {state.isTranscribing || state.isTranslating ? (
                  <>
                    <div className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                    Transcription en cours...
                  </>
                ) : (
                  <>
                    <Upload className="h-4 w-4" />
                    Transcrire le fichier
                  </>
                )}
              </Button>
            </div>
          )}

          {/* Transcription Display - Real-time during recording */}
          {state.isRecording && state.transcript && (
            <div className="mb-8 glass-card rounded-xl p-4 bg-muted/50">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-medium text-muted-foreground">Transcription en temps réel</h3>
                {detectedLanguage && detectedLanguage.startsWith('ar') && (
                  <span className="text-xs px-2 py-1 bg-primary/10 text-primary rounded-full">
                    {getLanguageDisplay(detectedLanguage)}
                  </span>
                )}
              </div>
              <p className="text-sm leading-relaxed">{state.transcript}</p>
            </div>
          )}

          {/* Editable Transcription - After recording complete */}
          {(editableRawTranscript || editableCleanedTranscript || editableTranslatedTranscript || state.rawTranscript || state.cleanedTranscript || state.transcript) && (
            <div className="mb-8 grid gap-6">
              <div>
                <label htmlFor="rawTranscript" className="mb-2 flex items-center gap-2 text-sm font-medium">
                  <Edit3 className="h-4 w-4 text-primary" />
                  Transcription brute (Whisper)
                </label>
                <Textarea
                  id="rawTranscript"
                  value={editableRawTranscript}
                  onChange={(e) => setEditableRawTranscript(e.target.value)}
                  placeholder="La transcription brute apparaîtra ici..."
                  className="bg-muted/50 min-h-[200px] font-mono text-sm"
                  rows={10}
                />
                <p className="mt-2 text-xs text-muted-foreground">
                  Texte d'origine en Derja/Français (non traduit)
                </p>
              </div>

              <div>
                <label htmlFor="cleanedTranscript" className="mb-2 flex items-center gap-2 text-sm font-medium">
                  <Edit3 className="h-4 w-4 text-primary" />
                  Transcription nettoyée (profil {state.cleaningProfile || 'auto'})
                </label>
                <Textarea
                  id="cleanedTranscript"
                  value={editableCleanedTranscript}
                  onChange={(e) => setEditableCleanedTranscript(e.target.value)}
                  placeholder="La transcription nettoyée apparaîtra ici..."
                  className="bg-muted/50 min-h-[200px] font-mono text-sm"
                  rows={10}
                />
                <p className="mt-2 text-xs text-muted-foreground">
                  Version post-nettoyage automatique (Derja/FR), utilisée avant traduction
                </p>
              </div>

              {state.cleaningDiff && state.cleaningDiff.length > 0 && (
                <div className="rounded-lg border border-border bg-muted/30 p-3">
                  <p className="text-sm font-medium">Diff de nettoyage appliqué</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {state.cleaningDiff.slice(0, 8).map((d, idx) => (
                      <span key={`${d.before}-${idx}`} className="rounded-full bg-primary/10 px-2 py-1 text-xs text-primary">
                        {d.count}× {d.before} → {d.after}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {state.lowConfidenceSegments && state.lowConfidenceSegments.length > 0 && (
                <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 dark:border-amber-700 dark:bg-amber-950/30">
                  <p className="text-sm font-medium text-amber-800 dark:text-amber-300">
                    Segments à faible confiance ({state.lowConfidenceSegments.length})
                  </p>
                  <ul className="mt-2 space-y-1 text-xs text-amber-700 dark:text-amber-300">
                    {state.lowConfidenceSegments.slice(0, 8).map((s, idx) => (
                      <li key={`${s.start}-${idx}`}>
                        [{Math.floor(s.start)}s–{Math.floor(s.end)}s] ({Math.round(s.confidence || 0)}%) {s.text}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <div>
                <label htmlFor="translatedTranscript" className="mb-2 flex items-center gap-2 text-sm font-medium">
                  <Edit3 className="h-4 w-4 text-primary" />
                  Traduction (Français)
                </label>
                <Textarea
                  id="translatedTranscript"
                  value={editableTranslatedTranscript}
                  onChange={(e) => setEditableTranslatedTranscript(e.target.value)}
                  placeholder="La traduction apparaîtra ici..."
                  className="bg-muted/50 min-h-[200px] font-mono text-sm"
                  rows={10}
                />
                <p className="mt-2 text-xs text-muted-foreground">
                  Utilisé pour l'analyse IA (vous pouvez corriger avant l'envoi)
                </p>
              </div>
            </div>
          )}

          {/* Client selection */}
          <div className="mb-8">
            <ClientSelector value={selectedClient} onChange={setSelectedClient} placeholder="Choisir ou créer un client" />
            {!selectedClient && (
              <p className="mt-2 text-sm text-destructive">Sélectionnez un client avant d'analyser.</p>
            )}
          </div>

          {/* Controls */}
          <div className="flex flex-col items-center gap-6">
            {inputMode === 'record' && (
              <RecordingButton
                isRecording={state.isRecording}
                isPaused={state.isPaused}
                onStart={() => {
                  console.log('Recording button clicked');
                  handleStart();
                }}
                onStop={handleStop}
                onPause={pauseRecording}
                onResume={resumeRecording}
              />
            )}

            {!state.isRecording && !recordingComplete && inputMode === 'record' && (
              <p className="text-sm text-muted-foreground">
                Cliquez pour commencer l'enregistrement
              </p>
            )}

            {state.isTranscribing && (
              <div className="flex items-center gap-2 text-blue-600">
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                <span className="font-medium">🎙️ Transcription en cours (Whisper large-v3)...</span>
              </div>
            )}

            {state.isTranslating && (
              <div className="flex items-center gap-2 text-purple-600">
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                <span className="font-medium">🌐 Traduction vers le français (NLLB-200)...</span>
              </div>
            )}

            {recordingComplete && state.audioBlob && !state.isTranscribing && !state.isTranslating && (
              <div className="flex flex-col items-center gap-4 animate-fade-in">
                <div className="flex items-center gap-2 text-success">
                  <CheckCircle className="h-5 w-5" />
                  <span className="font-medium">Enregistrement terminé</span>
                </div>

                <Button
                  onClick={handleUpload}
                  disabled={createMeeting.isPending || !title || state.isTranscribing || state.isTranslating || !selectedClient}
                  variant="gradient"
                  size="lg"
                  className="min-w-48"
                >
                  {createMeeting.isPending ? (
                    <>
                      <div className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                      Traitement en cours...
                    </>
                  ) : (
                    <>
                      <Upload className="h-5 w-5" />
                      Analyser avec l'IA
                    </>
                  )}
                </Button>

                {!title && (
                  <p className="text-sm text-destructive">
                    Veuillez entrer un titre pour continuer
                  </p>
                )}
                {title && !editableRawTranscript.trim() && !editableCleanedTranscript.trim() && !editableTranslatedTranscript.trim() && !state.isTranscribing && !state.isTranslating && (
                  <p className="text-sm text-amber-600">
                    ⚠️ La transcription a échoué. Vous pouvez quand même analyser l'audio.
                  </p>
                )}
                {state.translationWarning && (
                  <p className="text-sm text-amber-600">
                    ⚠️ La traduction a échoué - texte brut utilisé. Vérifiez que le service local-translate est actif sur le port 9100.
                  </p>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Features */}
        <div className="mt-12 grid gap-6 sm:grid-cols-3">
          {[
            {
              title: 'Transcription multilingue',
              description: 'IA avancée pour français et arabe tunisien avec précision élevée',
            },
            {
              title: 'Analyse commerciale',
              description: "Détection d'objections, risques et opportunités",
            },
            {
              title: 'Actions recommandées',
              description: 'Next steps personnalisés pour closer le deal',
            },
          ].map((feature, index) => (
            <div
              key={feature.title}
              className="glass-card rounded-xl p-6 animate-slide-up"
              style={{ animationDelay: `${index * 100}ms` }}
            >
              <h3 className="font-semibold">{feature.title}</h3>
              <p className="mt-2 text-sm text-muted-foreground">
                {feature.description}
              </p>
            </div>
          ))}
        </div>
      </div>
    </MainLayout>
  );
}
