import { useRef, useState, useEffect, useCallback, forwardRef, useImperativeHandle } from 'react';
import { Play, Pause, Volume2, VolumeX, Maximize, SkipBack, SkipForward } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { cn } from '@/lib/utils';
import type { MediaFile, MediaSegment } from '@/hooks/useMediaFiles';

interface MediaPlayerProps {
  media: MediaFile;
  segments?: MediaSegment[];
  onTimeUpdate?: (time: number) => void;
  className?: string;
}

export interface MediaPlayerRef {
  seekTo: (time: number) => void;
  getCurrentTime: () => number;
}

export const MediaPlayer = forwardRef<MediaPlayerRef, MediaPlayerProps>(
  ({ media, segments = [], onTimeUpdate, className }, ref) => {
    const mediaRef = useRef<HTMLVideoElement | HTMLAudioElement>(null);
    const [isPlaying, setIsPlaying] = useState(false);
    const [currentTime, setCurrentTime] = useState(0);
    const [duration, setDuration] = useState(0);
    const [volume, setVolume] = useState(1);
    const [isMuted, setIsMuted] = useState(false);
    const [mediaUrl, setMediaUrl] = useState<string | null>(null);

    // Get signed URL for the media file
    useEffect(() => {
      const getMediaUrl = async () => {
        if (media.source_type === 'upload' && media.file_path) {
          const { supabase } = await import('@/integrations/supabase/client');
          const { data } = await supabase.storage
            .from('media')
            .createSignedUrl(media.file_path, 3600);
          if (data?.signedUrl) {
            setMediaUrl(data.signedUrl);
          }
        } else if (media.source_url) {
          setMediaUrl(media.source_url);
        }
      };
      getMediaUrl();
    }, [media]);

    useImperativeHandle(ref, () => ({
      seekTo: (time: number) => {
        if (mediaRef.current) {
          mediaRef.current.currentTime = time;
          setCurrentTime(time);
        }
      },
      getCurrentTime: () => mediaRef.current?.currentTime || 0,
    }));

    const togglePlay = useCallback(() => {
      if (!mediaRef.current) return;
      if (isPlaying) {
        mediaRef.current.pause();
      } else {
        mediaRef.current.play();
      }
      setIsPlaying(!isPlaying);
    }, [isPlaying]);

    const handleTimeUpdate = useCallback(() => {
      if (!mediaRef.current) return;
      const time = mediaRef.current.currentTime;
      setCurrentTime(time);
      onTimeUpdate?.(time);
    }, [onTimeUpdate]);

    const handleSeek = (value: number[]) => {
      if (!mediaRef.current) return;
      const time = value[0];
      mediaRef.current.currentTime = time;
      setCurrentTime(time);
    };

    const handleVolumeChange = (value: number[]) => {
      if (!mediaRef.current) return;
      const vol = value[0];
      mediaRef.current.volume = vol;
      setVolume(vol);
      setIsMuted(vol === 0);
    };

    const toggleMute = () => {
      if (!mediaRef.current) return;
      if (isMuted) {
        mediaRef.current.volume = volume || 0.5;
        setIsMuted(false);
      } else {
        mediaRef.current.volume = 0;
        setIsMuted(true);
      }
    };

    const skip = (seconds: number) => {
      if (!mediaRef.current) return;
      mediaRef.current.currentTime = Math.max(
        0,
        Math.min(duration, mediaRef.current.currentTime + seconds)
      );
    };

    const formatTime = (seconds: number): string => {
      const mins = Math.floor(seconds / 60);
      const secs = Math.floor(seconds % 60);
      return `${mins}:${secs.toString().padStart(2, '0')}`;
    };

    const handleFullscreen = () => {
      if (media.media_type === 'video' && mediaRef.current) {
        (mediaRef.current as HTMLVideoElement).requestFullscreen?.();
      }
    };

    // Find current segment
    const currentSegment = segments.find(
      (s) => currentTime >= s.start_time && currentTime <= s.end_time
    );

    if (!mediaUrl) {
      return (
        <div className={cn('bg-muted rounded-lg p-8 text-center', className)}>
          <p className="text-muted-foreground">Loading media...</p>
        </div>
      );
    }

    return (
      <div className={cn('bg-card rounded-lg overflow-hidden', className)}>
        {/* Media Element */}
        {media.media_type === 'video' ? (
          <video
            ref={mediaRef as React.RefObject<HTMLVideoElement>}
            src={mediaUrl}
            className="w-full aspect-video bg-black"
            onTimeUpdate={handleTimeUpdate}
            onLoadedMetadata={(e) => setDuration(e.currentTarget.duration)}
            onEnded={() => setIsPlaying(false)}
            onClick={togglePlay}
          />
        ) : (
          <div className="w-full bg-gradient-to-br from-primary/20 to-primary/5 p-8 flex items-center justify-center">
            <audio
              ref={mediaRef as React.RefObject<HTMLAudioElement>}
              src={mediaUrl}
              onTimeUpdate={handleTimeUpdate}
              onLoadedMetadata={(e) => setDuration(e.currentTarget.duration)}
              onEnded={() => setIsPlaying(false)}
            />
            <div className="text-center">
              <div className="w-24 h-24 mx-auto mb-4 rounded-full bg-primary/20 flex items-center justify-center">
                <Volume2 className="h-12 w-12 text-primary" />
              </div>
              <p className="font-medium">{media.alias || media.name}</p>
            </div>
          </div>
        )}

        {/* Current Segment Display */}
        {currentSegment && (
          <div className="px-4 py-2 bg-muted/50 border-t">
            <p className="text-sm">
              {currentSegment.speaker_label && (
                <span className="font-medium text-primary">
                  {currentSegment.speaker_label}:{' '}
                </span>
              )}
              <span className="text-muted-foreground">{currentSegment.text}</span>
            </p>
          </div>
        )}

        {/* Controls */}
        <div className="p-4 space-y-3">
          {/* Progress Bar */}
          <div className="flex items-center gap-3">
            <span className="text-xs text-muted-foreground w-12">
              {formatTime(currentTime)}
            </span>
            <Slider
              value={[currentTime]}
              max={duration || 100}
              step={0.1}
              onValueChange={handleSeek}
              className="flex-1"
            />
            <span className="text-xs text-muted-foreground w-12 text-right">
              {formatTime(duration)}
            </span>
          </div>

          {/* Control Buttons */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="icon" onClick={() => skip(-10)}>
                <SkipBack className="h-4 w-4" />
              </Button>
              <Button
                variant="default"
                size="icon"
                className="h-10 w-10"
                onClick={togglePlay}
              >
                {isPlaying ? (
                  <Pause className="h-5 w-5" />
                ) : (
                  <Play className="h-5 w-5 ml-0.5" />
                )}
              </Button>
              <Button variant="ghost" size="icon" onClick={() => skip(10)}>
                <SkipForward className="h-4 w-4" />
              </Button>
            </div>

            <div className="flex items-center gap-2">
              <Button variant="ghost" size="icon" onClick={toggleMute}>
                {isMuted ? (
                  <VolumeX className="h-4 w-4" />
                ) : (
                  <Volume2 className="h-4 w-4" />
                )}
              </Button>
              <Slider
                value={[isMuted ? 0 : volume]}
                max={1}
                step={0.01}
                onValueChange={handleVolumeChange}
                className="w-24"
              />
              {media.media_type === 'video' && (
                <Button variant="ghost" size="icon" onClick={handleFullscreen}>
                  <Maximize className="h-4 w-4" />
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }
);

MediaPlayer.displayName = 'MediaPlayer';
