/*
 * Copyright (C) 2016 TopCoder Inc., All Rights Reserved.
 */

/**
 * The script to handle (insert, update, delete, publish, draft) data from Postgresql to contentful.
 * @author TCSCODER
 * @version 1.1
 */
'use strict';

const _ = require('underscore');
const async = require('async');
const request = require('request');
const pg = require('pg');
const fs = require('fs');
const logger = require('./common/logger');
const helper = require('./common/helper');
let config;

/**
 * This function shows help message.
 */
function showHelp() {
  logger.info('The command can be executed with any of following:');
  logger.info('node src/importer -h');
  logger.info('node src/importer --help');
  logger.info('node src/importer [insert,update,delete,publish,draft,map] [mapping-file] [config-file]');
  logger.info('node src/importer [insert,update,delete,publish,draft] [mapping-file] [config-file] [where-clause]');
}

/**
 * This function generates mapping stub file.
 * @param {String} mapFile the map file to write
 * @param {Function} callback asynchronous callback invoked upon method completion
 */
function generateMap(mapFile, callback) {
  const mapping = {};
  let theDone;
  async.waterfall([
    (cb) => {
      logger.info('Get database table columns.');
      pg.connect(config.DATABASE_URL, cb);
    },
    (client, done, cb) => {
      theDone = done;
      client.query('select column_name, data_type, column_default, is_nullable from information_schema.columns where table_name = $1', // eslint-disable-line
        [config.TABLE], cb);
    },
    (result, cb) => {
      mapping.tableColumns = result.rows;
      // generate stub mapping
      mapping.mapping = {};
      _.each(result.rows, (row) => {
        // id, contentful id, contentful version, contentful status, contentful language columns needn't mapped
        if (!_.contains([config.TABLE_ID_COLUMN, config.TABLE_CONTENTFUL_ID_COLUMN,
          config.TABLE_CONTENTFUL_VERSION_COLUMN, config.TABLE_CONTENTFUL_STATUS_COLUMN,
          config.TABLE_CONTENTFUL_LANG_COLUMN], row.column_name)) {
          mapping.mapping[row.column_name] = '';
        }
      });

      // query contentful content type details
      helper.allocateContentfulRequest(config, () => {
        logger.info('Get contentful content type fields.');
        request({
          uri: `https://api.contentful.com/spaces/${config.CONTENTFUL_SPACE_ID}/public/content_types`,
          method: 'GET',
          qs: { name: config.CONTENTFUL_CONTENT_TYPE_NAME },
          headers: { Authorization: `Bearer ${config.CONTENTFUL_ACCESS_TOKEN}` },
          json: true,
        }, cb);
      });
    },
    (response, body, cb) => {
      if (response.statusCode !== 200 || !body.items || body.items.length === 0) {
        logger.info(body);
        cb(new Error('The content type is not found.'));
      } else {
        mapping.contentfulFields = body.items[0].fields;
        const mappingContent = JSON.stringify(mapping, null, 4);
        // write mapping file
        logger.info('Write mapping file.');
        fs.writeFile(mapFile, mappingContent, cb);
      }
    },
  ], (err) => {
    // release the client
    if (theDone) {
      theDone();
    }
    callback(err);
  });
}

/**
 * This function inserts Contentful entry from a Postgresql table row.
 * If the row status is "Published", it will publish the contentful entry.
 * @param {Object} row the table row
 * @param {Object} mapping the mapping from Postgresql columns to Contentful fields
 * @param {Object} client the pg client
 * @param {Function} callback asynchronous callback invoked upon method completion
 */

