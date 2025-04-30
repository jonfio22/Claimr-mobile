# Claimr

Claimr is a mobile-first RMA (Return Merchandise Authorization) automation system built for AV technicians and integrators. The platform provides intelligent claim management with AI-powered analysis and recommendations.

## 🚀 Technology Stack

- **Frontend**: Next.js 14, TypeScript, Tailwind CSS
- **Backend**: Next.js API Routes, Supabase
- **Database**: PostgreSQL (via Supabase)
- **Authentication**: Supabase Auth
- **UI Components**: Headless UI, Phosphor Icons
- **Camera Integration**: react-webcam
- **Date Handling**: dayjs
- **State Management**: React Hooks, Context API

## 📱 Features

### Core Features
- Mobile-first UI with responsive design
- Claim management system with status tracking
- Photo/evidence capture for claims
- Vendor communication system
- Equipment database integration
- Organization-specific learning and insights

### AI & Intelligence Features
- MCP7 Intelligence Layer for claim analysis
- Anomaly detection in claim patterns
- Intelligent recommendations based on claim context
- Organization-Scoped Learning Vaults
- Super Agent orchestration system for intelligent task routing

## 🏗️ Project Structure

```
claimr-mobile/             # Next.js application
├── src/
│   ├── app/               # App router pages
│   ├── components/        # Shared UI components
│   └── lib/               # Utility functions
│
lib/                       # Core platform libraries
├── agent/                 # Super Agent orchestration layer
├── linker/                # MCPLinker Mini for tool integration
├── mcp/                   # MCP7 Intelligence tools
├── org/                   # Organization-scoped learning vaults
└── supabase/              # Supabase client and utilities
 
pages/                     # API routes
└── api/
    ├── agent/             # Agent API endpoints
    └── org/               # Organization API endpoints

schemas/                   # Database schemas
```

## 🧠 MCP7 Intelligence Layer

The MCP7 Intelligence Layer includes several components:

- **Memory Tracker**: Records user interactions and claim history
- **Context Builder**: Assembles relevant context for decisions
- **Anomaly Detector**: Identifies unusual patterns in claims
- **Recommendation Engine**: Generates smart recommendations
- **Org Learning Vault**: Stores organization-specific insights

## 👨‍💻 Super Agent Orchestration

The Super Agent system coordinates the MCP7 tools through:

- **Agent Router**: Intelligent routing to appropriate tools
- **Toolchain Registry**: Registered tools with schemas
- **A2A Adapter**: Agent-to-Agent communication protocol

## 🗄️ Database Schema

The application uses Supabase with the following main tables:

- `claims`: Core claim information
- `messages`: Communication related to claims
- `equipment`: Equipment database
- `vendors`: Vendor information
- `organizations`: Organization profiles
- `org_vaults`: Organization learning storage
- `org_behaviors`: Learned organizational patterns
- `linker_tools`: Tool registry for MCPLinker
- `linker_schemas`: Schema definitions for tools

## 🚦 Getting Started

### Prerequisites

- Node.js 18+
- npm or yarn
- Supabase account

### Installation

1. Clone the repository:
   ```
   git clone https://github.com/yourusername/claimr.git
   cd claimr
   ```

2. Install dependencies:
   ```
   npm install
   ```

3. Set up environment variables:
   ```
   cp .env.example .env.local
   ```
   Edit `.env.local` with your Supabase credentials.

4. Run the development server:
   ```
   npm run dev
   ```

5. Open [http://localhost:3000](http://localhost:3000) in your browser.

## 📊 Current Status

The project has implemented:

- ✅ Core application structure with Next.js and Tailwind
- ✅ Supabase database integration
- ✅ MCP7 Intelligence Layer components
- ✅ Organization-Scoped Learning Vaults
- ✅ MCPLinker Mini for tool registration
- ✅ Super Agent orchestration layer
- ✅ Agent API endpoints
- ✅ Mobile dashboard UI
- ✅ Agent demonstration UI

## 📝 License

[MIT](LICENSE)
