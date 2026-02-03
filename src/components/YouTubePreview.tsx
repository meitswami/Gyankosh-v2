import { useState, useEffect } from 'react';
import { Play, ExternalLink, Clock, User, Eye } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

interface YouTubeMetadata {
  title: string;
  author: string;
  thumbnail: string;
  duration?: string;
  views?: string;
}

interface YouTubePreviewProps {
  url: string;
  className?: string;
  onAnalyze?: () => void;
  isAnalyzing?: boolean;
  analysisResult?: {
    summary?: string;
    topics?: string[];
    hasTranscript?: boolean;
  };
}

// Extract video ID from various YouTube URL formats
function extractVideoId(url: string): string | null {
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/v\/|youtube\.com\/shorts\/)([a-zA-Z0-9_-]{11})/,
    /^([a-zA-Z0-9_-]{11})$/,
  ];
  
  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match) return match[1];
  }
  return null;
}

export function YouTubePreview({ 
  url, 
  className,
  onAnalyze,
  isAnalyzing,
  analysisResult 
}: YouTubePreviewProps) {
  const [metadata, setMetadata] = useState<YouTubeMetadata | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const videoId = extractVideoId(url);

  useEffect(() => {
    if (!videoId) {
      setError(true);
      setLoading(false);
      return;
    }

    const fetchMetadata = async () => {
      try {
        // Use oEmbed API for metadata (no API key needed)
        const response = await fetch(
          `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`
        );
        
        if (!response.ok) throw new Error('Failed to fetch metadata');
        
        const data = await response.json();
        
        setMetadata({
          title: data.title || 'YouTube Video',
          author: data.author_name || 'Unknown',
          thumbnail: `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`,
        });
        setLoading(false);
      } catch (e) {
        console.error('Error fetching YouTube metadata:', e);
        // Fallback - still show thumbnail
        setMetadata({
          title: 'YouTube Video',
          author: 'Unknown',
          thumbnail: `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`,
        });
        setLoading(false);
      }
    };

    fetchMetadata();
  }, [videoId]);

  if (!videoId || error) {
    return null;
  }

  if (loading) {
    return (
      <div className={cn('rounded-lg overflow-hidden border border-border bg-card', className)}>
        <Skeleton className="w-full aspect-video" />
        <div className="p-3 space-y-2">
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-3 w-1/2" />
        </div>
      </div>
    );
  }

  const isShort = url.includes('/shorts/');

  return (
    <div className={cn('rounded-lg overflow-hidden border border-border bg-card', className)}>
      {/* Thumbnail with play button overlay */}
      <div className="relative group cursor-pointer" onClick={() => window.open(url, '_blank')}>
        <img
          src={metadata?.thumbnail}
          alt={metadata?.title}
          className="w-full aspect-video object-cover"
          loading="lazy"
        />
        <div className="absolute inset-0 bg-black/30 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
          <div className="w-16 h-16 rounded-full bg-red-600 flex items-center justify-center">
            <Play className="w-8 h-8 text-white fill-white ml-1" />
          </div>
        </div>
        {isShort && (
          <div className="absolute top-2 left-2 bg-red-600 text-white text-xs px-2 py-1 rounded font-medium">
            Shorts
          </div>
        )}
        {metadata?.duration && (
          <div className="absolute bottom-2 right-2 bg-black/80 text-white text-xs px-1.5 py-0.5 rounded">
            {metadata.duration}
          </div>
        )}
      </div>

      {/* Metadata */}
      <div className="p-3 space-y-2">
        <h3 className="font-medium text-sm line-clamp-2 text-foreground">
          {metadata?.title}
        </h3>
        
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <div className="flex items-center gap-1">
            <User className="w-3 h-3" />
            <span>{metadata?.author}</span>
          </div>
          {metadata?.views && (
            <div className="flex items-center gap-1">
              <Eye className="w-3 h-3" />
              <span>{metadata.views}</span>
            </div>
          )}
        </div>

        {/* Analysis Result */}
        {analysisResult && (
          <div className="mt-3 pt-3 border-t border-border space-y-2">
            {analysisResult.hasTranscript === false && (
              <p className="text-xs text-amber-600 dark:text-amber-400">
                ⚠️ No captions available - using AI audio analysis
              </p>
            )}
            {analysisResult.summary && (
              <p className="text-xs text-muted-foreground line-clamp-3">
                {analysisResult.summary}
              </p>
            )}
            {analysisResult.topics && analysisResult.topics.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {analysisResult.topics.slice(0, 4).map((topic, i) => (
                  <span 
                    key={i}
                    className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded-full"
                  >
                    {topic}
                  </span>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Action buttons */}
        <div className="flex items-center gap-2 pt-2">
          <Button
            variant="outline"
            size="sm"
            className="flex-1 text-xs"
            onClick={() => window.open(url, '_blank')}
          >
            <ExternalLink className="w-3 h-3 mr-1" />
            Watch on YouTube
          </Button>
          {onAnalyze && !analysisResult && (
            <Button
              variant="default"
              size="sm"
              className="flex-1 text-xs"
              onClick={onAnalyze}
              disabled={isAnalyzing}
            >
              {isAnalyzing ? (
                <>
                  <span className="w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin mr-1" />
                  Analyzing...
                </>
              ) : (
                <>
                  <Play className="w-3 h-3 mr-1" />
                  Analyze Video
                </>
              )}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

// Utility to detect YouTube URLs in text
export function extractYouTubeUrls(text: string): string[] {
  const pattern = /(?:https?:\/\/)?(?:www\.)?(?:youtube\.com\/(?:watch\?v=|shorts\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})(?:\S*)?/gi;
  const matches = text.match(pattern);
  return matches || [];
}

// Check if message contains YouTube URL
export function containsYouTubeUrl(text: string): boolean {
  return extractYouTubeUrls(text).length > 0;
}