function insertRow(row, mapping, client, callback) {
  const tableId = row[0][config.TABLE_ID_COLUMN];
  logger.info(`Insert contentful entry for table row of id ${tableId}`);
  async.waterfall([
    (cb) => {
      // Getting entries from Contentful
      helper.allocateContentfulRequest(config, () => {
        request({
          uri: `https://api.contentful.com/spaces/${config.CONTENTFUL_SPACE_ID}/entries`,
          method: 'GET',
          headers: { Authorization: `Bearer ${config.CONTENTFUL_ACCESS_TOKEN}` },
          json: true,
        }, cb);
      });
    },
    (response, body, cb) => {
      // Checking whether entry is present in contentful or not
      let present = 0;
      body.items.forEach((index, arr) => {
        const objects = body.items[arr].fields[config.CONTENTFUL_TABLE_ID_FIELD];
        let value;
        for (let key in objects) {
          value = objects[key];
        }
        if (value === row[0][config.TABLE_ID_COLUMN]) {
          present++;
        }
      });
      if (response.statusCode !== 200) {
        logger.info(body);
        cb(new Error('Failed to get contentful entry.'));
      } else if (present) {
        // skip it if it is present
        logger.info(`Skip table row of id ${tableId}`);
        cb();
      } else {
        let contentfulId;
        let contentfulVersion;
        async.waterfall([
          (cb2) => {
            // create Contentful entry
            const lang = row[0][config.TABLE_CONTENTFUL_LANG_COLUMN];
            helper.createContentfulEntry(config, lang, row, mapping, cb2);
          },
          (response2, body2, cb2) => {
            if (response2.statusCode !== 201
              && row[0][config.TABLE_CONTENTFUL_LANG_COLUMN] !== config.CONTENTFUL_DEFAULT_LANG) {
              // try creating entry using default language
              logger.info(`Try creating contentful entry for table row of id ${tableId} using default language.`);
              const lang = config.CONTENTFUL_DEFAULT_LANG;
              helper.createContentfulEntry(config, lang, row, mapping, cb2);
            } else {
              cb2(null, response2, body2);
            }
          },
          (response2, body2, cb2) => {
            if (response2.statusCode !== 201) {
              logger.info(body2);
              cb2(new Error('Failed to create contentful entry.'));
            } else {
              contentfulId = body2.sys.id;
              contentfulVersion = body2.sys.version.toString();
              let pub = 0;
              row.forEach((index, arr) => {
                if (row[arr][config.TABLE_CONTENTFUL_STATUS_COLUMN] === 'Published') {
                  pub++;
                }
              });
              // publish the entry if needed
              if (pub) {
                logger.info(`Publish contentful entry of id: ${contentfulId}`);
                helper.publishContentfulEntry(config, contentfulId, contentfulVersion, (error, res) => {
                  if (error) {
                    return cb2(error);
                  }
                  // after published, the version is updated
                  contentfulVersion = (res.sys.publishedVersion + 1).toString();
                  cb2();
                });
              } else {
                cb2();
              }
            }
          },
          (cb2) => {
            // save created contentful data back to corresponding table row
            client.query(`update ${config.TABLE} set ${
              config.TABLE_CONTENTFUL_ID_COLUMN} = $1, ${
              config.TABLE_CONTENTFUL_VERSION_COLUMN} = $2 where ${
              config.TABLE_ID_COLUMN} = $3`, [contentfulId, contentfulVersion, tableId], cb2);
          },
        ], cb);
      }
    },
  ], callback);
}

/**
 * This function updates Contentful entry from a Postgresql table row.
 * If the row status is "Published", it will publish the contentful entry.
 * If the row status is "Draft", it will unpublish (draft) the contentful entry.
 * @param {Object} row the table row
 * @param {Object} mapping the mapping from Postgresql columns to Contentful fields
 * @param {Object} client the pg client
 * @param {Function} callback asynchronous callback invoked upon method completion
 */

