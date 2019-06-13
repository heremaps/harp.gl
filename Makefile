#
# Usage
#    make <script from package.json>
#
# Runs all tasks from package.json in correct order and deps, so this can be parallelized.
# (Good results observed up to -j4).
#
# By default, all output of successfull command is skipped, to enable it set VERBOSE env variable
# like this:
#
#    VERBOSE=1 make

tasks = \
	tslint prettier \
	test \
	build-examples \
	build-bundle \
	build-tests \
	test-browser-chrome test-browser-firefox \
	typedoc

default: $(tasks)

# custom targets and
build: build-examples build-bundle
test: test-browser
test-browser: test-browser-chrome test-browser-firefox

app_sources_ts=$(shell find @here/*/src -name "*.ts")
lib_sources_ts=$(shell find @here/*/lib -name "*.ts" | egrep -v ".d.ts") $(shell find @here/*/index*.ts)
test_sources_ts=$(shell find test @here/*/test -name "*.ts")

all_sources=$(lib_sources_ts) $(test_sources_ts) $(app_sources_ts)

# dependencies definitions
.tasks/build-examples: $(test_sources_ts) .tasks/build-bundle
.tasks/build-bundle: $(lib_sources_ts)

.tasks/tslint: $(all_sources)
.tasks/typedoc: $(lib_sources_ts)
.tasks/prettier: $(all_sources)

.tasks/test: $(lib_sources_ts) $(test_sources_ts)
.tasks/build-tests: $(lib_sources_ts) $(test_sources_ts)

# custom tasks, should be added to package.json actually
.tasks/test-browser-chrome: build-tests
	@./scripts/ci-task.sh $@ yarn test-browser --headless-firefox

.tasks/test-browser-firefox: build-tests
	@./scripts/ci-task.sh $@ yarn test-browser --headless-chrome

# workaround, firefox depend on chrome tests, so we don't run in parallel and we have problem with
# EADDRINUSE
.tasks/test-browser-firefox: .tasks/test-browser-chrome

.tasks/%: package.json
	@./scripts/ci-task.sh $@ yarn run $(@F)

$(tasks): %: .tasks/%
