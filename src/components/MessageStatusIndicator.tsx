import { Check, CheckCheck } from 'lucide-react';
import { format } from 'date-fns';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';

export type MessageStatus = 'sent' | 'delivered' | 'read';

interface MessageStatusIndicatorProps {
  status: MessageStatus;
  deliveredAt?: string | null;
  readAt?: string | null;
  createdAt: string;
  isOwn: boolean;
}

export function MessageStatusIndicator({
  status,
  deliveredAt,
  readAt,
  createdAt,
  isOwn,
}: MessageStatusIndicatorProps) {
  if (!isOwn) return null;

  const getStatusIcon = () => {
    switch (status) {
      case 'read':
        return <CheckCheck className="w-3.5 h-3.5 text-blue-500" />;
      case 'delivered':
        return <CheckCheck className="w-3.5 h-3.5 text-muted-foreground" />;
      case 'sent':
      default:
        return <Check className="w-3.5 h-3.5 text-muted-foreground" />;
    }
  };

  const getTooltipContent = () => {
    const sentTime = format(new Date(createdAt), 'MMM d, HH:mm:ss');
    
    if (status === 'read' && readAt) {
      const readTime = format(new Date(readAt), 'MMM d, HH:mm:ss');
      return (
        <div className="text-xs space-y-1">
          <div className="flex items-center gap-2">
            <Check className="w-3 h-3" />
            <span>Sent: {sentTime}</span>
          </div>
          {deliveredAt && (
            <div className="flex items-center gap-2">
              <CheckCheck className="w-3 h-3" />
              <span>Delivered: {format(new Date(deliveredAt), 'HH:mm:ss')}</span>
            </div>
          )}
          <div className="flex items-center gap-2">
            <CheckCheck className="w-3 h-3 text-blue-500" />
            <span>Seen: {readTime}</span>
          </div>
        </div>
      );
    }
    
    if (status === 'delivered' && deliveredAt) {
      const deliverTime = format(new Date(deliveredAt), 'MMM d, HH:mm:ss');
      return (
        <div className="text-xs space-y-1">
          <div className="flex items-center gap-2">
            <Check className="w-3 h-3" />
            <span>Sent: {sentTime}</span>
          </div>
          <div className="flex items-center gap-2">
            <CheckCheck className="w-3 h-3" />
            <span>Delivered: {deliverTime}</span>
          </div>
        </div>
      );
    }
    
    return (
      <div className="text-xs flex items-center gap-2">
        <Check className="w-3 h-3" />
        <span>Sent: {sentTime}</span>
      </div>
    );
  };

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="inline-flex cursor-help">{getStatusIcon()}</span>
      </TooltipTrigger>
      <TooltipContent side="left" className="p-2">
        {getTooltipContent()}
      </TooltipContent>
    </Tooltip>
  );
}
