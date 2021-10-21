/*
   Import dependencies
*/
const fetch = require('node-fetch');                                  // For making the HTTP request to the Matrikkel API
const XmlReader = require('xml-reader');                              // Reads XML in a format that can be used by xml-query for working with the data
const xml2js = require('xml2js')                                      // For converting XML to JSON
const prettifyXml = require('prettify-xml');                          // For beutifying the XML request after generating
const TemplateClient = require('../TemplateClient/TemplateClient');   // Class for handeling templates
const WSDLClient = require('../WSDLClient/WSDLClient');               // Class for searching for type-information
const xmlQuery = require('xml-query');

class MatrikkelClient {
  constructor (username, password, endpoint) {
    this.username = username;
    this.password = password;
    this.endpoint = endpoint;
  }

  /*
    Utility functions
  */
  // Prettifyes XML output
  prettifyXML (xml) {
    if (!xml) { return ''; }

    const options = {
      indent: 2,
      newline: '\n'
    }

    return prettifyXml(xml, options);
  }

  // Recursively makes a object as flat as possible
  static flattenObject(obj) {
    function flatten(current, currentKey, parent) {
      if(!current) { return; }
  
      if(currentKey === '$') { return; }
    
      // Delete metadata-fields
      if(currentKey === 'metadata') {
        delete parent[currentKey];
        return;
      }
    
      // Recursively go down all properties
      if(typeof current === 'object') {
        Object.keys(current).forEach((key) => {
          flatten(current[key], key, current);
        })
      }
    
      if(typeof current === 'object') {
        if(Object.keys(current).length === 1) {
          if(Object.keys(current)[0] !== '$') {
            parent[currentKey] = current[Object.keys(current)[0]];
          }
        } else if(Object.keys(current).length === 2 && current.$ !== undefined) {
          let key = Object.keys(current).find((k) => k !== '$');
          if(key) {
            if(typeof current[key] !== 'object') {
              parent[currentKey] = current[key];
            }
          }
        }
      }
    }
    
    let copy = JSON.parse(JSON.stringify(obj));

    Object.keys(copy).forEach((key) => {
      flatten(copy[key], key, copy);
    })

    return copy;
  }

  // Removes namespace information in front of the tag as it often gives wrong information
  static cleanUpXML (xml, full) {
    // Input validation
    if (!xml) { return; }

    // Remove some uneccessary tag-info to make parsing easier
    xml = xml.replace(/<[a-zA-Z]:/g, '<');
    xml = xml.replace(/<\/[a-zA-Z]:/g, '</')

    if (full) {
      xml = xml.replace(/<[a-zA-Z]+[0-9]+:/g, '<');
      xml = xml.replace(/<\/[a-zA-Z]+[0-9]+:/g, '</');
    }

    return xml;
  }

