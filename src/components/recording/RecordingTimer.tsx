import { cn } from '@/lib/utils';

interface RecordingTimerProps {
  duration: number;
  isRecording: boolean;
}

function formatDuration(seconds: number): string {
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;

  if (hrs > 0) {
    return `${hrs.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

export function RecordingTimer({ duration, isRecording }: RecordingTimerProps) {
  return (
    <div className="text-center">
      <div className="flex items-center justify-center gap-3">
        {isRecording && (
          <span className="relative flex h-3 w-3">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-destructive opacity-75" />
            <span className="relative inline-flex h-3 w-3 rounded-full bg-destructive" />
          </span>
        )}
        <span
          className={cn(
            "font-mono text-5xl font-bold tabular-nums tracking-tight",
            isRecording ? "text-foreground" : "text-muted-foreground"
          )}
        >
          {formatDuration(duration)}
        </span>
      </div>
      {isRecording && (
        <p className="mt-2 text-sm text-muted-foreground">
          Enregistrement en cours...
        </p>
      )}
    </div>
  );
}
