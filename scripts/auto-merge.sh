#!/usr/bin/env bash
#
# auto-merge.sh — CueDeck PR merge queue.
#
# Strategy (runs each cycle, lowest PR number first):
#   1. For every open `fix/issue-*` PR whose head is CLEAN and (if CI exists) green,
#      squash-merge it into the base branch and delete the branch.
#   2. Report which PRs are CONFLICTING so a resolver worker can rebase them.
#
# This script ONLY performs safe merges. Conflict *resolution* (rebasing a branch
# and fixing code) is done by an AI worker, not here, because it requires judgement.
#
# Env:
#   REPO        default: rwrife/cuedeck
#   BASE        default: master
#   DRY_RUN     if set to 1, only prints what it would do.
#   REQUIRE_CI  if set to 1, refuse to merge unless checks exist AND pass.
#
set -uo pipefail

REPO="${REPO:-rwrife/cuedeck}"
BASE="${BASE:-master}"
DRY_RUN="${DRY_RUN:-0}"
REQUIRE_CI="${REQUIRE_CI:-0}"

log() { echo "[auto-merge $(date -u +%H:%M:%S)] $*"; }

# List open fix/issue-* PRs, lowest number first, with mergeability + CI rollup.
mapfile -t PRS < <(gh pr list --repo "$REPO" --state open \
  --json number,headRefName,mergeable,mergeStateStatus,statusCheckRollup \
  --jq '[.[] | select(.headRefName | startswith("fix/issue-"))] | sort_by(.number) | .[] | @base64' 2>/dev/null)

if [ "${#PRS[@]}" -eq 0 ]; then
  log "No open fix/issue-* PRs. Queue drained."
  exit 0
fi

CONFLICTED=()
MERGED=()
SKIPPED=()

decode() { echo "$1" | base64 --decode; }

for row in "${PRS[@]}"; do
  json="$(decode "$row")"
  num="$(echo "$json"    | python3 -c 'import json,sys;print(json.load(sys.stdin)["number"])')"
  branch="$(echo "$json" | python3 -c 'import json,sys;print(json.load(sys.stdin)["headRefName"])')"
  mergeable="$(echo "$json" | python3 -c 'import json,sys;print(json.load(sys.stdin).get("mergeable") or "UNKNOWN")')"
  state="$(echo "$json"  | python3 -c 'import json,sys;print(json.load(sys.stdin).get("mergeStateStatus") or "UNKNOWN")')"
  # CI rollup: null => no checks configured yet.
  ci="$(echo "$json" | python3 -c 'import json,sys
d=json.load(sys.stdin).get("statusCheckRollup")
if not d: print("NONE")
else:
    states={c.get("conclusion") or c.get("state") for c in d}
    if states & {"FAILURE","ERROR","CANCELLED","TIMED_OUT","ACTION_REQUIRED"}: print("FAIL")
    elif states & {"PENDING","QUEUED","IN_PROGRESS",None,"EXPECTED"}: print("PENDING")
    else: print("PASS")')"

  case "$mergeable" in
    CONFLICTING)
      log "PR #$num ($branch): CONFLICTING — needs rebase/resolve."
      CONFLICTED+=("$num:$branch")
      continue
      ;;
    UNKNOWN)
      log "PR #$num ($branch): mergeability UNKNOWN (GitHub still computing) — skip this cycle."
      SKIPPED+=("$num")
      continue
      ;;
  esac

  # CI gating
  if [ "$REQUIRE_CI" = "1" ]; then
    if [ "$ci" = "NONE" ]; then
      log "PR #$num: REQUIRE_CI=1 but no checks configured — skip."
      SKIPPED+=("$num"); continue
    fi
  fi
  if [ "$ci" = "FAIL" ]; then
    log "PR #$num: CI failing — skip."
    SKIPPED+=("$num"); continue
  fi
  if [ "$ci" = "PENDING" ]; then
    log "PR #$num: CI pending — skip this cycle."
    SKIPPED+=("$num"); continue
  fi

  # Also respect a "blocked" merge state (e.g. required review) unless it's just 'clean'/'unstable'.
  if [ "$state" = "BLOCKED" ]; then
    log "PR #$num: merge state BLOCKED (branch protection/review) — skip."
    SKIPPED+=("$num"); continue
  fi

  if [ "$DRY_RUN" = "1" ]; then
    log "PR #$num ($branch): WOULD squash-merge (mergeable=$mergeable, state=$state, ci=$ci)."
    MERGED+=("$num")
    continue
  fi

  log "PR #$num ($branch): squash-merging…"
  if gh pr merge "$num" --repo "$REPO" --squash --delete-branch 2>&1; then
    log "PR #$num merged."
    MERGED+=("$num")
    # After a merge the base moves; remaining branches may now conflict.
    # Give GitHub a moment before evaluating the next one.
    sleep 4
  else
    log "PR #$num: merge command failed — leaving open."
    SKIPPED+=("$num")
  fi
done

echo
log "SUMMARY  merged=[${MERGED[*]:-}]  conflicted=[${CONFLICTED[*]:-}]  skipped=[${SKIPPED[*]:-}]"

# Emit conflicted list on a stable marker line so a caller can parse it.
if [ "${#CONFLICTED[@]}" -gt 0 ]; then
  echo "CONFLICTED_PRS=${CONFLICTED[*]}"
fi
