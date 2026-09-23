#!/usr/bin/env bash
set -uo pipefail
node "$(dirname "$0")/run-package-script.mjs" test:browser

