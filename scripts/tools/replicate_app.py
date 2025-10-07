#!/usr/bin/env python3
"""
Replicate this application into a new repo with a new name, outside the current repo.

Usage:
  python3 scripts/tools/replicate_app.py --name Ghost --dest /path/to/parent

This will create /path/to/parent/Ghost with a copy of the app, update branding in
README and dashboard header, set COMPOSE_PROJECT_NAME in .env, and initialize a new git repo.

No changes are made to the current repository.
"""
from __future__ import annotations

import argparse
import os
import re
import shutil
import subprocess
import sys
from pathlib import Path
from typing import Iterable, List

IGNORES = [
    ".git",
    "node_modules",
    "dist",
    "build",
    ".next",
    ".cache",
    "__pycache__",
    "*.pyc",
    "*.pyo",
    "*.DS_Store",
    "rpa/results",
]

ROOT_MARKERS = ["docker-compose.yml", "README.md", "frontend", "backend-api", "langgraph-service"]


def find_repo_root(start: Path) -> Path:
    cur = start.resolve()
    for _ in range(10):
        if any((cur / m).exists() for m in ROOT_MARKERS):
            return cur
        if cur.parent == cur:
            break
        cur = cur.parent
    raise RuntimeError("Could not locate repo root from: %s" % start)


def copytree(src: Path, dst: Path) -> None:
    def _ignore(dir: str, names: List[str]) -> Iterable[str]:
        ignored: List[str] = []
        for pat in IGNORES:
            ignored.extend([n for n in names if Path(n).match(pat)])
        return set(ignored)

    shutil.copytree(src, dst, ignore=_ignore, dirs_exist_ok=False)


def replace_in_file(path: Path, patterns: List[tuple[re.Pattern, str]]) -> None:
    if not path.exists() or not path.is_file():
        return
    try:
        text = path.read_text(encoding="utf-8")
    except UnicodeDecodeError:
        return
    orig = text
    for rx, repl in patterns:
        text = rx.sub(repl, text)
    if text != orig:
        path.write_text(text, encoding="utf-8")


def ensure_env_project_name(env_path: Path, project_slug: str) -> None:
    # Create or update .env to include COMPOSE_PROJECT_NAME
    content = ""
    if env_path.exists():
        try:
            content = env_path.read_text(encoding="utf-8")
        except Exception:
            content = ""
    lines = content.splitlines()
    # Remove existing COMPOSE_PROJECT_NAME lines
    lines = [ln for ln in lines if not ln.strip().startswith("COMPOSE_PROJECT_NAME=")]
    lines.append(f"COMPOSE_PROJECT_NAME={project_slug}")
    env_path.write_text("\n".join(lines) + "\n", encoding="utf-8")


def git_init(path: Path) -> None:
    subprocess.run(["git", "init"], cwd=str(path), check=True)
    subprocess.run(["git", "add", "-A"], cwd=str(path), check=True)
    subprocess.run(["git", "commit", "-m", "Initial commit (replicated app)"] , cwd=str(path), check=True)


def slugify(name: str) -> str:
    s = re.sub(r"[^A-Za-z0-9]+", "-", name).strip("-")
    return s.lower() or "app"


def main() -> int:
    parser = argparse.ArgumentParser(description="Replicate this app into a new repo with a new name.")
    parser.add_argument("--name", required=True, help="New app name, e.g. Ghost")
    parser.add_argument("--dest", required=True, help="Destination parent directory outside this repo")
    parser.add_argument("--overwrite", action="store_true", help="Allow overwriting existing non-git directory")
    # GitHub automation options
    parser.add_argument("--gh", action="store_true", help="Use GitHub CLI to create a remote repo and push initial commit")
    parser.add_argument("--gh-public", action="store_true", help="Create the GitHub repo as public (default: private)")
    parser.add_argument("--gh-owner", help="Owner/organization for the GitHub repo (default: your authed user)")
    parser.add_argument("--repo", help="Remote repository name override (default: same as --name)")
    args = parser.parse_args()

    script_path = Path(__file__).resolve()
    repo_root = find_repo_root(script_path)

    dest_parent = Path(args.dest).expanduser().resolve()
    target_dir = dest_parent / args.name

    # Safety: destination must be outside current repo root
    try:
        repo_root.relative_to(target_dir)
        # If this doesn't raise, target_dir is a parent/ancestor, forbid
        print("Refusing to write into a parent of the current repo.", file=sys.stderr)
        return 2
    except ValueError:
        pass
    if str(target_dir).startswith(str(repo_root)):
        print("Destination must be outside the current repository.", file=sys.stderr)
        return 2

    if target_dir.exists():
        if not args.overwrite:
            print(f"Target already exists: {target_dir}. Use --overwrite to replace if safe.", file=sys.stderr)
            return 3
        # Allow overwrite only if empty or a git repo to be replaced
        if any(target_dir.iterdir()):
            print(f"Target directory is not empty: {target_dir}. Aborting (use a new path).", file=sys.stderr)
            return 4

    print(f"Creating new app repo at: {target_dir}")
    copytree(repo_root, target_dir)

    # Branding replacements
    title_patterns = [
        (re.compile(r"\bE C Project Launchpad\b"), args.name),
        (re.compile(r"\bClio\s*Pro\b"), args.name),
    ]
    replace_in_file(target_dir / "README.md", title_patterns)
    replace_in_file(target_dir / "frontend" / "src" / "components" / "Dashboard.jsx", title_patterns)

    # Ensure COMPOSE_PROJECT_NAME in .env (create if missing)
    env_path = target_dir / ".env"
    ensure_env_project_name(env_path, slugify(args.name))

    # Initialize a new git repo
    git_init(target_dir)

    # Ensure default branch is main (aligns with GitHub defaults)
    try:
        subprocess.run(["git", "branch", "-M", "main"], cwd=str(target_dir), check=True)
    except Exception as e:
        print(f"Warning: could not set default branch to main: {e}")

    # Optionally create and push a GitHub repo using gh CLI
    if args.gh:
        repo_name = args.repo or args.name
        visibility_flag = "--public" if args.gh_public else "--private"
        full_repo = f"{args.gh_owner}/{repo_name}" if args.gh_owner else repo_name
        gh_cmd = [
            "gh",
            "repo",
            "create",
            full_repo,
            "--source",
            ".",
            "--remote",
            "origin",
            "--push",
            visibility_flag,
        ]
        try:
            print(f"Creating GitHub repo and pushing: {' '.join(gh_cmd)}")
            subprocess.run(gh_cmd, cwd=str(target_dir), check=True)
            print("GitHub repo created and initial commit pushed.")
        except FileNotFoundError:
            print("Error: GitHub CLI 'gh' not found. Install it from https://cli.github.com/ or run manual steps:")
            print("  git remote add origin <YOUR_GITHUB_REPO_URL>")
            print("  git push -u origin main")
        except subprocess.CalledProcessError as e:
            print(f"Error: gh command failed ({e}). You can add a remote manually and push:\n"
                  "  git remote add origin <YOUR_GITHUB_REPO_URL>\n"
                  "  git push -u origin main")

    print("\nDone. To start the new app:")
    print(f"  cd '{target_dir}'")
    print("  docker compose up -d --build")
    print("  open http://localhost:3000")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
