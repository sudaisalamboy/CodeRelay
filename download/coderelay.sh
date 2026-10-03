#!/usr/bin/env bash
# coderelay.sh — convenience CLI for the CodeRelay push/pull service.
#
# Usage:
#   coderelay.sh create <name>
#   coderelay.sh push   <endpoint-id> <folder-or-zip>
#   coderelay.sh pull   <endpoint-id> [out.zip]
#   coderelay.sh flash  <endpoint-id>
#   coderelay.sh info   <endpoint-id>
#   coderelay.sh delete <endpoint-id>
#
# Set RELAY_HOST env var to point at a non-default host, e.g.
#   RELAY_HOST=http://your-server.com coderelay.sh pull gb73h83h
#
# Requires: curl, zip, unzip, jq (for prettier JSON output).

set -euo pipefail

HOST="${RELAY_HOST:-}"
if [[ -z "$HOST" ]]; then
  # Auto-detect: if running on the same machine, use localhost.
  HOST="http://localhost:3000"
fi

HOST="${HOST%/}"  # strip trailing slash

cmd="${1:-}"
[[ -n "$cmd" ]] || {
  echo "Usage: $0 {create|push|pull|flash|info|delete} [args]" >&2
  exit 1
}
shift

case "$cmd" in

  create)
    name="${1:-}"
    [[ -n "$name" ]] || { echo "Usage: $0 create <name>" >&2; exit 1; }
    echo "[*] Creating endpoint for '$name'..."
    curl -sS -X POST "$HOST/api/projects" \
      -H "Content-Type: application/json" \
      -d "{\"name\":\"$name\"}" | jq .
    ;;

  push)
    id="${1:-}"
    target="${2:-}"
    [[ -n "$id" && -n "$target" ]] || {
      echo "Usage: $0 push <endpoint-id> <folder-or-zip>" >&2; exit 1; }
    tmp=""
    if [[ -d "$target" ]]; then
      # Default zip output to ~/Downloads so it lands in the user's
      # real Downloads folder (not /tmp).
      DOWNLOADS="${HOME}/Downloads"
      mkdir -p "$DOWNLOADS"
      tmp="$DOWNLOADS/coderelay-${id}-upload.zip"
      rm -f "$tmp"
      echo "[*] Zipping folder $target -> $tmp"
      ( cd "$target" && zip -rq "$tmp" . )
      zip_path="$tmp"
    elif [[ -f "$target" ]]; then
      zip_path="$target"
    else
      echo "[!] target not found: $target" >&2; exit 1
    fi

    echo "[*] Pushing to $HOST/api/push/$id ..."
    curl -sS -X POST "$HOST/api/push/$id" \
      -F "file=@$zip_path" | jq .
    # NOTE: We no longer delete the temp zip — it lives in ~/Downloads
    # so the user can inspect / re-upload it if needed.
    ;;

  pull)
    id="${1:-}"
    # Default to ~/Downloads/<id>.zip so downloads land in the user's
    # real Downloads folder, not the current working directory or /tmp.
    DOWNLOADS="${HOME}/Downloads"
    mkdir -p "$DOWNLOADS"
    out="${2:-$DOWNLOADS/${id}.zip}"
    extract_dir="${out%.zip}"
    [[ -n "$id" ]] || { echo "Usage: $0 pull <endpoint-id> [out.zip]" >&2; exit 1; }
    echo "[*] Pulling $HOST/api/pull/$id -> $out"
    curl -L -S -o "$out" "$HOST/api/pull/$id"
    echo "[+] Saved $out"
    if command -v unzip >/dev/null 2>&1; then
      echo "[*] Extracting to $extract_dir ..."
      mkdir -p "$extract_dir"
      unzip -oq "$out" -d "$extract_dir" && echo "[+] Extracted to $extract_dir"
    fi
    ;;

  flash)
    id="${1:-}"
    [[ -n "$id" ]] || { echo "Usage: $0 flash <endpoint-id>" >&2; exit 1; }
    echo "[*] Generating one-time flash token..."
    curl -sS -X POST "$HOST/api/flash/$id" | jq .
    ;;

  info)
    id="${1:-}"
    [[ -n "$id" ]] || { echo "Usage: $0 info <endpoint-id>" >&2; exit 1; }
    curl -sS "$HOST/api/projects/$id" | jq .
    ;;

  delete)
    id="${1:-}"
    [[ -n "$id" ]] || { echo "Usage: $0 delete <endpoint-id>" >&2; exit 1; }
    echo "[!] Deleting $id and all its files"
    curl -sS -X DELETE "$HOST/api/projects/$id" | jq .
    ;;

  *)
    echo "Unknown command: $cmd" >&2
    echo "Usage: $0 {create|push|pull|flash|info|delete} [args]" >&2
    exit 1
    ;;
esac
