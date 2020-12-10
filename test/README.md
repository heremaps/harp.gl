# Rendering Tests

Tests for components that render images. They render images to canvas and compare the result image
with approved reference images.
Tests are run in the browser headless mode, uses `mocha-webdriver-runner` to run `mocha` tests
in browser context.

## What to do first? Where to start?

Before start the work on implementing new features you should run rendering tests first to
generate actual images and store them as reference images to have possibility of making comparison
with right images after doing some changes in code.

### Prerequisites
-   Linux
-   Docker installed

### Tests execution - build and run locally

1. Run command:

```shell
    yarn run-rendering-tests
```

The first time you run the command it will pull the docker image to your system, therefore, the output might look similar to this:
```
$yarn run-rendering-tests
yarn run v1.17.3
$ ./scripts/rendering-tests-reference-platform.sh
$ webpack --config webpack.tests.config.js
[hardsource:51b0c007] Writing new cache 51b0c007...
[hardsource:51b0c007] Tracking node dependencies with: yarn.lock.
Time: 171135ms
Entrypoint test = test.bundle.js
Entrypoint performance-test = performance-test.bundle.js
Entrypoint rendering-test = rendering-test.bundle.js
with-http-server: Serving /home/user/dev/coresdk/dist/test at http://localhost:7777
with-http-server: Running ./scripts/with-docker-selenium.sh --image selenium/standalone-chrome:3.141.59-zirconium \
mocha-webdriver-runner -C browserName=chrome -C goog:chromeOptions.args=["--headless", "--disable-gpu=true", "--no-sandbox", "--disable-dev-shm-usage", "--window-size=1280,800"] http://localhost:7777/rendering.html
./scripts/with-docker-selenium.sh: docker run --rm -d --network=host selenium/standalone-chrome:3.141.59-zirconium &
Unable to find image 'selenium/standalone-chrome:3.141.59-zirconium' locally
3.141.59-zirconium: Pulling from selenium/standalone-chrome
5b7339215d1d: Pulling fs layer
14ca88e9f672: Pulling fs layer
.....
bb019cc37fdf: Pull complete
Digest: sha256:d0ed6e04a4b87850beb023e3693c453b825b938af48733c1c56fc671cd41fe51
Status: Downloaded newer image for selenium/standalone-chrome:3.141.59-zirconium
./scripts/with-docker-selenium.sh: # started docker container db31cb2caca09d2d290d40b3ec51772676dfb2b83e02b0c7a359b39b5b0a6368
```

After the first run, it will not need to pull the image anymore.

2. Local reference images

Now, the problem is that first run skips all tests because there are no reference images.
You need to establish base reference images for your platform (Hint!, it's good to establish them on
clean working copy!).

So, you see that all the tests ran, but you see only that all the tests are skipped and see only
_current_ images in browser window.

Note, that `RenderingTestResultServer` already saved all the images in `rendering-test-results/{PLATFORM}`, so
you have to establish reference images by calling
```bash
$ yarn save-reference
# it should output stg like
RenderingTestResultCli: rendering-test-results/Chrome-78.0.3904.97-Linux/mapview-geojson-extruded-polygon-flat.reference.png: establishing reference image
RenderingTestResultCli: rendering-test-results/Chrome-78.0.3904.97-Linux/mapview-geojson-extruded-polygon-with-height-color.reference.png: establishing reference image
RenderingTestResultCli: rendering-test-results/Chrome-78.0.3904.97-Linux/mapview-geojson-extruded-polygon-with-height.reference.png: establishing reference image
RenderingTestResultCli: rendering-test-results/Chrome-78.0.3904.97-Linux/mapview-geojson-polygon-fill.reference.png: establishing reference image
RenderingTestResultCli: rendering-test-results/Chrome-78.0.3904.97-Linux/text-canvas-hello-world-path.reference.png: establishing reference image
...
```

Now, you can restart tests by running `yarn run-rendering-tests`, they should find reference images and report successes.

Then you can start coding!

3. Approving changed images

If your tests fail, because you've changed something you can ACK reference images with
```
yarn approve-reference-rendering-tests
```
Next text runs, should use these files as reference.

Note, this is only _local_ approve.

## Interactive mode

1. Run command:

```shell
yarn start-tests
```

Starts `webpack-dev-server` which compiles your rendering tests on the fly
and should print port it listens on like this:

```
(...) Project is running at http://localhost:8081/
```

Open `http://localhost:8081/rendering.html`, in favorite browser. Tests will run.

2. If runned first time you should also establish local reference images
 by running command (as described in "Local reference images" section):

```bash
yarn save-reference-rendering-tests
```

After that you can refresh the page: http://localhost:8080/rendering.html and start coding.
