# Design Guidelines: Photo-to-Coloring-Book Converter

## Design Approach
**Reference-Based:** Inspired by Canva's image editor and Adobe's online conversion tools - simple upload interfaces with clear before/after displays. Child-friendly aesthetic with playful, approachable design.

## Color Palette
- **Primary:** #FF6B6B (warm coral) - CTAs, buttons, active states
- **Secondary:** #4ECDC4 (turquoise) - accents, icons, interactive elements
- **Background:** #FAFAFA (off-white) - main canvas
- **Text:** #2C3E50 (dark slate) - primary text
- **Accent:** #FFE66D (sunny yellow) - highlights, fun touches
- **Success:** #95E1D3 (mint) - success states, confirmation feedback

## Typography
- **Primary Font:** Poppins (headings, buttons, labels)
- **Secondary Font:** Inter (body text, descriptions, UI text)
- **Hierarchy:**
  - H1: Poppins 600, 2.5rem (main heading)
  - H2: Poppins 600, 1.75rem (section headings)
  - Body: Inter 400, 1rem (instructions, labels)
  - Button: Poppins 500, 1rem (CTAs)

## Layout System
**Spacing:** Tailwind units of 4, 6, 8, 12, 16 for consistent rhythm
- Container: max-w-7xl with centered content
- Section padding: py-12 to py-16
- Component spacing: gap-6 to gap-8
- Generous whitespace throughout for child-friendly feel

## Core Components

### Upload Zone
- Centered dashed border (2px, coral #FF6B6B with 50% opacity)
- Large dropzone area (min-height: 400px)
- Upload icon (cloud with arrow, turquoise)
- "Drag & drop your photo here" primary text
- "or click to browse" secondary text
- Rounded corners: 12px throughout
- Hover state: background tint of coral (5% opacity)

### Before/After Display
- Side-by-side layout on desktop (grid-cols-2)
- Stacked on mobile (grid-cols-1)
- Equal-width image containers with 12px rounded corners
- Subtle shadow: shadow-lg for depth
- Labels above each image ("Original Photo" / "Coloring Book Version")
- Both images maintain aspect ratio with object-fit

### Action Buttons
- Primary CTA (coral): "Convert to Coloring Book" - full width on mobile, inline on desktop
- Download button (turquoise): appears after conversion with download icon
- Soft shadows for elevation
- 12px border radius
- Poppins medium weight text

### Loading State
- Centered spinner with turquoise color
- "Creating your coloring book..." text in slate
- Playful crayon/pencil icon animation

### Success Feedback
- Mint background toast notification
- Checkmark icon
- "Ready to download!" message

## Design Details
- All corners: 12px radius for consistency
- Soft shadows: `shadow-md` for cards, `shadow-lg` for elevated elements
- Generous padding: p-6 to p-8 for cards and containers
- Icons: Heroicons or similar, sized at 24px-32px for primary actions
- Smooth transitions: 200ms ease for hover states

## Images
No hero image needed - this is a utility tool focused on the upload/conversion workflow. The interface should be clean and functional with the upload zone as the visual focal point.