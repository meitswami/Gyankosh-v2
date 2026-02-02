import { forwardRef } from 'react';
import { Mic, MicOff, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

interface SpeechButtonProps {
  isListening: boolean;
  isSupported: boolean;
  interimTranscript?: string;
  onClick: () => void;
  disabled?: boolean;
  className?: string;
}

export const SpeechButton = forwardRef<HTMLButtonElement, SpeechButtonProps>(
  function SpeechButton(
    {
      isListening,
      isSupported,
      interimTranscript,
      onClick,
      disabled,
      className,
    },
    ref
  ) {
    if (!isSupported) {
      return null;
    }

    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              ref={ref}
              variant={isListening ? "default" : "outline"}
              size="icon"
              onClick={onClick}
              disabled={disabled}
              className={cn(
                "flex-shrink-0 h-10 w-10 transition-all",
                isListening && "bg-red-500 hover:bg-red-600 animate-pulse",
                className
              )}
            >
              {isListening ? (
                <MicOff className="w-4 h-4" />
              ) : (
                <Mic className="w-4 h-4" />
              )}
            </Button>
          </TooltipTrigger>
          <TooltipContent side="top">
            <p>{isListening ? 'Stop listening' : 'Voice input (Hindi/English)'}</p>
            {interimTranscript && (
              <p className="text-xs text-muted-foreground mt-1 max-w-xs truncate">
                {interimTranscript}
              </p>
            )}
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }
);
