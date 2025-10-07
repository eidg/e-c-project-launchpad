#!/usr/bin/env bash
set -euo pipefail

ROBOT_ARGS_COMBINED="${ROBOT_ARGS:-}"
VAR_ARGS=()

# Convert known env vars to -v NAME:VALUE form if set
[[ -n "${PROPERTY_URL:-}" ]] && VAR_ARGS+=( -v PROPERTY_URL:"${PROPERTY_URL}" )
[[ -n "${CHECK_IN:-}" ]] && VAR_ARGS+=( -v CHECK_IN:"${CHECK_IN}" )
[[ -n "${CHECK_OUT:-}" ]] && VAR_ARGS+=( -v CHECK_OUT:"${CHECK_OUT}" )
[[ -n "${TEXT_ONLY:-}" ]] && VAR_ARGS+=( -v TEXT_ONLY:"${TEXT_ONLY}" )
[[ -n "${HEADLESS:-}" ]] && VAR_ARGS+=( -v HEADLESS:"${HEADLESS}" )

ROBOT_TEST_PATH_REL="${ROBOT_TEST_PATH:-robots}"

exec robot -L "${ROBOT_LOGLEVEL:-debug}" -d /app/results ${ROBOT_ARGS_COMBINED} "${VAR_ARGS[@]}" "${ROBOT_TEST_PATH_REL}"
