#!/usr/bin/env bash

#
# This test checks if `npm` packages we are about to publish to `npmjs.org`
# actually work with sample client application - where this application is
# just output of our `yo @here/harp.gl`.
#
set -e

# all @here/harp-* packages used (directly or indirectly by our test app)
packages=$(
    npx ts-node ./scripts/get-dependencies.ts @here/generator-harp.gl/generators/app/templates/package.json |
    grep @here/harp |
    grep -v @here/harp-font-resources
)


# ensure we have clean environment before and after test
rootDir=`pwd`
function cleanup() {
    cd $rootDir
    git checkout -- package.json @here/*/package.json
    rm -f @here/*/*.tgz
}
trap cleanup EXIT

set -x
cleanup

npx lerna version prepatch  --yes --no-push --no-git-tag-version

# build the npm packages
for package in $packages ; do
    # lerna exec "npm pack" is smarter and, parallel i guess but packages everything
    # and we don't want examples and other stuff
    ( cd $package && npm pack )
done

mkdir -p test-npm-packages-app
cd test-npm-packages-app

# generate test app
rm -rf node_modules package-lock.json
if [ ! -f package.json ] ; then
    yes "" | npx yo ../@here/generator-harp.gl/generators/app/
fi

set +x
for package in $packages ; do
    packageArchives="$packageArchives ../$package/here-$(basename $package)-*.tgz"
done
set -x

# install base deps
npm install

# force use of our local versions
npm install --no-save $packageArchives

# build it
npm run build

# cleanup will be called automatically
