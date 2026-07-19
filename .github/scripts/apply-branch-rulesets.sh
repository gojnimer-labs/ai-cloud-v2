#!/usr/bin/env bash
# Recreates the production/development branch rulesets and their environment
# branch locks. This is the source of truth for what actually gates merges —
# previously this only existed as one-off `gh api` calls made by hand, with
# nothing in the repo recording what the rules were supposed to be. Re-run
# this (idempotent-ish: environments/rulesets are recreated by name) if the
# rulesets are ever edited, deleted, or need reproducing on a fork.
#
# Requires: gh CLI authenticated with repo admin access.
set -euo pipefail

REPO="gojnimer-labs/ai-cloud-v2"

echo "== production environment, locked to branch 'main' =="
echo '{"deployment_branch_policy":{"protected_branches":false,"custom_branch_policies":true}}' \
  | gh api --method PUT "repos/$REPO/environments/production" --input - >/dev/null
gh api --method POST "repos/$REPO/environments/production/deployment-branch-policies" \
  -f name=main >/dev/null 2>&1 || true # already exists

echo "== development environment, locked to branch 'development' =="
echo '{"deployment_branch_policy":{"protected_branches":false,"custom_branch_policies":true}}' \
  | gh api --method PUT "repos/$REPO/environments/development" --input - >/dev/null
gh api --method POST "repos/$REPO/environments/development/deployment-branch-policies" \
  -f name=development >/dev/null 2>&1 || true # already exists

echo "== main ruleset: PR required, 'deploy' check required, development must have deployed =="
cat <<'EOF' | gh api --method POST "repos/gojnimer-labs/ai-cloud-v2/rulesets" --input - >/dev/null
{
  "name": "main-protection",
  "target": "branch",
  "enforcement": "active",
  "conditions": { "ref_name": { "include": ["refs/heads/main"], "exclude": [] } },
  "rules": [
    { "type": "deletion" },
    { "type": "non_fast_forward" },
    {
      "type": "pull_request",
      "parameters": {
        "required_approving_review_count": 0,
        "dismiss_stale_reviews_on_push": true,
        "require_code_owner_review": false,
        "require_last_push_approval": false,
        "required_review_thread_resolution": false
      }
    },
    {
      "type": "required_status_checks",
      "parameters": {
        "strict_required_status_checks_policy": false,
        "required_status_checks": [{ "context": "deploy" }]
      }
    },
    {
      "type": "required_deployments",
      "parameters": { "required_deployment_environments": ["development"] }
    }
  ]
}
EOF

echo "== development ruleset: PR required, 'lint' + 'test' checks required =="
cat <<'EOF' | gh api --method POST "repos/gojnimer-labs/ai-cloud-v2/rulesets" --input - >/dev/null
{
  "name": "development-protection",
  "target": "branch",
  "enforcement": "active",
  "conditions": { "ref_name": { "include": ["refs/heads/development"], "exclude": [] } },
  "rules": [
    { "type": "deletion" },
    { "type": "non_fast_forward" },
    {
      "type": "pull_request",
      "parameters": {
        "required_approving_review_count": 0,
        "dismiss_stale_reviews_on_push": true,
        "require_code_owner_review": false,
        "require_last_push_approval": false,
        "required_review_thread_resolution": false
      }
    },
    {
      "type": "required_status_checks",
      "parameters": {
        "strict_required_status_checks_policy": false,
        "required_status_checks": [{ "context": "lint" }, { "context": "test" }]
      }
    }
  ]
}
EOF

echo "Done. Note: this POSTs new rulesets — if main-protection/development-protection"
echo "already exist, delete them first (gh api repos/$REPO/rulesets to find their IDs,"
echo "then --method DELETE repos/$REPO/rulesets/<id>) or this will create duplicates."
