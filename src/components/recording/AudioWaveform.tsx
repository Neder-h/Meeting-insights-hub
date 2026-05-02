import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';

interface AudioWaveformProps {
  isRecording: boolean;
  isPaused: boolean;
}

export function AudioWaveform({ isRecording, isPaused }: AudioWaveformProps) {
  const [bars, setBars] = useState<number[]>(Array(32).fill(0.2));

  useEffect(() => {
    if (!isRecording || isPaused) {
      setBars(Array(32).fill(0.2));
      return;
    }

    const interval = setInterval(() => {
      setBars((prev) =>
        prev.map(() => Math.random() * 0.8 + 0.2)
      );
    }, 100);

    return () => clearInterval(interval);
  }, [isRecording, isPaused]);

  return (
    <div className="flex h-24 items-center justify-center gap-1">
      {bars.map((height, i) => (
        <div
          key={i}
          className={cn(
            "w-1.5 rounded-full transition-all duration-100",
            isRecording && !isPaused
              ? "bg-gradient-to-t from-primary to-accent"
              : "bg-muted"
          )}
          style={{
            height: `${height * 100}%`,
            opacity: isRecording && !isPaused ? 1 : 0.4,
          }}
        />
      ))}
    </div>
  );
}
