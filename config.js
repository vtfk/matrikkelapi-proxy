/*
  Import dependencies
*/
const path = require('path');
const envPath = path.resolve(__dirname, `.env.${process.env.NODE_ENV}`);
require('dotenv').config({ path: envPath }) // Load different .env files based on NODE_ENV

/*
  Config
*/
module.exports = {
  hostname: process.env.HOSTNAME || '0.0.0.0',
  port: process.env.PORT || 3000,
  MATRIKKELAPI_BASEURL: process.env.MATRIKKELAPI_BASEURL,
  MATRIKKELAPI_USERNAME: process.env.MATRIKKELAPI_USERNAME,
  MATRIKKELAPI_PASSWORD: process.env.MATRIKKELAPI_PASSWORD,
  VTFK_DSFAPI_ENDPOINT: process.env.VTFK_DSFAPI_ENDPOINT,
  VTFK_JWTAPI_SECRET: process.env.VTFK_DSFAPI_SECRET,
  APPLICATIONINSIGHTS_CONNECTION_STRING: process.env.APPLICATIONINSIGHTS_CONNECTION_STRING,
  DEBUG: process.env.DEBUG
}
