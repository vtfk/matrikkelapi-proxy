/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// Import dependencies
/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
const TemplateClient = require('../../lib/TemplateClient/TemplateClient');
const Sjablong = require('sjablong');

/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// Middleware function
/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
async function f (req, res, next) {
  let matrikkelContext = TemplateClient.getTemplate('matrikkelContext.xml');
  if (!req.body.matrikkelContext) { req.body.matrikkelContext = {} }
  if (req.body.koordinatsystemKodeId !== undefined) req.body.matrikkelContext.koordinatsystemKodeId = req.body.koordinatsystemKodeId;
  matrikkelContext = Sjablong.replacePlaceholders(matrikkelContext, req.body.matrikkelContext);
  req.matrikkelContext = matrikkelContext;

  next();
}

/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// Exports
/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
module.exports = f;
