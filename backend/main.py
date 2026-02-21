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

COLLECTOR_URL = os.getenv("COLLECTOR_URL", "http://localhost:8888")


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
    edge_data = {}
    
    for line in text.split('\n'):
        line = line.strip()
        if not line or line.startswith('#'):
            continue
        
        # Parse request_total (for throughput)
        if 'traces_service_graph_request_total{' in line:
            match = re.match(r'traces_service_graph_request_total\{([^}]+)\}\s+([\d.]+)', line)
            if match:
                labels_str, value = match.groups()
                labels = dict(kv.split('=', 1) for kv in labels_str.split(',') if '=' in kv)
                labels = {k: v.strip().strip('"') for k, v in labels.items()}
                
                client = labels.get('client')
                server = labels.get('server')
                failed = labels.get('failed', 'false')
                
                if client and server:
                    edge_key = (client, server)
                    if edge_key not in edge_data:
                        edge_data[edge_key] = {'requests': 0, 'failed': 0, 'latency_sum': 0, 'latency_count': 0}
                    
                    if failed == 'false':
                        edge_data[edge_key]['requests'] += float(value)
                    else:
                        edge_data[edge_key]['failed'] += float(value)
        
        # Parse latency histogram (client side)
        if 'traces_service_graph_request_client_seconds_bucket{' in line:
            match = re.match(r'traces_service_graph_request_client_seconds_bucket\{([^}]+)\}\s+([\d.]+)', line)
            if match:
                labels_str, value = match.groups()
                labels = dict(kv.split('=', 1) for kv in labels_str.split(',') if '=' in kv)
                labels = {k: v.strip().strip('"') for k, v in labels.items()}
                
                client = labels.get('client')
                server = labels.get('server')
                le = labels.get('le', '+Inf')
                
                if client and server and le == '+Inf':
                    edge_key = (client, server)
                    if edge_key not in edge_data:
                        edge_data[edge_key] = {'requests': 0, 'failed': 0, 'latency_sum': 0, 'latency_count': 0}
                    edge_data[edge_key]['latency_count'] += float(value)
        
        if 'traces_service_graph_request_client_seconds_sum{' in line:
            match = re.match(r'traces_service_graph_request_client_seconds_sum\{([^}]+)\}\s+([\d.]+)', line)
            if match:
                labels_str, value = match.groups()
                labels = dict(kv.split('=', 1) for kv in labels_str.split(',') if '=' in kv)
                labels = {k: v.strip().strip('"') for k, v in labels.items()}
                
                client = labels.get('client')
                server = labels.get('server')
                
                if client and server:
                    edge_key = (client, server)
                    if edge_key not in edge_data:
                        edge_data[edge_key] = {'requests': 0, 'failed': 0, 'latency_sum': 0, 'latency_count': 0}
                    edge_data[edge_key]['latency_sum'] += float(value)
    
    nodes = set()
    edges = []
    
    for (client, server), data in edge_data.items():
        nodes.add(client)
        nodes.add(server)
        
        requests = data['requests']
        errors = data['failed']
        latency_count = data['latency_count']
        latency_sum = data['latency_sum']
        
        avg_latency_ms = (latency_sum / latency_count * 1000) if latency_count > 0 else 0
        error_rate = errors / (requests + errors) if (requests + errors) > 0 else 0
        
        edges.append({
            "source": client,
            "target": server,
            "requests": requests,
            "latency": round(avg_latency_ms, 2),
            "errors": errors,
            "errorRate": round(error_rate, 4)
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