function updateRow(row, mapping, client, callback) {
  const tableId = row[0][config.TABLE_ID_COLUMN];
  const contentfulId = row[0][config.TABLE_CONTENTFUL_ID_COLUMN];
  logger.info(`Update contentful entry of id: ${contentfulId}`);
  let contentfulVersion;
  async.waterfall([
    (cb) => {
      // update Contentful entry
      const lang = 'null';
      helper.updateContentfulEntry(config, lang, row, mapping, cb);
    },
    (response, body, cb) => {
      if (response.statusCode !== 200) {
        cb(new Error('Failed to update contentful entry.'));
      } else {
        contentfulVersion = body.sys.version.toString();
        let pub = 0;
        row.forEach((index, arr) => {
          if (row[arr][config.TABLE_CONTENTFUL_STATUS_COLUMN] === 'Published') {
            pub++;
          }
        });
        // publish the entry if needed
        if (pub) {
          // try publishing the entry, ignoring error because it may already be published
          helper.publishContentfulEntry(config, contentfulId, contentfulVersion, (error, res) => {
            if (!error) {
              // successfully published, the version is updated
              contentfulVersion = (res.sys.publishedVersion + 1).toString();
            }
            cb();
          });
        } else {
        // try unpublishing (drafting) the entry, ignoring error because it may already be draft
          helper.draftContentfulEntry(config, contentfulId, contentfulVersion, (error) => {
            if (!error) {
              // successfully unpublished, the version is updated
              contentfulVersion = (Number(contentfulVersion) + 1).toString();
            }
            cb();
          });
        }
      }
    },
    (cb) => {
      // save updated contentful version back to corresponding table row
      client.query(`update ${config.TABLE} set ${
              config.TABLE_CONTENTFUL_ID_COLUMN} = $1, ${
              config.TABLE_CONTENTFUL_VERSION_COLUMN} = $2 where ${
              config.TABLE_ID_COLUMN} = $3`, [contentfulId, contentfulVersion, tableId], cb);
    },
  ], callback);
}

/**
 * This function deletes Contentful entry from a Postgresql table row.
 * @param {Object} row the table row
 * @param {Object} mapping the mapping from Postgresql columns to Contentful fields
 * @param {Object} client the pg client
 * @param {Function} callback asynchronous callback invoked upon method completion
 */
function deleteContent(row, mapping, client, callback) {
  let count = 0;
  let contentfulId;
  let contentfulVersion;
  let tableId;
  row.forEach((index, arr) => {
    if (row[arr][config.TABLE_CONTENTFUL_ID_COLUMN]) {
      contentfulId = row[arr][config.TABLE_CONTENTFUL_ID_COLUMN];
      contentfulVersion = row[arr][config.TABLE_CONTENTFUL_VERSION_COLUMN];
      tableId = row[arr][config.TABLE_ID_COLUMN];
      count++;
    }
  });
  if (count) {
    logger.info(`Delete contentful entry of id: ${contentfulId}`);
  // first try to unpublish it, published entry should be unpublished before being deleted,
  // ignoring any error because it might not be published
    helper.draftContentfulEntry(config, contentfulId, contentfulVersion, () => {
    // delete the contentful entry
      helper.allocateContentfulRequest(config, () => {
        request({
          uri: `https://api.contentful.com/spaces/${config.CONTENTFUL_SPACE_ID}/entries/${contentfulId}`,
          method: 'DELETE',
          headers: {
            Authorization: `Bearer ${config.CONTENTFUL_ACCESS_TOKEN}`,
            'X-Contentful-Version': contentfulVersion,
          },
        }, (err, response, body) => {
          if (err) {
            callback(err);
          } else if (response.statusCode !== 204) {
            logger.info(body);
            callback(new Error(`Failed to delete contentful entry of id: ${contentfulId}`));
          } else {
            // clear the contentful id and version in database
            row.forEach((index, arr) => {
              tableId = row[arr][config.TABLE_ID_COLUMN];
              client.query(`update ${config.TABLE} set ${
              config.TABLE_CONTENTFUL_ID_COLUMN} = null, ${
              config.TABLE_CONTENTFUL_VERSION_COLUMN} = null where ${
              config.TABLE_ID_COLUMN} = $1`, [tableId], () => {
                if (row.length === arr + 1) {
                  callback();
                } });
            });
          }
        });
      });
    });
  }
}

/**
 * This function publishes Contentful entry from a Postgresql table row.
 * @param {Object} row the table row
 * @param {Object} mapping the mapping from Postgresql columns to Contentful fields
 * @param {Object} client the pg client
 * @param {Function} callback asynchronous callback invoked upon method completion
 */
