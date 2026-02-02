import { useState, useRef } from 'react';
import { Upload, Link, Youtube, FileAudio, FileVideo, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Label } from '@/components/ui/label';
import { useMediaFiles } from '@/hooks/useMediaFiles';
import { useToast } from '@/hooks/use-toast';

interface MediaUploadPanelProps {
  onUploadComplete?: (mediaId: string) => void;
}

export function MediaUploadPanel({ onUploadComplete }: MediaUploadPanelProps) {
  const [isUploading, setIsUploading] = useState(false);
  const [url, setUrl] = useState('');
  const [dragActive, setDragActive] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { uploadMediaFile, uploadFromUrl } = useMediaFiles();
  const { toast } = useToast();

  const acceptedTypes = {
    video: ['video/mp4', 'video/webm', 'video/ogg', 'video/quicktime'],
    audio: ['audio/mp3', 'audio/mpeg', 'audio/wav', 'audio/ogg', 'audio/m4a', 'audio/x-m4a'],
  };

  const getMediaType = (file: File): 'video' | 'audio' | null => {
    if (acceptedTypes.video.includes(file.type)) return 'video';
    if (acceptedTypes.audio.includes(file.type)) return 'audio';
    return null;
  };

  const handleFileUpload = async (file: File) => {
    const mediaType = getMediaType(file);
    if (!mediaType) {
      toast({
        title: 'Invalid file type',
        description: 'Please upload a video (MP4, WebM) or audio (MP3, WAV, M4A) file.',
        variant: 'destructive',
      });
      return;
    }

    if (file.size > 500 * 1024 * 1024) {
      toast({
        title: 'File too large',
        description: 'Maximum file size is 500MB.',
        variant: 'destructive',
      });
      return;
    }

    setIsUploading(true);
    try {
      const mediaId = await uploadMediaFile(file, mediaType);
      if (mediaId) {
        toast({
          title: 'Upload started',
          description: 'Your file is being processed. Transcription will begin shortly.',
        });
        onUploadComplete?.(mediaId);
      }
    } finally {
      setIsUploading(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragActive(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFileUpload(file);
  };

  const handleUrlSubmit = async () => {
    if (!url.trim()) return;

    const isYouTube = url.includes('youtube.com') || url.includes('youtu.be');
    const sourceType = isYouTube ? 'youtube' : 'url';
    const mediaType = isYouTube ? 'video' : 'audio'; // Default to audio for URLs

    setIsUploading(true);
    try {
      const mediaId = await uploadFromUrl(url, mediaType, sourceType);
      if (mediaId) {
        setUrl('');
        onUploadComplete?.(mediaId);
      }
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FileVideo className="h-5 w-5" />
          Add Media for Transcription
        </CardTitle>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="upload" className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="upload" className="flex items-center gap-2">
              <Upload className="h-4 w-4" />
              Upload File
            </TabsTrigger>
            <TabsTrigger value="url" className="flex items-center gap-2">
              <Link className="h-4 w-4" />
              From URL
            </TabsTrigger>
          </TabsList>

          <TabsContent value="upload" className="mt-4">
            <div
              className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
                dragActive
                  ? 'border-primary bg-primary/5'
                  : 'border-muted-foreground/25 hover:border-primary/50'
              }`}
              onDragOver={(e) => {
                e.preventDefault();
                setDragActive(true);
              }}
              onDragLeave={() => setDragActive(false)}
              onDrop={handleDrop}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept="video/*,audio/*"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleFileUpload(file);
                }}
              />

              {isUploading ? (
                <div className="flex flex-col items-center gap-3">
                  <Loader2 className="h-10 w-10 animate-spin text-primary" />
                  <p className="text-muted-foreground">Uploading and processing...</p>
                </div>
              ) : (
                <>
                  <div className="flex justify-center gap-4 mb-4">
                    <FileVideo className="h-10 w-10 text-muted-foreground" />
                    <FileAudio className="h-10 w-10 text-muted-foreground" />
                  </div>
                  <p className="text-lg font-medium mb-2">
                    Drag and drop your file here
                  </p>
                  <p className="text-sm text-muted-foreground mb-4">
                    Supports MP4, WebM, MP3, WAV, M4A (max 500MB)
                  </p>
                  <Button
                    variant="outline"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    Browse Files
                  </Button>
                </>
              )}
            </div>
          </TabsContent>

          <TabsContent value="url" className="mt-4 space-y-4">
            <div className="space-y-2">
              <Label htmlFor="media-url">Video or Audio URL</Label>
              <div className="flex gap-2">
                <Input
                  id="media-url"
                  placeholder="https://youtube.com/watch?v=... or direct media URL"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleUrlSubmit()}
                />
                <Button
                  onClick={handleUrlSubmit}
                  disabled={!url.trim() || isUploading}
                >
                  {isUploading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    'Add'
                  )}
                </Button>
              </div>
            </div>

            <div className="flex items-center gap-4 text-sm text-muted-foreground">
              <div className="flex items-center gap-1">
                <Youtube className="h-4 w-4 text-red-500" />
                <span>YouTube</span>
              </div>
              <div className="flex items-center gap-1">
                <Link className="h-4 w-4" />
                <span>Direct URLs</span>
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}
