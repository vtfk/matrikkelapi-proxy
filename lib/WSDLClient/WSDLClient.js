/*
   Import dependencies
*/
const fs = require('fs');
const path = require('path');

const XmlReader = require('xml-reader');
const xmlQuery = require('xml-query');

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

/**
 * A class for parsing and resolving wsdl and xsd-files to resolve class-names and data types
 * The purpose of this is that the Matrikkel documentation can be hard to read or have missing information
 * This client makes it possible to specify resolve=true in the requests.
 * This will make the API resolve any typeinformation in the response.
 */
module.exports = class WSDLClient {
  // loadAllFiles: Loads all files then caches them
  static loadAllFiles (force = false) {
    // If the files files is already loaded, just return them
    if (!force && loadedFiles.length > 0) { return; }
    // Iterate through all WSDL-files and load them into memory
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

  // Retreives all XSI-types found in the provided XML
  static findAllXsiTypesInXml (parsedXML) {
    // Input validation
    if (!parsedXML) { return; }

    // Variables
    const xsiTypes = [];      // Array of typenames and namespaces

    // Find the body and responses
    const body = xmlQuery(parsedXML).find('Body');
    const responses = body.children();

    // Retreive the response type and namespace
    responses.each((response) => {
      // Variables
      const namespaces = [];    // Array that stores all namespaces present in this response

      // Get the namespaces
      if (response.attributes && typeof response.attributes === 'object') {
        for (const attr in response.attributes) {
          if (attr.startsWith('xmlns:')) {
            namespaces.push({
              id: attr.split(':')[1],
              namespace: response.attributes[attr]
            })
          } else if (attr === 'xmlns') {
            namespaces.push({
              id: 'ns',
              namespace: response.attributes[attr]
            })
          }
        }
      }

      // Recursively search through the data for xsi types
      function searchForXSIType (element, typesArray = [], level = 0) {
        // If first level, register the type as an xsi-type
        if (level === 0 && element.name && element.name.includes(':')) {
          const typeName = element.name.split(':')[1];
          const typeNamespaceId = element.name.split(':')[0];

          let typeNamespace = namespaces.find((ns) => ns.id === typeNamespaceId);
          if (typeNamespace) { typeNamespace = typeNamespace.namespace; }

          // Add the xsi-type if it has not been already added
          if (typeNamespace) {
            const match = typesArray.find((t) => t.type === typeName && t.namespace === typeNamespace);
            if (!match) {
              typesArray.push({
                type: typeName,
                namespace: typeNamespace
              })
            }
          }
        }

        // Check in attributes for xsi-type
        if (element && element.attributes && typeof element.attributes === 'object') {
          for (const attr in element.attributes) {
            if (attr === 'xsi:type') {
              if (element.attributes['xsi:type'].includes(':')) {
                const at = element.attributes['xsi:type'];
                const typeName = at.split(':')[1];
                const typeNamespaceId = at.split(':')[0];
                let typeNamespace = namespaces.find((ns) => ns.id === typeNamespaceId);
                if (typeNamespace) {
                  typeNamespace = typeNamespace.namespace;
                  // Add the xsi-type if it has not been already added
                  if (typeNamespace) {
                    const match = typesArray.find((t) => t.type === typeName && t.namespace === typeNamespace);
                    if (!match) {
                      typesArray.push({
                        type: typeName,
                        namespace: typeNamespace
                      })
                    }
                  }
                }
              }
            }
          }
        }

        // Recursively check children
        if (element.children && Array.isArray(element.children) && element.children.length > 0) {
          element.children.forEach((child) => {
            searchForXSIType(child, typesArray, level + 1);
          })
        }

        // Return all the found types
        return typesArray;
      }

      // Find all the XSI types
      const types = searchForXSIType(response);

      // Add the types to the common array
      if (types && Array.isArray(types)) {
        types.forEach((type) => {
          if (type.type && type.namespace) {
            if (!xsiTypes.find((t) => t.type === type.type && t.namespace === type.namespace)) {
              xsiTypes.push(type);
            }
          }
        })
      }
    })

    // Return the found types
    return xsiTypes;
  }

  // Resolves and creates a object containing all inherited properties and element-types for a given root-type
  static resolveType (currentObject, typeName, namespace, level = 0) {
    if (!typeName || !namespace) { return currentObject; }

    // Attempt to find the correct schema
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

      const matchNamespace = namespaces.find((ns) => ns.id === extensionNamespaceId);
      if (matchNamespace && matchNamespace.namespace) {
        extensionNamespace = matchNamespace.namespace;
      }

      const extensionObject = this.resolveType(currentObject, extensionType, extensionNamespace, level + 1);

      // Add all extension objects to the return object
      if (extensionObject && Object.keys(extensionObject).length > 0) {
        for (const obj in extensionObject) {
          // log(level + 3, '-', obj)
          if (obj.startsWith('$')) { return; }
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
          _type: attrs.type.split(':')[1],
          _namespaceId: attrs.type.split(':')[0]
        }

        // Get namespace
        const matchNamespace = namespaces.find((ns) => ns.id === currentObject[attrs.name]._namespaceId);
        if (matchNamespace && matchNamespace.namespace) {
          currentObject[attrs.name]._namespace = matchNamespace.namespace;
        }

        // Try to resolve the item object even further
        if (currentObject[attrs.name]._namespace && currentObject[attrs.name]._namespace.startsWith('http://matrikkel')) {
          this.resolveType(currentObject[attrs.name], currentObject[attrs.name]._type, currentObject[attrs.name]._namespace, level + 1);
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
