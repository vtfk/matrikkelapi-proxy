/*
   Import dependencies
*/
const fs = require('fs');
const path = require('path');

const XmlReader = require('xml-reader');
const xmlQuery = require('xml-query');

/*
   Class
*/
module.exports = class WSDLClient {
  // listTemplates - Lists all available templates
  static listFiles (options) {
    const directoryPath = path.resolve(__dirname, 'wsdl/');
    if (!fs.existsSync(directoryPath)) {
      throw new Error('Template directory could not be found: ' + directoryPath);
    }

    let files = fs.readdirSync(directoryPath);

    if (options) {
      files = files.map((f) => {
        if (options.toLowerCase) {
          f = f.toLowerCase();
        }
        return f;
      })
    }

    return files;
  }

  // readFile
  static readFile (filename) {
    const fullFilePath = path.resolve(__dirname, 'wsdl/', filename);
    if (!fs.existsSync(fullFilePath)) { throw new Error('The file "' + fullFilePath + '" could not be found') }
    return fs.readFileSync(fullFilePath, 'utf-8');
  }

  static findSchemaForNamespace (namespace, extension) {
    // Input validation
    if (!namespace || !namespace.includes('/')) { return; }

    // Variables
    let foundFile;

    // Get all schema files
    let files = this.listFiles();

    // Determine what files to start with
    const fileHint = namespace.substring(namespace.lastIndexOf('/') + 1);
    const firstSearchFiles = files.filter((f) => !extension ? f.toLowerCase().startsWith(fileHint.toLowerCase()) : f.toLowerCase() === fileHint + '.' + extension)

    // Remove the search-first files form the rest of tile files
    files = files.filter((f) => !firstSearchFiles.includes(f));

    firstSearchFiles.forEach(async (f) => {
      // Read the file
      const file = this.readFile(f);
      // Parse the file
      const parsed = XmlReader.parseSync(file);
      // Attempt to find the
      const targetNamespace = xmlQuery(parsed).find('xs:schema').attr('targetNamespace');
      // Check if the file has the correct target namespace
      if (targetNamespace === namespace) {
        foundFile = f;
        return foundFile;
      }
    })
    return foundFile;
  }

  // Find xsi-type
  static findXsiType (namespace, method, itemType) {
    // Input validation
    if (!namespace || !method) { return; }
    // Attempt to find the correct schema
    const schema = this.findSchemaForNamespace(namespace);
    // Read the file
    const file = this.readFile(schema);
    // Parse the file
    const parsed = XmlReader.parseSync(file);

    // Find all namespaces
    const namespaces = [];
    const _namespaces = xmlQuery(parsed).find('xs:schema').attr();
    if (_namespaces) {
      for (const ns in _namespaces) {
        if (ns.startsWith('xmlns:')) {
          namespaces.push({
            id: ns.split(':')[1],
            namespace: _namespaces[ns]
          })
        }
      }
    }

    // Find all schema imports for the namespaces
    xmlQuery(parsed).find('xs:import').each((e) => {
      if (e.attributes && e.attributes.namespace && e.attributes.schemaLocation) {
        namespaces.forEach((ns) => {
          if (ns.namespace === e.attributes.namespace) {
            ns.schemaLocation = e.attributes.schemaLocation;
          }
        })
      }
    })

    // Find the definition
    let foundDefinition;
    xmlQuery(parsed).find('xs:complexType').each((node) => {
      if (node.attributes.name === method) {
        foundDefinition = node;
      }
    })

    // Search for the value
    let foundType;
    xmlQuery(foundDefinition).find('xs:element').each((e) => {
      if (!e.attributes || !e.attributes.name || !e.attributes.type || !e.attributes.type.includes(':')) { return }

      if (e.name === itemType) {
        foundType = e.attributes.type
      } else {
        const nsid = e.attributes.type.split(':')[0];
        const nextType = e.attributes.type.split(':')[1];
        const matchNs = namespaces.find((ns) => ns.id === nsid);

        // TODO: MAKE THIS RECURSIVE
        // Load the file
        const file = this.readFile(matchNs.schemaLocation);
        // Parse the file
        const subParsed = XmlReader.parseSync(file);
        // Find the new type
        xmlQuery(subParsed).find('xs:complexType').each((elm) => {
          if (elm.attributes.name === nextType) {
            // Attempt to find the xsi-type to return
            xmlQuery(elm).find('xs:element').each((subelm) => {
              if (subelm.attributes.name === itemType && subelm.attributes.type) {
                if (subelm.attributes.type.includes(':')) {
                  foundType = subelm.attributes.type.split(':')[1];
                } else {
                  foundType = subelm.attributes.type;
                }
              }
            })
          }
        })
      }
    })
    return foundType;
  }
}
