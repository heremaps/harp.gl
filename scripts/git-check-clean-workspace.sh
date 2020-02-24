#!/usr/bin/env bash

set -e

readonly changed_or_dirty=$(git status --porcelain | wc -l)
if [ ${changed_or_dirty} != "0" ] ; then
    echo "$0: fail, some dirty files" >&2
    git status --porcelain >&2
    exit 1
fi
