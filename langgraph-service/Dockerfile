FROM python:3.11-alpine
ARG VERSION=0.0.1
WORKDIR /app

# Install system dependencies for building Python packages
RUN apk add --no-cache gcc musl-dev libffi-dev rust cargo ca-certificates && update-ca-certificates

# Install Poetry
RUN pip install poetry

# Copy Poetry configuration
COPY pyproject.toml ./
COPY poetry.lock* ./

# Configure Poetry to not create virtual environment
RUN poetry config virtualenvs.create false

# Install dependencies
RUN poetry install --only=main

# Copy application code
COPY app.py .

ENV PYTHONPATH=/app
EXPOSE 5000
CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "5000"]
LABEL org.opencontainers.image.version=${VERSION}
