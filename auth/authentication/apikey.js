/*
    Import dependencies
*/
const HeaderAPIKeyStrategy = require('passport-headerapikey').HeaderAPIKeyStrategy;

function getEnvironmentAPIKeys () {
  const APIKeys = [];
  let currentKey = 'initial';
  let count = 1;
  while (currentKey !== undefined) {
    currentKey = process.env['APIKEY' + count];
    if (currentKey) { APIKeys.push(currentKey); } else { break; }
    count++;
    console.log('Counter: ' + count)
  }
  return APIKeys;
}

module.exports = new HeaderAPIKeyStrategy(
  {
    header: 'X-API-KEY'
  },
  false,
  async (apikey, done) => {
    let isKeyFound = false;
    // Input valdidation
    if (!apikey) {
      console.log('No API key is provided');
      return done(null, false);
    }

    // Get environment API Keys
    const environmentkeys = getEnvironmentAPIKeys();
    if (!environmentkeys || !Array.isArray(environmentkeys || environmentkeys.length < 1)) {
      return done(null, false);
    }

    // Check the key against environmentkey
    if (environmentkeys.includes(apikey)) {
      isKeyFound = true;
    }

    // If the key was not found
    if (!isKeyFound) {
      console.log('❌ No matching API Key could be found');
      return done(null, false); 
    }

    // The key was found
    return done(null, apikey);
  })
