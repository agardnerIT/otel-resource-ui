#!/usr/bin/env python3
"""Frontend service - calls backend."""

from opentelemetry import trace
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export import BatchSpanProcessor
from opentelemetry.exporter.otlp.proto.grpc.trace_exporter import OTLPSpanExporter
from opentelemetry.sdk.resources import Resource
from opentelemetry.semconv.resource import ResourceAttributes
from opentelemetry.trace import SpanKind
import time
import random
import sys

# This is the FRONTEND service
provider = TracerProvider(resource=Resource.create({
    ResourceAttributes.SERVICE_NAME: "frontend",
}))
trace.set_tracer_provider(provider)

exporter = OTLPSpanExporter(endpoint="http://localhost:4317")
provider.add_span_processor(BatchSpanProcessor(exporter))

tracer = trace.get_tracer("frontend")

print("Frontend sending requests to backend...")

i = 0
while True:
    with tracer.start_as_current_span("GET /api", kind=SpanKind.CLIENT) as span:
        span.set_attribute("http.method", "GET")
        span.set_attribute("http.url", "http://backend/api")
        span.set_attribute("peer.service", "backend")
    
    i += 1
    if i % 10 == 0:
        print(f"Frontend: {i} requests")
    time.sleep(0.3)
