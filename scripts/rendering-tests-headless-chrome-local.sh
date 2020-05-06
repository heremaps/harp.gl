#!/bin/sh

#
# Run harp.gl rendering tests (see [../test/README.md]) on locally installed
# Chrome running in headless/software rendering mod
#
# Prerequisite: yarn build-tests
#


npx ts-node -- ./scripts/with-http-server.ts \
    -r ../@here/harp-test-utils/lib/rendering/RenderingTestResultServer.ts \
    -C dist/test \
    -p 7777 \
    -- \
        npx mocha-webdriver-runner \
            --config ./test/rendering/chrome-headless-softgl.json \
            http://localhost:7777/rendering.html
