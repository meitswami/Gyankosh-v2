import { Progress } from '@/components/ui/progress';
import { Upload, FileSearch, Brain, CheckCircle2 } from 'lucide-react';

export type UploadStage = 'uploading' | 'extracting' | 'analyzing' | 'complete';

interface UploadProgressProps {
  stage: UploadStage;
  fileName: string;
}

const stages: { id: UploadStage; label: string; icon: React.ReactNode }[] = [
  { id: 'uploading', label: 'Uploading', icon: <Upload className="w-4 h-4" /> },
  { id: 'extracting', label: 'Extracting Text', icon: <FileSearch className="w-4 h-4" /> },
  { id: 'analyzing', label: 'AI Analysis', icon: <Brain className="w-4 h-4" /> },
  { id: 'complete', label: 'Complete', icon: <CheckCircle2 className="w-4 h-4" /> },
];

function getProgressValue(stage: UploadStage): number {
  switch (stage) {
    case 'uploading': return 15;
    case 'extracting': return 45;
    case 'analyzing': return 75;
    case 'complete': return 100;
    default: return 0;
  }
}

function getStageIndex(stage: UploadStage): number {
  return stages.findIndex(s => s.id === stage);
}

export function UploadProgress({ stage, fileName }: UploadProgressProps) {
  const currentIndex = getStageIndex(stage);
  const progress = getProgressValue(stage);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm animate-fade-in">
      <div className="bg-card border border-border rounded-2xl shadow-xl p-6 max-w-md w-full mx-4 space-y-6">
        {/* Header */}
        <div className="text-center">
          <div className="w-12 h-12 mx-auto mb-3 rounded-xl bg-primary/10 flex items-center justify-center">
            <Upload className="w-6 h-6 text-primary animate-pulse" />
          </div>
          <h3 className="text-lg font-semibold text-foreground">Processing Document</h3>
          <p className="text-sm text-muted-foreground mt-1 truncate" title={fileName}>
            {fileName}
          </p>
        </div>

        {/* Progress Bar */}
        <div className="space-y-2">
          <Progress value={progress} className="h-2" />
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>{stages[currentIndex].label}...</span>
            <span>{progress}%</span>
          </div>
        </div>

        {/* Stage Indicators */}
        <div className="flex justify-between items-center">
          {stages.map((s, index) => {
            const isActive = index === currentIndex;
            const isComplete = index < currentIndex;
            
            return (
              <div key={s.id} className="flex flex-col items-center gap-1.5">
                <div
                  className={`
                    w-10 h-10 rounded-full flex items-center justify-center transition-all duration-300
                    ${isComplete 
                      ? 'bg-primary text-primary-foreground' 
                      : isActive 
                        ? 'bg-primary/20 text-primary ring-2 ring-primary ring-offset-2 ring-offset-background' 
                        : 'bg-muted text-muted-foreground'
                    }
                  `}
                >
                  {isComplete ? <CheckCircle2 className="w-5 h-5" /> : s.icon}
                </div>
                <span className={`text-[10px] font-medium ${isActive ? 'text-primary' : 'text-muted-foreground'}`}>
                  {s.label}
                </span>
              </div>
            );
          })}
        </div>

        {/* Animated dots */}
        <div className="flex justify-center gap-1">
          <span className="w-2 h-2 bg-primary/50 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
          <span className="w-2 h-2 bg-primary/50 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
          <span className="w-2 h-2 bg-primary/50 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
        </div>
      </div>
    </div>
  );
}
