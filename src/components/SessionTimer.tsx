import { useState, useEffect } from 'react';
import { Clock, User } from 'lucide-react';

interface SessionTimerProps {
  loginTime: Date;
  userName?: string;
  userEmail?: string;
}

export function SessionTimer({ loginTime, userName, userEmail }: SessionTimerProps) {
  const [elapsed, setElapsed] = useState('00:00:00');

  useEffect(() => {
    const updateTimer = () => {
      const now = new Date();
      const diff = now.getTime() - loginTime.getTime();
      
      const hours = Math.floor(diff / (1000 * 60 * 60));
      const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
      const seconds = Math.floor((diff % (1000 * 60)) / 1000);
      
      setElapsed(
        `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`
      );
    };

    // Update immediately
    updateTimer();
    
    // Then update every second
    const interval = setInterval(updateTimer, 1000);
    
    return () => clearInterval(interval);
  }, [loginTime]);

  const displayName = userName || userEmail?.split('@')[0] || 'User';

  return (
    <div className="flex items-center justify-between w-full text-[10px] text-muted-foreground/70">
      <div className="flex items-center gap-1 truncate">
        <User className="w-3 h-3 flex-shrink-0" />
        <span className="truncate max-w-[100px]" title={displayName}>
          {displayName}
        </span>
      </div>
      <div className="flex items-center gap-1 font-mono">
        <Clock className="w-3 h-3" />
        <span>{elapsed}</span>
      </div>
    </div>
  );
}
