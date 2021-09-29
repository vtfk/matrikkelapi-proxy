/*
   Import dependencies
*/
const fs = require('fs');
const path = require('path');

class TemplateClient {
  // getTemplate - Gets a template from the filesystem
  getTemplate (filename) {
    if (!filename) { return undefined; }

    const fullFilePath = path.resolve(__dirname, 'templates/', filename);

    if (!fs.existsSync(fullFilePath)) {
      throw new Error('Template could not be found at location: ' + fullFilePath);
    }

    const fileData = fs.readFileSync(fullFilePath, { encoding: 'utf-8' });

    return fileData;
  }

  // listTemplates - Lists all available templates
  listTemplates() {
    const templateDirectoryPath = path.resolve(__dirname, 'templates/');
    if (!fs.existsSync(templateDirectoryPath)) {
      throw new Error('Template directory could not be found: ' + templateDirectoryPath);
    }
    return fs.readdirSync(templateDirectoryPath);
  }

  // replacePlaceholder - Replaces any placeholders sendt inn the pairs object
  replacePlaceholder (data, pairs, placeholderStart = '{{', placeholderEnd = '}}') {
    if (!data) { return }
    if (!pairs || !typeof pairs === 'object') { return data }

    let updatedData = JSON.parse(JSON.stringify(data));

    // Find all indexes of a searchstring in a datastring
    function getAllIndexesOf (data, searchString) {
      const indexes = [];
      let i = 0;
      if (data === undefined || searchString === undefined) { return indexes }
      while ((i = data.indexOf(searchString, i + 1)) >= 0) indexes.push(i);
      return indexes;
    }

    // Loop through all keys
    for (const key in pairs) {
      const searchKey = key.toUpperCase();
      const fullplaceholder = placeholderStart + searchKey + placeholderEnd;

      console.log('Searchig for: ' + searchKey);
      const indexes = getAllIndexesOf(data, fullplaceholder);
      console.log('Found indexes: ' + indexes.length);

      // Check if the key has specified a default value, if it has, remove it.
      let negativeOffset = 0; // Holds an accumalative value of how many characters has been removed since the indexes was found
      for (let i = 0; i < indexes.length; i++) {
        const index = indexes[i] - negativeOffset;                                      // The index value found when searching for the placeholders - the number of characters that has been removed since then
        const closingIndex = index + fullplaceholder.length;                            // The index of the last character of the placeholder
        const defaultValueIndex = closingIndex + 4;                                     // The index of where the default value will be if it has one
        const closingDefaultTagIndex = updatedData.indexOf(']]', defaultValueIndex);    // The index of there the default value will end if it has one

        // Search for and remove default values if any
        if (defaultValueIndex < updatedData.length) {
          const afterPlaceholder = updatedData.substring(closingIndex, defaultValueIndex);
          if (afterPlaceholder === '::[[' && closingDefaultTagIndex) {
            // Remove the default data
            updatedData = updatedData.substring(0, closingIndex) + updatedData.substring(closingDefaultTagIndex + 2);
            negativeOffset += (closingDefaultTagIndex + 2) - closingIndex;              // Increment the negative offsett with the number of characters that has been removed
          }
        }
      }

      // Replace the placeholder
      updatedData = updatedData.split(fullplaceholder).join(pairs[key]);
    }

    return updatedData;
  }

  // fillDefaultValues - Will resolve and fill any default values in the template
  fillDefaultValues (data, placeholderStart = '{{', placeholderEnd = '}}') {
    if (data === undefined) { return data; }

    let updatedData = JSON.parse(JSON.stringify(data)); // Make a copy of the data to no modify the source data
    const placeholderWithDefaultValueRegex = new RegExp(placeholderStart + '.+' + placeholderEnd + '::\\[\\[.+\\]', 'g'); // Regex expression to find all placeholders with default values

    let match;
    let loopGuard = 100;
    // Loop through all found placeholders with default values or until it hit the loopguard.
    while ((match = placeholderWithDefaultValueRegex.exec(updatedData)) != null && loopGuard >= 0) {
      // Get the start and end index of the match
      const index = match.index;
      const indexEnd = placeholderWithDefaultValueRegex.lastIndex;
      let defaultIndex = null;
      let defaultIndexEnd = null;

      // Retreive the text
      const placeholderSet = updatedData.substring(index, indexEnd)

      // Retreive the default value
      const defaultValueMatch = placeholderSet.match(/\[\[.+\]\]/);
      if (defaultValueMatch && defaultValueMatch.length > 0) {
        defaultIndex = index + defaultValueMatch?.index;
        defaultIndexEnd = defaultIndex + defaultValueMatch[0].length;

        const defaultValue = updatedData.substring(defaultIndex + 2, defaultIndexEnd - 2);

        updatedData = updatedData.substring(0, index) + defaultValue + updatedData.substring(defaultIndexEnd);
      }
      loopGuard--;
    }

    return updatedData
  }
}

/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// Exports
/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
module.exports = TemplateClient;
