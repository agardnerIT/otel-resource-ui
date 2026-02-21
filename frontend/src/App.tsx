import { useState, useEffect, useRef, useCallback } from 'react'
import axios from 'axios'
import ForceGraph2D from 'react-force-graph-2d'
import type { NodeObject } from 'react-force-graph-2d'

interface ServiceNode {
  id: string;
  name?: string;
  x?: number;
  y?: number;
}

interface ServiceLink {
  source: string | ServiceNode;
  target: string | ServiceNode;
  requests: number;
}

interface GraphData {
  nodes: ServiceNode[];
  links: ServiceLink[];
}

const API_URL = 'http://localhost:8000';

function App() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const graphRef = useRef<any>(null);
  const [collectorUrl, setCollectorUrl] = useState('http://localhost:8889');
  const [graphData, setGraphData] = useState<GraphData>({ nodes: [], links: [] });
  const [loading, setLoading] = useState(false);
  const [connected, setConnected] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [selectedNode, setSelectedNode] = useState<string | null>(null);

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
      setGraphData({
        nodes: data.nodes.map((n: { id: string }) => ({ id: n.id, name: n.id })),
        links: data.edges.map((e: { source: string; target: string; requests: number }) => ({
          source: e.source,
          target: e.target,
          requests: e.requests
        }))
      });
    } catch (err) {
      console.error('Failed to fetch data:', err);
      setGraphData({ nodes: [], links: [] });
    } finally {
      setLoading(false);
    }
  };

  const nodeCanvasObject = useCallback((node: NodeObject, ctx: CanvasRenderingContext2D, globalScale: number) => {
    const label = (node as ServiceNode).id;
    const fontSize = 12/globalScale;
    ctx.font = `${fontSize}px Sans-Serif`;

    ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
    ctx.beginPath();
    ctx.arc((node as ServiceNode).x || 0, (node as ServiceNode).y || 0, 5, 0, 2 * Math.PI);
    ctx.fill();

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#1f2937';
    ctx.fillText(label, (node as ServiceNode).x || 0, ((node as ServiceNode).y || 0) + 8);
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
            nodePointerAreaPaint={(node, color, ctx) => {
              ctx.fillStyle = color;
              const size = 8;
              ctx.beginPath();
              ctx.arc((node as ServiceNode).x || 0, (node as ServiceNode).y || 0, size, 0, 2 * Math.PI);
              ctx.fill();
            }}
            linkColor={() => '#94a3b8'}
            linkWidth={2}
            linkDirectionalArrowLength={6}
            linkDirectionalArrowRelPos={1}
            onNodeClick={handleNodeClick}
            backgroundColor="#f8fafc"
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
