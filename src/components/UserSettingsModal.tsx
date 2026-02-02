import { useState, useRef, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import {
  User, Pencil, Trash2, Plus, Star, Upload, Building, Phone, Briefcase, Check,
  Shield, History, Plug, Key, Calendar, Activity, AlertTriangle, Copy, RefreshCw,
  Globe, BookOpen, Cpu, Zap, Info
} from 'lucide-react';
import { ollama } from '@/lib/ollama';
import { useUserSettings, type UserSignature } from '@/hooks/useUserSettings';
import { useTwoFactor } from '@/hooks/useTwoFactor';
import { useActivityLogs } from '@/hooks/useActivityLogs';
import { useApiIntegrations, type ApiIntegration } from '@/hooks/useApiIntegrations';
import { useAppSettings } from '@/hooks/useAppSettings';
import { useToast } from '@/hooks/use-toast';
import { format } from 'date-fns';

interface UserSettingsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userId: string;
  userEmail?: string;
  userCreatedAt?: string;
}

export function UserSettingsModal({ open, onOpenChange, userId, userEmail, userCreatedAt }: UserSettingsModalProps) {
  const { toast } = useToast();
  const {
    settings,
    signatures,
    loading,
    updateSettings,
    addSignature,
    updateSignature,
    deleteSignature,
    setDefaultSignature,
    uploadLogo
  } = useUserSettings(userId);

  const { settings: twoFactorSettings, enableTwoFactor, disableTwoFactor } = useTwoFactor(userId);
  const { logs, fetchLogs } = useActivityLogs(userId);
  const { integrations, addIntegration, deleteIntegration, updateIntegration } = useApiIntegrations(userId);
  const { isKBPublicAccessEnabled, updateKBPublicAccess } = useAppSettings();

  // Check if current user is admin
  const isAdmin = userEmail === 'test@genxai.com';
  const [kbAccessUpdating, setKbAccessUpdating] = useState(false);

  const [profileForm, setProfileForm] = useState({
    first_name: '',
    last_name: '',
    designation: '',
    company: '',
    phone: '',
  });
  const [editingSignature, setEditingSignature] = useState<UserSignature | null>(null);
  const [newSignature, setNewSignature] = useState({
    name: '',
    type: 'formal' as 'formal' | 'semi-formal' | 'casual',
    content: '',
  });
  const [showNewSignatureForm, setShowNewSignatureForm] = useState(false);
  const [newIntegration, setNewIntegration] = useState({
    name: '',
    base_url: '',
    api_key_encrypted: '',
    description: '',
    icon: '🔌',
  });
  const [showNewIntegrationForm, setShowNewIntegrationForm] = useState(false);
  const [show2FASetup, setShow2FASetup] = useState(false);
  const [backupCodes, setBackupCodes] = useState<string[]>([]);
  const logoInputRef = useRef<HTMLInputElement>(null);

  // Initialize form when settings load
  useEffect(() => {
    if (settings) {
      setProfileForm({
        first_name: settings.first_name || '',
        last_name: settings.last_name || '',
        designation: settings.designation || '',
        company: settings.company || '',
        phone: settings.phone || '',
      });
    }
  }, [settings]);

  // Load activity logs and Ollama models when tab opens
  const [ollamaModels, setOllamaModels] = useState<string[]>([]);
  const [isCheckingOllama, setIsCheckingOllama] = useState(false);
  const { settings: appSettings, updateLocalAiSettings } = useAppSettings();

  useEffect(() => {
    if (open) {
      fetchLogs(20);
      checkOllama();
    }
  }, [open, fetchLogs]);

  const checkOllama = async () => {
    setIsCheckingOllama(true);
    ollama.setBaseUrl(appSettings.local_ai.ollama_url);
    const isConn = await ollama.checkConnection();
    if (isConn) {
      const models = await ollama.listModels();
      setOllamaModels(models);
    }
    setIsCheckingOllama(false);
  };

  const handleSaveProfile = async () => {
    await updateSettings(profileForm);
  };

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      await uploadLogo(file);
    }
  };

  const handleAddSignature = async () => {
    if (!newSignature.name || !newSignature.content) return;

    const success = await addSignature({
      name: newSignature.name,
      type: newSignature.type,
      content: newSignature.content,
      is_default: signatures.length === 0,
    });

    if (success) {
      setNewSignature({ name: '', type: 'formal', content: '' });
      setShowNewSignatureForm(false);
    }
  };

  const handleUpdateSignature = async () => {
    if (!editingSignature) return;

    await updateSignature(editingSignature.id, {
      name: editingSignature.name,
      type: editingSignature.type,
      content: editingSignature.content,
    });
    setEditingSignature(null);
  };

  const handleEnable2FA = async () => {
    const result = await enableTwoFactor();
    if (result) {
      setBackupCodes(result.backupCodes);
      setShow2FASetup(true);
    }
  };

  const handleDisable2FA = async () => {
    await disableTwoFactor();
    setShow2FASetup(false);
    setBackupCodes([]);
  };

  const handleAddIntegration = async () => {
    if (!newIntegration.name || !newIntegration.base_url) return;

    await addIntegration({
      name: newIntegration.name,
      base_url: newIntegration.base_url,
      api_key_encrypted: newIntegration.api_key_encrypted || null,
      description: newIntegration.description || null,
      icon: newIntegration.icon,
      headers: {},
      is_active: true,
    });

    setNewIntegration({ name: '', base_url: '', api_key_encrypted: '', description: '', icon: '🔌' });
    setShowNewIntegrationForm(false);
  };

  const copyBackupCodes = () => {
    navigator.clipboard.writeText(backupCodes.join('\n'));
    toast({ title: 'Backup codes copied!' });
  };

  const getInitials = () => {
    const first = settings?.first_name?.[0] || userEmail?.[0] || '?';
    const last = settings?.last_name?.[0] || '';
    return (first + last).toUpperCase();
  };

  const getActionIcon = (action: string) => {
    if (action.includes('login')) return '🔐';
    if (action.includes('document')) return '📄';
    if (action.includes('chat')) return '💬';
    if (action.includes('upload')) return '📤';
    if (action.includes('delete')) return '🗑️';
    return '📌';
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] p-0 overflow-hidden">
        <DialogHeader className="px-6 pt-6 pb-4 border-b border-border">
          <DialogTitle className="flex items-center gap-3">
            <Avatar className="h-12 w-12">
              <AvatarImage src={settings?.logo_url || undefined} />
              <AvatarFallback className="bg-primary/10 text-primary text-lg">
                {getInitials()}
              </AvatarFallback>
            </Avatar>
            <div>
              <p className="font-semibold">
                {[settings?.first_name, settings?.last_name].filter(Boolean).join(' ') || 'Your Profile'}
              </p>
              <p className="text-sm text-muted-foreground font-normal">{userEmail}</p>
              {userCreatedAt && (
                <p className="text-xs text-muted-foreground font-normal flex items-center gap-1">
                  <Calendar className="w-3 h-3" />
                  Member since {format(new Date(userCreatedAt), 'MMM yyyy')}
                </p>
              )}
            </div>
          </DialogTitle>
        </DialogHeader>

        <Tabs defaultValue="profile" className="flex-1">
          <TabsList className="w-full justify-start rounded-none border-b border-border bg-transparent px-6 flex-wrap h-auto py-1">
            <TabsTrigger value="profile" className="gap-2">
              <User className="w-4 h-4" /> Profile
            </TabsTrigger>
            <TabsTrigger value="signatures" className="gap-2">
              <Pencil className="w-4 h-4" /> Signatures
            </TabsTrigger>
            <TabsTrigger value="security" className="gap-2">
              <Shield className="w-4 h-4" /> Security
            </TabsTrigger>
            <TabsTrigger value="integrations" className="gap-2">
              <Plug className="w-4 h-4" /> Integrations
            </TabsTrigger>
            <TabsTrigger value="activity" className="gap-2">
              <History className="w-4 h-4" /> Activity
            </TabsTrigger>
            <TabsTrigger value="localai" className="gap-2">
              <Cpu className="w-4 h-4" /> Local AI
            </TabsTrigger>
            {isAdmin && (
              <TabsTrigger value="admin" className="gap-2">
                <Globe className="w-4 h-4" /> Admin
              </TabsTrigger>
            )}
          </TabsList>

          <ScrollArea className="h-[450px]">
            {/* Profile Tab */}
            <TabsContent value="profile" className="p-6 space-y-6 mt-0">
              {/* Logo Upload */}
              <div className="flex items-center gap-4">
                <div className="relative">
                  <Avatar className="h-20 w-20">
                    <AvatarImage src={settings?.logo_url || undefined} />
                    <AvatarFallback className="bg-muted text-2xl">
                      {settings?.logo_url ? '' : '📷'}
                    </AvatarFallback>
                  </Avatar>
                  <Button
                    size="icon"
                    variant="secondary"
                    className="absolute -bottom-1 -right-1 h-7 w-7 rounded-full"
                    onClick={() => logoInputRef.current?.click()}
                  >
                    <Upload className="h-3.5 w-3.5" />
                  </Button>
                  <input
                    ref={logoInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={handleLogoUpload}
                  />
                </div>
                <div>
                  <p className="font-medium">Profile Photo / Logo</p>
                  <p className="text-sm text-muted-foreground">
                    Used in document templates and invoices
                  </p>
                </div>
              </div>

              {/* Name */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="first_name">First Name</Label>
                  <Input
                    id="first_name"
                    placeholder="John"
                    value={profileForm.first_name}
                    onChange={e => setProfileForm(p => ({ ...p, first_name: e.target.value }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="last_name">Last Name</Label>
                  <Input
                    id="last_name"
                    placeholder="Doe"
                    value={profileForm.last_name}
                    onChange={e => setProfileForm(p => ({ ...p, last_name: e.target.value }))}
                  />
                </div>
              </div>

              {/* Professional Info */}
              <div className="space-y-2">
                <Label htmlFor="designation" className="flex items-center gap-2">
                  <Briefcase className="w-4 h-4" /> Designation
                </Label>
                <Input
                  id="designation"
                  placeholder="Software Engineer"
                  value={profileForm.designation}
                  onChange={e => setProfileForm(p => ({ ...p, designation: e.target.value }))}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="company" className="flex items-center gap-2">
                  <Building className="w-4 h-4" /> Company / Organization
                </Label>
                <Input
                  id="company"
                  placeholder="Acme Inc."
                  value={profileForm.company}
                  onChange={e => setProfileForm(p => ({ ...p, company: e.target.value }))}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="phone" className="flex items-center gap-2">
                  <Phone className="w-4 h-4" /> Phone Number
                </Label>
                <Input
                  id="phone"
                  placeholder="+1 234 567 8900"
                  value={profileForm.phone}
                  onChange={e => setProfileForm(p => ({ ...p, phone: e.target.value }))}
                />
              </div>

              <Button onClick={handleSaveProfile} className="w-full">
                <Check className="w-4 h-4 mr-2" /> Save Profile
              </Button>
            </TabsContent>

            {/* Signatures Tab */}
            <TabsContent value="signatures" className="p-6 space-y-4 mt-0">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium">Your Signatures</p>
                  <p className="text-sm text-muted-foreground">
                    Create up to 3 signatures for different contexts
                  </p>
                </div>
                {signatures.length < 3 && (
                  <Button
                    size="sm"
                    onClick={() => setShowNewSignatureForm(true)}
                    disabled={showNewSignatureForm}
                  >
                    <Plus className="w-4 h-4 mr-1" /> Add
                  </Button>
                )}
              </div>

              {/* New Signature Form */}
              {showNewSignatureForm && (
                <div className="border border-border rounded-lg p-4 space-y-3 bg-muted/30">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <Label>Name</Label>
                      <Input
                        placeholder="e.g., Formal Work"
                        value={newSignature.name}
                        onChange={e => setNewSignature(s => ({ ...s, name: e.target.value }))}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label>Type</Label>
                      <select
                        className="w-full h-10 px-3 rounded-md border border-input bg-background text-sm"
                        value={newSignature.type}
                        onChange={e => setNewSignature(s => ({
                          ...s,
                          type: e.target.value as 'formal' | 'semi-formal' | 'casual'
                        }))}
                      >
                        <option value="formal">Formal</option>
                        <option value="semi-formal">Semi-formal</option>
                        <option value="casual">Casual</option>
                      </select>
                    </div>
                  </div>
                  <div className="space-y-1">
                    <Label>Signature Content</Label>
                    <Textarea
                      placeholder={`Warm Regards,\n${settings?.first_name || 'Your Name'} ${settings?.last_name || ''}\n${settings?.designation || 'Designation'}`}
                      value={newSignature.content}
                      onChange={e => setNewSignature(s => ({ ...s, content: e.target.value }))}
                      rows={4}
                    />
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" onClick={handleAddSignature}>
                      <Check className="w-4 h-4 mr-1" /> Save
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        setShowNewSignatureForm(false);
                        setNewSignature({ name: '', type: 'formal', content: '' });
                      }}
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              )}

              {/* Existing Signatures */}
              <div className="space-y-3">
                {signatures.map(sig => (
                  <div
                    key={sig.id}
                    className="border border-border rounded-lg p-4 space-y-2"
                  >
                    {editingSignature?.id === sig.id ? (
                      <>
                        <div className="grid grid-cols-2 gap-3">
                          <Input
                            value={editingSignature.name}
                            onChange={e => setEditingSignature(s => s ? { ...s, name: e.target.value } : null)}
                          />
                          <select
                            className="h-10 px-3 rounded-md border border-input bg-background text-sm"
                            value={editingSignature.type}
                            onChange={e => setEditingSignature(s => s ? {
                              ...s,
                              type: e.target.value as 'formal' | 'semi-formal' | 'casual'
                            } : null)}
                          >
                            <option value="formal">Formal</option>
                            <option value="semi-formal">Semi-formal</option>
                            <option value="casual">Casual</option>
                          </select>
                        </div>
                        <Textarea
                          value={editingSignature.content}
                          onChange={e => setEditingSignature(s => s ? { ...s, content: e.target.value } : null)}
                          rows={4}
                        />
                        <div className="flex gap-2">
                          <Button size="sm" onClick={handleUpdateSignature}>Save</Button>
                          <Button size="sm" variant="ghost" onClick={() => setEditingSignature(null)}>
                            Cancel
                          </Button>
                        </div>
                      </>
                    ) : (
                      <>
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span className="font-medium">{sig.name}</span>
                            <Badge variant="secondary" className="text-xs">
                              {sig.type}
                            </Badge>
                            {sig.is_default && (
                              <Badge className="text-xs bg-primary/10 text-primary">
                                <Star className="w-3 h-3 mr-1" /> Default
                              </Badge>
                            )}
                          </div>
                          <div className="flex gap-1">
                            {!sig.is_default && (
                              <Button
                                size="icon"
                                variant="ghost"
                                className="h-8 w-8"
                                onClick={() => setDefaultSignature(sig.id)}
                                title="Set as default"
                              >
                                <Star className="w-4 h-4" />
                              </Button>
                            )}
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-8 w-8"
                              onClick={() => setEditingSignature(sig)}
                            >
                              <Pencil className="w-4 h-4" />
                            </Button>
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-8 w-8 text-destructive"
                              onClick={() => deleteSignature(sig.id)}
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </div>
                        </div>
                        <pre className="text-sm text-muted-foreground whitespace-pre-wrap bg-muted/50 p-3 rounded-md">
                          {sig.content}
                        </pre>
                      </>
                    )}
                  </div>
                ))}

                {signatures.length === 0 && !showNewSignatureForm && (
                  <div className="text-center py-8 text-muted-foreground">
                    <Pencil className="w-10 h-10 mx-auto mb-3 opacity-50" />
                    <p>No signatures yet</p>
                    <p className="text-sm">Add signatures to use in your documents</p>
                  </div>
                )}
              </div>
            </TabsContent>

            {/* Security Tab */}
            <TabsContent value="security" className="p-6 space-y-6 mt-0">
              {/* 2FA Section */}
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                      <Shield className="w-5 h-5 text-primary" />
                    </div>
                    <div>
                      <p className="font-medium">Two-Factor Authentication</p>
                      <p className="text-sm text-muted-foreground">
                        Add extra security with Microsoft Authenticator
                      </p>
                    </div>
                  </div>
                  <Switch
                    checked={twoFactorSettings?.is_enabled || false}
                    onCheckedChange={(checked) => {
                      if (checked) {
                        handleEnable2FA();
                      } else {
                        handleDisable2FA();
                      }
                    }}
                  />
                </div>

                {show2FASetup && backupCodes.length > 0 && (
                  <div className="border border-border rounded-lg p-4 bg-muted/30 space-y-3">
                    <div className="flex items-center gap-2 text-amber-600">
                      <AlertTriangle className="w-4 h-4" />
                      <span className="text-sm font-medium">Save your backup codes!</span>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      These codes can be used if you lose access to your authenticator app.
                      Store them safely - you won't see them again.
                    </p>
                    <div className="grid grid-cols-4 gap-2">
                      {backupCodes.map((code, i) => (
                        <code key={i} className="text-sm bg-background p-2 rounded text-center font-mono">
                          {code}
                        </code>
                      ))}
                    </div>
                    <Button size="sm" variant="outline" onClick={copyBackupCodes}>
                      <Copy className="w-4 h-4 mr-2" /> Copy Codes
                    </Button>
                  </div>
                )}

                {twoFactorSettings?.is_enabled && !show2FASetup && (
                  <div className="flex items-center gap-2 text-sm text-green-600">
                    <Check className="w-4 h-4" />
                    <span>2FA is enabled</span>
                    {twoFactorSettings.last_verified_at && (
                      <span className="text-muted-foreground">
                        • Last verified {format(new Date(twoFactorSettings.last_verified_at), 'MMM d, yyyy')}
                      </span>
                    )}
                  </div>
                )}
              </div>

              <Separator />

              {/* Account Info */}
              <div className="space-y-3">
                <p className="font-medium">Account Information</p>
                <div className="grid gap-3 text-sm">
                  <div className="flex justify-between py-2 border-b border-border">
                    <span className="text-muted-foreground">Email</span>
                    <span>{userEmail}</span>
                  </div>
                  <div className="flex justify-between py-2 border-b border-border">
                    <span className="text-muted-foreground">User ID</span>
                    <code className="text-xs bg-muted px-2 py-1 rounded">{userId.slice(0, 8)}...</code>
                  </div>
                  {userCreatedAt && (
                    <div className="flex justify-between py-2 border-b border-border">
                      <span className="text-muted-foreground">Account Created</span>
                      <span>{format(new Date(userCreatedAt), 'MMMM d, yyyy')}</span>
                    </div>
                  )}
                </div>
              </div>
            </TabsContent>

            {/* Integrations Tab */}
            <TabsContent value="integrations" className="p-6 space-y-4 mt-0">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium">API Integrations</p>
                  <p className="text-sm text-muted-foreground">
                    Connect external APIs to query with ! mention
                  </p>
                </div>
                <Button
                  size="sm"
                  onClick={() => setShowNewIntegrationForm(true)}
                  disabled={showNewIntegrationForm}
                >
                  <Plus className="w-4 h-4 mr-1" /> Add API
                </Button>
              </div>

              {/* New Integration Form */}
              {showNewIntegrationForm && (
                <div className="border border-border rounded-lg p-4 space-y-3 bg-muted/30">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <Label>Name</Label>
                      <Input
                        placeholder="e.g., Weather API"
                        value={newIntegration.name}
                        onChange={e => setNewIntegration(s => ({ ...s, name: e.target.value }))}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label>Icon (emoji)</Label>
                      <Input
                        placeholder="🔌"
                        value={newIntegration.icon}
                        onChange={e => setNewIntegration(s => ({ ...s, icon: e.target.value }))}
                        maxLength={2}
                      />
                    </div>
                  </div>
                  <div className="space-y-1">
                    <Label>Base URL</Label>
                    <Input
                      placeholder="https://api.example.com"
                      value={newIntegration.base_url}
                      onChange={e => setNewIntegration(s => ({ ...s, base_url: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label>API Key (optional)</Label>
                    <Input
                      type="password"
                      placeholder="sk-..."
                      value={newIntegration.api_key_encrypted}
                      onChange={e => setNewIntegration(s => ({ ...s, api_key_encrypted: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label>Description</Label>
                    <Input
                      placeholder="What does this API do?"
                      value={newIntegration.description}
                      onChange={e => setNewIntegration(s => ({ ...s, description: e.target.value }))}
                    />
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" onClick={handleAddIntegration}>
                      <Check className="w-4 h-4 mr-1" /> Add
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        setShowNewIntegrationForm(false);
                        setNewIntegration({ name: '', base_url: '', api_key_encrypted: '', description: '', icon: '🔌' });
                      }}
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              )}

              {/* Existing Integrations */}
              <div className="space-y-3">
                {integrations.map(int => (
                  <div
                    key={int.id}
                    className="border border-border rounded-lg p-4 flex items-center justify-between"
                  >
                    <div className="flex items-center gap-3">
                      <span className="text-2xl">{int.icon}</span>
                      <div>
                        <p className="font-medium flex items-center gap-2">
                          {int.name}
                          <Badge variant={int.is_active ? 'default' : 'secondary'} className="text-xs">
                            {int.is_active ? 'Active' : 'Inactive'}
                          </Badge>
                        </p>
                        <p className="text-xs text-muted-foreground">{int.base_url}</p>
                      </div>
                    </div>
                    <div className="flex gap-1">
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-8 w-8"
                        onClick={() => updateIntegration(int.id, { is_active: !int.is_active })}
                      >
                        <RefreshCw className="w-4 h-4" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-8 w-8 text-destructive"
                        onClick={() => deleteIntegration(int.id)}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                ))}

                {integrations.length === 0 && !showNewIntegrationForm && (
                  <div className="text-center py-8 text-muted-foreground">
                    <Plug className="w-10 h-10 mx-auto mb-3 opacity-50" />
                    <p>No integrations yet</p>
                    <p className="text-sm">Add APIs to query them with ! in chat</p>
                  </div>
                )}
              </div>

              <Separator />

              {/* Coming Soon */}
              <div className="space-y-3">
                <p className="font-medium text-muted-foreground">Coming Soon</p>
                <div className="grid grid-cols-2 gap-3">
                  <div className="border border-dashed border-border rounded-lg p-3 opacity-50">
                    <p className="font-medium text-sm">📧 Email Integration</p>
                    <p className="text-xs text-muted-foreground">Send letters directly</p>
                  </div>
                  <div className="border border-dashed border-border rounded-lg p-3 opacity-50">
                    <p className="font-medium text-sm">📊 Google Sheets</p>
                    <p className="text-xs text-muted-foreground">Import/export data</p>
                  </div>
                  <div className="border border-dashed border-border rounded-lg p-3 opacity-50">
                    <p className="font-medium text-sm">📄 Google Docs</p>
                    <p className="text-xs text-muted-foreground">Sync documents</p>
                  </div>
                  <div className="border border-dashed border-border rounded-lg p-3 opacity-50">
                    <p className="font-medium text-sm">📁 Dropbox</p>
                    <p className="text-xs text-muted-foreground">Cloud storage</p>
                  </div>
                </div>
              </div>
            </TabsContent>

            {/* Activity Tab */}
            <TabsContent value="activity" className="p-6 space-y-4 mt-0">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium">Activity Log</p>
                  <p className="text-sm text-muted-foreground">
                    Recent actions in your account
                  </p>
                </div>
                <Button size="sm" variant="outline" onClick={() => fetchLogs(50)}>
                  <RefreshCw className="w-4 h-4 mr-1" /> Refresh
                </Button>
              </div>

              <div className="space-y-2">
                {logs.map(log => (
                  <div
                    key={log.id}
                    className="flex items-start gap-3 p-3 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors"
                  >
                    <span className="text-lg">{getActionIcon(log.action)}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium">{log.action}</p>
                      <p className="text-xs text-muted-foreground">
                        {log.resource_type}
                        {log.resource_id && ` • ${log.resource_id.slice(0, 8)}...`}
                      </p>
                    </div>
                    <span className="text-xs text-muted-foreground whitespace-nowrap">
                      {format(new Date(log.created_at), 'MMM d, HH:mm')}
                    </span>
                  </div>
                ))}

                {logs.length === 0 && (
                  <div className="text-center py-8 text-muted-foreground">
                    <Activity className="w-10 h-10 mx-auto mb-3 opacity-50" />
                    <p>No activity recorded yet</p>
                    <p className="text-sm">Your actions will appear here</p>
                  </div>
                )}
              </div>
            </TabsContent>

            {/* Local AI Tab */}
            <TabsContent value="localai" className="p-6 space-y-6 mt-0">
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                      <Cpu className="w-5 h-5 text-primary" />
                    </div>
                    <div>
                      <p className="font-medium">Local AI (Ollama)</p>
                      <p className="text-sm text-muted-foreground">
                        Run models locally for 100% privacy and no cost
                      </p>
                    </div>
                  </div>
                  <Switch
                    checked={appSettings.local_ai.enabled}
                    onCheckedChange={(checked) => updateLocalAiSettings({ enabled: checked })}
                  />
                </div>

                <div className="space-y-4 pt-4">
                  <div className="space-y-2">
                    <Label htmlFor="ollama_url">Ollama Base URL</Label>
                    <div className="flex gap-2">
                      <Input
                        id="ollama_url"
                        placeholder="http://localhost:11434"
                        value={appSettings.local_ai.ollama_url}
                        onChange={(e) => updateLocalAiSettings({ ollama_url: e.target.value })}
                      />
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={checkOllama}
                        disabled={isCheckingOllama}
                      >
                        {isCheckingOllama ? <RefreshCw className="w-4 h-4 animate-spin" /> : 'Check'}
                      </Button>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="ollama_model">Model Name</Label>
                    <select
                      id="ollama_model"
                      className="w-full h-10 px-3 rounded-md border border-input bg-background text-sm"
                      value={appSettings.local_ai.model_name}
                      onChange={(e) => updateLocalAiSettings({ model_name: e.target.value })}
                    >
                      {ollamaModels.length > 0 ? (
                        ollamaModels.map(m => <option key={m} value={m}>{m}</option>)
                      ) : (
                        <option value={appSettings.local_ai.model_name}>{appSettings.local_ai.model_name} (Not found)</option>
                      )}
                    </select>
                    <p className="text-xs text-muted-foreground flex items-center gap-1">
                      <Zap className="w-3 h-3 text-amber-500" />
                      Recommended: llama3.1:8b or mistral
                    </p>
                  </div>

                  <div className="bg-blue-500/10 p-4 rounded-lg border border-blue-500/20 space-y-2">
                    <p className="text-sm font-medium flex items-center gap-2">
                      <Info className="w-4 h-4" /> Setup Instructions
                    </p>
                    <ol className="text-xs text-muted-foreground list-decimal list-inside space-y-1">
                      <li>Install <a href="https://ollama.com" target="_blank" className="text-primary hover:underline">Ollama</a> on your computer</li>
                      <li>Run <code>ollama run llama3.1</code> in your terminal</li>
                      <li>Enable "Local AI" toggle above</li>
                    </ol>
                  </div>
                </div>
              </div>
            </TabsContent>
            {isAdmin && (
              <TabsContent value="admin" className="p-6 space-y-6 mt-0">
                <div className="space-y-4">
                  <div className="flex items-center gap-3 p-4 border border-amber-500/30 rounded-lg bg-amber-50/50 dark:bg-amber-950/20">
                    <AlertTriangle className="w-5 h-5 text-amber-600" />
                    <div>
                      <p className="font-medium text-amber-800 dark:text-amber-400">Admin Settings</p>
                      <p className="text-sm text-amber-600 dark:text-amber-500">
                        These settings affect all users globally
                      </p>
                    </div>
                  </div>

                  <Separator />

                  {/* Knowledge Base Public Access Toggle */}
                  <div className="flex items-center justify-between p-4 border border-border rounded-lg">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                        <BookOpen className="w-5 h-5 text-primary" />
                      </div>
                      <div>
                        <p className="font-medium">Universal Knowledge Base Access</p>
                        <p className="text-sm text-muted-foreground">
                          Allow all users to access the knowledge base without login
                        </p>
                        <Badge
                          variant={isKBPublicAccessEnabled ? 'default' : 'secondary'}
                          className="mt-1"
                        >
                          {isKBPublicAccessEnabled ? '🌐 Public Access ON' : '🔒 Login Required'}
                        </Badge>
                      </div>
                    </div>
                    <Switch
                      checked={isKBPublicAccessEnabled}
                      disabled={kbAccessUpdating}
                      onCheckedChange={async (checked) => {
                        setKbAccessUpdating(true);
                        const success = await updateKBPublicAccess(checked);
                        if (success) {
                          toast({
                            title: checked ? 'Public Access Enabled' : 'Public Access Disabled',
                            description: checked
                              ? 'Knowledge base is now accessible to everyone'
                              : 'Users must login to access knowledge base',
                          });
                        } else {
                          toast({
                            title: 'Failed to update setting',
                            variant: 'destructive',
                          });
                        }
                        setKbAccessUpdating(false);
                      }}
                    />
                  </div>

                  <div className="text-xs text-muted-foreground bg-muted/50 p-3 rounded-lg">
                    <p className="font-medium mb-1">ℹ️ How it works:</p>
                    <ul className="list-disc list-inside space-y-1">
                      <li>When enabled, anyone can view knowledge base documents</li>
                      <li>Changes apply in real-time across all sessions</li>
                      <li>Only you (test@genxai.com) can modify this setting</li>
                    </ul>
                  </div>
                </div>
              </TabsContent>
            )}
          </ScrollArea>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
