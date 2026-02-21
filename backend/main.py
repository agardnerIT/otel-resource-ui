from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import httpx
import os
import re

app = FastAPI(title="OTel Resource UI API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

COLLECTOR_URL = os.getenv("COLLECTOR_URL", "http://localhost:8889")


class CollectorConfig(BaseModel):
    url: str


@app.get("/health")
async def health():
    return {"status": "ok"}


@app.get("/api/collector/config")
async def get_collector_config():
    return {"url": COLLECTOR_URL}


@app.post("/api/collector/config")
async def set_collector_config(config: CollectorConfig):
    global COLLECTOR_URL
    COLLECTOR_URL = config.url
    return {"url": COLLECTOR_URL}


def parse_prometheus_metrics(text):
    """Parse Prometheus text format and extract service graph metrics."""
    nodes = set()
    edges = []
    edge_requests = {}
    
    for line in text.split('\n'):
        line = line.strip()
        if not line or line.startswith('#'):
            continue
        
        if 'traces_service_graph_request_total{' in line:
            match = re.match(r'traces_service_graph_request_total\{([^}]+)\}\s+([\d.]+)', line)
            if match:
                labels_str, value = match.groups()
                labels = {}
                for kv in labels_str.split(','):
                    if '=' in kv:
                        k, v = kv.split('=', 1)
                        labels[k.strip()] = v.strip().strip('"')
                
                client = labels.get('client')
                server = labels.get('server')
                failed = labels.get('failed', 'false')
                
                if client and server and failed == 'false':
                    edge_key = (client, server)
                    if edge_key not in edge_requests:
                        edge_requests[edge_key] = 0
                    edge_requests[edge_key] += float(value)
    
    for (client, server), requests in edge_requests.items():
        nodes.add(client)
        nodes.add(server)
        edges.append({
            "source": client,
            "target": server,
            "requests": requests
        })
    
    return nodes, edges


@app.get("/api/services")
async def get_services():
    async with httpx.AsyncClient(timeout=10.0) as client:
        try:
            response = await client.get(f"{COLLECTOR_URL}/metrics")
            response.raise_for_status()
            
            nodes, _ = parse_prometheus_metrics(response.text)
            return {"services": sorted(list(nodes))}
        except Exception as e:
            raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/topology")
async def get_topology():
    async with httpx.AsyncClient(timeout=10.0) as client:
        try:
            response = await client.get(f"{COLLECTOR_URL}/metrics")
            if response.status_code != 200:
                return {
                    "nodes": [],
                    "edges": [],
                    "error": f"Collector returned {response.status_code}",
                    "collector_url": COLLECTOR_URL
                }
            
            nodes, edges = parse_prometheus_metrics(response.text)
            
            return {
                "nodes": [{"id": n} for n in nodes],
                "edges": edges
            }
        except Exception as e:
            return {
                "nodes": [],
                "edges": [],
                "error": str(e),
                "collector_url": COLLECTOR_URL
            }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