function publishRow(row, mapping, client, callback) {
  let count = 0;
  let contentfulId;
  let contentfulVersion;
  let tableId;
  row.forEach((index, arr) => {
    if (row[arr][config.TABLE_CONTENTFUL_ID_COLUMN]) {
      contentfulId = row[arr][config.TABLE_CONTENTFUL_ID_COLUMN];
      contentfulVersion = row[arr][config.TABLE_CONTENTFUL_VERSION_COLUMN];
      tableId = row[arr][config.TABLE_ID_COLUMN];
      count++;
    }
  });

  if (count) {
    // try publishing the entry
    helper.publishContentfulEntry(config, contentfulId, contentfulVersion, (error, res) => {
      if (error) {
        // it is already published, do nothing
        callback();
      } else {
        logger.info(`Published contentful entry of id: ${contentfulId}`);
        // successfully published, the version is updated
        contentfulVersion = (res.sys.publishedVersion + 1).toString();
        // save updated contentful version and status back to corresponding table row
        client.query(`update ${config.TABLE} set ${
          config.TABLE_CONTENTFUL_VERSION_COLUMN} = $1, ${
          config.TABLE_CONTENTFUL_STATUS_COLUMN} = $2 where ${
          config.TABLE_ID_COLUMN} = $3`, [contentfulVersion, 'Published', tableId], callback);
      }
    });
  }
}

/**
 * This function unpublishes (drafts) Contentful entry from a Postgresql table row.
 * @param {Object} row the table row
 * @param {Object} mapping the mapping from Postgresql columns to Contentful fields
 * @param {Object} client the pg client
 * @param {Function} callback asynchronous callback invoked upon method completion
 */
function draftRow(row, mapping, client, callback) {
  let count = 0;
  let contentfulId;
  let contentfulVersion;
  let tableId;
  row.forEach((index, arr) => {
    if (row[arr][config.TABLE_CONTENTFUL_ID_COLUMN]) {
      contentfulId = row[arr][config.TABLE_CONTENTFUL_ID_COLUMN];
      contentfulVersion = row[arr][config.TABLE_CONTENTFUL_VERSION_COLUMN];
      tableId = row[arr][config.TABLE_ID_COLUMN];
      count++;
    }
  });

  if (count) {
    // try unpublishing the entry
    helper.draftContentfulEntry(config, contentfulId, contentfulVersion, (error) => {
      if (error) {
        // it is already draft, do nothing
        callback();
      } else {
        logger.info(`Unpublished contentful entry of id: ${contentfulId}`);
        // successfully unpublished, the version is updated
        contentfulVersion = (Number(contentfulVersion) + 1).toString();
        // save updated contentful version back to corresponding table row
        client.query(`update ${config.TABLE} set ${
          config.TABLE_CONTENTFUL_VERSION_COLUMN} = $1, ${
          config.TABLE_CONTENTFUL_STATUS_COLUMN} = $2 where ${
          config.TABLE_ID_COLUMN} = $3`, [contentfulVersion, 'Draft', tableId], callback);
      }
    });
  }
}

/**
 * This function handles data from Postgresql to Contentful.
 * @param {String} operation the operation ('insert', 'update', 'delete', 'publish', 'draft')
 * @param {String} mapFile the map file to read
 * @param {String} whereClause the where clause to query database table records
 * @param {Function} callback asynchronous callback invoked upon method completion
 */