  simplifyParsedJSON (data) {
    // Input validation
    if (!data) { return; }
    if (!data.Envelope || !data.Envelope.Body) { return data; }

    // Variables
    const responses = [];
    // const resolvedTypes = [];

    /*
      Get the all the responses from the body
    */
    const body = data.Envelope.Body
    let _responses = [];
    if (!Array.isArray(body)) {
      _responses.push(body);
    } else {
      _responses = body;
    }

    /*
      Parse and get items from each response
    */
    for (let i = 0; i < _responses.length; i++) {
      // Response object that will be pushed to the responses array
      const response = {
        items: []
      }
      let _response = _responses[i];  // Local working copy of the API returned response

      // Get the type and namespace
      const responseTagName = Object.keys(_response)[0];
      if (responseTagName.includes(':')) {
        response.namespaceid = responseTagName.split(':')[0];
        response.type = responseTagName.split(':')[1];
      }

      // Set the respons to be one level down, this is just for convenvience
      _response = _response[Object.keys(_response)[0]];

      // Attempt to retreive the namespaces used in this response
      const namespaces = [];
      if (_response.$ && typeof _response.$ === 'object') {
        for (const ns in _response.$) {
          const namespace = {};
          if (ns.startsWith('xmlns')) {
            const split = ns.split(':');
            if (split.length <= 1) {
              namespace.id = 'default'
            } else {
              if (split[1] === response.namespaceid) {
                response.namespace = _response.$[ns];
              }
              namespace.id = split[1];
            }
            namespace.namespace = _response.$[ns];
            namespaces.push(namespace);
          }
        }
        if (namespaces.length > 1) {
          response.namespaces = namespaces;
        }
      }
      response.namespaces = namespaces;

      /*
        Items
      */
      let _itemGroups = [];

      // Find the key where the items are stored
      let _itemsKey = Object.keys(_response).find((key) => key.includes('return'));
      if (!_itemsKey) { _itemsKey = Object.keys(_response).find((key) => key !== '$'); }

      if (_itemsKey) {
        _itemGroups = _response[_itemsKey];
        if (!Array.isArray(_itemGroups)) { _itemGroups = [_itemGroups]; }
      }

      // Attempt to retreive all items
      for (let j = 0; j < _itemGroups.length; j++) {
        const _itemGroup = _itemGroups[j];
        const _itemKey = Object.keys(_itemGroup)[0];
        let _items = _itemGroup[Object.keys(_itemGroup)[0]];

        let itemKeyNamespace;
        let itemKeyType;
        if (_itemKey.includes(':')) {
          itemKeyNamespace = _itemKey.split(':')[0];
          itemKeyType = _itemKey.split(':')[1];
        }

        if (_items && !Array.isArray(_items)) { _items = [_items]; }

        for (let ii = 0; ii < _items.length; ii++) {
          let item = {};
          let itemXSINamespace = '';
          let itemXSIType = '';
          let _item = _items[ii];

          // Attempt to extract xsi type-information about the item if present
          if (_item.$ && _item.$['xsi:type']) {
            const type = _item.$['xsi:type'];
            if (type.includes(':')) {
              itemXSINamespace = type.split(':')[0];
              itemXSIType = type.split(':')[1];
            }
          }

          const namespaceID = itemXSINamespace || itemKeyNamespace;
          let namespaceString;

          const matchedNamespace = response.namespaces.find((ns) => ns.id === namespaceID);
          if (matchedNamespace && matchedNamespace.namespace) {
            namespaceString = matchedNamespace.namespace;
          }

          if (!itemXSINamespace) {
            // Attempt to extract the xsi type-information by following the WSDL-files
            const result = WSDLClient.findXsiType(response.namespace, response.type, itemKeyType);
            if (result) { itemXSIType = result; }
          }

          // If the _item is just { value: 'something' }, extract the value
          if (Object.keys(_item).length === 1 && _item.value) {
            _item = _item.value;
          }

          item = {
            namespace: namespaceString || undefined,
            type: itemXSIType || itemKeyType,
            value: _item
          }

          response.items.push(item);
        }
      }
      responses.push(response);
    }

    // Combine all the response items
    const responseItems = [];
    responses.forEach((response) => {
      responseItems.push({
        type: response.type,
        namespace: response.namespace,
        namespaces: response.namespaces,
        values: response.items
      })
    });

    return responseItems
  }

