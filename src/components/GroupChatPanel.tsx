import { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { 
  Users, Plus, ArrowLeft, Send, UserPlus, Settings, LogOut, Lock, Crown
} from 'lucide-react';
import { useGroupChat, type ChatGroup, type GroupMember } from '@/hooks/useGroupChat';
import { useUserPresence } from '@/hooks/useUserPresence';
import { format, isToday, isYesterday } from 'date-fns';

interface GroupChatPanelProps {
  userId: string | null;
  onClose?: () => void;
}

function getInitials(name: string | null) {
  if (!name) return '?';
  return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
}

function formatTime(dateStr: string) {
  const date = new Date(dateStr);
  if (isToday(date)) return format(date, 'HH:mm');
  if (isYesterday(date)) return 'Yesterday ' + format(date, 'HH:mm');
  return format(date, 'MMM d, HH:mm');
}

export function GroupChatPanel({ userId, onClose }: GroupChatPanelProps) {
  const [messageInput, setMessageInput] = useState('');
  const [showCreateGroup, setShowCreateGroup] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');
  const [selectedMembers, setSelectedMembers] = useState<string[]>([]);
  const [showAddMember, setShowAddMember] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const {
    groups,
    currentGroup,
    members,
    messages,
    loading,
    createGroup,
    selectGroup,
    sendMessage,
    addMember,
    removeMember,
    leaveGroup,
    closeGroup,
  } = useGroupChat(userId);

  const { friends } = useUserPresence();

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleCreateGroup = async () => {
    if (!newGroupName.trim() || selectedMembers.length === 0) return;

    // Get public keys for all selected members
    const publicKeys: Record<string, string> = {};
    friends.forEach(f => {
      if (selectedMembers.includes(f.user_id) && f.public_key) {
        publicKeys[f.user_id] = f.public_key;
      }
    });

    const group = await createGroup(newGroupName, selectedMembers, publicKeys);
    if (group) {
      setShowCreateGroup(false);
      setNewGroupName('');
      setSelectedMembers([]);
      selectGroup(group);
    }
  };

  const handleSend = async () => {
    if (!messageInput.trim()) return;
    const success = await sendMessage(messageInput.trim());
    if (success) setMessageInput('');
  };

  const handleAddMember = async (friendId: string) => {
    const friend = friends.find(f => f.user_id === friendId);
    if (friend?.public_key) {
      await addMember(friendId, friend.public_key);
      setShowAddMember(false);
    }
  };

  const getMemberProfile = (senderId: string) => {
    const member = members.find(m => m.user_id === senderId);
    return member?.profile;
  };

  const isAdmin = members.some(m => m.user_id === userId && m.role === 'admin');

  if (!userId) return null;

  // Current group chat view
  if (currentGroup) {
    return (
      <div className="flex flex-col h-full">
        {/* Header */}
        <div className="flex items-center gap-3 p-3 border-b border-border bg-muted/30">
          <Button variant="ghost" size="icon" onClick={closeGroup} className="h-8 w-8">
            <ArrowLeft className="w-4 h-4" />
          </Button>
          
          <Avatar className="h-9 w-9">
            <AvatarImage src={currentGroup.avatar_url || undefined} />
            <AvatarFallback className="bg-primary/10 text-primary">
              <Users className="w-4 h-4" />
            </AvatarFallback>
          </Avatar>
          
          <div className="flex-1 min-w-0">
            <p className="font-medium truncate text-sm">{currentGroup.name}</p>
            <p className="text-xs text-muted-foreground">
              {members.length} members
            </p>
          </div>

          {/* Group Settings */}
          <Dialog>
            <DialogTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8">
                <Settings className="w-4 h-4" />
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{currentGroup.name}</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div>
                  <p className="text-sm font-medium mb-2">Members ({members.length})</p>
                  <div className="space-y-2">
                    {members.map(member => (
                      <div key={member.id} className="flex items-center justify-between p-2 rounded-lg bg-muted/50">
                        <div className="flex items-center gap-2">
                          <Avatar className="h-8 w-8">
                            <AvatarImage src={member.profile?.avatar_url || undefined} />
                            <AvatarFallback>{getInitials(member.profile?.display_name || null)}</AvatarFallback>
                          </Avatar>
                          <span className="text-sm">{member.profile?.display_name || 'Unknown'}</span>
                          {member.role === 'admin' && (
                            <Crown className="w-4 h-4 text-yellow-500" />
                          )}
                        </div>
                        {isAdmin && member.user_id !== userId && (
                          <Button 
                            size="sm" 
                            variant="ghost"
                            onClick={() => removeMember(member.user_id)}
                          >
                            Remove
                          </Button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>

                {isAdmin && (
                  <Button 
                    variant="outline" 
                    className="w-full"
                    onClick={() => setShowAddMember(true)}
                  >
                    <UserPlus className="w-4 h-4 mr-2" /> Add Member
                  </Button>
                )}

                <Button 
                  variant="destructive" 
                  className="w-full"
                  onClick={leaveGroup}
                >
                  <LogOut className="w-4 h-4 mr-2" /> Leave Group
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        {/* Messages */}
        <ScrollArea className="flex-1 p-3" ref={scrollRef}>
          <div className="space-y-3">
            {messages.map(msg => {
              const isOwn = msg.sender_id === userId;
              const sender = getMemberProfile(msg.sender_id);
              
              return (
                <div key={msg.id} className={`flex ${isOwn ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[80%] ${isOwn ? 'order-1' : ''}`}>
                    {!isOwn && (
                      <p className="text-xs text-muted-foreground mb-1 ml-1">
                        {sender?.display_name || 'Unknown'}
                      </p>
                    )}
                    <div className={`px-3 py-2 rounded-2xl ${
                      isOwn 
                        ? 'bg-primary text-primary-foreground rounded-br-md' 
                        : 'bg-muted rounded-bl-md'
                    }`}>
                      <p className="text-sm">{msg.content}</p>
                    </div>
                    <p className={`text-[10px] text-muted-foreground mt-0.5 ${isOwn ? 'text-right' : ''}`}>
                      {formatTime(msg.created_at)}
                    </p>
                  </div>
                </div>
              );
            })}

            {messages.length === 0 && (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <Lock className="w-10 h-10 text-muted-foreground mb-3" />
                <p className="text-sm font-medium">End-to-end encrypted</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Start the conversation
                </p>
              </div>
            )}
          </div>
        </ScrollArea>

        {/* Input */}
        <div className="p-3 border-t border-border">
          <div className="flex gap-2">
            <Input
              placeholder="Type a message..."
              value={messageInput}
              onChange={e => setMessageInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSend()}
              className="flex-1"
            />
            <Button onClick={handleSend} disabled={!messageInput.trim()}>
              <Send className="w-4 h-4" />
            </Button>
          </div>
        </div>

        {/* Add Member Dialog */}
        <Dialog open={showAddMember} onOpenChange={setShowAddMember}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add Member</DialogTitle>
            </DialogHeader>
            <div className="space-y-2">
              {friends
                .filter(f => !members.some(m => m.user_id === f.user_id))
                .map(friend => (
                  <button
                    key={friend.user_id}
                    onClick={() => handleAddMember(friend.user_id)}
                    className="w-full flex items-center gap-3 p-3 rounded-lg hover:bg-muted transition-colors"
                  >
                    <Avatar className="h-10 w-10">
                      <AvatarImage src={friend.avatar_url || undefined} />
                      <AvatarFallback>{getInitials(friend.display_name)}</AvatarFallback>
                    </Avatar>
                    <span className="font-medium">{friend.display_name}</span>
                  </button>
                ))}
              {friends.filter(f => !members.some(m => m.user_id === f.user_id)).length === 0 && (
                <p className="text-center text-muted-foreground py-4">
                  All your friends are already in this group
                </p>
              )}
            </div>
          </DialogContent>
        </Dialog>
      </div>
    );
  }

  // Groups list view
  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between p-3 border-b border-border">
        <h3 className="font-semibold flex items-center gap-2">
          <Users className="w-5 h-5" /> Group Chats
        </h3>
        <Button size="sm" onClick={() => setShowCreateGroup(true)}>
          <Plus className="w-4 h-4 mr-1" /> New Group
        </Button>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-3 space-y-2">
          {groups.map(group => (
            <button
              key={group.id}
              onClick={() => selectGroup(group)}
              className="w-full flex items-center gap-3 p-3 rounded-lg hover:bg-muted transition-colors"
            >
              <Avatar className="h-12 w-12">
                <AvatarImage src={group.avatar_url || undefined} />
                <AvatarFallback className="bg-primary/10 text-primary">
                  <Users className="w-5 h-5" />
                </AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0 text-left">
                <p className="font-medium truncate">{group.name}</p>
                <p className="text-xs text-muted-foreground">
                  {group.description || 'Group chat'}
                </p>
              </div>
              <Badge variant="secondary" className="text-xs">
                <Lock className="w-3 h-3 mr-1" /> E2E
              </Badge>
            </button>
          ))}

          {groups.length === 0 && (
            <div className="text-center py-12 text-muted-foreground">
              <Users className="w-12 h-12 mx-auto mb-3 opacity-50" />
              <p className="font-medium">No group chats yet</p>
              <p className="text-sm mt-1">Create one to start messaging</p>
            </div>
          )}
        </div>
      </ScrollArea>

      {/* Create Group Dialog */}
      <Dialog open={showCreateGroup} onOpenChange={setShowCreateGroup}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create Group</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium">Group Name</label>
              <Input
                placeholder="My Awesome Group"
                value={newGroupName}
                onChange={e => setNewGroupName(e.target.value)}
              />
            </div>

            <div>
              <label className="text-sm font-medium">Add Members</label>
              <p className="text-xs text-muted-foreground mb-2">
                Select friends to add to this group
              </p>
              <div className="space-y-2 max-h-48 overflow-auto">
                {friends.map(friend => (
                  <label 
                    key={friend.user_id}
                    className="flex items-center gap-3 p-2 rounded-lg hover:bg-muted cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      checked={selectedMembers.includes(friend.user_id)}
                      onChange={e => {
                        if (e.target.checked) {
                          setSelectedMembers(prev => [...prev, friend.user_id]);
                        } else {
                          setSelectedMembers(prev => prev.filter(id => id !== friend.user_id));
                        }
                      }}
                      className="rounded"
                    />
                    <Avatar className="h-8 w-8">
                      <AvatarImage src={friend.avatar_url || undefined} />
                      <AvatarFallback>{getInitials(friend.display_name)}</AvatarFallback>
                    </Avatar>
                    <span className="text-sm">{friend.display_name}</span>
                  </label>
                ))}
              </div>
            </div>

            <Button 
              className="w-full" 
              onClick={handleCreateGroup}
              disabled={!newGroupName.trim() || selectedMembers.length === 0}
            >
              Create Group ({selectedMembers.length} members)
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
