# FleetOS

**Smart Fleet Coordination & Logistics Management Platform**

FleetOS is a full-stack fleet management system designed for real-time vehicle tracking, intelligent shipment allocation, and multi-role operational control. It provides dedicated workspaces for administrators, dispatchers, drivers, and customers — each tailored to their specific workflow requirements.

---

## Table of Contents

- [Overview](#overview)
- [Architecture](#architecture)
- [Key Features](#key-features)
- [Tech Stack](#tech-stack)
- [Getting Started](#getting-started)
- [Project Structure](#project-structure)
- [API Reference](#api-reference)
- [Environment Variables](#environment-variables)
- [Team](#team)
- [License](#license)

---

## Overview

FleetOS addresses the core operational challenges of fleet logistics: vehicle tracking, shipment lifecycle management, driver assignment, and route optimization. The platform implements role-based access control (RBAC) with four distinct user roles, each with a purpose-built interface.

| Role | Workspace | Capabilities |
|------|-----------|-------------|
| **Administrator** | Admin Portal | System management, user oversight, fleet analytics, configuration |
| **Dispatcher** | Command Center | Real-time fleet map, shipment creation, vehicle-driver allocation, route planning |
| **Driver** | Driver Workspace | Active route view, shipment status updates, proof-of-delivery capture |
| **Customer** | Customer Portal | Shipment tracking, delivery status monitoring |

---

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                     Frontend (Vite + React)              │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌────────────┐  │
│  │  Admin   │ │Dispatcher│ │  Driver  │ │  Customer  │  │
│  │  Portal  │ │ Command  │ │Workspace │ │   Portal   │  │
│  │          │ │  Center  │ │          │ │            │  │
│  └────┬─────┘ └────┬─────┘ └────┬─────┘ └─────┬──────┘  │
│       └─────────────┴────────────┴─────────────┘         │
│                         │                                │
│              WebSocket + REST API Calls                   │
└─────────────────────────┬───────────────────────────────┘
                          │
┌─────────────────────────┴───────────────────────────────┐
│                   Backend (Express.js)                    │
│                                                          │
│  ┌──────────┐  ┌──────────┐  ┌───────────────────────┐  │
│  │   Auth   │  │  Fleet   │  │  Allocation Engine    │  │
│  │  + OTP   │  │ Tracking │  │  (Greedy Nearest)     │  │
│  └──────────┘  └──────────┘  └───────────────────────┘  │
│  ┌──────────┐  ┌──────────┐  ┌───────────────────────┐  │
│  │Shipments │  │  Routes  │  │  OSRM Route Optimizer │  │
│  │Lifecycle │  │ + Multi  │  │  + Haversine Fallback │  │
│  └──────────┘  └──────────┘  └───────────────────────┘  │
│                                                          │
│  Socket.IO (Real-time GPS)    SQLite (sql.js)            │
│  Firebase Admin (Google Auth) Nodemailer (OTP via SMTP)  │
└──────────────────────────────────────────────────────────┘
```

---

## Key Features

### Real-Time Fleet Tracking
- Live GPS position broadcasting via WebSocket (Socket.IO)
- Interactive map interface powered by Leaflet with dark tile layers
- Vehicle status monitoring (available, en route, maintenance, idle)

### Intelligent Allocation Engine
- Greedy nearest-vehicle allocation algorithm
- Filters by vehicle type compatibility, weight capacity, and availability
- Batch allocation with priority-based ordering (urgent, high, medium, low)
- Distance-ranked candidate scoring using Haversine formula

### Route Optimization
- OSRM integration for real-world driving routes with polyline geometry
- Multi-stop route planning using nearest-neighbor ordering
- Automatic Haversine fallback when OSRM is unavailable
- Fuel cost estimation by vehicle and fuel type (diesel, petrol, electric, CNG)

### Shipment Lifecycle Management
- Full status tracking: pending, allocated, picked up, in transit, delivered, cancelled
- Enforced state machine transitions
- Proof-of-delivery image capture
- Shipment tracking tokens for customer-facing visibility

### Authentication & Security
- JWT-based authentication with role-based access control
- Email OTP verification via SMTP (Nodemailer)
- Google OAuth integration via Firebase
- Helmet.js security headers with strict CSP directives
- Rate limiting on authentication endpoints
- bcrypt password hashing

### Role-Based Workspaces
- Dedicated UI for each role with contextual data and controls
- Administrator access restricted to sign-in only (no self-registration)
- Cinematic onboarding flow with role selection

---

## Tech Stack

### Frontend
| Technology | Purpose |
|---|---|
| React 19 | UI framework |
| TypeScript | Type safety |
| Vite 8 | Build tooling and dev server |
| Tailwind CSS 4 | Utility-first styling |
| Leaflet + React Leaflet | Interactive map rendering |
| Framer Motion | Page transitions and animations |
| Socket.IO Client | Real-time data streaming |
| Firebase SDK | Google OAuth client |
| Lucide React | Icon system |

### Backend
| Technology | Purpose |
|---|---|
| Node.js + Express | API server |
| SQLite (sql.js) | Embedded database (zero-config) |
| Socket.IO | Real-time GPS event broadcasting |
| JWT (jsonwebtoken) | Token-based authentication |
| Firebase Admin SDK | Google OAuth token verification |
| Nodemailer | OTP email delivery via SMTP |
| OSRM | Open-source routing engine integration |
| Helmet | HTTP security headers |
| Joi | Request payload validation |
| bcryptjs | Password hashing |

---

## Getting Started

### Prerequisites

- **Node.js** v18 or later
- **npm** v9 or later

### Installation

1. **Clone the repository**

   ```bash
   git clone https://github.com/adityarajIITj/FLEETOS.git
   cd fleetos
   ```

2. **Install dependencies**

   ```bash
   # Backend
   cd backend
   npm install

   # Frontend
   cd ../frontend-app
   npm install
   ```

3. **Configure environment variables**

   ```bash
   cp .env.example backend/.env
   ```

   Edit `backend/.env` and set the required values. Refer to the [Environment Variables](#environment-variables) section.

4. **Seed the database**

   ```bash
   npm run seed
   ```

5. **Start development servers**

   ```bash
   # From project root
   npm run backend:dev     # API server on http://localhost:3000
   npm run frontend:dev    # Vite dev server on http://localhost:5173
   ```

6. **Open the application**

   Navigate to `http://localhost:5173` in your browser.

### Demo Credentials

| Role | Email | Password |
|------|-------|----------|
| Administrator | `admin@fleetos.io` | `password123` |
| Dispatcher | `rajesh@fleetos.io` | `password123` |
| Driver | `arun@fleetos.io` | `password123` |

---

## Project Structure

```
fleetos/
├── backend/
│   ├── data/                       # SQLite database file (gitignored)
│   ├── scripts/
│   │   ├── gps-simulator.js        # GPS position simulator for testing
│   │   └── reconcile.js            # Data reconciliation utility
│   ├── src/
│   │   ├── algorithms/
│   │   │   ├── allocator.js        # Greedy nearest-vehicle allocation
│   │   │   ├── haversine.js        # Distance and ETA calculations
│   │   │   └── routeOptimizer.js   # OSRM routing with fallback
│   │   ├── cache/
│   │   │   └── memoryCache.js      # In-memory caching layer
│   │   ├── config/
│   │   │   ├── constants.js        # Roles, statuses, fuel costs
│   │   │   └── database.js         # SQLite initialization and schema
│   │   ├── middleware/
│   │   │   └── auth.js             # JWT verification and RBAC middleware
│   │   ├── realtime/
│   │   │   ├── eventBus.js         # Internal event emitter
│   │   │   └── socketManager.js    # Socket.IO server configuration
│   │   ├── seeds/
│   │   │   └── seed.js             # Database seeding script
│   │   ├── services/
│   │   │   ├── allocation/         # Vehicle-shipment allocation API
│   │   │   ├── auth/               # Authentication and OTP routes
│   │   │   ├── fleet/              # Vehicle management API
│   │   │   ├── routes/             # Route computation API
│   │   │   ├── shipments/          # Shipment CRUD and lifecycle API
│   │   │   └── users/              # User management API
│   │   └── server.js               # Express application entry point
│   └── uploads/                    # Proof-of-delivery images (gitignored)
│
├── frontend-app/
│   ├── public/
│   │   └── assets/                 # Static media (intro video, images)
│   └── src/
│       ├── components/
│       │   ├── DriverVehicleAllocationPanel.tsx
│       │   ├── FleetMap.tsx         # Leaflet map component
│       │   └── TransitionPanel.tsx
│       ├── hooks/
│       │   ├── useAuth.tsx          # Authentication context and hooks
│       │   └── useTheme.tsx         # Theme context
│       ├── lib/
│       │   ├── api.ts              # API client utilities
│       │   ├── firebase.ts         # Firebase client configuration
│       │   └── socket.ts           # Socket.IO client setup
│       ├── pages/
│       │   ├── AdminPortal.tsx      # Administrator workspace
│       │   ├── CommandCenter.tsx    # Dispatcher workspace
│       │   ├── CustomerPortal.tsx   # Customer tracking interface
│       │   ├── DriverWorkspace.tsx  # Driver active route interface
│       │   ├── OnboardingStory.tsx  # Onboarding and authentication flow
│       │   └── RoleSelect.tsx       # Role selection screen
│       ├── App.tsx                  # Root component with role-based routing
│       └── main.tsx                 # Application entry point
│
├── frontend/                       # Legacy static HTML frontend
├── package.json                    # Root-level scripts
├── .env.example                    # Environment variable template
└── .gitignore
```

---

## API Reference

All endpoints are prefixed with `/api/v1`.

### Authentication
| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/auth/login` | Authenticate with email and password, triggers OTP |
| `POST` | `/auth/register` | Register a new user account |
| `POST` | `/auth/verify-otp` | Verify OTP code and receive JWT |
| `POST` | `/auth/google` | Authenticate via Google OAuth token |

### Fleet Management
| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/fleet/vehicles` | List all vehicles with current status |
| `POST` | `/fleet/vehicles` | Register a new vehicle |
| `PATCH` | `/fleet/vehicles/:id` | Update vehicle details or status |
| `POST` | `/fleet/gps` | Submit GPS position update |

### Shipments
| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/shipments` | List shipments (filtered by role) |
| `POST` | `/shipments` | Create a new shipment |
| `PATCH` | `/shipments/:id/status` | Transition shipment status |
| `GET` | `/shipments/track/:token` | Public shipment tracking by token |

### Allocation
| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/allocation/auto` | Auto-allocate vehicle to shipment |
| `POST` | `/allocation/batch` | Batch-allocate multiple shipments |

### Routes
| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/routes/compute` | Compute optimal route between points |
| `POST` | `/routes/multi-stop` | Compute multi-stop optimized route |

### Health
| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/health` | Server health check |

---

## Environment Variables

Create a `backend/.env` file based on `.env.example`:

| Variable | Description | Required |
|----------|-------------|----------|
| `PORT` | API server port | No (default: `3000`) |
| `JWT_SECRET` | Secret key for JWT signing | Yes |
| `JWT_EXPIRY` | Token expiration duration | No (default: `24h`) |
| `OSRM_BASE_URL` | OSRM routing server URL | No (default: public OSRM) |
| `SMTP_USER` | Email address for OTP delivery | Yes |
| `SMTP_PASS` | SMTP app password | Yes |
| `FIREBASE_API_KEY` | Firebase client API key | Yes (for Google Auth) |
| `FIREBASE_AUTH_DOMAIN` | Firebase auth domain | Yes |
| `FIREBASE_PROJECT_ID` | Firebase project identifier | Yes |
| `FIREBASE_CLIENT_EMAIL` | Firebase service account email | Yes |
| `FIREBASE_PRIVATE_KEY` | Firebase service account private key | Yes |

---

## Team

### Core Team

| Name | Role | GitHub |
|------|------|--------|
| Aditya | Team Lead | [github.com/adityarajIITj](https://github.com/adityarajIITj) |
| Divyansh | Member | [github.com/divyanshsharma24-git](https://github.com/divyanshsharma24-git) |
| Atharv | Member | [github.com/fratharv](https://github.com/fratharv) |
| Piyush | Member | — |
| Drishti | Member | — |
| Chirag | Member | — |

---

## License

This project is developed as part of a hackathon. All rights reserved by the contributors.
