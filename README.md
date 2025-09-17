# Product Page Reviewer

Analyzes product pages and provides UX feedback with conversion optimization insights. Built with React + Python FastAPI.

## Features

- **Smart Analysis** - Comprehensive heuristics engine analyzing 50+ conversion factors
- **AI Insights** - OpenAI-powered recommendations for UX improvements
- **Beautiful Visualizations** - Interactive charts showing performance breakdown
- **Mobile-First Design** - Responsive interface built with shadcn/ui
- **Real-time Results** - Fast analysis with progress tracking

## Quick Start

### Backend (Python FastAPI)
```bash
cd backend
python -m venv .venv
source .venv/bin/activate  # Windows: .venv\Scripts\activate
pip install -r requirements.txt
echo "OPENAI_API_KEY=your_key_here" > .env
uvicorn main:app --reload --port 8000
```

### Frontend (React + Vite)
```bash
cd frontend
npm install
npm run dev
```

Visit http://localhost:5173 to use the app!

## Architecture

- **Backend**: FastAPI + BeautifulSoup + OpenAI API
- **Frontend**: React 18 + TypeScript + Tailwind CSS + shadcn/ui
- **Analysis**: 50+ heuristics covering CTA effectiveness, trust signals, performance
- **Visualizations**: Recharts for interactive data display

## API Usage

```bash
curl -X POST http://localhost:8000/api/analyze \
  -H "Content-Type: application/json" \
  -d '{"url": "https://example.com/product/123"}'
```

## What It Analyzes

- **Core Metrics**: Title, headings, price, call-to-action placement
- **Trust Signals**: Reviews, testimonials, security badges, guarantees  
- **Visual Elements**: Image count, alt text coverage, gallery presence
- **Technical Performance**: Page size, script count, accessibility
- **Conversion Optimization**: CTA grouping, pricing proximity, urgency cues

## Development

### Running Tests
```bash
# Backend tests
cd backend && python test_heuristics.py

# Frontend build
cd frontend && npm run build
```

### Project Structure
```
├── backend/          # FastAPI server
│   ├── main.py      # API endpoints
│   ├── heuristic.py # Analysis engine
│   └── llm.py       # AI integration
└── frontend/         # React app
    ├── src/
    │   ├── App.tsx   # Main component
    │   └── components/ui/  # shadcn components
    └── package.json
```
