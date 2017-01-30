/*
 * Copyright (C) 2016 TopCoder Inc., All Rights Reserved.
 */
/**
 * The default configuration file.
 * @author TCSCODER
 * @version 1.0
 */
'use strict';

module.exports = {
  // Postresql database connection string.
  DATABASE_URL: process.env.DATABASE_URL || 'postgres://sumeet:turbo123@127.0.0.1:5432/topcoder',  // eslint-disable-line
  // database table name
  TABLE: process.env.TABLE || 'item_tab',
  // table id column name
  TABLE_ID_COLUMN: process.env.TABLE_ID_COLUMN || 'id',
  // table contentful id column name, used to link to contentful record
  TABLE_CONTENTFUL_ID_COLUMN: process.env.TABLE_CONTENTFUL_ID_COLUMN || 'contentfulid',
  // table contentful version column name, used to store contentful record version
  TABLE_CONTENTFUL_VERSION_COLUMN: process.env.TABLE_CONTENTFUL_VERSION_COLUMN || 'contentversion',
  // table contentful status column name, used to store contentful record status (Draft,Published)
  TABLE_CONTENTFUL_STATUS_COLUMN: process.env.TABLE_CONTENTFUL_STATUS_COLUMN || 'contentstatus',
  // table contentful language column name, used to store contentful language
  TABLE_CONTENTFUL_LANG_COLUMN: process.env.TABLE_CONTENTFUL_LANG_COLUMN || 'contentlang',

  // contentful space id
  CONTENTFUL_SPACE_ID: process.env.CONTENTFUL_SPACE_ID || 'nbpmpetpeiov',
  // contentful content type
  CONTENTFUL_CONTENT_TYPE: process.env.CONTENTFUL_CONTENT_TYPE || 'check',
  // contentful content type name
  CONTENTFUL_CONTENT_TYPE_NAME: process.env.CONTENTFUL_CONTENT_TYPE_NAME || 'test',
  // contentful default language
  CONTENTFUL_DEFAULT_LANG: process.env.CONTENTFUL_DEFAULT_LANG || 'en-US',
  // contentful table id field, used to link to database record
  CONTENTFUL_TABLE_ID_FIELD: process.env.CONTENTFUL_TABLE_ID_FIELD || 'commonId',
  // contentful access token
  CONTENTFUL_ACCESS_TOKEN: process.env.CONTENTFUL_ACCESS_TOKEN
    || '0b2baec4f115dc2a6765ed237a9cf9c0ec00df616739c8ad194489ebcf0fbdfe',
  // contentful rate limit count, it is configured to 5 to be safer (slow down request rate)
  CONTENTFUL_RATE_LIMIT_COUNT: process.env.CONTENTFUL_RATE_LIMIT_COUNT &&
    Number(process.env.CONTENTFUL_RATE_LIMIT_COUNT) || 5,
  // contentful rate limit period in milliseconds, it is configured to 3000 to be safer (slow down request rate)
  CONTENTFUL_RATE_LIMIT_PERIOD: process.env.CONTENTFUL_RATE_LIMIT_PERIOD &&
    Number(process.env.CONTENTFUL_RATE_LIMIT_PERIOD) || 3000,
  // contentful rate limit retry period in milliseconds, it is configured to 3000 to be safer (slow down request rate)
  CONTENTFUL_RATE_LIMIT_RETRY_PERIOD: process.env.CONTENTFUL_RATE_LIMIT_RETRY_PERIOD &&
    Number(process.env.CONTENTFUL_RATE_LIMIT_RETRY_PERIOD) || 3000,
};
