# Photo-to-Coloring-Book Converter

## Overview

A web application that transforms regular photos into cartoon-style coloring book pages using AI. Users can upload images and download converted versions suitable for coloring.

The application features a child-friendly, playful interface with a warm, approachable color palette.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture

**Framework**: React 18 with TypeScript, using Vite as the build tool and development server.

**Routing**: Wouter for lightweight client-side routing with a single-page application structure.

**UI Component Library**: Shadcn/ui components built on Radix UI primitives, providing accessible, customizable components following a "new-york" style theme.

**Styling**: Tailwind CSS with custom design tokens for the child-friendly aesthetic:
- Primary color: Coral (#FF6B6B) for CTAs and active states
- Secondary color: Turquoise (#4ECDC4) for accents
- Typography: Poppins for headings, Inter for body text
- Rounded corners (12px) throughout for approachable feel
- Generous whitespace and spacing (Tailwind units: 4, 6, 8, 12, 16)

**State Management**: TanStack Query (React Query) for server state management with custom query client configuration. Toast notifications for user feedback via Shadcn toast component.

**Theme System**: Custom light/dark theme provider with localStorage persistence, though the application is optimized for light mode with the child-friendly color palette.

### Backend Architecture

**Server Framework**: Express.js with TypeScript running on Node.js.

**API Design**: RESTful endpoint for image conversion.

**Request Processing**:
- Accepts base64-encoded images in JSON payloads
- Validates requests using Zod schemas
- Enforces 50MB size limit for uploaded images
- Returns both original and converted images as base64 data URLs

**Error Handling**: Centralized error handling with retry logic using p-retry for transient failures, particularly rate limit errors from the AI service.

**Static File Serving**: Production builds serve the React application from the `dist/public` directory with fallback to `index.html` for client-side routing.

**Development Mode**: Vite middleware integration for hot module replacement and development server features.

### External Dependencies

#### AI Image Processing

**Service**: OpenAI's image editing API via Replit's AI Integrations service.

**Model**: gpt-image-1 for photo-to-line-art conversion.

**API Configuration**:
- Base URL: `process.env.AI_INTEGRATIONS_OPENAI_BASE_URL`
- API Key: `process.env.AI_INTEGRATIONS_OPENAI_API_KEY`
- Uses Replit's managed OpenAI integration (no direct OpenAI API key required)

**Image Processing Parameters**:
- Input: PNG, WebP, or JPG files up to 50MB
- Output: PNG format with opaque background
- Prompt engineering: Carefully crafted prompt to generate clean, cartoon-style line art with bold outlines, simplified details, and high contrast suitable for children's coloring

**Error Handling**: Implements retry logic with exponential backoff for rate limit errors (429 status codes) and quota violations.

### Build & Development Tools

**Build Pipeline**: Custom esbuild configuration bundling server code with selective dependency bundling to optimize cold start times.

**Dependency Bundling Strategy**: Allowlist approach bundles specific server dependencies (OpenAI, Express, etc.) while externalizing others to reduce syscalls.

**Development Plugins**:
- Replit Cartographer for code navigation
- Replit Dev Banner for development mode indicators
- Runtime error overlay for better debugging

### Third-Party Libraries

**UI Components**: Comprehensive Radix UI component suite (@radix-ui/*) for accessible primitives.

**Utilities**:
- clsx and tailwind-merge (via cn utility) for conditional styling
- class-variance-authority for component variant management
- date-fns for date manipulation

**Form & Validation**:
- Zod for schema validation and type safety
- React Hook Form for form state management
- @hookform/resolvers for Zod integration

**Icons**: Lucide React for consistent iconography.
