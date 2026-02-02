# ज्ञानकोष (Gyaankosh) - AI Document Knowledge Base

**ज्ञानकोष** (Gyaankosh, meaning "Treasury of Knowledge") is an AI-powered document knowledge base that lets you upload documents and interact with them using natural language in Hindi, English, or Hinglish. Features end-to-end encrypted messaging, smart mentions, RBAC, and enterprise-grade security.

## 🆚 ChatGPT vs Gyaankosh Comparison

| Feature | ChatGPT | Gyaankosh |
|---------|---------|-----------|
| **Document Upload** | ✅ Limited (paid) | ✅ Unlimited (PDF, DOCX, Images, Videos) |
| **Knowledge Base** | ❌ No persistent storage | ✅ Personal document library with semantic search |
| **Multi-Language** | ✅ Many languages | ✅ Hindi/English/Hinglish optimized |
| **Document Comparison** | ❌ Not available | ✅ AI-powered side-by-side analysis |
| **Chat History** | ✅ Basic | ✅ Sessions with export (PDF/DOCX/Markdown) |
| **Voice Input** | ✅ Mobile only | ✅ Browser-based, Hindi + English |
| **End-to-End Encryption** | ❌ Not available | ✅ RSA-OAEP + AES-GCM messaging |
| **Team Collaboration** | ❌ Enterprise only | ✅ Built-in with RBAC |
| **Smart Mentions** | ❌ Not available | ✅ @users, #documents, !APIs/Search |
| **Web Search** | ✅ Paid feature | ✅ Google & Bing integration (free) |
| **API Integrations** | ❌ Plugins (limited) | ✅ Custom API connections |
| **Group Chat E2EE** | ❌ Not available | ✅ Encrypted multi-participant chats |
| **Professional Templates** | ❌ Not available | ✅ Letters, Emails, Reports, Invoices |
| **Dynamic Signatures** | ❌ Not available | ✅ Auto-inserted based on context |
| **2FA Security** | ✅ Available | ✅ Microsoft Authenticator |
| **Activity Logs** | ❌ Limited | ✅ Detailed audit trail |
| **Organization RBAC** | ❌ Enterprise only | ✅ Role-based access control |
| **Onboarding Tour** | ❌ Not available | ✅ Interactive walkthrough |
| **Usage Limits** | Fixed plans | ✅ Configurable per organization |
| **Self-Hosted Option** | ❌ Not available | ✅ Full control |
| **Pricing** | $20/month+ | Free / Self-hosted |

## ✨ Features

### 📚 Document Management
- **Multi-Format Upload**: PDF, DOCX, DOC, TXT, images (JPG, PNG, WebP), videos (MP4, WebM, MOV)
- **📦 Batch Upload**: Multiple files with queue management (3 concurrent)
- **🔍 Advanced OCR**: Extract text from scanned documents with multilingual support
- **🏷️ AI-Generated Tags**: Automatic categorization and tagging
- **📊 Document Comparison**: Side-by-side AI analysis
- **🔗 Sharing**: Public links with view tracking
- **🌐 Whole Document Translation**: Translate entire documents (PDF, DOCX, etc.) while preserving formatting, layout, and indentation. Download as Word (.docx) ready for copy-paste

### 💬 AI Chat & Smart Mentions
- **🌐 Global Search**: Query across entire knowledge base
- **@ User Mentions**: Reference friends in conversations
- **# Document Mentions**: Link specific documents
- **! Web Search**: Query Google & Bing directly from chat
- **! API Mentions**: Query your custom API integrations
- **⚡ Semantic Search**: Vector embeddings for intelligent results
- **🎤 Voice Input**: Hindi and English speech-to-text
- **📝 FAQ Generation**: Auto-generate FAQs from documents
- **💡 AI Suggestions**: Follow-up question recommendations
- **🔤 Language Tools**: Translate, Paraphrase, and Grammar check with real-time streaming and proper error handling

### 🔐 E2E Encrypted Group Chat
- **👥 Multi-Participant**: Create groups with multiple members
- **🔐 Hybrid Encryption**: RSA-OAEP + AES-GCM per-group keys
- **🔄 Key Rotation**: Secure key distribution for new members
- **📎 Encrypted Files**: Share files securely in groups
- **👑 Admin Controls**: Add/remove members, manage group

### 📝 Professional Formatting & Templates
- **📄 Letter Templates**: Formal, resignation, recommendation, leave requests
- **📧 Email Templates**: Professional, follow-up, thank you, cold outreach
- **📊 Business Documents**: Invoices, memos, meeting notes, reports
- **🔤 Rich Text**: H1-H6 headings, tables, lists, code blocks
- **✍️ Dynamic Signatures**: Auto-inserted based on document type (max 3)
- **📋 DOCX Export**: Download any AI response as Word document

### 🔐 Security & Enterprise Features
- **👥 RBAC**: Role-based access (Admin, Moderator, User)
- **🏢 Organizations**: Multi-tenant team management
- **🔒 2FA**: Microsoft Authenticator support with backup codes
- **📊 Activity Logs**: Complete audit trail
- **🔑 API Integrations**: Connect external services
- **📈 Usage Limits**: Configurable per organization

### 💬 E2E Encrypted Direct Messaging
- **🔐 Hybrid Encryption**: RSA-OAEP + AES-GCM
- **📎 Encrypted Files**: Secure file sharing
- **🎤 Voice/Video Notes**: Encrypted media messages
- **✅ Read Receipts**: Sent → Delivered → Read
- **⌨️ Typing Indicators**: Real-time status
- **😀 Reactions**: Emoji reactions on messages

