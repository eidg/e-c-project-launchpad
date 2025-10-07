# Multi-stage not required; use Playwright Python base with browsers and Node preinstalled
# See: https://mcr.microsoft.com/en-us/product/playwright/python/about
FROM mcr.microsoft.com/playwright/python:v1.46.0-jammy

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=on \
    PIP_NO_CACHE_DIR=off \
    ROBOT_LOGLEVEL=debug \
    HEADLESS=True \
    ROBOT_TEST_PATH=robots \
    ROBOT_ARGS=""

WORKDIR /app

# Ensure a modern Node.js and npm are available for rfbrowser init (required to install Browser's node deps)
RUN apt-get update -y \
    && apt-get install -y --no-install-recommends ca-certificates curl gnupg \
    && curl -fsSL https://deb.nodesource.com/setup_18.x | bash - \
    && apt-get install -y --no-install-recommends nodejs \
    && npm -v \
    && node -v \
    && rm -rf /var/lib/apt/lists/*

# Install Python deps first for better caching
COPY requirements.txt /app/requirements.txt
RUN pip install --upgrade pip && \
    pip install -r /app/requirements.txt && \
    # Initialize Robot Framework Browser without downloading browsers (already in base image)
    rfbrowser init --skip-browsers

# Copy project files
COPY robots /app/robots
COPY README.md /app/README.md
COPY app /app/app

# Entry point wrapper to allow env-configurable Robot args
COPY entrypoint.sh /usr/local/bin/entrypoint.sh
RUN chmod +x /usr/local/bin/entrypoint.sh

# Create results dir (also bind-mountable via compose)
RUN mkdir -p /app/results
VOLUME ["/app/results"]

EXPOSE 8000

# Default process: run API server (keeps container alive and accepts HTTP triggers)
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
