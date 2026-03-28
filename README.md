# UrbanOps — Smart City Operations Platform

A real-time city operations dashboard that unifies traffic, transit, incidents, and weather data into a single live map for Chicago. Built with an event-driven microservices architecture, it detects disruptions early, predicts their impact using GPT-4o, and recommends phased response plans for city operators.

## Features

- **Live Mapbox 3D Map** — Full-screen dark-themed map of Chicago with 3D buildings, centered on the Loop
- **4 Real-Time Data Layers** — Traffic congestion (color-coded roads), CTA bus/train positions, incident markers (pulsing by severity), and weather conditions
- **AI-Powered Analysis** — GPT-4o analyzes medium+ severity incidents and generates actionable recommendations with confidence scores
- **Response Plan Generator** — Click "PLAN" on any incident to get a detailed, phased response plan with assigned units, resources, alternate routes, and public communications
- **Palantir-Style HUD** — Glassmorphic floating panels, cyan accent system, JetBrains Mono font, scanline overlays, military-grade operations center aesthetic
- **Event Stream** — Live scrolling feed of all city events with type tags and severity indicators
- **Incident Panel** — Sorted by severity, clickable to filter AI recommendations, with status badges

## Architecture

```
Frontend (Next.js) <-- WebSocket --> Stream Processor <-- Redis Pub/Sub --> Simulator
                                                      <-- Redis Pub/Sub --> LLM Analyst
```

| Service | Tech | Port | Role |
|---------|------|------|------|
| **Simulator** | FastAPI | 8010 | Generates realistic Chicago traffic, transit, incident, and weather events |
| **Stream Processor** | FastAPI | 8011 | Subscribes to Redis, maintains city state, serves WebSocket + REST |
| **LLM Analyst** | FastAPI + OpenAI | 8012 | Analyzes incidents via GPT-4o, publishes recommendations + generates plans |
| **Frontend** | Next.js + Mapbox GL | 3001 | Palantir-style operations dashboard |
| **Redis** | Redis 7 | 6379 | Pub/Sub message broker between services |

## Tech Stack

**Backend:** Python 3.11, FastAPI, Redis Pub/Sub, OpenAI GPT-4o, Pydantic
**Frontend:** Next.js 16, React 19, Mapbox GL JS, Tailwind CSS v4, TypeScript
**Infrastructure:** Docker Compose, Redis Alpine
**Fonts:** JetBrains Mono, Outfit

## Prerequisites

- Python 3.11+
- Node.js 20+
- Redis
- Mapbox access token ([get one free](https://account.mapbox.com/))
- OpenAI API key

## Setup

### 1. Clone and configure

```bash
git clone https://github.com/ashcastelinocs124/UrbanOps.git
cd UrbanOps
cp .env.example .env
```

Edit `.env` and add your keys:
```env
REDIS_URL=redis://localhost:6379
MAPBOX_TOKEN=pk.your_token_here
NEXT_PUBLIC_MAPBOX_TOKEN=pk.your_token_here
NEXT_PUBLIC_WS_URL=ws://localhost:8011/ws
OPENAI_API_KEY=sk-your_key_here
```

### 2. Install dependencies

```bash
# Backend (from project root)
pip install -r services/simulator/requirements.txt
pip install -r services/processor/requirements.txt
pip install -r services/analyst/requirements.txt

# Frontend
cd frontend && npm install
```

### 3. Start services

```bash
# Start Redis
redis-server --daemonize yes

# Start backend services (each in a separate terminal)
cd services/simulator && REDIS_URL=redis://localhost:6379 PYTHONPATH=../.. uvicorn main:app --port 8010
cd services/processor && REDIS_URL=redis://localhost:6379 PYTHONPATH=../.. uvicorn main:app --port 8011
cd services/analyst && REDIS_URL=redis://localhost:6379 OPENAI_API_KEY=your_key PYTHONPATH=../.. uvicorn main:app --port 8012

# Start frontend
cd frontend && NEXT_PUBLIC_MAPBOX_TOKEN=your_token NEXT_PUBLIC_WS_URL=ws://localhost:8011/ws npm run dev -- -p 3001
```

### Docker Compose (alternative)

```bash
docker compose up --build
```

### 4. Open the dashboard

Navigate to **http://localhost:3001**

## Chicago Data

The simulator generates realistic events across 14 major Chicago roads (Kennedy, Dan Ryan, Eisenhower, Lake Shore Drive, Michigan Ave, etc.), 6 CTA bus routes, and 4 L-train lines (Red, Blue, Brown, Green). Incidents reference real Chicago geography, neighborhoods, and CTA infrastructure.

## API Endpoints

| Endpoint | Method | Service | Description |
|----------|--------|---------|-------------|
| `/health` | GET | All | Service health check |
| `/api/snapshot` | GET | Processor | Current city state (all layers) |
| `/ws` | WebSocket | Processor | Real-time event stream |
| `/api/plan` | POST | Analyst | Generate detailed response plan for an incident |

## License

MIT
