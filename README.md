# 🚀 Real-Time Chat Application

A full-stack, production-ready chat application built with modern technologies and best practices.

## 📋 Table of Contents

- [Features](#features)
- [Tech Stack](#tech-stack)
- [Project Structure](#project-structure)
- [Quick Start](#quick-start)
- [Development](#development)
- [Deployment](#deployment)
- [API Documentation](#api-documentation)

## ✨ Features

### Core Features
- 💬 **Real-time messaging** with Socket.IO
- 👥 **Group chats** with role-based permissions
- 📁 **File sharing** with drag & drop support
- 🔍 **Message search** with full-text search
- 📱 **Responsive design** for all devices
- 🌙 **Dark/Light mode** support

### Advanced Features
- 🔐 **End-to-end encryption** for secure messaging
- 📞 **Voice & Video calls** with WebRTC
- 📅 **Scheduled messages** for future delivery
- 🔔 **Push notifications** for real-time alerts
- 📊 **Analytics dashboard** for insights
- 🔒 **Two-factor authentication** for security

### Technical Features
- 🏗️ **Monorepo architecture** with Turborepo
- 🔄 **Real-time synchronization** across devices
- 📈 **Horizontal scaling** with Redis clustering
- 🐳 **Docker deployment** with monitoring
- 🧪 **Comprehensive testing** suite
- 📝 **TypeScript** for type safety

## 🛠️ Tech Stack

### Frontend
- **Next.js 14** - React framework with App Router
- **TypeScript** - Type-safe JavaScript
- **Tailwind CSS** - Utility-first CSS framework
- **Socket.IO Client** - Real-time communication
- **Zustand** - State management
- **React Query** - Server state management

### Backend
- **Node.js** - JavaScript runtime
- **Express.js** - Web application framework
- **Socket.IO** - Real-time bidirectional communication
- **PostgreSQL** - Primary database
- **Prisma** - Database ORM
- **Redis** - Caching and session storage

### DevOps & Tools
- **Turborepo** - Monorepo build system
- **Docker** - Containerization
- **Docker Compose** - Multi-container orchestration
- **Prometheus** - Metrics collection
- **Grafana** - Monitoring dashboards
- **Nginx** - Reverse proxy and load balancer

## 📁 Project Structure

```
chat-app/
├── apps/
│   ├── client/                 # Next.js frontend application
│   │   ├── src/
│   │   │   ├── app/           # Next.js App Router pages
│   │   │   ├── components/    # React components
│   │   │   ├── lib/           # Client utilities
│   │   │   └── types/         # TypeScript types
│   │   └── package.json
│   └── server/                # Node.js backend application
│       ├── src/
│       │   ├── routes/        # API routes
│       │   ├── middleware/    # Express middleware
│       │   ├── socket/        # Socket.IO handlers
│       │   ├── config/        # Configuration files
│       │   └── utils/         # Server utilities
│       └── package.json
├── packages/
│   ├── shared/                # Shared utilities and types
│   │   ├── src/
│   │   │   ├── types/         # Shared TypeScript types
│   │   │   ├── utils/         # Shared utility functions
│   │   │   ├── constants/     # Application constants
│   │   │   └── schemas/       # Validation schemas
│   │   └── package.json
│   └── database/              # Database configuration and schemas
│       ├── prisma/
│       │   └── schema.prisma  # Prisma database schema
│       ├── src/
│       │   ├── client.ts      # Prisma client configuration
│       │   └── types.ts       # Database types
│       └── package.json
├── docker-compose.yml         # Development environment
├── turbo.json                 # Turborepo configuration
└── package.json               # Root package.json
```

## 🚀 Quick Start

### Prerequisites

- **Node.js** 18+ 
- **npm** or **yarn**
- **PostgreSQL** 14+
- **Redis** 6+
- **Docker** (optional, for containerized development)

### Installation

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd real-time-chat-application
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Set up environment variables**
   ```bash
   cp .env.example .env
   # Edit .env with your configuration
   ```

4. **Set up the database**
   ```bash
   # Start PostgreSQL and Redis (if using Docker)
   docker-compose up -d postgres redis
   
   # Run database migrations
   npm run db:migrate
   
   # Seed the database (optional)
   npm run db:seed
   ```

5. **Build packages**
   ```bash
   npm run build
   ```

6. **Start development servers**
   ```bash
   npm run dev
   ```

The application will be available at:
- **Frontend**: http://localhost:3000
- **Backend API**: http://localhost:4000
- **Socket.IO**: http://localhost:4000

## 💻 Development

### Available Scripts

```bash
# Development
npm run dev              # Start all development servers
npm run dev:client       # Start only the client
npm run dev:server       # Start only the server

# Building
npm run build            # Build all packages
npm run build:client     # Build only the client
npm run build:server     # Build only the server

# Testing
npm run test             # Run all tests
npm run test:watch       # Run tests in watch mode
npm run test:coverage    # Run tests with coverage

# Database
npm run db:generate      # Generate Prisma client
npm run db:migrate       # Run database migrations
npm run db:seed          # Seed the database
npm run db:studio        # Open Prisma Studio

# Linting & Formatting
npm run lint             # Lint all packages
npm run lint:fix         # Fix linting issues
npm run type-check       # Run TypeScript type checking

# Docker
npm run docker:dev       # Start development environment
npm run docker:prod      # Start production environment
```

### Development Workflow

1. **Start the development environment**
   ```bash
   npm run docker:dev  # Starts PostgreSQL, Redis, and other services
   npm run dev         # Starts the development servers
   ```

2. **Make your changes**
   - Frontend changes in `apps/client/`
   - Backend changes in `apps/server/`
   - Shared code in `packages/shared/`

3. **Test your changes**
   ```bash
   npm run test
   npm run lint
   npm run type-check
   ```

4. **Build and verify**
   ```bash
   npm run build
   ```

### Environment Variables

Create a `.env` file in the root directory:

```env
# Database
DATABASE_URL="postgresql://postgres:password@localhost:5432/chatapp"
REDIS_URL="redis://localhost:6379"

# Server
PORT=4000
NODE_ENV=development
JWT_SECRET="your-secret-key"

# Client
CLIENT_URL="http://localhost:3000"
NEXT_PUBLIC_API_URL="http://localhost:4000"
NEXT_PUBLIC_SOCKET_URL="http://localhost:4000"
```

## 🐳 Deployment

### Docker Deployment

1. **Build and start the production environment**
   ```bash
   npm run docker:prod
   ```

2. **The application will be available at:**
   - **Application**: http://localhost
   - **Grafana Dashboard**: http://localhost:3001
   - **Prometheus**: http://localhost:9090

### Manual Deployment

1. **Build the application**
   ```bash
   npm run build
   ```

2. **Set up production environment variables**

3. **Start the production servers**
   ```bash
   npm run start:server  # Start the backend
   npm run start:client  # Start the frontend
   ```

## 📚 API Documentation

The API documentation is available at:
- **Development**: http://localhost:4000/api/docs
- **Production**: https://your-domain.com/api/docs

### Key Endpoints

- `GET /api/health` - Health check
- `POST /api/auth/login` - User authentication
- `GET /api/conversations` - Get user conversations
- `POST /api/messages` - Send a message
- `GET /api/users/profile` - Get user profile

### Socket.IO Events

#### Client to Server
- `message:send` - Send a message
- `typing:start` - Start typing indicator
- `typing:stop` - Stop typing indicator
- `conversation:join` - Join a conversation
- `conversation:leave` - Leave a conversation

#### Server to Client
- `message:new` - New message received
- `typing:start` - User started typing
- `typing:stop` - User stopped typing
- `user:online` - User came online
- `user:offline` - User went offline

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- Built with modern web technologies
- Inspired by popular chat applications
- Community-driven development

---

**Happy Coding! 🎉**
