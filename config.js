module.exports = {
  hostname: process.env.HOSTNAME || '0.0.0.0',
  port: process.env.PORT || 3000,
  MATRIKKELAPI_BASEURL: process.env.MATRIKKELAPI_BASEURL,
  MATRIKKELAPI_USERNAME: process.env.MATRIKKELAPI_USERNAME,
  MATRIKKELAPI_PASSWORD: process.env.MATRIKKELAPI_PASSWORD,
  dsfAPIEndpoint: process.env.DSFAPIENDPOINT,
  jwtSecret: process.env.DSFSECRET
}
