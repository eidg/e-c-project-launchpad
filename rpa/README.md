# Airbnb RPA Connector

This service provides a small FastAPI wrapper that runs a Robot Framework + Playwright browser to extract a price breakdown from an Airbnb listing. It exposes endpoints:

- GET /healthz
- GET /readyz
- POST /run

Artifacts (log.html, report.html, output.xml, trace.zip, screenshots, result.json) are stored per run under `/app/results/run-<id>/`.
