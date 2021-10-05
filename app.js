/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// Import dependencies
/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
const http = require('http');                                         // For hosting the web server
const fs = require('fs');                                             // For working with the file system
const path = require('path');                                         // For combining paths
const yamljs = require('yamljs');                                     // For converting YAML to JSON
const express = require('express');                                   // Main system for running the API
const morgan = require('morgan');                                     // For outputing information about the requests
const cors = require('cors');                                         // For handeling CORS
const swaggerUi = require('swagger-ui-express');                      // For hosting and displaying the APIs documentation
const OpenApiValidator = require('express-openapi-validator');        // Validates all routes based on the requested resource
require('dotenv').config({ path: `.env.${process.env.NODE_ENV}` })    // Load different .env files based on NODE_ENV
const config = require('./config');                                   // Loads the config

/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// Determine variables and constants
/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
const host = config.hostname;                                         // Get the hosting address
const port = config.port;                                             // Get the hosting port

/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// Create App
/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
const app = express();

/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// Register middleware
/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
app.use(express.json());                                                // Automatically parse JSON body
app.use(morgan('dev'));                                                 // Output request information to stdout

/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// Handle CORS
/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
const corsOptions = {
  origin: true,
  credentials: true
}
app.use(cors(corsOptions));

/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// Documentation & Validation
// Host SwaggerUI and validate incoming requests based on OpenAPI 3.0 spesification files
/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
const swaggerUIOptions = {
  deepLinking: false,
  displayOperationId: true
}

const oasDocumentationEndpoints = [];
const routeChildren = fs.readdirSync(path.join(__dirname, 'routes'));
if (routeChildren && Array.isArray(routeChildren)) {
  for (let i = 0; i < routeChildren.length; i++) {
    const oasSpecPath = path.join(__dirname, 'routes', routeChildren[i], 'openapispec.yaml');
    if (fs.existsSync(oasSpecPath)) {
      // Load the file as JSON and determine what the endpoint will be
      const oasJSON = yamljs.load(oasSpecPath)
      const oasDocEndpoint = '/api/' + routeChildren[i] + '/docs';
      oasDocumentationEndpoints.push(oasDocEndpoint);

      // Host the documentation
      app.use(oasDocEndpoint, swaggerUi.serve, swaggerUi.setup(oasJSON, swaggerUIOptions));

      // Register the API validator
      app.use(
        OpenApiValidator.middleware({
          apiSpec: oasSpecPath,
          validateRequests: true
        })
      )
    }
  }
}

/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// Authentication
/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// Import dependencies
const passport = require('passport');                                 // Engine for authenticating using different strategies
const headerAPIKeyStrategy = require('./auth/authentication/apikey'); // Passport strategy for authenticating with APIKey
// Register strategies
passport.use(headerAPIKeyStrategy);
// Use strategies
app.all('*',
  passport.authenticate(['headerapikey'], { session: false }),
  (req, res, next) => {
    // This function triggers when a request has been successfully authenticated
    req.timestamp = new Date();
    next();
  }
);

/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// Routes
/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// v1 routes
app.use('/api/v1/*', require('./routes/v1/beforeRouteMiddleware'));
app.use('/api/v1/matrikkelenheter', require('./routes/v1/matrikkelenheter'));
app.use('/api/v1/store', require('./routes/v1/store'));

/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// Send response
// All routes sets the req.response object so that it can be sent to the requestor by a common function
/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
app.use('/*', (req, res, next) => {
  const response = {
    __metadata: {
      uri: req.protocol + '://' + req.get('host') + req.baseUrl,
      operationId: req.openapi.schema.operationId || '',
      durationMS: (new Date().getMilliseconds()) - req.timestamp.getMilliseconds()
    },
    data: req.response
  }

  res.type('json').send(JSON.stringify(response, null, 2));
})

/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// Error handling
// This will catch any errors that occured anywhere in the routes and handle them
/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
app.use((err, req, res, next) => {
  console.log('❌ Error occured ❌');
  const requestedHost = req.protocol + '://' + req.get('host');

  // Construct an error object
  let error = {}
  // Setup the error object based on type
  if (typeof err === 'object') {
    // Get all enumurable and non-enumurable property from the error object
    Object.getOwnPropertyNames(err).forEach((key) => {
      error[key] = err[key];
    })
  } else if (typeof err === 'string') {
    error.message = err;
  } else {
    error = err;
  }
  // Attempt to determine what documentation is correct for the failed request
  if (req.openapi && req.openapi.expressRoute) {
    // Attempt to match the express route with the API version
    let route = req.openapi.expressRoute;
    if (req.openapi.expressRoute.startsWith('/')) {
      route = route.substring(1);
    }
    const split = route.split('/');
    if (split.length >= 2) {
      const reconstructedRoute = '/' + split[0] + '/' + split[1] + '/docs';
      if (oasDocumentationEndpoints.includes(reconstructedRoute)) {
        error.documentation = {
          full: requestedHost + reconstructedRoute
        }

        if (req.openapi.schema && req.openapi.schema.operationId && req.openapi.schema.tags) {
          error.documentation.method = requestedHost + reconstructedRoute + '/#/' + req.openapi.schema.tags[0] + '/' + req.openapi.schema.operationId
        }
      }
    }
  }

  // Output the error
  console.error(error);

  // Send the error
  res.status(err.status || 500).json(error);
  next();
})

/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// Host the server
/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
const server = http.createServer(app);
server.listen(port, host, () => {
  let hostname = host;
  if (host === '0.0.0.0') { hostname = 'localhost' }

  // Output the root adress the server is listening on
  console.log('Root endpoint:')
  console.log('Your server is listening on port %d (http://%s:%d)', port, hostname, port);

  // Output API endpoint documentation URLs
  console.log('\nDocumentation endpoints:')
  oasDocumentationEndpoints.forEach((endpoint) => {
    console.log('http://%s:%d' + endpoint, hostname, port);
  })
})
