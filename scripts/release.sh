#!/usr/bin/env bash
# SPDX-License-Identifier: GPL-3.0-or-later
# Structorizer Web: install, test, build, package and (optionally) publish in one go.
#
#   ./scripts/release.sh                  install, test, build both web versions + MCP, package into release/
#   ./scripts/release.sh --skip-tests     same without running the tests
#   ./scripts/release.sh --with-guide     include the user guide PDF in the web package (only if you may redistribute it)
#   ./scripts/release.sh --publish        additionally: push main, tag v<version>, create a GitHub release with the packages
#   ./scripts/release.sh --publish --draft
#
# Needs: bash, git, Node.js >= 20 with npm. --publish also needs the GitHub CLI (gh), signed in.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WEB="$ROOT/main/web"
MCP="$ROOT/main/mcp"
SKIP_TESTS=0; PUBLISH=0; DRAFT=0; GUIDE=""

for arg in "$@"; do
  case "$arg" in
    --skip-tests) SKIP_TESTS=1 ;;
    --publish) PUBLISH=1 ;;
    --draft) DRAFT=1 ;;
    --with-guide) GUIDE="--with-guide" ;;
    -h|--help) sed -n '3,12p' "$0"; exit 0 ;;
    *) echo "unknown option: $arg (see --help)" >&2; exit 2 ;;
  esac
done

step() { printf '\n\033[1;36m==> %s\033[0m\n' "$*"; }
fail() { printf '\033[1;31merror:\033[0m %s\n' "$*" >&2; exit 1; }

command -v node >/dev/null || fail "Node.js is not installed (https://nodejs.org, version 20 or newer)"
command -v npm  >/dev/null || fail "npm is not installed"
NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]')"
[ "$NODE_MAJOR" -ge 20 ] || fail "Node.js $NODE_MAJOR found, version 20 or newer is needed"

VERSION="$(node -p "require('$WEB/package.json').version")"
SHORT="${VERSION%-web.*}"
step "Structorizer Web $VERSION"

step "Installing dependencies"
(cd "$WEB" && npm ci --no-fund --no-audit)
(cd "$MCP" && npm ci --no-fund --no-audit)

if [ "$SKIP_TESTS" -eq 0 ]; then
  step "Testing the web app"
  (cd "$WEB" && npm run typecheck && npm test)
  step "Testing the MCP server (builds it)"
  (cd "$MCP" && npm test)
else
  (cd "$MCP" && npm run build)
fi

step "Building the web version (multi-file, with documentation)"
(cd "$WEB" && npx vite build)
step "Building the single-file version"
(cd "$WEB" && npx vite build --mode single)

step "Packaging into release/"
node "$ROOT/scripts/package.mjs" $GUIDE

if [ "$PUBLISH" -eq 1 ]; then
  command -v gh >/dev/null || fail "--publish needs the GitHub CLI (gh)"
  gh auth status >/dev/null 2>&1 || fail "gh is not signed in (gh auth login)"
  cd "$ROOT"
  [ -z "$(git status --porcelain --untracked-files=no)" ] || fail "uncommitted changes: commit them first"
  BRANCH="$(git rev-parse --abbrev-ref HEAD)"
  TAG="v$VERSION"
  step "Pushing $BRANCH"
  git push origin "$BRANCH"
  if git rev-parse -q --verify "refs/tags/$TAG" >/dev/null; then
    echo "tag $TAG exists"
  else
    git tag -a "$TAG" -m "Structorizer Web $VERSION"
  fi
  git push origin "$TAG"
  step "Creating the GitHub release $TAG"
  NOTES="$(node -e "
    const t=require('fs').readFileSync('CHANGELOG.md','utf8');
    const m=t.split(/^## \[/m).find(s=>s.startsWith('$VERSION'));
    console.log(m ? m.split('\n').slice(1).join('\n').trim() : 'See CHANGELOG.md');")"
  FLAGS=()
  [ "$DRAFT" -eq 1 ] && FLAGS+=(--draft)
  gh release create "$TAG" release/*.zip "release/structorizer-$SHORT.html" release/SHA256SUMS.txt \
    --title "Structorizer Web $SHORT" --notes "$NOTES" "${FLAGS[@]}"
fi

step "Done"
ls -lh "$ROOT/release"
