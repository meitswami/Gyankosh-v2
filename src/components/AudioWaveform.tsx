import { useRef, useEffect, useState, useCallback } from 'react';
import { cn } from '@/lib/utils';

interface AudioWaveformProps {
  stream: MediaStream | null;
  isRecording: boolean;
  isPaused: boolean;
  className?: string;
}

export function AudioWaveform({ stream, isRecording, isPaused, className }: AudioWaveformProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef<number | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const [levels, setLevels] = useState<number[]>(Array(32).fill(0));

  useEffect(() => {
    if (!stream || !isRecording) {
      // Reset levels when not recording
      setLevels(Array(32).fill(0));
      return;
    }

    // Create audio context and analyser
    audioContextRef.current = new AudioContext();
    analyserRef.current = audioContextRef.current.createAnalyser();
    analyserRef.current.fftSize = 64;
    analyserRef.current.smoothingTimeConstant = 0.8;

    const source = audioContextRef.current.createMediaStreamSource(stream);
    source.connect(analyserRef.current);

    const dataArray = new Uint8Array(analyserRef.current.frequencyBinCount);

    const updateLevels = () => {
      if (!analyserRef.current || isPaused) {
        animationRef.current = requestAnimationFrame(updateLevels);
        return;
      }

      analyserRef.current.getByteFrequencyData(dataArray);
      
      // Convert to normalized levels (0-1)
      const newLevels = Array.from(dataArray).map(v => v / 255);
      setLevels(newLevels);

      animationRef.current = requestAnimationFrame(updateLevels);
    };

    updateLevels();

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
      if (audioContextRef.current) {
        audioContextRef.current.close();
      }
    };
  }, [stream, isRecording, isPaused]);

  // Draw on canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = canvas.width;
    const height = canvas.height;
    const barCount = Math.min(levels.length, 32);
    const barWidth = width / barCount - 2;
    const barGap = 2;

    ctx.clearRect(0, 0, width, height);

    levels.slice(0, barCount).forEach((level, i) => {
      const barHeight = Math.max(4, level * height);
      const x = i * (barWidth + barGap);
      const y = (height - barHeight) / 2;

      // Gradient from primary to primary-foreground
      const gradient = ctx.createLinearGradient(x, y, x, y + barHeight);
      gradient.addColorStop(0, 'hsl(var(--primary))');
      gradient.addColorStop(1, 'hsl(var(--primary) / 0.5)');

      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.roundRect(x, y, barWidth, barHeight, 2);
      ctx.fill();
    });
  }, [levels]);

  return (
    <div className={cn("flex items-center justify-center", className)}>
      <canvas
        ref={canvasRef}
        width={320}
        height={64}
        className="w-full max-w-xs h-16"
      />
    </div>
  );
}

// Simpler bar-based waveform for fallback
export function SimpleWaveform({ 
  isRecording, 
  isPaused 
}: { 
  isRecording: boolean; 
  isPaused: boolean;
}) {
  const [bars, setBars] = useState<number[]>(Array(16).fill(0.2));

  useEffect(() => {
    if (!isRecording || isPaused) {
      setBars(Array(16).fill(0.2));
      return;
    }

    const interval = setInterval(() => {
      setBars(prev => prev.map(() => 0.2 + Math.random() * 0.8));
    }, 100);

    return () => clearInterval(interval);
  }, [isRecording, isPaused]);

  return (
    <div className="flex items-center justify-center gap-0.5 h-12">
      {bars.map((height, i) => (
        <div
          key={i}
          className={cn(
            "w-1.5 bg-primary rounded-full transition-all duration-100",
            isPaused && "opacity-50"
          )}
          style={{ 
            height: `${height * 100}%`,
            animationDelay: `${i * 50}ms`
          }}
        />
      ))}
    </div>
  );
}
