#!/bin/sh

yarn build-tests

npx ts-node -- \
    ./scripts/with-http-server.ts -r ../@here/harp-test-utils/lib/rendering/RenderingTestResultServer.ts -C dist/test -p 7777 -- \
        ./scripts/with-docker-selenium.sh --image selenium/standalone-chrome:3.141.59-xenon \
            mocha-webdriver-runner \
                -C browserName=chrome \
                -C goog:chromeOptions.args='["--headless", "--disable-gpu=true", "--no-sandbox", "--disable-dev-shm-usage", "--window-size=1280,800"]' \
                http://localhost:7777/rendering.html
