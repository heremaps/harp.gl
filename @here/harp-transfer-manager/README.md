# @here/harp-transfer-manager

## Overview

This module provides a download manager that orchestrates downloading URLs, particularly static map resources.

The module:

* limits the number of parallel concurrent downloads
* retries downloads on HTTP errors with increasing timeouts, which is the best practice for many content delivery platforms
* combines multiple JSON requests for the same URL to prevent downloading the same resource multiple times
* allows to override the default `fetch` function used for downloading URLs
