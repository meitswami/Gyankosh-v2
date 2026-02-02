import { useState, useEffect } from 'react';
import { X, ChevronRight, ChevronLeft, Sparkles, FileText, AtSign, Hash, Zap, Keyboard, Users, Settings, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

interface TourStep {
  id: string;
  title: string;
  description: string;
  icon: React.ReactNode;
  highlight?: string;
  tips?: string[];
}

const tourSteps: TourStep[] = [
  {
    id: 'welcome',
    title: 'Welcome to ज्ञानकोष!',
    description: 'Your AI-powered document knowledge base. Let\'s walk through the key features to get you started.',
    icon: <Sparkles className="w-8 h-8 text-primary" />,
    tips: [
      'Upload documents to build your knowledge base',
      'Chat with AI about your documents',
      'Share and collaborate with team members',
    ],
  },
  {
    id: 'upload',
    title: 'Upload Documents',
    description: 'Drag and drop files or click the paperclip icon to upload. We support PDF, DOCX, images, and more.',
    icon: <Upload className="w-8 h-8 text-blue-500" />,
    highlight: 'upload-button',
    tips: [
      'PDFs, DOCX, images, and videos supported',
      'AI extracts text and generates summaries',
      'Batch upload multiple files at once',
    ],
  },
  {
    id: 'documents',
    title: 'Your Knowledge Base',
    description: 'All uploaded documents appear in the sidebar. Click to select a document for focused conversations.',
    icon: <FileText className="w-8 h-8 text-green-500" />,
    highlight: 'document-sidebar',
    tips: [
      'Search documents by name or content',
      'Filter by tags and categories',
      'Right-click for quick actions',
    ],
  },
  {
    id: 'mentions',
    title: 'Smart Mentions',
    description: 'Use special triggers in the chat input to access powerful features.',
    icon: <AtSign className="w-8 h-8 text-purple-500" />,
    highlight: 'chat-input',
    tips: [
      '@ - Mention a friend or colleague',
      '# - Reference a specific document',
      '! - Web search or API integration',
    ],
  },
  {
    id: 'document-mention',
    title: '# Document References',
    description: 'Type # followed by a document name to include it as context for your question.',
    icon: <Hash className="w-8 h-8 text-orange-500" />,
    tips: [
      'Example: #report.pdf What are the key findings?',
      'Suggestions appear as you type',
      'Press Tab or Enter to select',
    ],
  },
  {
    id: 'web-search',
    title: '! Web Search & APIs',
    description: 'Type ! to search the web or call integrated APIs directly from chat.',
    icon: <Zap className="w-8 h-8 text-yellow-500" />,
    tips: [
      '!google AI trends - Search Google',
      '!bing weather - Search Bing',
      '!api-name - Call your custom APIs',
    ],
  },
  {
    id: 'groups',
    title: 'Group Chat (E2E Encrypted)',
    description: 'Create encrypted group conversations with your team. All messages are end-to-end encrypted.',
    icon: <Users className="w-8 h-8 text-cyan-500" />,
    highlight: 'groups-button',
    tips: [
      'Click Groups to open the panel',
      'Create new groups with friends',
      'Messages never readable by server',
    ],
  },
  {
    id: 'shortcuts',
    title: 'Keyboard Shortcuts',
    description: 'Power users can navigate quickly with keyboard shortcuts. Press Ctrl+/ anytime to see all shortcuts.',
    icon: <Keyboard className="w-8 h-8 text-pink-500" />,
    tips: [
      'Ctrl+N - New chat session',
      'Ctrl+K - Focus search',
      'Ctrl+M - Voice input',
      'Ctrl+/ - Show all shortcuts',
    ],
  },
  {
    id: 'settings',
    title: 'Settings & Security',
    description: 'Configure your profile, signatures, 2FA, and manage API integrations.',
    icon: <Settings className="w-8 h-8 text-gray-500" />,
    highlight: 'settings-button',
    tips: [
      'Set up professional signatures',
      'Enable 2FA for extra security',
      'Connect external APIs',
      'View activity logs',
    ],
  },
];

interface OnboardingTourProps {
  onComplete: () => void;
}

export function OnboardingTour({ onComplete }: OnboardingTourProps) {
  const [currentStep, setCurrentStep] = useState(0);
  const [isVisible, setIsVisible] = useState(true);

  const step = tourSteps[currentStep];
  const isFirstStep = currentStep === 0;
  const isLastStep = currentStep === tourSteps.length - 1;

  const handleNext = () => {
    if (isLastStep) {
      handleComplete();
    } else {
      setCurrentStep(prev => prev + 1);
    }
  };

  const handlePrev = () => {
    if (!isFirstStep) {
      setCurrentStep(prev => prev - 1);
    }
  };

  const handleComplete = () => {
    setIsVisible(false);
    localStorage.setItem('gyaankosh_onboarding_complete', 'true');
    setTimeout(onComplete, 300);
  };

  const handleSkip = () => {
    handleComplete();
  };

  if (!isVisible) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-background/80 backdrop-blur-sm animate-fade-in"
        onClick={handleSkip}
      />

      {/* Tour Card */}
      <div className="relative w-full max-w-lg mx-4 bg-card border border-border rounded-2xl shadow-2xl overflow-hidden animate-scale-in">
        {/* Progress Bar */}
        <div className="h-1 bg-muted">
          <div 
            className="h-full bg-primary transition-all duration-300"
            style={{ width: `${((currentStep + 1) / tourSteps.length) * 100}%` }}
          />
        </div>

        {/* Close Button */}
        <button
          onClick={handleSkip}
          className="absolute top-4 right-4 p-1 rounded-full hover:bg-muted transition-colors"
        >
          <X className="w-5 h-5 text-muted-foreground" />
        </button>

        {/* Content */}
        <div className="p-6">
          {/* Step Counter */}
          <div className="flex items-center gap-2 mb-4">
            <Badge variant="secondary" className="text-xs">
              Step {currentStep + 1} of {tourSteps.length}
            </Badge>
          </div>

          {/* Icon */}
          <div className="flex justify-center mb-4">
            <div className="w-16 h-16 rounded-full bg-muted/50 flex items-center justify-center">
              {step.icon}
            </div>
          </div>

          {/* Title & Description */}
          <div className="text-center mb-6">
            <h2 className="text-xl font-bold mb-2">{step.title}</h2>
            <p className="text-muted-foreground">{step.description}</p>
          </div>

          {/* Tips */}
          {step.tips && step.tips.length > 0 && (
            <div className="bg-muted/30 rounded-lg p-4 mb-6 space-y-2">
              {step.tips.map((tip, i) => (
                <div key={i} className="flex items-start gap-2 text-sm">
                  <span className="text-primary mt-0.5">•</span>
                  <span className={cn(
                    tip.startsWith('@') || tip.startsWith('#') || tip.startsWith('!')
                      ? "font-mono"
                      : ""
                  )}>
                    {tip}
                  </span>
                </div>
              ))}
            </div>
          )}

          {/* Step Dots */}
          <div className="flex justify-center gap-1.5 mb-6">
            {tourSteps.map((_, i) => (
              <button
                key={i}
                onClick={() => setCurrentStep(i)}
                className={cn(
                  "w-2 h-2 rounded-full transition-all",
                  i === currentStep 
                    ? "bg-primary w-6" 
                    : "bg-muted hover:bg-muted-foreground/30"
                )}
              />
            ))}
          </div>

          {/* Navigation */}
          <div className="flex items-center justify-between">
            <Button
              variant="ghost"
              onClick={handlePrev}
              disabled={isFirstStep}
              className="gap-1"
            >
              <ChevronLeft className="w-4 h-4" />
              Back
            </Button>

            <Button variant="ghost" onClick={handleSkip} className="text-muted-foreground">
              Skip Tour
            </Button>

            <Button onClick={handleNext} className="gap-1">
              {isLastStep ? 'Get Started' : 'Next'}
              {!isLastStep && <ChevronRight className="w-4 h-4" />}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

export function useOnboardingTour() {
  const [showTour, setShowTour] = useState(false);

  useEffect(() => {
    const completed = localStorage.getItem('gyaankosh_onboarding_complete');
    if (!completed) {
      // Delay to let the app load first
      const timer = setTimeout(() => setShowTour(true), 1000);
      return () => clearTimeout(timer);
    }
  }, []);

  const resetTour = () => {
    localStorage.removeItem('gyaankosh_onboarding_complete');
    setShowTour(true);
  };

  const completeTour = () => {
    setShowTour(false);
  };

  return { showTour, resetTour, completeTour };
}
