import { Progress } from '@/components/ui/progress';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Upload, FileSearch, Brain, CheckCircle2, X, AlertCircle, File } from 'lucide-react';
import type { FileUploadStatus } from '@/hooks/useBatchUpload';
import type { UploadStage } from '@/components/UploadProgress';

interface BatchUploadProgressProps {
  uploads: FileUploadStatus[];
  onClose: () => void;
  onClear: () => void;
  onCancel: (id: string) => void;
}

const stageIcons: Record<UploadStage, React.ReactNode> = {
  uploading: <Upload className="w-4 h-4 animate-pulse" />,
  extracting: <FileSearch className="w-4 h-4 animate-pulse" />,
  analyzing: <Brain className="w-4 h-4 animate-pulse" />,
  complete: <CheckCircle2 className="w-4 h-4 text-primary" />,
};

const stageLabels: Record<UploadStage, string> = {
  uploading: 'Uploading...',
  extracting: 'Extracting text...',
  analyzing: 'AI analyzing...',
  complete: 'Complete',
};

function getProgressValue(stage: UploadStage): number {
  switch (stage) {
    case 'uploading': return 25;
    case 'extracting': return 50;
    case 'analyzing': return 75;
    case 'complete': return 100;
    default: return 0;
  }
}

export function BatchUploadProgress({ uploads, onClose, onClear, onCancel }: BatchUploadProgressProps) {
  const completed = uploads.filter(u => u.stage === 'complete').length;
  const failed = uploads.filter(u => u.error).length;
  const inProgress = uploads.filter(u => !u.error && u.stage !== 'complete').length;

  if (uploads.length === 0) return null;

  return (
    <div className="fixed bottom-4 right-4 z-50 w-96 bg-card border border-border rounded-2xl shadow-xl overflow-hidden animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-border bg-muted/50">
        <div className="flex items-center gap-2">
          <Upload className="w-5 h-5 text-primary" />
          <span className="font-semibold text-foreground">
            Uploading {uploads.length} file{uploads.length > 1 ? 's' : ''}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {completed > 0 && (
            <Button variant="ghost" size="sm" onClick={onClear} className="text-xs">
              Clear done
            </Button>
          )}
          <Button variant="ghost" size="icon" onClick={onClose} className="h-8 w-8">
            <X className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="flex gap-4 px-4 py-2 text-xs border-b border-border bg-muted/30">
        <span className="text-muted-foreground">
          <span className="text-primary font-medium">{completed}</span> complete
        </span>
        <span className="text-muted-foreground">
          <span className="text-yellow-500 font-medium">{inProgress}</span> in progress
        </span>
        {failed > 0 && (
          <span className="text-muted-foreground">
            <span className="text-destructive font-medium">{failed}</span> failed
          </span>
        )}
      </div>

      {/* File list */}
      <ScrollArea className="max-h-64">
        <div className="p-2 space-y-2">
          {uploads.map((upload) => (
            <div
              key={upload.id}
              className={`p-3 rounded-xl border transition-all ${
                upload.error 
                  ? 'border-destructive/50 bg-destructive/5' 
                  : upload.stage === 'complete'
                    ? 'border-primary/50 bg-primary/5'
                    : 'border-border bg-muted/30'
              }`}
            >
              <div className="flex items-start gap-3">
                <div className={`p-2 rounded-lg ${
                  upload.error 
                    ? 'bg-destructive/10' 
                    : upload.stage === 'complete'
                      ? 'bg-primary/10'
                      : 'bg-muted'
                }`}>
                  {upload.error ? (
                    <AlertCircle className="w-4 h-4 text-destructive" />
                  ) : (
                    stageIcons[upload.stage]
                  )}
                </div>
                
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-medium truncate text-foreground" title={upload.file.name}>
                      {upload.file.name}
                    </p>
                    {!upload.error && upload.stage !== 'complete' && (
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => onCancel(upload.id)}
                        className="h-6 w-6 shrink-0"
                      >
                        <X className="w-3 h-3" />
                      </Button>
                    )}
                  </div>
                  
                  {upload.error ? (
                    <p className="text-xs text-destructive mt-1">{upload.error}</p>
                  ) : (
                    <>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {stageLabels[upload.stage]}
                      </p>
                      {upload.stage !== 'complete' && (
                        <Progress 
                          value={getProgressValue(upload.stage)} 
                          className="h-1.5 mt-2" 
                        />
                      )}
                    </>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      </ScrollArea>

      {/* Overall progress */}
      <div className="p-3 border-t border-border bg-muted/30">
        <div className="flex items-center justify-between text-xs text-muted-foreground mb-2">
          <span>Overall progress</span>
          <span>{Math.round((completed / uploads.length) * 100)}%</span>
        </div>
        <Progress value={(completed / uploads.length) * 100} className="h-2" />
      </div>
    </div>
  );
}