  // Resolve the response beefore sending
  resolveRequest (rawXML, parsedJSON) {
    // Input validation
    if (!rawXML || !parsedJSON) {
      return parsedJSON;
    }

    // Make sure that all WSDLClients are loaded into memory
    WSDLClient.loadAllFiles();

    // Parse the XML using XML Reader - this is used for generating the type schemas
    const parsedXML = XmlReader.parseSync(rawXML)

    // Parse the XML to JSON - This will be modified with the generated schema and be returned to the caller
    let jsonBody = parsedJSON;
    if (parsedJSON && parsedJSON.Envelope && parsedJSON.Envelope.Body) {
      jsonBody = parsedJSON.Envelope.Body;
    }
    if (!Array.isArray(jsonBody)) { jsonBody = [jsonBody] }

    // Retreive all the XSI types in the XML data
    const xsiTypes = WSDLClient.findAllXsiTypesInXml(parsedXML);

    // Resolve and generate the schema for all the types
    if (xsiTypes) {
      xsiTypes.forEach((type) => {
        const resolved = WSDLClient.findElementTypeInOtherType(type.namespace, type.type);
        if (resolved) {
          type.schema = {
            $type: type.type,
            $namespace: type.namespace,
            ...resolved
          }
        }
      })
    }

    // Function for updating JSON-data with information in the generated schemas
    function updateJSON (parent, parentKey, current, currentKey, schema, schemaKey, childIndex, level = 0) {
      // Check if the current property has an specified xsi:type, if so attempt to change to a matching schema
      if (current.$ && current.$['xsi:type']) {
        const xsiType = current.$['xsi:type'].split(':')[1];

        const tmpSchema = xsiTypes.find((type) => type.type === xsiType);
        if (tmpSchema && tmpSchema.schema) {
          schema = tmpSchema.schema;
        }
      }

      // Assume that the typeinformation is unresolved
      let schemaType = 'unresolved';
      let schemaNamespace = 'unresolved';

      // Check if the schema matches with the next level
      if (schema && currentKey !== schemaKey && schema[currentKey]) {
        schema = schema[currentKey];
      }

      if (schema) {
        schemaType = schema.$type || 'unresolved';
        schemaNamespace = schema.$namespace || 'unresolved';
      }

      if (schemaType === 'unresolved') {
        console.log('Could not resolve: ' + parentKey + '/' + currentKey);
      }

      let addedValue = false;
      if (typeof current === 'object') {
        current = {
          $type: schemaType,
          $namespace: schemaNamespace,
          ...current
        }
      } else {
        current = {
          $type: schemaType,
          $namespace: schemaNamespace,
          value: current
        }
        addedValue = true;
      }

      if (Array.isArray(parent[currentKey])) {
        parent[currentKey][childIndex] = current;
      } else {
        parent[currentKey] = current;
      }

      let childKeys = Object.keys(current).filter((key) => !key.startsWith('$'));
      if (addedValue) { childKeys = childKeys.filter((key) => key !== 'value') }
      childKeys.forEach((key) => {
        const nextSchema = schema && schema[key] ? schema[key] : undefined;
        if (!Array.isArray(current[key])) {
          updateJSON(current, currentKey, current[key], key, nextSchema, key, 0, level + 1);
        } else {
          current[key].forEach((child, i) => {
            updateJSON(current, currentKey, child, key, nextSchema, key, i, level + 1);
          })
        }
      })

      return current;
    }

    // Update the JSON data with schema information
    if (xsiTypes) {
      // For each response in the JSON body
      for (let i = 0; i < jsonBody.length; i++) {
        const response = jsonBody[i];
        // Get the name of the current respose
        const name = Object.keys(response)[0];
        // Get the data of the current respose
        const data = response[name];
        // Get all child-keys for the response
        const childKeys = Object.keys(data).filter((key) => !key.startsWith('$'));
        // Attempt to find a schema for the response type
        let schema = xsiTypes.find((type) => type.type === name);
        if (schema && schema.schema) { schema = schema.schema || undefined; }

        childKeys.forEach((key) => {
          const updatedData = updateJSON(data, name, data[key], key, schema)
          if (updatedData) {
            jsonBody[i] = updatedData;
          }
        })
      }
    }

    // Return the JSON body
    return jsonBody;
  }

