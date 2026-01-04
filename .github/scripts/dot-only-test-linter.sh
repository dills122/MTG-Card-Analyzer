#!/bin/bash

dotOnlyFound=$(grep -r --include=\*.spec.js --include=\*.spec.mjs -E '(\.only)' ./)

if [ -z "$dotOnlyFound" ]; then
      echo "No .only found, good to go!"
      exit 0
else
      echo ".only found, please remove this"
      echo "$dotOnlyFound"
      exit 1
fi
