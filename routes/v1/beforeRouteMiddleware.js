/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// Import dependencies
/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
const TemplateClient = require('../../lib/TemplateClient/TemplateClient');

/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// Middleware function
/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
async function f (req, res, next) {
  const templateClient = new TemplateClient();
  let matrikkelContext = templateClient.getTemplate('matrikkelContext.xml');

  matrikkelContext = templateClient.replacePlaceholder(matrikkelContext, { LOCALE: 'testtest' });
  matrikkelContext = templateClient.fillDefaultValues(matrikkelContext);

  req.matrikkelContext = matrikkelContext;

  next();
}

/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// Exports
/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
module.exports = f;
