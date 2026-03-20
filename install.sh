#!/usr/bin/env bash
#
# Forge Framework Installer
# Copies skills and agents to ~/.claude/ and registers hooks.
#
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CLAUDE_DIR="${HOME}/.claude"

echo "Forge Framework Installer"
echo "========================="
echo ""

# Check prerequisites
if ! command -v node &>/dev/null; then
  echo "Error: Node.js is required but not found. Install Node.js 18+ first."
  exit 1
fi

NODE_VERSION=$(node -v | sed 's/v//' | cut -d. -f1)
if [ "$NODE_VERSION" -lt 18 ]; then
  echo "Error: Node.js 18+ required, found v${NODE_VERSION}."
  exit 1
fi

# Create directories
mkdir -p "${CLAUDE_DIR}/skills"
mkdir -p "${CLAUDE_DIR}/agents"

# Copy skills
echo "Installing forge skill..."
if [ -d "${CLAUDE_DIR}/skills/forge" ]; then
  echo "  Existing forge skill found - backing up to forge.backup"
  rm -rf "${CLAUDE_DIR}/skills/forge.backup"
  mv "${CLAUDE_DIR}/skills/forge" "${CLAUDE_DIR}/skills/forge.backup"
fi
cp -r "${SCRIPT_DIR}/skills/forge" "${CLAUDE_DIR}/skills/forge"
echo "  Copied to ${CLAUDE_DIR}/skills/forge/"

# Copy agents
echo "Installing forge agents..."
for agent in "${SCRIPT_DIR}"/agents/forge-*.md; do
  name=$(basename "$agent")
  if [ -f "${CLAUDE_DIR}/agents/${name}" ]; then
    cp "${CLAUDE_DIR}/agents/${name}" "${CLAUDE_DIR}/agents/${name}.backup"
  fi
  cp "$agent" "${CLAUDE_DIR}/agents/${name}"
  echo "  Installed ${name}"
done

# Register hooks
echo ""
echo "Registering hooks..."
node "${CLAUDE_DIR}/skills/forge/scripts/register-hooks.js"

echo ""
echo "Installation complete!"
echo ""
echo "Next steps:"
echo "  1. Open a project in Claude Code"
echo "  2. Run: /forge init"
echo "  3. Run: /forge start"
echo ""
echo "To uninstall:"
echo "  node ~/.claude/skills/forge/scripts/register-hooks.js --unregister"
echo "  rm -rf ~/.claude/skills/forge"
echo "  rm ~/.claude/agents/forge-*.md"
