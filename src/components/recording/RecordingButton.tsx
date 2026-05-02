import { Mic, Square, Pause, Play } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface RecordingButtonProps {
  isRecording: boolean;
  isPaused: boolean;
  onStart: () => void;
  onStop: () => void;
  onPause: () => void;
  onResume: () => void;
}

export function RecordingButton({
  isRecording,
  isPaused,
  onStart,
  onStop,
  onPause,
  onResume,
}: RecordingButtonProps) {
  if (!isRecording) {
    return (
      <Button
        onClick={onStart}
        variant="gradient"
        size="icon-xl"
        className="rounded-full transition-transform hover:scale-105"
      >
        <Mic className="h-8 w-8" />
      </Button>
    );
  }

  return (
    <div className="flex items-center gap-4">
      <Button
        onClick={isPaused ? onResume : onPause}
        variant="outline"
        size="icon-lg"
        className="rounded-full"
      >
        {isPaused ? (
          <Play className="h-6 w-6" />
        ) : (
          <Pause className="h-6 w-6" />
        )}
      </Button>

      <Button
        onClick={onStop}
        variant="record"
        size="icon-xl"
        className={cn(
          "rounded-full transition-transform hover:scale-105",
          !isPaused && "animate-recording"
        )}
      >
        <Square className="h-8 w-8" />
      </Button>
    </div>
  );
}
