const TemplateClient = require('./lib/TemplateClient/TemplateClient');

const templateClient = new TemplateClient();

let matrikkelContext = templateClient.getTemplate('matrikkelContext.xml');

console.log('Unmodified');
console.log(matrikkelContext);

console.log('');
console.log('After replacing:');
// matrikkelContext = templateClient.replacePlaceholder(matrikkelContext, replaceObject)
matrikkelContext = templateClient.fillDefaultValues(matrikkelContext);
console.log(matrikkelContext);
