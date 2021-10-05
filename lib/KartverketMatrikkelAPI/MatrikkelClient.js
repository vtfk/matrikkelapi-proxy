/*
   Import dependencies
*/
const fetch = require('node-fetch')
const xml2js = require('xml2js')                                      // For converting XML to JSON
const prettifyXml = require('prettify-xml');                          // For beutifying the XML request after generating
const TemplateClient = require('../TemplateClient/TemplateClient');   // Class for handeling templates
const WSDLClient = require('../WSDLClient/WSDLClient');               // Class for searching for type-information

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

  simplifyParsedJSON (data) {
    // Input validation
    if (!data) { return; }
    if (!data.Envelope || !data.Envelope.Body) { return data; }

    // Variables
    const responses = [];

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
    responseBody = responseBody.replace(/<[a-zA-Z]:/g, '<');
    responseBody = responseBody.replace(/<\/[a-zA-Z]:/g, '</')

    // Try to parse the body as XML and convert it to JSON
    // If the request fails authentication with the MatrikkelAPI it will send back HTML for some reason.
    try {
      responseBody = await xml2js.parseStringPromise(responseBody, { explicitArray: false });
      const tmp = this.simplifyParsedJSON(responseBody);
      responseBody = tmp;

      return responseBody;
    } catch (err) {
      throw new Error('Unable to parse response as XML. \n' + err)
    }
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
      let namespace = namespaces.find(ns => ns.namespace === item.namespace);
      if (!namespace) {
        namespaces.push({
          id: 'ns' + (namespaces.length + 1),
          namespace: item.namespace
        })
        namespace = namespaces[namespaces.length - 1];
      }

      // Generate item XML
      let itemTemplate = TemplateClient.getTemplate('storeServiceItem.xml');
      itemTemplate = TemplateClient.replacePlaceholder(itemTemplate, {
        TYPE: item.type,
        VALUE: item.value,
        NAMESPACEID: namespace.id
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
