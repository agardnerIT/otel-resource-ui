#!/usr/bin/env python3
"""Simple OTel test to generate service graph data."""

from opentelemetry import trace
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export import BatchSpanProcessor
from opentelemetry.exporter.otlp.proto.grpc.trace_exporter import OTLPSpanExporter
from opentelemetry.sdk.resources import Resource
from opentelemetry.semconv.resource import ResourceAttributes
from opentelemetry.trace import SpanKind
import time
import random

# Single provider
provider = TracerProvider(resource=Resource.create({
    ResourceAttributes.SERVICE_NAME: "client",
}))
trace.set_tracer_provider(provider)

exporter = OTLPSpanExporter(endpoint="http://localhost:4317")
provider.add_span_processor(BatchSpanProcessor(exporter))

tracer = trace.get_tracer(__name__)

print("Sending traces... Press Ctrl+C to stop")

i = 0
while True:
    # CLIENT span with peer.service = backend
    with tracer.start_as_current_span("request", kind=SpanKind.CLIENT) as client:
        client.set_attribute("http.method", "GET")
        client.set_attribute("http.url", "http://backend/api")
        client.set_attribute("server.address", "backend")
        
    # SERVER span with server.address = backend  
    with tracer.start_as_current_span("handle", kind=SpanKind.SERVER) as server:
        server.set_attribute("http.method", "GET")
        server.set_attribute("server.address", "backend")
    
    i += 1
    if i % 10 == 0:
        print(f"Sent {i} requests")
    time.sleep(0.3)
