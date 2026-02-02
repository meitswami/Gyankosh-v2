import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  FileText, Mail, Receipt, ClipboardList, BarChart3, Sparkles
} from 'lucide-react';
import { useDocumentTemplates, type DocumentTemplate } from '@/hooks/useDocumentTemplates';
import { useUserSettings } from '@/hooks/useUserSettings';

interface TemplatePickerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userId: string | null;
  onSelectTemplate: (prompt: string) => void;
}

const categoryIcons: Record<string, React.ReactNode> = {
  letter: <FileText className="w-4 h-4" />,
  email: <Mail className="w-4 h-4" />,
  invoice: <Receipt className="w-4 h-4" />,
  memo: <ClipboardList className="w-4 h-4" />,
  report: <BarChart3 className="w-4 h-4" />,
};

export function TemplatePicker({ open, onOpenChange, userId, onSelectTemplate }: TemplatePickerProps) {
  const { templates, getCategories, getTemplatePrompt } = useDocumentTemplates();
  const { settings, signatures, getFormattedSignature } = useUserSettings(userId);
  const [selectedTemplate, setSelectedTemplate] = useState<DocumentTemplate | null>(null);

  const categories = getCategories();

  const handleUseTemplate = (template: DocumentTemplate) => {
    const context = {
      settings,
      signatures,
      getFormattedSignature,
    };

    // Create a prompt that asks AI to fill the template
    const prompt = `Use the "${template.name}" template to create a ${template.category}. Please fill in all the placeholders appropriately.`;
    
    onSelectTemplate(prompt);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[80vh] p-0 overflow-hidden">
        <DialogHeader className="px-6 pt-6 pb-4 border-b border-border">
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-primary" />
            Document Templates
          </DialogTitle>
          <p className="text-sm text-muted-foreground">
            Select a template to start writing. AI will fill in details based on your profile.
          </p>
        </DialogHeader>

        <Tabs defaultValue={categories[0]?.name || 'letter'} className="flex-1">
          <TabsList className="w-full justify-start rounded-none border-b border-border bg-transparent px-6 gap-1">
            {categories.map(cat => (
              <TabsTrigger 
                key={cat.name} 
                value={cat.name}
                className="gap-2 data-[state=active]:bg-primary/10"
              >
                {categoryIcons[cat.name] || <FileText className="w-4 h-4" />}
                {cat.label}
                <Badge variant="secondary" className="text-xs ml-1">
                  {cat.count}
                </Badge>
              </TabsTrigger>
            ))}
          </TabsList>

          <ScrollArea className="h-[450px]">
            {categories.map(cat => (
              <TabsContent key={cat.name} value={cat.name} className="p-6 mt-0">
                <div className="grid grid-cols-2 gap-4">
                  {templates
                    .filter(t => t.category === cat.name)
                    .map(template => (
                      <button
                        key={template.id}
                        onClick={() => setSelectedTemplate(template)}
                        className={`text-left p-4 rounded-lg border transition-all hover:border-primary/50 hover:bg-muted/50 ${
                          selectedTemplate?.id === template.id 
                            ? 'border-primary bg-primary/5' 
                            : 'border-border'
                        }`}
                      >
                        <div className="flex items-start gap-3">
                          <span className="text-2xl">{template.icon}</span>
                          <div className="flex-1 min-w-0">
                            <h3 className="font-medium truncate">{template.name}</h3>
                            <p className="text-sm text-muted-foreground line-clamp-2 mt-1">
                              {template.description}
                            </p>
                            {template.subcategory && (
                              <Badge variant="outline" className="mt-2 text-xs">
                                {template.subcategory.replace(/_/g, ' ')}
                              </Badge>
                            )}
                          </div>
                        </div>
                      </button>
                    ))}
                </div>
              </TabsContent>
            ))}
          </ScrollArea>
        </Tabs>

        {/* Selected Template Preview */}
        {selectedTemplate && (
          <div className="border-t border-border p-4 bg-muted/30">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium">
                  {selectedTemplate.icon} {selectedTemplate.name}
                </p>
                <p className="text-sm text-muted-foreground">
                  Click "Use Template" to start creating with AI assistance
                </p>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setSelectedTemplate(null)}>
                  Cancel
                </Button>
                <Button onClick={() => handleUseTemplate(selectedTemplate)}>
                  <Sparkles className="w-4 h-4 mr-2" />
                  Use Template
                </Button>
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
