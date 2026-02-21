#!/usr/bin/env python3
"""Backend service - receives from frontend, calls payment."""

from opentelemetry import trace
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export import BatchSpanProcessor
from opentelemetry.exporter.otlp.proto.grpc.trace_exporter import OTLPSpanExporter
from opentelemetry.sdk.resources import Resource
from opentelemetry.semconv.resource import ResourceAttributes
from opentelemetry.trace import SpanKind
import time
import random
import os

provider = TracerProvider(resource=Resource.create({
    ResourceAttributes.SERVICE_NAME: "backend",
}))
trace.set_tracer_provider(provider)

exporter = OTLPSpanExporter(endpoint="http://localhost:4317")
provider.add_span_processor(BatchSpanProcessor(exporter))

tracer = trace.get_tracer("backend")

print("Backend: receiving from frontend, calling payment...")

i = 0
while True:
    with tracer.start_as_current_span("GET /api", kind=SpanKind.SERVER) as span:
        span.set_attribute("http.method", "GET")
    
    with tracer.start_as_current_span("POST /payment", kind=SpanKind.CLIENT) as span:
        span.set_attribute("http.method", "POST")
        span.set_attribute("peer.service", "payment")
    
    i += 1
    if i % 10 == 0:
        print(f"Backend: {i} requests")
    time.sleep(0.3)
