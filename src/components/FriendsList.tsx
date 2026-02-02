import { useState } from 'react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  Users, UserPlus, Check, X, Search, MessageCircle, 
  Circle, Clock, UserMinus 
} from 'lucide-react';
import type { UserProfile, FriendRequest } from '@/hooks/useUserPresence';

interface FriendsListProps {
  friends: UserProfile[];
  pendingRequests: FriendRequest[];
  allUsers: UserProfile[];
  currentUserId: string;
  onSendRequest: (userId: string) => void;
  onRespondRequest: (requestId: string, accept: boolean) => void;
  onRemoveFriend: (userId: string) => void;
  onStartChat: (friend: UserProfile) => void;
  getUnreadCount?: (friendId: string) => number;
}

function getStatusColor(status: string) {
  switch (status) {
    case 'online': return 'bg-green-500';
    case 'away': return 'bg-yellow-500';
    default: return 'bg-muted-foreground';
  }
}

function getInitials(name: string | null) {
  if (!name) return '?';
  return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
}

export function FriendsList({
  friends,
  pendingRequests,
  allUsers,
  currentUserId,
  onSendRequest,
  onRespondRequest,
  onRemoveFriend,
  onStartChat,
  getUnreadCount,
}: FriendsListProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [activeTab, setActiveTab] = useState('friends');

  const incomingRequests = pendingRequests.filter(r => r.to_user_id === currentUserId);
  const outgoingRequests = pendingRequests.filter(r => r.from_user_id === currentUserId);
  const outgoingUserIds = new Set(outgoingRequests.map(r => r.to_user_id));
  const friendUserIds = new Set(friends.map(f => f.user_id));

  // Filter users who are not friends and don't have pending requests
  const discoverableUsers = allUsers.filter(u => 
    !friendUserIds.has(u.user_id) &&
    !outgoingUserIds.has(u.user_id) &&
    !incomingRequests.some(r => r.from_user_id === u.user_id)
  );

  const filteredFriends = friends.filter(f =>
    f.display_name?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const filteredDiscoverable = discoverableUsers.filter(u =>
    u.display_name?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="flex flex-col h-full">
      {/* Search */}
      <div className="p-3 border-b border-border">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search users..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-9"
          />
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col">
        <TabsList className="w-full rounded-none border-b border-border bg-transparent p-0">
          <TabsTrigger 
            value="friends" 
            className="flex-1 rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent"
          >
            <Users className="w-4 h-4 mr-2" />
            Friends ({friends.length})
          </TabsTrigger>
          <TabsTrigger 
            value="requests"
            className="flex-1 rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent"
          >
            <UserPlus className="w-4 h-4 mr-2" />
            Requests
            {incomingRequests.length > 0 && (
              <Badge variant="destructive" className="ml-2 h-5 px-1.5">
                {incomingRequests.length}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger 
            value="discover"
            className="flex-1 rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent"
          >
            <Search className="w-4 h-4 mr-2" />
            Discover
          </TabsTrigger>
        </TabsList>

        <ScrollArea className="flex-1">
          {/* Friends Tab */}
          <TabsContent value="friends" className="m-0 p-2">
            {filteredFriends.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <Users className="w-12 h-12 text-muted-foreground mb-3" />
                <p className="text-muted-foreground">
                  {friends.length === 0 ? 'No friends yet' : 'No matching friends'}
                </p>
              </div>
            ) : (
              <div className="space-y-1">
                {filteredFriends.map((friend) => (
                  <div
                    key={friend.id}
                    className="flex items-center gap-3 p-3 rounded-xl hover:bg-muted/50 transition-colors group"
                  >
                    <div className="relative">
                      <Avatar className="h-10 w-10">
                        <AvatarImage src={friend.avatar_url || undefined} />
                        <AvatarFallback>{getInitials(friend.display_name)}</AvatarFallback>
                      </Avatar>
                      <span className={`absolute bottom-0 right-0 w-3 h-3 rounded-full border-2 border-background ${getStatusColor(friend.status)}`} />
                    </div>
                    
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="font-medium truncate">{friend.display_name || 'Unknown'}</p>
                        {getUnreadCount && getUnreadCount(friend.user_id) > 0 && (
                          <Badge variant="destructive" className="h-5 px-1.5 text-[10px]">
                            {getUnreadCount(friend.user_id)}
                          </Badge>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground flex items-center gap-1">
                        <Circle className={`w-2 h-2 fill-current ${friend.status === 'online' ? 'text-green-500' : 'text-muted-foreground'}`} />
                        {friend.status === 'online' ? 'Online' : `Last seen ${new Date(friend.last_seen).toLocaleDateString()}`}
                      </p>
                    </div>

                    <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => onStartChat(friend)}
                        className="h-8 w-8"
                      >
                        <MessageCircle className="w-4 h-4" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => onRemoveFriend(friend.user_id)}
                        className="h-8 w-8 text-destructive hover:text-destructive"
                      >
                        <UserMinus className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </TabsContent>

          {/* Requests Tab */}
          <TabsContent value="requests" className="m-0 p-2">
            {incomingRequests.length === 0 && outgoingRequests.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <Clock className="w-12 h-12 text-muted-foreground mb-3" />
                <p className="text-muted-foreground">No pending requests</p>
              </div>
            ) : (
              <div className="space-y-4">
                {incomingRequests.length > 0 && (
                  <div>
                    <h4 className="text-xs font-medium text-muted-foreground mb-2 px-1">INCOMING</h4>
                    <div className="space-y-1">
                      {incomingRequests.map((request) => (
                        <div
                          key={request.id}
                          className="flex items-center gap-3 p-3 rounded-xl bg-muted/30"
                        >
                          <Avatar className="h-10 w-10">
                            <AvatarImage src={request.from_profile?.avatar_url || undefined} />
                            <AvatarFallback>{getInitials(request.from_profile?.display_name || null)}</AvatarFallback>
                          </Avatar>
                          
                          <div className="flex-1 min-w-0">
                            <p className="font-medium truncate">{request.from_profile?.display_name || 'Unknown'}</p>
                            <p className="text-xs text-muted-foreground">Wants to connect</p>
                          </div>

                          <div className="flex gap-1">
                            <Button
                              size="icon"
                              variant="default"
                              onClick={() => onRespondRequest(request.id, true)}
                              className="h-8 w-8"
                            >
                              <Check className="w-4 h-4" />
                            </Button>
                            <Button
                              size="icon"
                              variant="outline"
                              onClick={() => onRespondRequest(request.id, false)}
                              className="h-8 w-8"
                            >
                              <X className="w-4 h-4" />
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {outgoingRequests.length > 0 && (
                  <div>
                    <h4 className="text-xs font-medium text-muted-foreground mb-2 px-1">PENDING</h4>
                    <div className="space-y-1">
                      {outgoingRequests.map((request) => (
                        <div
                          key={request.id}
                          className="flex items-center gap-3 p-3 rounded-xl bg-muted/20"
                        >
                          <Avatar className="h-10 w-10">
                            <AvatarImage src={request.to_profile?.avatar_url || undefined} />
                            <AvatarFallback>{getInitials(request.to_profile?.display_name || null)}</AvatarFallback>
                          </Avatar>
                          
                          <div className="flex-1 min-w-0">
                            <p className="font-medium truncate">{request.to_profile?.display_name || 'Unknown'}</p>
                            <p className="text-xs text-muted-foreground">Request pending</p>
                          </div>

                          <Badge variant="secondary">Pending</Badge>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </TabsContent>

          {/* Discover Tab */}
          <TabsContent value="discover" className="m-0 p-2">
            {filteredDiscoverable.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <Search className="w-12 h-12 text-muted-foreground mb-3" />
                <p className="text-muted-foreground">
                  {discoverableUsers.length === 0 ? 'No new users to discover' : 'No matching users'}
                </p>
              </div>
            ) : (
              <div className="space-y-1">
                {filteredDiscoverable.map((user) => (
                  <div
                    key={user.id}
                    className="flex items-center gap-3 p-3 rounded-xl hover:bg-muted/50 transition-colors"
                  >
                    <div className="relative">
                      <Avatar className="h-10 w-10">
                        <AvatarImage src={user.avatar_url || undefined} />
                        <AvatarFallback>{getInitials(user.display_name)}</AvatarFallback>
                      </Avatar>
                      <span className={`absolute bottom-0 right-0 w-3 h-3 rounded-full border-2 border-background ${getStatusColor(user.status)}`} />
                    </div>
                    
                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate">{user.display_name || 'Unknown'}</p>
                      <p className="text-xs text-muted-foreground">
                        {user.status === 'online' ? 'Online' : 'Offline'}
                      </p>
                    </div>

                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => onSendRequest(user.user_id)}
                      className="gap-1"
                    >
                      <UserPlus className="w-4 h-4" />
                      Add
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </TabsContent>
        </ScrollArea>
      </Tabs>
    </div>
  );
}