  // Makes the request to the Kartverket Matrikkel SOAP API
  async makeRequest (req, body) {
    // Input validation
    if (!body) {
      throw new Error('makeRequest: body cannot be empty')
    }
    // Fix MatrikkelContext
    body = TemplateClient.replacePlaceholder(body, { CONTEXT: req.matrikkelContext });

    // Prettify the request body
    body = this.prettifyXML(body);

    // Define the body
    const fetchRequest = {
      method: 'POST',
      cache: 'no-cache',
      redirect: 'follow',
      headers: {
        'Content-Type': 'text/xml;charset=UTF-8',
        'Access-Control-Allow-Origin': '*',
        Host: 'prodtest.matrikkel.no:443',
        Authorization: 'Basic ' + Buffer.from(this.username + ':' + this.password).toString('base64')
      },
      body: body
    }

    // Make the request
    const response = await fetch(this.endpoint, fetchRequest);
    // Retreive the response body
    let responseBody = await response.text();

    // Remove some uneccessary tag-info to make parsing easier
    responseBody = MatrikkelClient.cleanUpXML(responseBody);
    let cleanJSON = MatrikkelClient.cleanUpXML(responseBody, true);
    const cleanXML = MatrikkelClient.cleanUpXML(responseBody, true);

    // The MatrikkelAPI returns status 200 and HTML if the request is unauthenticated or unauthorized, check for this as it will fail on the XML and JSON parsing below.
    const notOkContent = ['<!DOCTYPE HTML', '401 Unauthorized'];

    let errorMessage = '';
    notOkContent.forEach((phrase) => {
      if (responseBody.includes(phrase)) {
        errorMessage = 'The returned response from the Matrikkel API was invalid\r\nThe request might be unauthorized\r\n' + responseBody;
      }
    })
    if (errorMessage) {
      throw new Error(errorMessage)
    }

    // Parse the XML and convert it to JSON
    cleanJSON = await xml2js.parseStringPromise(cleanJSON, { explicitArray: false });

    // Attempt to find the JSON body
    if (cleanJSON && cleanJSON.Envelope && cleanJSON.Envelope.Body) {
      cleanJSON = cleanJSON.Envelope.Body;
    }

    // Attempt to find the number of items that will be returned
    const parsedXML = XmlReader.parseSync(cleanXML);
    const items = xmlQuery(parsedXML).find('item');
    if (items && items.length) {
      req.__metadata.items = items.length;
    } else {
      req.__metadata.items = 0;
    }

    // Resolve the types if specified, if not just return the cleaned JSON
    if (req.query.resolve) {
      const tmp = this.resolveRequest(responseBody, cleanJSON);
      if (tmp) {
        responseBody = tmp;
      } else {
        responseBody = cleanJSON;
      }
    } else {
      responseBody = cleanJSON;
    }
    if (!Array.isArray(responseBody)) { responseBody = [responseBody] }

    // Flatten the respons returning only the items
    if (req.query.flatten) {
      const items = [];
      // Start by stripping away all the response type layers
      for (let i = 0; i < responseBody.length; i++) {
        let response = responseBody[i];
        const firstProperty = response[Object.keys(response)[0]];

        // If the response has been resolved the two first ifs should return correctly
        if (response.item) {
          items.push(response.item)
        } else if (response.items) {
          items.push(...response.items)
        } else if (firstProperty && firstProperty.return) {
          response = firstProperty;
          if (response.return && response.return.item) {
            if (Array.isArray(response.return.item)) {
              response.return.item.forEach((item) => {
                if (item.value && Object.keys(item).length === 1) {
                  items.push(item.value);
                } else {
                  items.push(item);
                }
              })
            } else {
              items.push(response.return.item);
            }
          }
        } else {
          items.push(response);
        }
      }
      // Then flatten all the reminding data
      let flattenedItems = [];
      items.forEach((item) => {
        flattenedItems.push(MatrikkelClient.flattenObject(item));
      })
      responseBody = flattenedItems;
    }

    return responseBody;
  }

  async getMatrikkelPolygon (req, polygon) {
    // Input validation
    if (!polygon) { return; }

    const requestTemplate = TemplateClient.getTemplate('findMatrikkelenheterPolygon.xml');

    let coordinatesString = '';
    polygon.forEach((p) => {
      let item = TemplateClient.getTemplate('geomPolygon.xml');
      item = TemplateClient.replacePlaceholder(item, { X: p.x, Y: p.y });
      item = TemplateClient.fillDefaultValues(item);
      coordinatesString += item;
    })

    const requestBody = TemplateClient.replacePlaceholder(requestTemplate, { COORDINATES: coordinatesString, KOORDINATSYSTEMID: 24 });

    return await this.makeRequest(req, requestBody);
  }

  /*
    Store service
  */
  async callStoreService (req, body) {
    // Array for storing all the found namespaces in the request as well as an unique generated id
    const namespaces = [];
    let itemsXML = '';

    // Enumurate all items and do the following
    // 1. Find all unique namespaces and assign a ID to it
    // 2. Generate item XML from template
    body.forEach((item) => {
      // Find or register namespace
      let namespace = namespaces.find(ns => ns.namespace === item.namespace || ns.namespace === item.$namespace);
      if (!namespace) {
        namespaces.push({
          id: 'ns' + (namespaces.length + 1),
          namespace: item.namespace || item.$namespace
        })
        namespace = namespaces[namespaces.length - 1];
      }

      // Generate item XML
      let itemTemplate = TemplateClient.getTemplate('storeServiceItem.xml');
      itemTemplate = TemplateClient.replacePlaceholder(itemTemplate, {
        TYPE: item.type || item.$type,
        NAMESPACEID: namespace.id,
        VALUE: item.value
      })

      itemsXML += itemTemplate;
    })

    // Generate the namespace string
    let namespaceString = '';
    namespaces.forEach((ns) => {
      namespaceString += 'xmlns:' + ns.id + '="' + ns.namespace + '" ';
    })
    namespaceString += 'xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"';

    // Generate store request template
    let requestTemplate = TemplateClient.getTemplate('storeRequest.xml');
    requestTemplate = TemplateClient.replacePlaceholder(requestTemplate, {
      NAMESPACESTRING: namespaceString,
      ITEMS: itemsXML
    })

    return await this.makeRequest(req, requestTemplate);
  }
}

module.exports = MatrikkelClient;
