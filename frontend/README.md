# Product Page Reviewer - Frontend

A modern React frontend for analyzing product pages with UX insights and conversion optimization recommendations.

## Features

- **Clean, Minimal UI** - Built with React + TypeScript + shadcn/ui
- **Real-time Analysis** - Submit any product URL for instant feedback
- **Interactive Visualizations** - Charts and graphs powered by Recharts
- **Responsive Design** - Works perfectly on mobile and desktop
- **Accessibility First** - Full keyboard navigation and screen reader support

## Tech Stack

- **React 18** with TypeScript
- **Vite** for fast development and building
- **Tailwind CSS** for styling
- **shadcn/ui** for component library
- **Recharts** for data visualization
- **Lucide React** for icons

## Development

```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Build for production
npm run build

# Preview production build
npm run preview
```

## API Integration

The frontend connects to the backend API at `http://localhost:8000/api/analyze` and expects:

```json
{
  "url": "https://example.com/product/123",
  "heuristics": {
    "title": "Product Title",
    "h1": "Main Heading",
    "price": "$49.99",
    "cta": "Add to Cart",
    "conversion_scores": {
      "overall_score": 7.2,
      "value_proposition_clarity": 8,
      "cta_effectiveness": 6,
      "trust_social_proof": 7,
      "visual_imagery": 8,
      "technical_performance": 9
    }
  },
  "llm_report": {
    "summary": "Analysis summary...",
    "top_issues": ["Issue 1", "Issue 2"],
    "quick_wins": ["Win 1", "Win 2"],
    "prioritized_actions": [...]
  }
}
```

## Components

- **App.tsx** - Main application component
- **ui/button.tsx** - Reusable button component
- **ui/card.tsx** - Card layout components
- **ui/input.tsx** - Form input component
- **ui/progress.tsx** - Progress bar component

## Styling

Uses Tailwind CSS with custom design tokens and shadcn/ui component styling. Supports both light and dark modes automatically based on system preference.