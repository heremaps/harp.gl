#!/bin/sh

#
# Run a command with Chrome/Firefox Selenium Node running in docker.
#
# Designed for local testing with tests served on `locahost`, so docker operates in `host` network
# mode and thus bind to real localhost and more importantly can access real localhost urls.
#
#
# Example
#
#    bash with-docker-selenium.sh --firefox npx mocha-webdriver-runner http://localhost:8080/
#    bash with-docker-selenium.sh --chrome npx mocha-webdriver-runner http://localhost:8080/
#
# Note: On non-Linux platforms (Mac,Windows) you must use `host.docker.internal`, in future maybe
# all platforms will use `host.docker.internal`.
# See: https://stackoverflow.com/questions/48546124/what-is-linux-equivalent-of-docker-for-mac-host-internal
#
# Usage
#
#    with-docker-selenium.sh [options] COMMAND
#
# Options
#    --chrome - select latest Chrome image (default)
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

SCRIPT_NAME=with-docker-selenium

dir=.
port=4444
image=selenium/standalone-chrome
export SELENIUM_BROWSER=${SELENIUM_BROWSER-chrome}

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

OSNAME=`uname`

dockerCommand="docker run --rm -d -p 4444:4444"
if [ "$OSNAME" = "Linux" ]; then
    dockerCommand="$dockerCommand --network=host"
fi
dockerCommand="$dockerCommand $image"

echo "$SCRIPT_NAME: $dockerCommand &" >&2
if ! containerId=$($dockerCommand) ; then
    echo "$0: failed to start docker image $image"  >&2
    exit 2
fi

echo "$SCRIPT_NAME: # started docker container $containerId" >&2
attemptNumber=0
while ! curl -fI http://localhost:$port/wd/hub >/dev/null 2>&1  ; do
    # check if we have some attempts left
    if [ "$attemptNumber" -gt 10 ] ; then
        echo "$SCRIPT_NAME: # stopping docker container $containerId" >&2
        docker kill $containerId
        exit 1
    fi
    attemptNumber=`expr $attemptNumber + 1`
    sleep 1
done

echo "$SCRIPT_NAME: $@" >&2
export SELENIUM_REMOTE_URL=http://localhost:$port/wd/hub

"$@"

exitCode=$?

echo "$SCRIPT_NAME: # stopping docker container $containerId" >&2
docker stop $containerId
exit $exitCode
