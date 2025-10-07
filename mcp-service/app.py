from fastapi import FastAPI

app = FastAPI(title="E C Project Launchpad MCP Service", version="0.0.1")

@app.get("/healthz")
async def health_check():
    return {"status": "OK", "version": "0.0.1"}

@app.get("/")
async def root():
    return {
        "message": "E C Project Launchpad MCP Service",
        "version": "0.0.1",
        "status": "running"
    }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=5100)
