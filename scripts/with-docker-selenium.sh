#!/bin/sh

#
# Run a command with Chrome/Firefox Selenium Node running in docker.
#
# Designed for local testing with tests served on `locahost`, so docker operates in `host` network
# mode and thus bind to real localhost and more importantly can access real localhost urls.
#
# Example
#
#    bash with-docker-selenium.sh --firefox npx mocha-webdriver-runner http://localhost:8080/
#    bash with-docker-selenium.sh --chrome npx mocha-webdriver-runner http://localhost:8080/
#
# Usage
#
#    with-docker-selenium.sh [options] COMMAND
#
# Options
#    --chrome - select latest Chrome image
#    --firefox - select latest Firefox image
#    -i, --image IMAGE - select particular image
#
#
# Always sets up SELENIUM_REMOTE_URL.
# Both `--chrome` and `--firefox` set up proper SELENIUM_BROWSER and latest images for these
# browsers.
# Requires port 4444 to be free on localhost.
#
# Uses images from https://github.com/SeleniumHQ/docker-selenium
#
# See `docker-selenium` release page (https://github.com/SeleniumHQ/docker-selenium/releases),
# to find image versions for particular browser versions. As example, image
# `selenium/standalone-chrome:3.141.59-radium` will always point at Chrome 75.0.3770.90


dir=.
port=4444
image=selenium/standalone-firefox

while [ -n "$1" ]; do
    case "$1" in
        --image | -i)
            image=${2}
            shift ; shift
            ;;
        --firefox)
            image=selenium/standalone-firefox
            export SELENIUM_BROWSER=firefox
            shift
            ;;
        --chrome)
            image=selenium/standalone-chrome
            export SELENIUM_BROWSER=chrome
            shift
            ;;
        *) break ;;
    esac
done

dockerCommand="docker run --rm -d --network=host $image"
echo "$0: $dockerCommand &" >&2
if ! containerId=$($dockerCommand) ; then
    echo "$0: failed to start docker image $image"  >&2
    exit 2
fi

echo "$0: # started docker container $containerId" >&2
attemptNumber=0
while ! curl -fI http://localhost:$port/wd/hub >/dev/null 2>&1  ; do
    # check if we have some attempts left
    if [ "$attemptNumber" -gt 10 ] ; then
        echo "$0: # stopping docker container $containerId" >&2
        docker kill $containerId
        exit 1
    fi
    attemptNumber=`expr $attemptNumber + 1`
    sleep 1
done

echo "$0: $@" >&2
export SELENIUM_REMOTE_URL=http://localhost:$port/wd/hub

"$@"

exitCode=$?

echo "$0: # stopping docker container $containerId" >&2
docker stop $containerId
exit $exitCode
