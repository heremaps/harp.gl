#!/bin/bash
# This script prepares the documentation to be deployed by Travis to S3 and
# gh-pages.
# Precondition: documentation ready on /dist folder
# including docs and examples (e.g. after yarn run build && yarn run typedoc)

folder_name='master'
if [ "$TRAVIS_BRANCH" != "master" ]; then
    folder_name=`git rev-parse --short HEAD`
fi

# create the following directory structure
# dist
# ├──s3_deploy (to be deployed to s3)
# │   ├── [ master | {githash} ] (folder with docs and examples)
# ├──gh_deploy (to be deployed to gh-pages)
# │   ├── index.html (and assets for minisite)
# │   ├── releases.json (list all releases in order)

mkdir -p dist/gh_deploy
mv dist/index.html dist/gh_deploy
mv dist/css dist/gh_deploy
mv dist/resources dist/gh_deploy
mv dist/js dist/gh_deploy
mv dist/redirect_examples dist/gh_deploy/examples
mv dist/redirect_docs dist/gh_deploy/docs

mv dist/_config.yml dist/gh_deploy

mkdir -p dist/s3_deploy/${folder_name}
mv dist/doc* dist/s3_deploy/${folder_name}
mv dist/examples dist/s3_deploy/${folder_name}

# create (or update) the releases.json file containing a json object
# listing all releases with the following format
# [
#   {
#    "date": "{timestamp}",
#    "hash": "{githash}"
#   }
# ]
# ordered so that the most recent is always the first one
# note: master is not included

if [ "$TRAVIS_BRANCH" != "master" ]; then
    print_date=`date +"%d-%m-%y"`
    new_release='{ "date": "'${print_date}'","hash": "'${folder_name}'"}'
    wget 'https://heremaps.github.io/harp.gl/releases.json'

    if [ ! -f releases.json ]; then
        echo -e '[\n'${new_release}'\n]\n' > releases.json
    else
        sed -i -e "2i$new_release,\n" releases.json
    fi

    mv releases.json dist/gh_deploy
fi
