/*
    Import dependencies
*/
const HeaderAPIKeyStrategy = require('passport-headerapikey').HeaderAPIKeyStrategy;

module.exports = new HeaderAPIKeyStrategy(
  {
    header: 'X-API-KEY'
  },
  false,
  async (apikey, done) => {
    let isKeyFound = false;
    console.log('Authenticate with API Key')
    // Input valdidation
    if (!apikey) { console.log('No API key is provided'); return done(null, false); }
    console.log('Got key: ' + apikey)

    // Check the key against environmentkey
    if (apikey === 'asd') { isKeyFound = true; }

    // If no key is found
    if (!isKeyFound) { console.log('❌ No matching API Key could be found'); return done(null, false); }
    console.log('✔ API Keys is found, validated')

    return done(null, apikey);
  })
