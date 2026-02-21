# OTel Resource UI

> **⚠️ WARNING**: This is a hobby project, vibe coded, and **NOT recommended for production use**. Things can and will change at any time without notice.

A native OpenTelemetry UI for visualizing Resource information and entity relationships.

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                      OTel Resource UI (Web App)                   │
├─────────────────────────────────────────────────────────────────┤
│  ┌─────────────┐   ┌─────────────┐   ┌─────────────────────┐   │
│  │  Frontend   │◄──│   Backend   │◄──│  OTel Collector    │   │
│  │  (React)    │   │  (Python)   │   │  (Prometheus :8889) │   │
│  └─────────────┘   └─────────────┘   └──────────┬──────────┘   │
│                                                │               │
│                              ┌─────────────────┴───────────┐   │
│                              │   Service Graph Metrics     │   │
│                              │   traces_service_graph_*    │   │
│                              └───────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

## Quick Start

### Prerequisites
- Python 3.11+
- Node.js 18+

### 1. Start OTel Collector

Use the provided config:

```bash
otelcol-contrib --config collector-config.yaml
```

Or run with Docker:

```bash
docker run -p 4317:4317 -p 4318:4318 -p 8889:8889 \
  -v $(pwd)/collector-config.yaml:/etc/otelcol-contrib/config.yaml \
  otel/opentelemetry-collector-contrib
```

### 2. Start Backend

```bash
cd backend
python -m venv venv
source venv/bin/activate  # or venv\Scripts\activate on Windows
pip install -r requirements.txt
uvicorn main:app --reload
```

### 3. Start Frontend

```bash
cd frontend
npm install
npm run dev
```

### 4. Configure

1. Open http://localhost:5173
2. Click "Settings"
3. Enter your collector URL (default: http://localhost:8889)
4. Click Save

The graph will populate with services that send traces to your collector.

## OTel Collector Configuration

The collector needs the `servicegraph` connector to generate topology data:

```yaml
receivers:
  otlp:
    processors:
      grpc:
        endpoint: 0.0.0.0:4317
      http:
        endpoint: 0.0.0.0:4318

processors:
  batch:
    timeout: 10s

connectors:
  servicegraph:
    latency_histogram_buckets: [2ms, 4ms, 6ms, 8ms, 10ms, 50ms, 100ms, 200ms, 400ms, 800ms, 1s]

exporters:
  prometheus:
    endpoint: 0.0.0.0:8889

service:
  pipelines:
    traces:
      receivers: [otlp]
      processors: [batch]
      exporters: [servicegraph]
    metrics:
      receivers: [servicegraph]
      processors: [batch]
      exporters: [prometheus]
```

See `collector-config.yaml` for the full configuration.

## Features

- Service discovery from Prometheus
- Interactive topology graph
- Resource attribute viewing
- Real-time updates