function handleData(operation, mapFile, whereClause, localelang, callback) {
  let theDone;
  let theClient;
  let mapping;
  // construct where clause,
  // for non-insert operation, we need to query records that have contentful id
  // for insert operation, we need to query records that have no contentful id
  let condition;
  if (operation === 'insert') {
    condition = `${config.TABLE_CONTENTFUL_ID_COLUMN} is null`;
  } else if (operation === 'update') {
    condition = '';
  } else {
    condition = `${config.TABLE_CONTENTFUL_ID_COLUMN} is not null`;
  }
  let where = whereClause;
  if (where) {
    where = where.split('=');
    where = `${where[0]}='${where[1]}' and ${condition}`;
  } else {
    where = condition;
  }
  async.waterfall([
    (cb) => {
      fs.readFile(mapFile, cb);
    },
    (mappingContent, cb) => {
      const map = JSON.parse(mappingContent);
      mapping = map.mapping;

      pg.connect(config.DATABASE_URL, cb);
    },
    (client, done, cb) => {
      theDone = done;
      theClient = client;
      if (localelang) { // Check whether Locale language is send as parameter and used to delete a speccific locale
        const sql = `delete from ${config.TABLE} where ${where} and contentlang='${localelang}'`;
        client.query(sql, [], () => { });
      }
      let sql1 = `select * from ${config.TABLE}`;
      if (where) {
        sql1 += ` where ${where}`;
      }
      client.query(sql1, [], cb);
    },
    (result, cb) => {
      // Grouping results by common Id
      let rows = [];
      rows = result.rows;
      rows.sort(function (a, b) {
        return parseFloat(a.id) - parseFloat(b.id);
      });
      let i;
      const test = [];
      let same = [];
      let x = 0;
      if (rows.length > 0) {
        x = rows[0][config.TABLE_ID_COLUMN];
        same.push(rows[0]);
      }
      for (i = 1; i < rows.length; i++) {
        if (x === rows[i][config.TABLE_ID_COLUMN]) {
          same.push(rows[i]);
        } else {
          test.push(same);
          x = rows[i][config.TABLE_ID_COLUMN];
          same = [];
          same.push(rows[i]);
        }
      }
      if (x) {
        test.push(same);
      }
      rows = test;

      // handle each table row
      async.each(rows, (row, cb2) => {
        if (operation === 'insert') {
          logger.info('Inserting into Contentful ! ');
          insertRow(row, mapping, theClient, cb2);
        } else if (operation === 'update') {
          logger.info('Syncing postgresql with Contentful ! ');
          updateRow(row, mapping, theClient, cb2);
        } else if (operation === 'delete') {
          logger.info('Delete from Contentful ! ');
          deleteContent(row, mapping, theClient, cb2);
        } else if (operation === 'publish') {
          logger.info('Publishing on Contentful ! ');
          publishRow(row, mapping, theClient, cb2);
        } else if (operation === 'deletelocalebyid') {
          logger.info('Deleting The Locale of particular entry ! ');
          updateRow(row, mapping, theClient, cb2);
        } else {
          logger.info('Saving contents as draft on Contentful ! ');
          draftRow(row, mapping, theClient, cb2);
        }
      }, cb);
    },
  ], (err) => {
    // release the client
    if (theDone) {
      theDone();
    }
    callback(err);
  });
}

async.waterfall([
  (cb) => {
    if (process.argv.length === 3 && (process.argv[2] === '-h' || process.argv[2] === '--help')) {
      showHelp();
      process.exit();
    } else if (process.argv.length === 5 && process.argv[2] === 'map') {
      config = helper.getConfig(process.argv[4]);
      generateMap(process.argv[3], cb);
    } else if ((process.argv.length === 5 || process.argv.length === 6) &&
      _.contains(['insert', 'update', 'delete', 'publish', 'draft'], process.argv[2])) {
      const whereClause = process.argv.length === 5 ? null : process.argv[5];
      config = helper.getConfig(process.argv[4]);
      handleData(process.argv[2], process.argv[3], whereClause, null, cb);
    } else if ((process.argv.length === 7) &&
      _.contains(['deletelocalebyid'], process.argv[2])) {
      const whereClause = process.argv.length === 5 ? null : process.argv[5];
      const language = process.argv[6];
      config = helper.getConfig(process.argv[4]);
      handleData(process.argv[2], process.argv[3], whereClause, language, cb);
    } else {
      // for other cases, show help
      showHelp();
      process.exit();
    }
  },
], (err) => {
  if (err) {
    logger.logFullError(err);
  } else {
    logger.info('done');
  }
  process.exit();
});
