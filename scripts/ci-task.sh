#!/usr/bin/env bash

readonly task_tag_file="$1"
shift

[ -e $task_tag_file ] && rm -f $task_tag_file

readonly task_name=$(basename $task_tag_file)
readonly tmp_file=$(mktemp)

echo "${task_name}: ..." >&2
if ( "$@" ; ) > "$tmp_file" 2>&1 ; then
    mkdir -p $(dirname $task_tag_file)
    touch $task_tag_file
    if [ -n "$VERBOSE" ] ; then
        echo "${task_name}: output" >&2
        cat $tmp_file >&2
        echo "${task_name}: ... ok" >&2
    fi
    rm -f $tmp_file
    exit 0
else
    readonly r="$?"
    echo "${task_name}: $@ failed, output follows" >&2
    cat $tmp_file >&2
    echo "${task_name}: ... fail" >&2
    rm $tmp_file
    exit $r
fi
