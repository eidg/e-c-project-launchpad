from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any
import subprocess
import shlex
import os
import time
from datetime import datetime

app = FastAPI(title="RPA Runner API", version="1.0.0")

RESULTS_DIR = "/app/results"
DEFAULT_TEST_PATH = os.getenv("ROBOT_TEST_PATH", "robots")
DEFAULT_LOG_LEVEL = os.getenv("ROBOT_LOGLEVEL", "debug")


class RunRequest(BaseModel):
    property_url: Optional[str] = Field(None, description="Airbnb property URL")
    check_in: Optional[str] = Field(None, description="YYYY-MM-DD")
    check_out: Optional[str] = Field(None, description="YYYY-MM-DD")
    text_only: Optional[bool] = Field(None, description="If True, avoid screenshots")
    headless: Optional[bool] = Field(True, description="Run browser headless")
    robot_args: Optional[str] = Field(None, description="Raw Robot args, e.g. --test 'My Test' --include smoke")
    robot_test_path: Optional[str] = Field(None, description="Path of suite or directory to run")


class RunResponse(BaseModel):
    status: str
    run_id: str
    results_dir: str
    command: List[str]
    return_code: int
    artifacts: Dict[str, Any] | None = None
    result: Dict[str, Any] | None = None


@app.get("/healthz")
def healthz() -> Dict[str, Any]:
    """Lightweight liveness probe."""
    return {"status": "ok", "service": "rpa-runner", "time": time.time()}


def _check_cmd(cmd: str) -> Dict[str, Any]:
    try:
        proc = subprocess.run(shlex.split(cmd), stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, timeout=15)
        return {"ok": proc.returncode == 0, "code": proc.returncode, "output": proc.stdout}
    except Exception as e:
        return {"ok": False, "error": str(e)}


@app.get("/readyz")
def readyz() -> Dict[str, Any]:
    """Readiness probe: validate Node/npm, Playwright (node-based), and rfbrowser are accessible."""
    checks = {
        "node": _check_cmd("node -v"),
        "npm": _check_cmd("npm -v"),
        "rfbrowser": _check_cmd("rfbrowser --version"),
        "python_browser_import": _check_cmd("python -c 'import Browser; print(Browser.__version__)'")
    }
    ok = all(v.get("ok") for v in checks.values())
    status = "ready" if ok else "not-ready"
    return {"status": status, "checks": checks}


@app.post("/run", response_model=RunResponse)
def run_robot(payload: RunRequest):
    # Ensure results dir exists
    os.makedirs(RESULTS_DIR, exist_ok=True)

    # Create a dedicated run folder
    run_id = datetime.utcnow().strftime("%Y%m%dT%H%M%S%fZ")
    run_dir = os.path.join(RESULTS_DIR, f"run-{run_id}")
    os.makedirs(run_dir, exist_ok=True)

    # Build Robot command
    cmd: List[str] = [
        "robot",
        "-L", DEFAULT_LOG_LEVEL,
        "-d", run_dir,
        "-v", f"HEADLESS:{str(payload.headless).title() if payload.headless is not None else os.getenv('HEADLESS','True')}"
    ]

    if payload.property_url:
        cmd += ["-v", f"PROPERTY_URL:{payload.property_url}"]
    if payload.check_in:
        cmd += ["-v", f"CHECK_IN:{payload.check_in}"]
    if payload.check_out:
        cmd += ["-v", f"CHECK_OUT:{payload.check_out}"]
    if payload.text_only is not None:
        cmd += ["-v", f"TEXT_ONLY:{str(payload.text_only).title()}"]

    if payload.robot_args:
        # Split respecting quotes
        cmd += shlex.split(payload.robot_args)

    test_path = payload.robot_test_path or DEFAULT_TEST_PATH
    cmd.append(test_path)

    # Execute
    proc = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True)

    # Persist combined stdout to run folder for debugging
    try:
        with open(os.path.join(run_dir, "console.log"), "w", encoding="utf-8") as f:
            f.write(proc.stdout)
    except Exception:
        pass

    # Collect artifacts
    artifacts: Dict[str, Any] = {}
    def _p(name: str) -> str:
        return os.path.join(run_dir, name)
    for f in ["log.html", "report.html", "output.xml", "console.log", "trace.zip", "final.png", "reserve_click_failed.png", "result.json"]:
        fp = _p(f)
        if os.path.exists(fp):
            artifacts[f] = fp

    # Try parse result.json if present
    result_obj: Dict[str, Any] | None = None
    rj = _p("result.json")
    if os.path.exists(rj):
        try:
            import json
            with open(rj, "r", encoding="utf-8") as f:
                result_obj = json.load(f)
        except Exception:
            result_obj = None

    if proc.returncode != 0:
        # Attach a short tail of the output to error message
        tail = "\n".join(proc.stdout.splitlines()[-50:]) if proc.stdout else ""
        raise HTTPException(status_code=500, detail={
            "message": "Robot execution failed",
            "return_code": proc.returncode,
            "run_id": run_id,
            "results_dir": run_dir,
            "tail": tail,
            "artifacts": artifacts,
            "result": result_obj,
        })

    return RunResponse(
        status="completed",
        run_id=run_id,
        results_dir=run_dir,
        command=cmd,
        return_code=proc.returncode,
        artifacts=artifacts,
        result=result_obj,
    )
