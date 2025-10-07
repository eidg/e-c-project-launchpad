FROM python:3.11-alpine
ARG VERSION=0.0.1
WORKDIR /app
COPY app.py .
RUN pip install fastapi uvicorn
ENV PYTHONPATH=/app
EXPOSE 5100
CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "5100"]
LABEL org.opencontainers.image.version=${VERSION}
