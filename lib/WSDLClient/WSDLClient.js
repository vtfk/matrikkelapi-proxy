/*
   Import dependencies
*/
const fs = require('fs');
const path = require('path');

const XmlReader = require('xml-reader');
const xmlQuery = require('xml-query');

const util = require('util');

/*
  Global variable
*/
const loadedFiles = [];

/*
   Private functions
*/
// Get all namespaces and schema locations used in a xsd-file
function getNamespacesAndSchemalocations (parsedXML) {
  if (!parsedXML) { return []; }

  // Find all namespaces
  const namespaces = [];
  const _namespaces = xmlQuery(parsedXML).find('xs:schema').attr();
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
  xmlQuery(parsedXML).find('xs:import').each((e) => {
    if (e.attributes && e.attributes.namespace && e.attributes.schemaLocation) {
      namespaces.forEach((ns) => {
        if (ns.namespace === e.attributes.namespace) {
          ns.schemaLocation = e.attributes.schemaLocation;
        }
      })
    }
  })

  return namespaces;
}

function log(level, type, message) {
  let spaces = '';
  for(let i = 0; i < level; i++) { spaces += '  '; }
  console.log(spaces + type + ' ' + message);
}

/*
   Class
*/
module.exports = class WSDLClient {
  // loadAllFiles: Loads all files then caches them
  static loadAllFiles () {
    const files = this.listFiles();
    files.forEach((file) => {
      const f = this.readFile(file);
      loadedFiles.push({
        name: file,
        data: f,
        parsed: XmlReader.parseSync(f)
      });
    })
  }

  // listTemplates - Lists all available templates
  static listFiles (options) {
    if (loadedFiles.length > 0) {
      const tmpFiles = loadedFiles.map((f) => f.name)
      return tmpFiles;
    }
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
  static readFile (filename, options) {
    const cached = loadedFiles.find((f) => f.name === filename);
    if (cached) {
      if (cached.parsed && options && options.parsed) { return cached.parsed; } else if (cached.data) { return cached.data; }
    }
    const fullFilePath = path.resolve(__dirname, 'wsdl/', filename);
    if (!fs.existsSync(fullFilePath)) { throw new Error('The file "' + fullFilePath + '" could not be found') }

    // Read and parse the file
    const data = fs.readFileSync(fullFilePath, 'utf-8');
    const parsed = XmlReader.parseSync(data);

    // Push to the cache
    loadedFiles.push({
      name: filename,
      data: data,
      parsed: parsed
    });

    // Return the data
    if (options) {
      if (options.parsed) {
        return parsed
      }
    }

    return data;
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

    files = firstSearchFiles.concat(files);

    files.forEach(async (f) => {
      // Read the file
      const parsed = this.readFile(f, { parsed: true });
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
    const parsed = this.readFile(schema, { parsed: true });

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
        const subParsed = this.readFile(matchNs.schemaLocation, { parsed: true });
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

  // Resolves and creates a object containing all inherited properties and element-types for a given root-type
  static resolveType (currentObject, typeName, namespace, level = 0) {
    if (!typeName || !namespace) { return currentObject; }
    log(level, '!', 'Resolving ' + typeName)
    log(level + 1, '-', 'Namespace: ' + namespace);


    // Attempt to find the correct schema
    // console.log('Searching for type: ' + typeName);
    // console.log('Searching for namespace: ' + namespace)
    const schema = WSDLClient.findSchemaForNamespace(namespace);
    // Read the file
    const parsed = this.readFile(schema, { parsed: true });
    // Retreive the namespaces of the file
    const namespaces = getNamespacesAndSchemalocations(parsed);

    // Find the type in the file
    let foundType;
    xmlQuery(parsed).find('xs:complexType').each((type) => {
      if (type.attributes && type.attributes.name === typeName) {
        foundType = type;
      }
    })

    if (!foundType) { return currentObject; }

    // Check if the type has any extensions
    const extension = xmlQuery(foundType).find('xs:extension');
    if (extension && extension.attr('base')) {
      const extensionNamespaceId = extension.attr('base').split(':')[0];
      const extensionType = extension.attr('base').split(':')[1];
      let extensionNamespace;
      log(level + 2, '!', 'Found extension type: ' + extensionType);
      const matchNamespace = namespaces.find((ns) => ns.id === extensionNamespaceId);
      if (matchNamespace && matchNamespace.namespace) {
        extensionNamespace = matchNamespace.namespace;
      }

      const extensionObject = this.resolveType(currentObject, extensionType, extensionNamespace, level + 1);

      // Add all extension objects to the return object
      if (extensionObject && Object.keys(extensionObject).length > 0) {
        
        for (const obj in extensionObject) {
          log(level + 3, '-', obj)
          if(obj.startsWith('$')) { return; }
          currentObject[obj] = {
            $inherited: true,
            ...extensionObject[obj]
          }
        }
      }
    }

    // Add all elements to the object
    xmlQuery(foundType).find('xs:element').each((element) => {
      const attrs = element.attributes;
      if (attrs.name && attrs.type) {
        currentObject[attrs.name] = {
          $type: attrs.type.split(':')[1],
          $namespaceId: attrs.type.split(':')[0]
        }

        // Get namespace
        const matchNamespace = namespaces.find((ns) => ns.id === currentObject[attrs.name].$namespaceId);
        if (matchNamespace && matchNamespace.namespace) {
          currentObject[attrs.name].$namespace = matchNamespace.namespace;
        }

        // Try to resolve the item object even further
        if (currentObject[attrs.name].$namespace && currentObject[attrs.name].$namespace.startsWith('http://matrikkel')) {
          this.resolveType(currentObject[attrs.name], currentObject[attrs.name].$type, currentObject[attrs.name].$namespace, level + 1);
        }

      }
    })

    return currentObject;
  }

  // Find elementtype in other type
  static findElementTypeInOtherType (namespace, typeName, elementName) {
    // Input validation
    if (!namespace || !typeName) { return; }

    const resolvedObject = this.resolveType({}, typeName, namespace, elementName);

    return resolvedObject;
  }
}
