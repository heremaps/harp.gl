# @here/harp-utils

## Overview

This module provides utility classes. Such as, but not limited to:

* logging
* caching
* URL resolving
* Simple Math

## Logger
Custom logger for writing messages to browser console or separate window.
Messages could be filtered by log names or completely disabled via URI parameters or UI.
Logger name is required and cannot be empty.

```javascript
import { LoggerManager, LogLevel } from '@here/harp-utils';

const loggerManager = LoggerManager.instance;

// Create named logger and configure it to Warn log level.
const logger: ILogger = loggerManager.create('my logger', {
    level: LogLevel.Warn
});

// Warning 'my logger: something' logged to output.
logger.warn('something...');

// Won't be logged because log level is 'warn'.
logger.log('not logged...');

// Now, message is logged.
logger.level = LogLevel.Log;
logger.log('logged...');

// Be good developer. Free resources after you done.
// Unregister logger from global registry.
loggerManager.dispose(logger);

```
