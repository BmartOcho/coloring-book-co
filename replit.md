# Photo-to-Coloring-Book Converter

## Overview

A web application that transforms regular photos into cartoon-style coloring book pages using AI. Users can upload images, convert them to line art suitable for coloring, and download the results. 

**Phase 2 (December 2025):** Added Story Builder MVP - users can now create personalized coloring story books after converting their image. Features include:
- Interactive mad-libs style story creation with AI-generated prompts
- 4 story types: Adventure, Hero's Tale, Explorer, Career/Dream Story
- 5 story sections with "Keep Writing" and "Redo Section" controls
- Complete story display with download option

**Phase 3 (December 2025):** Added paid coloring book generation:
- Stripe checkout integration for $45 coloring book purchases
- Background job system to generate 25-page illustrated books
- PDF assembly with pdf-lib for professional-quality output
- Email notification via Resend when books are ready
- Order status page with real-time progress tracking
- Secure download endpoint for completed books

The application features a child-friendly, playful interface inspired by Canva's image editor with a warm, approachable color palette.

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

**Form Handling**: React Hook Form with Zod resolvers for validation.

**Theme System**: Custom light/dark theme provider with localStorage persistence, though the application is optimized for light mode with the child-friendly color palette.

### Backend Architecture

**Server Framework**: Express.js with TypeScript running on Node.js.

**API Design**: RESTful endpoints with a single primary route (`POST /api/convert`) for image conversion.

**Request Processing**:
- Accepts base64-encoded images in JSON payloads
- Validates requests using Zod schemas
- Enforces 50MB size limit for uploaded images
- Returns both original and converted images as base64 data URLs

**Error Handling**: Centralized error handling with retry logic using p-retry for transient failures, particularly rate limit errors from the AI service.

**Static File Serving**: Production builds serve the React application from the `dist/public` directory with fallback to `index.html` for client-side routing.

**Development Mode**: Vite middleware integration for hot module replacement and development server features.

### Data Storage

**Storage Strategy**: PostgreSQL database with Drizzle ORM for persistent data storage.

**Database Tables**:
- `users`: Basic user management (for future use)
- `stories`: Story content with sections, character info, and completion status
- `stripe_products`, `stripe_prices`: Synced from Stripe for product catalog
- `orders`: Purchase records with status tracking (pending → paid → generating → completed)
- `book_pages`: Generated coloring book pages with image data

**File Storage**: Generated PDFs stored in `uploads/books/` directory, served via secure download endpoint.

### Authentication & Authorization

**Current State**: No authentication or authorization implemented. The application is designed as an open, public tool.

**Future Extensibility**: Infrastructure exists for user management (storage layer, user schema) to support authentication if needed.

## External Dependencies

### AI Image Processing

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

### AI Story Generation

**Service**: OpenAI Chat Completions via Replit's AI Integrations service.

**Model**: gpt-4.1-mini for story text generation.

**Story Generation Flow**:
1. `generateSectionPrompt()` - Creates mad-lib style prompts with 2-3 fill-in-the-blank slots
2. `generateSectionText()` - Generates 100-150 word story sections based on user inputs
3. Uses JSON response format for structured prompt data

**Story API Endpoints**:
- `POST /api/stories` - Create new story with character name, type, and image
- `GET /api/stories/:id` - Get story by ID
- `POST /api/stories/:id/generate-prompt` - Generate next section's mad-lib prompt
- `POST /api/stories/:id/submit-section` - Submit user inputs and generate story text
- `POST /api/stories/:id/redo-section` - Remove last section and allow regeneration

### Payment Processing (Stripe)

**Service**: Stripe via stripe-replit-sync with managed webhooks.

**Product**: Personalized Coloring Book at $45 USD (one-time purchase).

**Payment Flow**:
1. User completes story and clicks "Order Coloring Book"
2. Email collected, order created in database
3. Stripe Checkout session created with order metadata
4. User redirected to Stripe for payment
5. Webhook receives `checkout.session.completed` event
6. Order status updated, background job starts generation
7. 25 pages generated using OpenAI gpt-image-1
8. PDF assembled with pdf-lib
9. Email sent via Resend with download link

**Order API Endpoints**:
- `POST /api/orders/checkout` - Create checkout session (requires storyId, email)
- `GET /api/orders/:id` - Get order status with progress
- `POST /api/orders/:id/verify-payment` - Fallback payment verification
- `GET /api/downloads/:orderId` - Secure PDF download

### Email Notifications (Resend)

**Service**: Resend via Replit connection integration.

**Email Types**:
- Book ready notification with download link
- HTML template with gradient header, order details, and CTA button

### Build & Development Tools

**Build Pipeline**: Custom esbuild configuration bundling server code with selective dependency bundling to optimize cold start times.

**Dependency Bundling Strategy**: Allowlist approach bundles specific server dependencies (OpenAI, Express, Drizzle, etc.) while externalizing others to reduce syscalls.

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
- nanoid for unique ID generation

**Form & Validation**:
- Zod for schema validation and type safety
- React Hook Form for form state management
- @hookform/resolvers for Zod integration

**Icons**: Lucide React for consistent iconography.