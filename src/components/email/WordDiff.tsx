import React from 'react';

/** Lightweight word-level diff – no external dependency. */
function diffWords(oldText: string, newText: string): Array<{ type: 'equal' | 'add' | 'remove'; value: string }> {
  const oldTokens = oldText.split(/(\s+)/);
  const newTokens = newText.split(/(\s+)/);
  const m = oldTokens.length;
  const n = newTokens.length;

  // Simple LCS-based diff (adequate for email-length texts)
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = oldTokens[i - 1] === newTokens[j - 1]
        ? dp[i - 1][j - 1] + 1
        : Math.max(dp[i - 1][j], dp[i][j - 1]);
    }
  }

  const result: Array<{ type: 'equal' | 'add' | 'remove'; value: string }> = [];
  let i = m, j = n;
  const stack: typeof result = [];
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && oldTokens[i - 1] === newTokens[j - 1]) {
      stack.push({ type: 'equal', value: oldTokens[i - 1] });
      i--; j--;
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      stack.push({ type: 'add', value: newTokens[j - 1] });
      j--;
    } else {
      stack.push({ type: 'remove', value: oldTokens[i - 1] });
      i--;
    }
  }
  stack.reverse();

  // Merge consecutive same-type entries
  for (const entry of stack) {
    const last = result[result.length - 1];
    if (last && last.type === entry.type) {
      last.value += entry.value;
    } else {
      result.push({ ...entry });
    }
  }
  return result;
}

interface WordDiffProps {
  oldText: string;
  newText: string;
  oldLabel?: string;
  newLabel?: string;
}

export function WordDiffView({ oldText, newText, oldLabel, newLabel }: WordDiffProps) {
  const parts = diffWords(oldText, newText);
  const hasChanges = parts.some((p) => p.type !== 'equal');

  if (!hasChanges) {
    return <p className="text-xs text-muted-foreground italic">No text differences.</p>;
  }

  return (
    <div className="space-y-3">
      {oldLabel && newLabel && (
        <div className="flex items-center gap-4 text-[11px] text-muted-foreground">
          <span className="flex items-center gap-1"><span className="inline-block w-3 h-3 rounded-sm bg-red-100 dark:bg-red-900/40 border border-red-300 dark:border-red-700" />{oldLabel}</span>
          <span className="flex items-center gap-1"><span className="inline-block w-3 h-3 rounded-sm bg-emerald-100 dark:bg-emerald-900/40 border border-emerald-300 dark:border-emerald-700" />{newLabel}</span>
        </div>
      )}
      <div className="text-xs leading-relaxed whitespace-pre-wrap font-mono">
        {parts.map((part, i) => {
          if (part.type === 'equal') return <span key={i}>{part.value}</span>;
          if (part.type === 'remove') {
            return (
              <span key={i} className="bg-red-100 text-red-800 line-through dark:bg-red-900/40 dark:text-red-300 rounded-sm px-0.5">
                {part.value}
              </span>
            );
          }
          return (
            <span key={i} className="bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300 rounded-sm px-0.5">
              {part.value}
            </span>
          );
        })}
      </div>
    </div>
  );
}