### 🎓 Onboarding Tour
New users are greeted with an interactive walkthrough covering:
- Document upload and management
- Smart mention system (@, #, !)
- Group chat with E2E encryption
- Keyboard shortcuts
- Settings and security

## ⌨️ Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Ctrl+N` | New Chat |
| `Ctrl+K` | Focus Search |
| `Ctrl+M` | Voice Input |
| `Ctrl+P` | Preview Document |
| `Ctrl+E` | Export Chat |
| `Ctrl+B` | Toggle Knowledge Base |
| `Ctrl+/` | Show Shortcuts & Mentions Guide |
| `Escape` | Close Dialog |

## 📝 Smart Mentions Guide

Type these triggers in the chat input:

| Trigger | Description | Examples |
|---------|-------------|----------|
| **@** | Mention a friend or colleague | `@john`, `@team` |
| **#** | Reference a document from knowledge base | `#report.pdf`, `#contract` |
| **!** | Web search or API integration | `!google AI trends`, `!bing weather`, `!api-name` |

### How Mentions Work
1. Type the trigger symbol (`@`, `#`, or `!`)
2. A tooltip appears showing what you can do
3. Type to filter suggestions
4. Press `Tab` or `Enter` to select
5. Continue typing your message

## 🛠️ Tech Stack

- **Frontend**: React 18, TypeScript, Vite
- **Styling**: Tailwind CSS, shadcn/ui
- **Backend**: Lovable Cloud (Supabase)
- **AI**: Google Gemini 3 Flash, Multi-model adaptive
- **Database**: PostgreSQL with pgvector
- **Encryption**: Web Crypto API (RSA-OAEP + AES-GCM)
- **Real-time**: Supabase Realtime

## 🚀 Getting Started

```sh
# Clone and install
git clone <YOUR_GIT_URL>
cd gyaankosh
npm install
npm run dev
```

## 📖 Usage

### Smart Mentions
Type these triggers in the chat input:
- **@username** - Mention a connected friend
- **#document** - Reference a specific document
- **!google** - Search the web via Google
- **!bing** - Search via Bing
- **!apiname** - Query your custom API integrations

### Web Search Integration
1. Type `!` in the chat input
2. Select "Google Search" or "Bing Search"
3. Type your query and send
4. Get AI-enhanced search results instantly

### Group Chat
1. Click the "Groups" button in the header
2. Create a new group and invite friends
3. All messages are E2E encrypted
4. Click "Groups" again to close the panel

### Document Templates
1. Open Settings → Signatures to set up your signatures
2. Ask AI: "Write a formal letter requesting leave"
3. AI auto-fills date, salutation, and your signature

### Document Translation
1. Click "Document Translation" button in chat interface
2. Upload your document (PDF, DOCX, DOC, TXT, MD)
3. Select source and target languages (English, Hindi, Hinglish)
4. Click "Translate Document" and wait for processing
5. Preview translated content and download as Word (.docx)
6. The downloaded document preserves formatting, layout, and structure
7. Ready for direct copy-paste into any Word document

### Settings & Security
- Click ⚙️ Settings in header
- **Profile**: Name, company, logo for templates
- **Signatures**: 3 types (formal, semi-formal, casual)
- **Security**: Enable 2FA, view backup codes
- **Integrations**: Add custom APIs
- **Activity**: View your action history
- **Admin** (test@genxai.com only): Universal KB access toggle

### Admin Controls
Only the admin user (test@genxai.com) can access the Admin tab in Settings:
- **Universal KB Access Toggle**: Enable/disable public access to knowledge base for all users
- Changes apply in real-time across all sessions via WebSocket
- No page refresh required - uses Supabase Realtime

### Onboarding Tour
- First-time users see an interactive tour automatically
- To replay: Clear localStorage key `gyaankosh_onboarding_complete`

## 🔒 Security

- **RLS Policies**: User-scoped data access
- **JWT Auth**: Secure token authentication
- **RBAC**: Role-based permissions
- **2FA**: TOTP-based second factor
- **E2E Encryption**: Messages never readable by server
- **Group Key Encryption**: Per-group AES keys wrapped with RSA
- **Audit Logs**: Complete activity tracking

## 🆕 Recent Updates

### Bug Fixes & Improvements
- **Fixed Language Tools Loading Issue**: Resolved stuck loading state in Translate, Paraphrase, and Grammar functions. Added proper request cancellation, timeout handling, and resource cleanup to prevent memory leaks.
- **Fixed Chat History Loading**: Fixed issue where old chats would show only loading state. Improved loading state management with synchronous clearing and proper race condition handling.
- **Fixed TypeScript Configuration**: Removed unnecessary vitest types reference from `tsconfig.app.json` to resolve compilation errors.

### New Features
- **Whole Document Translation**: 
  - Upload entire documents (PDF, DOCX, DOC, TXT, MD) and translate them while preserving formatting
  - Maintains paragraph structure, headings, lists, and indentation
  - Download translated content as formatted Word (.docx) documents
  - Supports Hindi, English, and Hinglish translations
  - Accessible via "Document Translation" button in chat interface
  - Similar to ChatGPT's document translation feature with formatting preservation

### Technical Improvements
- Enhanced error handling and timeout mechanisms for streaming responses
- Improved resource cleanup to prevent memory leaks
- Better loading state management across components
- Optimized document translation prompts for formatting preservation

## 📄 License

MIT License - Free for personal and commercial use.

---

Built with ❤️ using [Lovable](https://lovable.dev)
