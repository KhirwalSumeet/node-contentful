/*
 * Copyright (C) 2016 TopCoder Inc., All Rights Reserved.
 */
/**
 * This module contains the helper functions.
 * @author TCSCODER
 * @version 1.0
 */
'use strict';

const path = require('path');
const _ = require('underscore');
const request = require('request');

// stores milliseconds of last requests to contentful, used to throttle contentful requests
const lastTimestamps = [];

/**
 * This function allocates request to contentful API, it makes sure the rate limit is not exceeded.
 * It may wait if rate limit is reached.
 * @param {Object} config the config object
 * @param {Function} callback asynchronous callback invoked upon method completion
 */
function allocateContentfulRequest(config, callback) {
  // remove outdated timestamps
  while (lastTimestamps.length > 0 && lastTimestamps[0] + config.CONTENTFUL_RATE_LIMIT_PERIOD < new Date().getTime()) {
    lastTimestamps.shift();
  }
  if (lastTimestamps.length >= config.CONTENTFUL_RATE_LIMIT_COUNT) {
    // need to wait, then retry
    setTimeout(() => allocateContentfulRequest(config, callback), config.CONTENTFUL_RATE_LIMIT_RETRY_PERIOD);
  } else {
    // ok, can do request
    lastTimestamps.push(new Date().getTime());
    callback();
  }
}

/**
 * This function gets config from given config path.
 * @param configPath the config path
 * @param {return} the config object
 */
function getConfig(configPath) {
  let p = configPath;
  if (!path.isAbsolute(p)) {
    p = path.join(process.cwd(), p);
  }
  return require(p);
}

/**
 * Create contentful entry.
 * @param {Object} config the config object
 * @param {String} lang the language
 * @param {Object} row the table row
 * @param {Object} mapping the mapping
 * @param {Function} callback asynchronous callback invoked upon method completion
 */
function createContentfulEntry(config, lang, row, mapping, callback) {
  const language = [];
  row.forEach((index, arr) => {
    language.push(row[arr][config.TABLE_CONTENTFUL_LANG_COLUMN]);
  });
  const tableId = row[0][config.TABLE_ID_COLUMN];
  const obj = { fields: {} };
  obj.fields[config.CONTENTFUL_TABLE_ID_FIELD] = {};
  row.forEach((index, arr) => { obj.fields[config.CONTENTFUL_TABLE_ID_FIELD][language[arr]] = tableId; });
  _.each(mapping, (field, column) => {
    obj.fields[field] = {};
    row.forEach((index, arr) => {
      obj.fields[field][language[arr]] = row[arr][column];
    });
  });
  // create contentful entry
  allocateContentfulRequest(config, () => {
    request({
      uri: `https://api.contentful.com/spaces/${config.CONTENTFUL_SPACE_ID}/entries`,
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.CONTENTFUL_ACCESS_TOKEN}`,
        'X-Contentful-Content-Type': `${config.CONTENTFUL_CONTENT_TYPE}`,
        'Content-Type': 'application/vnd.contentful.management.v1+json',
      },
      json: true,
      body: obj,
    }, callback);
  });
}

/**
 * Update contentful entry.
 * @param {Object} config the config object
 * @param {String} lang the language
 * @param {Object} row the table row
 * @param {Object} mapping the mapping
 * @param {Function} callback asynchronous callback invoked upon method completion
 */
function updateContentfulEntry(config, lang, row, mapping, callback) {
  const contentfulId = row[0][config.TABLE_CONTENTFUL_ID_COLUMN];
  const contentfulVersion = row[0][config.TABLE_CONTENTFUL_VERSION_COLUMN];
  const language = [];
  row.forEach((index, arr) => { language.push(row[arr][config.TABLE_CONTENTFUL_LANG_COLUMN]); });
  const tableId = row[0][config.TABLE_ID_COLUMN];
  const obj = { fields: {} };
  obj.fields[config.CONTENTFUL_TABLE_ID_FIELD] = {};
  row.forEach((index, arr) => { obj.fields[config.CONTENTFUL_TABLE_ID_FIELD][language[arr]] = tableId; });
  _.each(mapping, (field, column) => {
    obj.fields[field] = {};
    row.forEach((index, arr) => { obj.fields[field][language[arr]] = row[arr][column]; });
  });
  // checking for any new locale entry
  for (let key in obj.fields[contentfulId]) {
    if (obj.fields[contentfulId][key] === null) {
      obj.fields[contentfulId][key] = contentfulId;
    }
  }
  // update contentful entry
  allocateContentfulRequest(config, () => {
    request({
      uri: `https://api.contentful.com/spaces/${config.CONTENTFUL_SPACE_ID}/entries/${contentfulId}`,
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${config.CONTENTFUL_ACCESS_TOKEN}`,
        'X-Contentful-Content-Type': config.CONTENTFUL_CONTENT_TYPE,
        'Content-Type': 'application/vnd.contentful.management.v1+json',
        'X-Contentful-Version': contentfulVersion,
      },
      json: true,
      body: obj,
    }, callback);
  });
}

/**
 * Publish contentful entry.
 * @param {Object} config the config object
 * @param {String} entryId the entry id
 * @param {String} version the contentful version
 * @param {Function} callback asynchronous callback invoked upon method completion
 */
function publishContentfulEntry(config, entryId, version, callback) {
  allocateContentfulRequest(config, () => {
    request({
      uri: `https://api.contentful.com/spaces/${config.CONTENTFUL_SPACE_ID}/entries/${entryId}/published`,
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${config.CONTENTFUL_ACCESS_TOKEN}`,
        'X-Contentful-Version': version,
      },
      json: true,
    }, (err, response, body) => {
      if (err) {
        callback(err);
      } else if (response.statusCode !== 200) {
        callback(new Error(`Failed to publish contentful entry of id: ${entryId}`));
      } else {
        callback(null, body);
      }
    });
  });
}

/**
 * Draft (unpublish) contentful entry.
 * @param {Object} config the config object
 * @param {String} entryId the entry id
 * @param {String} version the contentful version
 * @param {Function} callback asynchronous callback invoked upon method completion
 */
function draftContentfulEntry(config, entryId, version, callback) {
  allocateContentfulRequest(config, () => {
    request({
      uri: `https://api.contentful.com/spaces/${config.CONTENTFUL_SPACE_ID}/entries/${entryId}/published`,
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${config.CONTENTFUL_ACCESS_TOKEN}`,
        'X-Contentful-Version': version,
      },
      json: true,
    }, (err, response) => {
      if (err) {
        callback(err);
      } else if (response.statusCode !== 200) {
        callback(new Error(`Failed to unpublish contentful entry of id: ${entryId}`));
      } else {
        callback();
      }
    });
  });
}

module.exports = {
  allocateContentfulRequest,
  getConfig,
  createContentfulEntry,
  updateContentfulEntry,
  publishContentfulEntry,
  draftContentfulEntry,
};
