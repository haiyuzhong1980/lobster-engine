#!/usr/bin/env bash
# Run code generation for tangping_lobster.
# Requires Flutter SDK and pub dependencies installed.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

cd "$PROJECT_DIR"

echo ">> Getting Flutter dependencies..."
flutter pub get

echo ">> Running build_runner (delete conflicting outputs)..."
dart run build_runner build --delete-conflicting-outputs

echo ">> Code generation complete."
