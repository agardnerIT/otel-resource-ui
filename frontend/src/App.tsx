import { useState, useEffect, useRef, useCallback } from 'react'
import axios from 'axios'
import ForceGraph2D from 'react-force-graph-2d'
import type { NodeObject } from 'react-force-graph-2d'

interface ServiceNode {
  id: string;
  name?: string;
  x?: number;
  y?: number;
  vx?: number;
  vy?: number;
  fx?: number;
  fy?: number;
}

interface ServiceLink {
  source: string | ServiceNode;
  target: string | ServiceNode;
  requests: number;
  latency?: number;
  errors?: number;
  errorRate?: number;
}

interface GraphData {
  nodes: ServiceNode[];
  links: ServiceLink[];
}

const API_URL = 'http://localhost:8000';
const STORAGE_KEY = 'otel-graph-positions';

function loadPositions(): Record<string, { x: number; y: number }> {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    return saved ? JSON.parse(saved) : {};
  } catch {
    return {};
  }
}

function App() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const graphRef = useRef<any>(null);
  const [collectorUrl, setCollectorUrl] = useState('http://localhost:8889');
  const [graphData, setGraphData] = useState<GraphData>({ nodes: [], links: [] });
  const [loading, setLoading] = useState(false);
  const [connected, setConnected] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [selectedNode, setSelectedNode] = useState<string | null>(null);
  const [hoveredLink, setHoveredLink] = useState<ServiceLink | null>(null);

  useEffect(() => {
    fetchCollectorConfig();
  }, []);

  const fetchCollectorConfig = async () => {
    try {
      const res = await axios.get(`${API_URL}/api/collector/config`);
      setCollectorUrl(res.data.url);
      setConnected(true);
      fetchData();
    } catch {
      setConnected(false);
    }
  };

  const saveCollectorUrl = async () => {
    try {
      await axios.post(`${API_URL}/api/collector/config`, { url: collectorUrl });
      setShowSettings(false);
      setConnected(true);
      fetchData();
    } catch (err) {
      console.error('Failed to save config:', err);
    }
  };

  const fetchData = async () => {
    setLoading(true);
    try {
      const topologyRes = await axios.get(`${API_URL}/api/topology`);
      const data = topologyRes.data || { nodes: [], edges: [] };
      
      const savedPositions = loadPositions();
      const nodes = data.nodes.map((n: { id: string }) => {
        const pos = savedPositions[n.id];
        return {
          id: n.id,
          name: n.id,
          x: pos?.x,
          y: pos?.y,
          fx: pos?.x ?? null,
          fy: pos?.y ?? null,
        };
      });
      
      setGraphData({
        nodes,
        links: data.edges.map((e: { source: string; target: string; requests: number; latency?: number; errors?: number; errorRate?: number }) => ({
          source: e.source,
          target: e.target,
          requests: e.requests,
          latency: e.latency,
          errors: e.errors,
          errorRate: e.errorRate
        }))
      });
    } catch (err) {
      console.error('Failed to fetch data:', err);
      setGraphData({ nodes: [], links: [] });
    } finally {
      setLoading(false);
    }
  };

  const onNodeDragEnd = useCallback((node: NodeObject) => {
    const n = node as ServiceNode;
    if (n.x !== undefined && n.y !== undefined) {
      const positions = loadPositions();
      positions[n.id] = { x: n.x, y: n.y };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(positions));
    }
  }, []);

  const formatLatency = (ms: number) => {
    if (ms >= 1000) return `${(ms / 1000).toFixed(2)}s`;
    return `${ms.toFixed(1)}ms`;
  };

  const handleLinkHover = useCallback((link: ServiceLink | null) => {
    setHoveredLink(link);
  }, []);

  const nodeCanvasObject = useCallback((node: NodeObject, ctx: CanvasRenderingContext2D, _globalScale: number) => {
    const n = node as ServiceNode;
    const label = n.id;
    const x = n.x || 0;
    const y = n.y || 0;
    
    // Draw larger circle (12px)
    ctx.beginPath();
    ctx.arc(x, y, 12, 0, 2 * Math.PI);
    ctx.fillStyle = '#3b82f6';
    ctx.fill();
    ctx.strokeStyle = '#1d4ed8';
    ctx.lineWidth = 2;
    ctx.stroke();
    
    // Draw label below node
    const fontSize = 14;
    ctx.font = `bold ${fontSize}px Sans-Serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillStyle = '#1f2937';
    ctx.fillText(label, x, y + 16);
  }, []);

  const linkCanvasObject = useCallback((link: ServiceLink, ctx: CanvasRenderingContext2D, _globalScale: number) => {
    const source = link.source as ServiceNode;
    const target = link.target as ServiceNode;
    
    if (!source.x || !source.y || !target.x || !target.y) return;
    
    // Calculate edge color based on error rate
    let color = '#22c55e'; // green
    if (link.errorRate !== undefined) {
      if (link.errorRate > 0.05) color = '#ef4444'; // red
      else if (link.errorRate > 0.01) color = '#eab308'; // yellow
    }
    
    // Draw edge
    ctx.beginPath();
    ctx.moveTo(source.x, source.y);
    ctx.lineTo(target.x, target.y);
    ctx.strokeStyle = color;
    ctx.lineWidth = Math.max(1, Math.min(link.requests / 100, 6));
    ctx.stroke();
  }, []);

  const handleNodeClick = useCallback((node: NodeObject) => {
    const nodeData = node as ServiceNode;
    setSelectedNode(nodeData.id);
    graphRef.current?.centerAt(nodeData.x, nodeData.y, 1000);
    graphRef.current?.zoom(2, 2000);
  }, []);

  return (
    <div className="h-screen flex flex-col">
      <header className="bg-white border-b border-gray-200 px-6 py-3 flex items-center justify-between shrink-0">
        <h1 className="text-lg font-semibold text-gray-900">OTel Resource UI</h1>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <span className={`w-2 h-2 rounded-full ${connected ? 'bg-green-500' : 'bg-red-500'}`}></span>
            <span className="text-sm text-gray-600">{connected ? 'Connected' : 'Disconnected'}</span>
          </div>
          <button
            onClick={fetchData}
            disabled={loading}
            className="px-3 py-1.5 text-sm bg-gray-100 hover:bg-gray-200 rounded-md disabled:opacity-50"
          >
            Refresh
          </button>
          <button
            onClick={() => setShowSettings(true)}
            className="px-3 py-1.5 text-sm bg-gray-100 hover:bg-gray-200 rounded-md"
          >
            Settings
          </button>
        </div>
      </header>

      <div className="flex-1 relative">
        {loading ? (
          <div className="absolute inset-0 flex items-center justify-center">
            <p className="text-gray-500">Loading topology...</p>
          </div>
        ) : graphData.nodes.length === 0 ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <p className="text-gray-500 mb-4">No services found</p>
            <p className="text-sm text-gray-400">Configure your OTel Collector to use the servicegraph connector</p>
          </div>
        ) : (
          <ForceGraph2D
            ref={graphRef}
            graphData={graphData}
            nodeLabel="id"
            nodeCanvasObject={nodeCanvasObject}
            linkCanvasObject={linkCanvasObject}
            nodePointerAreaPaint={(node, color, ctx) => {
              ctx.fillStyle = color;
              ctx.beginPath();
              ctx.arc((node as ServiceNode).x || 0, (node as ServiceNode).y || 0, 15, 0, 2 * Math.PI);
              ctx.fill();
            }}
            linkWidth={0}
            linkDirectionalArrowLength={8}
            linkDirectionalArrowRelPos={0.95}
            linkPointerAreaPaint={(link, color, ctx) => {
              ctx.fillStyle = color;
              const source = (link as ServiceLink).source as ServiceNode;
              const target = (link as ServiceLink).target as ServiceNode;
              if (source.x && source.y && target.x && target.y) {
                ctx.beginPath();
                ctx.moveTo(source.x, source.y);
                ctx.lineTo(target.x, target.y);
                ctx.lineWidth = 8;
                ctx.stroke();
              }
            }}
            onLinkHover={handleLinkHover}
            onNodeClick={handleNodeClick}
            onNodeDragEnd={onNodeDragEnd}
            enableNodeDrag
            backgroundColor="#f8fafc"
            cooldownTicks={100}
            onEngineStop={() => {
              if (graphRef.current) {
                const nodes = graphRef.current.graphData().nodes;
                nodes.forEach((n: ServiceNode) => {
                  if (n.x !== undefined && n.y !== undefined) {
                    const positions = loadPositions();
                    positions[n.id] = { x: n.x, y: n.y };
                    localStorage.setItem(STORAGE_KEY, JSON.stringify(positions));
                  }
                });
              }
            }}
          />
        )}

        {selectedNode && (
          <div className="absolute top-4 right-4 bg-white rounded-lg shadow-lg border border-gray-200 p-4 w-72">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-medium text-gray-900">{selectedNode}</h3>
              <button
                onClick={() => setSelectedNode(null)}
                className="text-gray-400 hover:text-gray-600"
              >
                ✕
              </button>
            </div>
            <div className="text-sm text-gray-600">
              <p>Service: {selectedNode}</p>
              <p className="mt-2 text-xs text-gray-400">
                Connections: {graphData.links.filter(l => 
                  l.source === selectedNode || l.target === selectedNode
                ).length}
              </p>
            </div>
          </div>
        )}

        {hoveredLink && (
          <div 
            className="absolute bg-white rounded-lg shadow-lg border border-gray-200 p-3 z-50 pointer-events-none"
            style={{ 
              left: '50%', 
              top: '50%', 
              transform: 'translate(-50%, -50%)',
              minWidth: '180px'
            }}
          >
            <div className="text-sm font-medium text-gray-900 mb-2">
              {typeof hoveredLink.source === 'object' ? hoveredLink.source.id : hoveredLink.source} → {typeof hoveredLink.target === 'object' ? hoveredLink.target.id : hoveredLink.target}
            </div>
            <div className="space-y-1 text-xs text-gray-600">
              <div className="flex justify-between">
                <span>Requests:</span>
                <span className="font-medium">{hoveredLink.requests.toFixed(0)}</span>
              </div>
              {hoveredLink.latency !== undefined && (
                <div className="flex justify-between">
                  <span>Latency:</span>
                  <span className="font-medium">{formatLatency(hoveredLink.latency)}</span>
                </div>
              )}
              {hoveredLink.errors !== undefined && hoveredLink.errors > 0 && (
                <div className="flex justify-between">
                  <span>Errors:</span>
                  <span className="font-medium text-red-600">{hoveredLink.errors.toFixed(0)}</span>
                </div>
              )}
              {hoveredLink.errorRate !== undefined && hoveredLink.errorRate > 0 && (
                <div className="flex justify-between">
                  <span>Error Rate:</span>
                  <span className={`font-medium ${hoveredLink.errorRate > 0.05 ? 'text-red-600' : hoveredLink.errorRate > 0.01 ? 'text-yellow-600' : 'text-green-600'}`}>
                    {(hoveredLink.errorRate * 100).toFixed(1)}%
                  </span>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {showSettings && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-96">
            <h2 className="text-lg font-medium mb-4">Collector Settings</h2>
            <p className="text-sm text-gray-600 mb-4">
              Enter the Prometheus endpoint of your OTel Collector (with servicegraph connector)
            </p>
            <input
              type="text"
              value={collectorUrl}
              onChange={e => setCollectorUrl(e.target.value)}
              placeholder="http://localhost:8889"
              className="w-full px-3 py-2 border border-gray-300 rounded-md mb-4"
            />
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setShowSettings(false)}
                className="px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-100 rounded-md"
              >
                Cancel
              </button>
              <button
                onClick={saveCollectorUrl}
                className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App
