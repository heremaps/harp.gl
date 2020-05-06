#!/bin/sh

#
# Run harp.gl rendering tests (see [../test/README.md]) on reference platform i.e
#
#   Headless Chrome 80 on Linux with GPU disabled
#

#
# Docker image with chrome
#
# See https://github.com/SeleniumHQ/docker-selenium/releases.
#
# zirconium stands for chrome 80
REFERENCE_IMAGE=selenium/standalone-chrome:3.141.59-zirconium

yarn build-tests

OSNAME=`uname`
if [ "$OSNAME" = "Linux" ]; then
    testAppHost="localhost"
else
    testAppHost="host.docker.internal"
fi

npx ts-node -- ./scripts/with-http-server.ts \
    -r ../@here/harp-test-utils/lib/rendering/RenderingTestResultServer.ts \
    -C dist/test \
    -p 7777 \
    -- \
    ./scripts/with-docker-selenium.sh --image $REFERENCE_IMAGE \
        npx mocha-webdriver-runner \
            --config ./test/rendering/chrome-headless-softgl.json \
            http://$testAppHost:7777/rendering.html
