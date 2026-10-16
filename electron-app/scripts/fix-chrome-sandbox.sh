#!/bin/bash -x

# Only run on Linux
[[ "$(uname -s)" == "Linux" ]] || exit 0

DEFAULT_SANDBOX_EXECUTABLE="../node_modules/electron/dist/chrome-sandbox"
SANDBOX_EXECUTABLE=${1:-$DEFAULT_SANDBOX_EXECUTABLE}

if [[ ! -e "$SANDBOX_EXECUTABLE" ]]; then
    echo "Executable '$SANDBOX_EXECUTABLE' does not exist." >&2
    exit 1
fi

if [[ "$(stat -c '%u:%g:%a' "$SANDBOX_EXECUTABLE")" == "0:0:4755" ]]; then
    echo "chrome-sandbox permissions already correct."
    exit 0
fi

SUDO=""
[[ $EUID -ne 0 ]] && SUDO="sudo"

echo "Changing permissions and ownership of $SANDBOX_EXECUTABLE"
$SUDO chown root:root "$SANDBOX_EXECUTABLE"
$SUDO chmod 4755 "$SANDBOX_EXECUTABLE"
