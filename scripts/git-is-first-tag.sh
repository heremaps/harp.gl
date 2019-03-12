#!/bin/sh -e

#
# Simple script that returns 0 if a given tag is the
# first tag for the sha it is pointing to.
#

tag="$1"

if [ -z "$tag" ] ; then
    echo "Please provide a tag"
    exit 1
fi

sha=$(git rev-list -n1 "$tag")
allTags=$(git tag --points-at "$sha")

case "$allTags" in
    $tag*)
        echo Tag $tag is the first tag of commit $sha
        exit 0
        ;;
    *)
        echo Tag $tag is not the first tag of commit $sha
        exit 1
        ;;
esac

