#!/usr/bin/env bash
set -euo pipefail

typeset image="${1:?usage: smoke-test.sh <image-ref> [port]}"
typeset port="${2:-3000}"
typeset container="renderer-smoke-${RANDOM}"
typeset -i attempt

# shellcheck disable=SC2329 # invoked by the EXIT trap below
cleanup() {
  docker rm --force "${container}" > /dev/null 2>&1 || true
}
trap cleanup EXIT

docker run --detach --name "${container}" \
  --cap-drop ALL \
  --security-opt no-new-privileges:true \
  --read-only \
  --publish "127.0.0.1:${port}:3000" \
  "${image}" > /dev/null

for (( attempt = 1; attempt <= 30; attempt++ )); do
  if curl --fail --silent --output /dev/null "http://127.0.0.1:${port}/healthz"; then
    printf 'smoke test passed after %ds: %s\n' "${attempt}" "${image}"
    exit 0
  fi
  sleep 1
done

printf 'smoke test failed: %s never answered /healthz\n' "${image}" >&2
docker logs "${container}" >&2
exit 1
