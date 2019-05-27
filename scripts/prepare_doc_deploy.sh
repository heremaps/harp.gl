#!/bin/bash
# This script prepares the documentation to be deployed by Travis to an S3 bucket
# Precondition: documentation ready on /dist folder
# including docs and examples (e.g. after yarn run build && yarn run typedoc)

folder_name='master'
if [ "$TRAVIS_BRANCH" != "master" ]; then
    folder_name=`git rev-parse --short HEAD`
fi

# create the following directory structurey
# dist
# ├──s3_deploy (to be deployed to s3)
# │   ├── master | {githash} (folder with docs and examples)
# ├──gh_deploy (to be deployed to gh-pages)
# │   ├── index.html (and assets for minisite)

mkdir -p dist/gh_deploy
mv dist/index.html dist/gh_deploy
mv dist/css dist/gh_deploy
mv dist/img dist/gh_deploy
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
    new_release='{ \"date\": \"'${print_date}'\",\"hash\": \"'${folder_name}'\"}'
    wget 'http://harp.gl.s3-website-us-east-1.amazonaws.com/docs/releases.json'

    if [ ! -f releases.json ]; then
        echo -e '[\n'${new_release}'\n]\n' > releases.json
    else
        sed -i -e "2i$new_release,\n" releases.json
    fi

    mv releases.json dist/s3_deploy/${folder_name}
fi
