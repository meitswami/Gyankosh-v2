import { useState, useRef, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { TooltipProvider } from '@/components/ui/tooltip';
import { 
  MessageCircle, X, Send, Users, ArrowLeft, Search, 
  Paperclip, FileText, Lock, Circle, Download, Image, File, Mic, Video
} from 'lucide-react';
import { FriendsList } from './FriendsList';
import { ChatSearchDialog } from './ChatSearchDialog';
import { VoiceVideoRecorder } from './VoiceVideoRecorder';
import { MessageStatusIndicator } from './MessageStatusIndicator';
import { MessageReactions } from './MessageReactions';
import { useUserPresence, type UserProfile } from '@/hooks/useUserPresence';
import { useDirectMessages } from '@/hooks/useDirectMessages';
import { useChatSearch } from '@/hooks/useChatSearch';
import { useMessageNotifications } from '@/hooks/useMessageNotifications';
import { useTypingIndicator } from '@/hooks/useTypingIndicator';
import { useMessageReactions } from '@/hooks/useMessageReactions';
import { highlightText } from '@/lib/highlightText';
import { uploadEncryptedFile } from '@/lib/encryptedFileUpload';
import { format, isToday, isYesterday } from 'date-fns';
import { useToast } from '@/hooks/use-toast';
import type { Document } from '@/hooks/useDocuments';

interface ChatWidgetProps {
  documents: Document[];
  onShareDocument?: (doc: Document, friendId: string) => void;
}

function getInitials(name: string | null) {
  if (!name) return '?';
  return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
}

function formatMessageTime(dateStr: string) {
  const date = new Date(dateStr);
  if (isToday(date)) return format(date, 'HH:mm');
  if (isYesterday(date)) return 'Yesterday ' + format(date, 'HH:mm');
  return format(date, 'MMM d, HH:mm');
}

export function ChatWidget({ documents, onShareDocument }: ChatWidgetProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [activeChat, setActiveChat] = useState<UserProfile | null>(null);
  const [messageInput, setMessageInput] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [showDocPicker, setShowDocPicker] = useState(false);
  const [showFilePicker, setShowFilePicker] = useState(false);
  const [showVoiceVideo, setShowVoiceVideo] = useState(false);
  const [showGlobalSearch, setShowGlobalSearch] = useState(false);
  const [uploadingFile, setUploadingFile] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const {
    currentUser,
    friends,
    pendingRequests,
    allUsers,
    sendFriendRequest,
    respondToRequest,
    removeFriend,
  } = useUserPresence();

  const { messages, sendMessage, markAsRead } = useDirectMessages(
    currentUser?.user_id || null,
    activeChat
  );

  const { 
    totalUnread, 
    getUnreadCount, 
    markFriendMessagesRead,
    requestNotificationPermission 
  } = useMessageNotifications(currentUser?.user_id || null);

  const {
    searchResults,
    searchQuery,
    search: globalSearch,
    loading: searchLoading,
    friendsMap,
  } = useChatSearch(currentUser?.user_id || null);

  const { friendIsTyping, startTyping, stopTyping } = useTypingIndicator(
    currentUser?.user_id || null,
    activeChat?.user_id || null
  );

  const { 
    fetchReactions, 
    addReaction, 
    getReactions, 
    quickReactions 
  } = useMessageReactions(currentUser?.user_id || null);

  // Request notification permission on mount
  useEffect(() => {
    requestNotificationPermission();
  }, [requestNotificationPermission]);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, friendIsTyping]);

  // Mark as read when opening chat
  useEffect(() => {
    if (activeChat) {
      markAsRead();
      markFriendMessagesRead(activeChat.user_id);
    }
  }, [activeChat, markAsRead, markFriendMessagesRead]);

  // Fetch reactions for visible messages
  useEffect(() => {
    if (messages.length > 0) {
      fetchReactions(messages.map(m => m.id));
    }
  }, [messages, fetchReactions]);

  // Handle typing
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setMessageInput(e.target.value);
    if (e.target.value.length > 0) {
      startTyping();
    } else {
      stopTyping();
    }
  };

  const handleSend = async () => {
    if (!messageInput.trim() || !activeChat) return;
    
    stopTyping();
    const success = await sendMessage(messageInput.trim());
    if (success) {
      setMessageInput('');
    }
  };

  const handleShareDocument = (doc: Document) => {
    if (activeChat && onShareDocument) {
      onShareDocument(doc, activeChat.user_id);
      sendMessage(`📄 Shared document: ${doc.alias || doc.name}`, 'document');
    }
    setShowDocPicker(false);
  };

  const handleFileUpload = useCallback(async (file: File) => {
    if (!activeChat?.public_key || !currentUser) {
      toast({ title: 'Cannot upload file', variant: 'destructive' });
      return;
    }

    setUploadingFile(true);
    try {
      const result = await uploadEncryptedFile(file, activeChat.public_key, currentUser.user_id);
      
      if (result) {
        await sendMessage(`📎 ${result.fileName}`, 'file', result.fileUrl);
        toast({ title: 'File sent securely' });
      } else {
        throw new Error('Upload failed');
      }
    } catch (error) {
      console.error('File upload error:', error);
      toast({ title: 'Failed to upload file', variant: 'destructive' });
    } finally {
      setUploadingFile(false);
      setShowFilePicker(false);
    }
  }, [activeChat, currentUser, sendMessage, toast]);

  const handleVoiceVideoSend = useCallback(async (blob: Blob, type: 'audio' | 'video', duration: number) => {
    if (!activeChat?.public_key || !currentUser) return;
    
    const fileName = `${type}_note_${Date.now()}.webm`;
    const file = new window.File([blob], fileName, { type: blob.type });
    
    setUploadingFile(true);
    try {
      const result = await uploadEncryptedFile(file, activeChat.public_key, currentUser.user_id);
      if (result) {
        const emoji = type === 'audio' ? '🎤' : '🎥';
        const mins = Math.floor(duration / 60);
        const secs = duration % 60;
        // Send as 'file' type since that's what the DB supports
        await sendMessage(`${emoji} ${type === 'audio' ? 'Voice' : 'Video'} note (${mins}:${secs.toString().padStart(2, '0')})`, 'file', result.fileUrl);
        toast({ title: `${type === 'audio' ? 'Voice' : 'Video'} note sent` });
      }
    } catch (error) {
      console.error('Voice/video send error:', error);
      toast({ title: 'Failed to send', variant: 'destructive' });
    } finally {
      setUploadingFile(false);
      setShowVoiceVideo(false);
    }
  }, [activeChat, currentUser, sendMessage, toast]);

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      handleFileUpload(file);
    }
    e.target.value = '';
  };

  const handleDownloadFile = async (msg: typeof messages[0]) => {
    if (!currentUser || !msg.file_url) return;
    window.open(msg.file_url, '_blank');
  };

  const handleSelectFromSearch = (friendId: string) => {
    const friend = friends.find(f => f.user_id === friendId);
    if (friend) {
      setActiveChat(friend);
    }
  };

  const filteredMessages = searchTerm
    ? messages.filter(m => m.content.toLowerCase().includes(searchTerm.toLowerCase()))
    : messages;

  if (!currentUser) return null;

  return (
    <TooltipProvider>
      <div className="fixed bottom-6 right-6 z-50">
        <Popover open={isOpen} onOpenChange={setIsOpen}>
          <PopoverTrigger asChild>
            <Button
              size="lg"
              className="h-14 w-14 rounded-full shadow-lg hover:shadow-xl transition-all relative"
            >
              <MessageCircle className="w-6 h-6" />
              {totalUnread > 0 && (
                <Badge 
                  variant="destructive" 
                  className="absolute -top-1 -right-1 h-5 min-w-5 px-1.5 flex items-center justify-center animate-pulse"
                >
                  {totalUnread > 99 ? '99+' : totalUnread}
                </Badge>
              )}
            </Button>
          </PopoverTrigger>

          <PopoverContent 
            side="top" 
            align="end" 
            className="w-96 h-[520px] p-0 rounded-2xl overflow-hidden shadow-2xl"
          >
            {activeChat ? (
              <div className="flex flex-col h-full">
                {/* Chat Header */}
                <div className="flex items-center gap-3 p-3 border-b border-border bg-muted/30">
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => { setActiveChat(null); setShowVoiceVideo(false); }}
                    className="h-8 w-8"
                  >
                    <ArrowLeft className="w-4 h-4" />
                  </Button>
                  
                  <div className="relative">
                    <Avatar className="h-9 w-9">
                      <AvatarImage src={activeChat.avatar_url || undefined} />
                      <AvatarFallback>{getInitials(activeChat.display_name)}</AvatarFallback>
                    </Avatar>
                    <span className={`absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full border-2 border-background ${
                      activeChat.status === 'online' ? 'bg-green-500' : 'bg-muted-foreground'
                    }`} />
                  </div>
                  
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate text-sm">{activeChat.display_name}</p>
                    <p className="text-xs text-muted-foreground flex items-center gap-1">
                      {friendIsTyping ? (
                        <span className="text-primary animate-pulse">typing...</span>
                      ) : (
                        <>
                          <Lock className="w-3 h-3" />
                          End-to-end encrypted
                        </>
                      )}
                    </p>
                  </div>

                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setSearchTerm(searchTerm ? '' : ' ')}
                    className="h-8 w-8"
                  >
                    <Search className="w-4 h-4" />
                  </Button>
                </div>

                {/* Search Bar */}
                {searchTerm !== '' && (
                  <div className="p-2 border-b border-border">
                    <Input
                      placeholder="Search in chat..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      autoFocus
                      className="h-8 text-sm"
                    />
                  </div>
                )}

                {/* Messages */}
                <ScrollArea className="flex-1 p-3" ref={scrollRef}>
                  <div className="space-y-3">
                    {filteredMessages.map((msg) => {
                      const isOwn = msg.sender_id === currentUser.user_id;
                      const isFile = msg.content_type === 'file';
                      const isMedia = msg.content_type === 'audio' || msg.content_type === 'video';
                      const reactions = getReactions(msg.id);
                      
                      return (
                        <div
                          key={msg.id}
                          className={`flex ${isOwn ? 'justify-end' : 'justify-start'} group`}
                        >
                          <div className={`max-w-[80%] ${isOwn ? 'order-1' : ''}`}>
                            <div
                              className={`px-3 py-2 rounded-2xl ${
                                isOwn 
                                  ? 'bg-primary text-primary-foreground rounded-br-md' 
                                  : 'bg-muted rounded-bl-md'
                              }`}
                            >
                              {isFile || isMedia ? (
                                <button
                                  onClick={() => handleDownloadFile(msg)}
                                  className="flex items-center gap-2 hover:opacity-80 transition-opacity"
                                >
                                  {msg.content_type === 'audio' ? <Mic className="w-4 h-4" /> : 
                                   msg.content_type === 'video' ? <Video className="w-4 h-4" /> :
                                   <File className="w-4 h-4" />}
                                  <span className="text-sm underline">{msg.content}</span>
                                  <Download className="w-3 h-3" />
                                </button>
                              ) : msg.content_type === 'document' ? (
                                <div className="flex items-center gap-2">
                                  <FileText className="w-4 h-4" />
                                  <span className="text-sm">{msg.content}</span>
                                </div>
                              ) : searchTerm ? (
                                <p className="text-sm">{highlightText(msg.content, searchTerm)}</p>
                              ) : (
                                <p className="text-sm">{msg.content}</p>
                              )}
                            </div>
                            
                            {/* Message footer: time + status */}
                            <div className={`flex items-center gap-1 mt-0.5 ${isOwn ? 'justify-end' : ''}`}>
                              <span className="text-[10px] text-muted-foreground">
                                {formatMessageTime(msg.created_at)}
                              </span>
                              <MessageStatusIndicator
                                status={msg.status}
                                deliveredAt={msg.delivered_at}
                                readAt={msg.read_at}
                                createdAt={msg.created_at}
                                isOwn={isOwn}
                              />
                            </div>

                            {/* Reactions */}
                            <MessageReactions
                              messageId={msg.id}
                              reactions={reactions}
                              currentUserId={currentUser.user_id}
                              onAddReaction={addReaction}
                              quickReactions={quickReactions}
                              isOwn={isOwn}
                            />
                          </div>
                        </div>
                      );
                    })}

                    {/* Typing indicator */}
                    {friendIsTyping && (
                      <div className="flex justify-start">
                        <div className="bg-muted rounded-2xl rounded-bl-md px-4 py-2">
                          <div className="flex gap-1">
                            <span className="w-2 h-2 bg-foreground/50 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                            <span className="w-2 h-2 bg-foreground/50 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                            <span className="w-2 h-2 bg-foreground/50 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                          </div>
                        </div>
                      </div>
                    )}

                    {messages.length === 0 && !friendIsTyping && (
                      <div className="flex flex-col items-center justify-center py-12 text-center">
                        <Lock className="w-10 h-10 text-muted-foreground mb-3" />
                        <p className="text-sm font-medium">Messages are end-to-end encrypted</p>
                        <p className="text-xs text-muted-foreground mt-1">
                          No one outside of this chat can read them
                        </p>
                      </div>
                    )}
                  </div>
                </ScrollArea>

                {/* Voice/Video Recorder */}
                {showVoiceVideo && (
                  <VoiceVideoRecorder
                    onSend={handleVoiceVideoSend}
                    onCancel={() => setShowVoiceVideo(false)}
                  />
                )}

                {/* File/Document Picker */}
                {(showDocPicker || showFilePicker) && !showVoiceVideo && (
                  <div className="border-t border-border p-2 max-h-48 overflow-auto">
                    {showFilePicker ? (
                      <div className="space-y-2">
                        <p className="text-xs font-medium text-muted-foreground">Upload encrypted file</p>
                        <div className="grid grid-cols-2 gap-2">
                          <button
                            onClick={() => fileInputRef.current?.click()}
                            className="flex flex-col items-center gap-2 p-3 rounded-xl border border-dashed border-border hover:bg-muted transition-colors"
                          >
                            <Image className="w-6 h-6 text-primary" />
                            <span className="text-xs">Image</span>
                          </button>
                          <button
                            onClick={() => fileInputRef.current?.click()}
                            className="flex flex-col items-center gap-2 p-3 rounded-xl border border-dashed border-border hover:bg-muted transition-colors"
                          >
                            <File className="w-6 h-6 text-primary" />
                            <span className="text-xs">Any File</span>
                          </button>
                        </div>
                        <input
                          ref={fileInputRef}
                          type="file"
                          className="hidden"
                          onChange={handleFileInputChange}
                        />
                      </div>
                    ) : (
                      <>
                        <p className="text-xs font-medium text-muted-foreground mb-2">Share a document</p>
                        {documents.map((doc) => (
                          <button
                            key={doc.id}
                            onClick={() => handleShareDocument(doc)}
                            className="w-full flex items-center gap-2 p-2 rounded-lg hover:bg-muted transition-colors text-left"
                          >
                            <FileText className="w-4 h-4 text-primary" />
                            <span className="text-sm truncate">{doc.alias || doc.name}</span>
                          </button>
                        ))}
                      </>
                    )}
                  </div>
                )}

                {/* Message Input */}
                {!showVoiceVideo && (
                  <div className="p-3 border-t border-border flex items-center gap-2">
                    <div className="flex">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => {
                          setShowFilePicker(!showFilePicker);
                          setShowDocPicker(false);
                        }}
                        className="h-9 w-9"
                        disabled={uploadingFile}
                      >
                        {uploadingFile ? (
                          <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                        ) : (
                          <Paperclip className="w-4 h-4" />
                        )}
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => {
                          setShowDocPicker(!showDocPicker);
                          setShowFilePicker(false);
                        }}
                        className="h-9 w-9"
                      >
                        <FileText className="w-4 h-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => setShowVoiceVideo(true)}
                        className="h-9 w-9"
                      >
                        <Mic className="w-4 h-4" />
                      </Button>
                    </div>
                    
                    <Input
                      placeholder="Type a message..."
                      value={messageInput}
                      onChange={handleInputChange}
                      onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && handleSend()}
                      onBlur={stopTyping}
                      className="flex-1"
                    />
                    
                    <Button
                      size="icon"
                      onClick={handleSend}
                      disabled={!messageInput.trim()}
                      className="h-9 w-9 shrink-0"
                    >
                      <Send className="w-4 h-4" />
                    </Button>
                  </div>
                )}
              </div>
            ) : (
              // Friends List View
              <div className="flex flex-col h-full">
                <div className="flex items-center justify-between p-3 border-b border-border bg-muted/30">
                  <div className="flex items-center gap-2">
                    <Users className="w-5 h-5 text-primary" />
                    <span className="font-semibold">Messages</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => setShowGlobalSearch(true)}
                      className="h-8 w-8"
                      title="Search all chats"
                    >
                      <Search className="w-4 h-4" />
                    </Button>
                    <div className="flex items-center gap-1">
                      <Circle className="w-2 h-2 fill-green-500 text-green-500" />
                      <span className="text-xs text-muted-foreground">Online</span>
                    </div>
                  </div>
                </div>

                <FriendsList
                  friends={friends}
                  pendingRequests={pendingRequests}
                  allUsers={allUsers}
                  currentUserId={currentUser.user_id}
                  onSendRequest={sendFriendRequest}
                  onRespondRequest={respondToRequest}
                  onRemoveFriend={removeFriend}
                  onStartChat={setActiveChat}
                  getUnreadCount={getUnreadCount}
                />
              </div>
            )}
          </PopoverContent>
        </Popover>

        {/* Global Chat Search Dialog */}
        <ChatSearchDialog
          isOpen={showGlobalSearch}
          onClose={() => setShowGlobalSearch(false)}
          searchResults={searchResults}
          searchQuery={searchQuery}
          onSearch={globalSearch}
          loading={searchLoading}
          onSelectMessage={handleSelectFromSearch}
          friendsMap={friendsMap}
        />
      </div>
    </TooltipProvider>
  );
}
