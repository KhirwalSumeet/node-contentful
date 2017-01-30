
'use strict';

const winston = require('winston');
const util = require('util');

const transports = [new (winston.transports.Console)({ level: 'debug' })];
const logger = new (winston.Logger)({ transports });

/**
 * Log error details with signature
 * @param err the error
 * @param signature the signature
 */
logger.logFullError = function (err, signature) { // eslint-disable-line
  if (!err) {
    return;
  }
  if (signature) {
    logger.error(`Error occurred at ${signature}.`);
  }
  const args = Array.prototype.slice.call(arguments);
  args.shift();
  logger.error.apply(logger, args);
  logger.error(util.inspect(err));
  if (!err.logged) {
    logger.error(err.stack);
  }
  err.logged = true;
};

module.exports = logger;
