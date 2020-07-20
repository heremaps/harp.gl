# harp.gl website

Source for [harp.gl](https://www.harp.gl) "landing" page


## Local testing/development

* `yarn start --open` - starts `webpack-dev-server` for this project

* `yarn build` -> build into `dist/` ->

## Production architecture

Main part of "app", Examples and docs are hosted on S3, behind Cloudfront. [harp.gl](https://www.harp.gl).

## Production Deployment

(all paths relative to `harp.gl` project root)

1) `harp.gl` site is static and lives in `www/index.html`. It creates bundle from current `harp.gl`
   sources into `www/dist/`
2) `yarn typedoc` - builds docs into `doc/`
3) `yarn examples` - builds examples into `dist/examples`

4) Then `scripts/prepare_doc_deploy.sh` - executed only on `master` and `release` branch distributes
  files created in previous steps into

   * `dist/s3_deploy`
   * `dist/gh_deploy`

   and additionally, if branch === `release` adds new version to `dist/gh_deploy/releases.json`.

