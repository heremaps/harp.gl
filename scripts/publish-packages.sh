#!/bin/sh -e

#
# Simple script that bundles the publishing of packages
# to be run from Travis
#

echo '//registry.npmjs.org/:_authToken=${NPM_TOKEN}' > ~/.npmrc
npx lerna publish -y from-git --pre-dist-tag alpha
