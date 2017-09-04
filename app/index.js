///////////////////////////////////////////////////////////////////////////////
//
// Fast Domains
//
///////////////////////////////////////////////////////////////////////////////

"use strict"

const os = require('os');
const fs = require('fs');
const net = require('net');
const _ = require('lodash');
const moment = require('moment');
// const whois = require('node-whois')

const compression = require('compression');
const express = require('express');
const bodyParser = require('body-parser');
const RateLimit = require('express-rate-limit');

const fastDomainsDB_ADDRESS = '127.0.0.1';
const fastDomainsDB_PORT = 4000;
const FAST_DOMAINS_EOC = "\n";
const MAX_REQUESTS_IN_QUEUE = 50000;
const FAST_DOMAINS_RETRY_MS = 2000;
const REPLY_STATUS_OK = 200;
const REPLY_STATUS_CLIENT_ERR = 400;
const REPLY_STATUS_SERVER_ERR = 500;
const REPLY_STATUS_DISCARD = 503;
const MAX_PENDING_QUERIES = 10000;
const MAX_BATCH_REQUESTS = 10000;
const ENABLE_RATE_LIMIT = false;

let logStream = null;
let AppInfo = 'Dev'
let APP_PORT = 8081;
const DATE = moment().format('YYYYMMDD');
if ( process.env.NODE_ENV == 'production' ) {
  APP_PORT = 8080;
  AppInfo = 'Pro'
  logStream = fs.createWriteStream('log-prod.' + DATE + '.txt', {'flags': 'a'});
} else {
  logStream = fs.createWriteStream('log-dev.' + DATE + '.txt', {'flags': 'a'});
}

let App = {
  ticketQueue: {},
  ticketReplyQueue: '',
  ticketID: 0,
  pendingTickets: 0,
  fastDomainsDB: null,

  initialize: function() {
    const app = this;
    app.initializeFastDomainsDB();
    app.initializeHTTP();
  },

  retryFastDomainsDB: function() {
    const app = this;

    setTimeout(function() {
      console.log('retryFastDomainsDB...');
      app.initializeFastDomainsDB();
    }, FAST_DOMAINS_RETRY_MS);
  },

  initializeFastDomainsDB: function() {
    const app = this;

    app.fastDomainsDB = new net.Socket();

    app.fastDomainsDB.on('error', function(err) {
      console.error('Connection error:');
      console.error(err);
      if ( app.fastDomainsDB ) {
        app.fastDomainsDB.destroy();
        app.fastDomainsDB = null;
        app.retryFastDomainsDB();
      }
    });

    app.fastDomainsDB.on('close', function(had_error) {
      console.error('Connection closed. Had error: ' + had_error);
      if ( app.fastDomainsDB ) {
        app.fastDomainsDB.destroy();
        app.fastDomainsDB = null;
        app.retryFastDomainsDB();
      }
    });

    app.fastDomainsDB.on('timeout', function(err) {
      // Should still be valid though
      console.error('Connection timed out.');
    });

    app.fastDomainsDB.on('data', app.onFastDomainsData.bind(app));

    app.fastDomainsDB.connect(fastDomainsDB_PORT, fastDomainsDB_ADDRESS, function() {
      console.log('Connected to FastDomainsDB on ' + fastDomainsDB_ADDRESS + ':' + fastDomainsDB_PORT);
    });
  },

  onFastDomainsData: function( data ) {
    const app = this;

    // Enqueue replies
    app.ticketReplyQueue += data;

    // Split replies
    let replies = app.ticketReplyQueue.split( FAST_DOMAINS_EOC );

    // Make sure we have some
    if ( replies.length == 0 ) {
      return;
    }

    // Handle only complete replies (FAST_DOMAINS_EOC delimits a complete reply)
    // If they're all complete the last entry is empty,
    // else is an incomplete reply so we put it back in the queue
    let last = replies.pop();
    if ( last.length == 0 ) {
      app.ticketReplyQueue = '';
    } else {
      app.ticketReplyQueue = last;
      // console.log('Requeue fragment...');
    }

    // Handle replies one by one
    for( let i=0; i<replies.length; ++i ) {
      let db_reply = replies[i];

      // MIC FIXME: error handling here
      try {
        db_reply = JSON.parse( db_reply );
      } catch(e) {
        console.log( e );
        console.log( '---' );
        console.log( db_reply.toString() );
        console.log( '---' );
        process.exit();
      }

      let ticket = db_reply.ticketID in app.ticketQueue ? app.ticketQueue[db_reply.ticketID] : null;
      delete app.ticketQueue[db_reply.ticketID];
      app.pendingTickets--;

      if ( ticket ) {
        if ( ticket.ticketID === db_reply.ticketID && ticket.hash == db_reply.hash ) {
          // default response fields
          let responseBody = {
            status: db_reply.status, // FIXME: this should be handled more robustly to handle all kinds of errors not just db ones
            message: db_reply.message,
            userSocketRequestID: ticket.in_data.userSocketRequestID
          };
          
          // call command specific callback - can overrided `response` params
          _.assign( responseBody, ticket.respond( db_reply ) );
          
          // send response          
          if (ticket.socket) {
            ticket.socket.emit('server-reply', responseBody);
          } else {
            let json = JSON.stringify(responseBody)
            ticket.response.statusCode = db_reply.status; // FIXME: this should be handled more robustly to handle all kinds of errors not just db ones
            ticket.response.setHeader('Content-Type', 'application/json');
            ticket.response.end(json);
          }
        } else {
          console.error("FastDomainsDB out of sync error #1 (ticketID mismatch).");
          console.error("db_reply:");
          console.error(db_reply);
          console.error("ticketQueue: ");
          console.error(app.ticketQueue);
          app.fastDomainsDB.destroy(); // kill client after error
          process.exit();
        }
      } else {
        console.error("FastDomainsDB out of sync error #2 (ticket not found).");
        console.error("db_reply:");
        console.error(db_reply);
        console.error("ticketQueue: ");
        console.error(app.ticketQueue);
        app.fastDomainsDB.destroy(); // kill client after error
        process.exit();
      }
    }
  },

  initializeHTTP: function() {
    const app = this;

    var exprapp = express();
    var http = require('http').createServer( exprapp );
    var io = require('socket.io')( http );
    http.listen( APP_PORT );

    http.on('listening', function() {
      console.log( "Listening on port " + APP_PORT );
      console.log( "Production: " + (process.env.NODE_ENV == 'production' ? 'YES' : 'NO') );
    });    

    // --- middlewares ---

    // API per-IP rate limit

    if ( ENABLE_RATE_LIMIT === true ) {
      let checkLimiter = new RateLimit({
        windowMs: 1*60*1000, // 1 minute 
        max: 600,            // limit each IP to 600 requests per windowMs 
        delayMs: 0           // disable delaying - full speed until the max limit is reached 
      });
  
  
      let ideasLimiter = new RateLimit({
        windowMs: 1*60*1000, // 1 minute 
        max: 600,            // limit each IP to 600 requests per windowMs 
        delayMs: 0           // disable delaying - full speed until the max limit is reached 
      });


      let batchLimiter = new RateLimit({
        windowMs: 10*1000, // 10 seconds 
        max: 5,            // limit each IP to 5 requests per windowMs 
        delayMs: 0         // disable delaying - full speed until the max limit is reached 
      });

      exprapp.use('/api/1.0/domains/ideas.json', ideasLimiter);
      exprapp.use('/api/1.0/domains/check.json', checkLimiter);
      exprapp.use('/api/1.0/domains/batch.json', batchLimiter);
    }

    // Other middlewares

    exprapp.use(compression());
    exprapp.use(bodyParser.json());
    exprapp.use(express.static('static'));

    // API UTILS

    let logRequest = function( action, in_data, request, socket ) {
      let ip = request ? request.connection.remoteAddress : socket.client.conn.remoteAddress;
      let date = moment().format('YYYY/MM/DD hh:mm:ss');
      logStream.write( date + ' : ' + ip + ' : ' + action + ' : ' + JSON.stringify( in_data ) + '\n' );
    };

    let canAcceptRequest = function ( request, response, socket, in_data ) {
      if ( null === app.fastDomainsDB ) {
        response.statusCode = 500;
        response.end('500 - Database Disconnected');
        return false;
      } else
      if ( app.pendingTickets >= MAX_PENDING_QUERIES ) {
        response.statusCode = 503;
        response.end('503 - Server Busy');
        return false;
      }
      return true;
    }

    let requestError = function( response, socket, in_data, code, error_message ) {
      response.statusCode = code;
      response.end( JSON.stringify( {error: error_message} ) );
    }

    // COMMON API

    let handleCheck = function( request, response, socket, in_data ) {
      if ( canAcceptRequest( request, response, socket, in_data ) ) {
        app.enqueueFastDomainsCommand(
          // response
          response,
          
          // socket
          socket,
          
          // input data
          in_data,

          // command
          {
            command: 'QUERY',
            domains: [in_data.domain],
          },
          // compile reply
          function( db_reply ) {
            return { availability: db_reply.availability };
          }
        );

        // is this slowing us down? not too much
        logRequest( 'check', in_data, request, socket );

      } else {
        requestError( response, socket, in_data, 400, 'Check error.' );
      }
    };

    let handleBatch = function( request, response, socket, in_data ) {
      if ( in_data.domains.length > MAX_BATCH_REQUESTS ) {
        requestError( response, socket, in_data, 400, 'Batch too big.' );
      } else
      if ( canAcceptRequest( request, response ) ) {
        app.enqueueFastDomainsCommand(
          // response
          response, 
          
          // socket
          socket,
          
          // input data
          in_data,

          // command
          {
            command: 'QUERY',
            domains: in_data.domains,
          },
          
          // compile reply
          function( db_reply ) {
            return { availability: db_reply.availability };
          }
        );

        // is this slowing us down?
        logRequest( 'batch', in_data, request, socket );

      } else {
        requestError( response, socket, in_data, 400, 'Batch error.' );
      }
    };

    let logIdeasTimout = null;
    let logIdeasLast = {
      topic: [],
      sorting: [],
      filter: []
    };

    let handleIdeas = function( request, response, socket, in_data ) {
      if ( canAcceptRequest( request, response ) ) {
        app.enqueueFastDomainsCommand(
          // response
          response, 
          
          // socket
          socket,
          
          // input data
          in_data,

          // command
          {
            command: 'IDEAS',
            topic: in_data.topic,
            filter: in_data.filter,
            sorting: in_data.sorting,
          },
          
          // compile reply
          function( db_reply ) {
            return {
              ideasIndex: db_reply.ideasIndex,
              exactMatch: db_reply.exactMatch,
              domains:    db_reply.domains,
            };
          }
        );

        if ( logIdeasLast.topic.length === 0 )
          logIdeasLast.topic.push( in_data.topic );
        else {
          let last = logIdeasLast.topic[ logIdeasLast.topic.length - 1 ];
          if ( in_data.topic.indexOf( last ) === 0 ) {
            logIdeasLast.topic.pop();
            logIdeasLast.topic.push( in_data.topic );
          } else
          if ( last.indexOf( in_data.topic ) === 0 ) {
            // ignore
          } else {
            logIdeasLast.topic.push( in_data.topic );
          }
        }

        if ( logIdeasLast.sorting.length === 0 )
          logIdeasLast.sorting.push( in_data.sorting );
        else {
          let last = logIdeasLast.sorting[ logIdeasLast.sorting.length - 1 ];
          if ( last != in_data.sorting ) {
            logIdeasLast.sorting.push( in_data.sorting );
          }
        }

        if ( logIdeasLast.filter.length === 0 )
          logIdeasLast.filter.push( in_data.filter );
        else {
          let last = logIdeasLast.filter[ logIdeasLast.filter.length - 1 ];
          if ( last != in_data.filter ) {
            logIdeasLast.filter.push( in_data.filter );
          }
        }

        if ( logIdeasTimout ) {
          clearTimeout( logIdeasTimout );
        }
        logIdeasTimout = setTimeout(function() {
          logRequest( 'ideas', logIdeasLast, request, socket );
          logIdeasLast = {
            topic: [],
            sorting: [],
            filter: []
          };
        }, 3000);

      } else {
        requestError( response, socket, in_data, 400, 'Ideas error.' );
      }
    };

    let handleVersion = function( request, response, socket, in_data ) {
      if ( canAcceptRequest( request, response ) ) {
        app.enqueueFastDomainsCommand(
          // response
          response, 
          
          // socket
          socket,
          
          // input data
          in_data,

          // command
          {
            command: 'VERSION',
          },

          // compile reply
          function( db_reply ) {
            return {
              version: db_reply.version.replace('_', '').substr(4,4) + '-' + os.hostname().substr(0, 2) + '-' + AppInfo,
            };
          }
        );

        // is this slowing us down?
        logRequest( 'version', in_data, request, socket );

      } else {
        requestError( response, socket, in_data, 400, 'Version error.' );
      }
    };

    let handleStats = function( request, response, socket, in_data ) {
      // logRequest( 'stats', in_data, request, socket );
    };

    // REST API

    exprapp.post('/api/1.0/domains/check.json', function (request, response) {
      handleCheck( request, response, null, request.body );
    });

    exprapp.post('/api/1.0/domains/batch.json', function (request, response) {
      handleBatch( request, response, null, request.body );
    });

    exprapp.post('/api/1.0/domains/ideas.json', function (request, response) {
      handleIdeas( request, response, null, request.body );
    });

    exprapp.get('/api/1.0/database/version.json', function (request, response) {
      handleVersion( request, response, null, request.body );
    });

    exprapp.post('/api/1.0/stats.json', function (request, response) {
      handleStats( request, response, null, request.body );
    });

    exprapp.post('/api/1.0/database/update.json', function (request, response) {
      if ( canAcceptRequest( request, response ) && '::ffff:127.0.0.1' == request.connection.remoteAddress ) {
        app.enqueueFastDomainsCommand(
          // response
          response, 

          // socket
          null,
          
          // input data
          request.body,

          // command
          {
            command: 'UPDATE',
            version: request.body.version
          },
          // compile reply
          function( db_reply ) {
            return { version: db_reply.version };
          }
        );

        // is this slowing us down?
        logRequest( 'check', {update:1}, request, null );

      } else {
        // pretend it doesn't exist'
        response.statusCode = 404;
        response.end();
      }
    });

    // SOCKET API

    io.on('connection', function( socket ) {
      socket.on( 'POST:/api/1.0/domains/check.json', function( in_data ) {
        handleCheck( null, null, socket, in_data );
      });
      
      socket.on( 'POST:/api/1.0/domains/batch.json', function( in_data ) {
        handleBatch( null, null, socket, in_data );
      });
      
      socket.on( 'POST:/api/1.0/domains/ideas.json', function( in_data ) {
        handleIdeas( null, null, socket, in_data );
      });
      
      socket.on( 'GET:/api/1.0/database/version.json', function( in_data ) {
        handleVersion( null, null, socket, in_data );
      });
      
      socket.on( 'POST:/api/1.0/stats.json', function( in_data ) {
        handleStats( null, null, socket, in_data );
      });
      
    });
    
  },

  enqueueFastDomainsCommand: function(response, socket, in_data, command, respond_callback) {
    const app = this;

    // increment ticketID
    app.ticketID++;

    // used for debugging
    let hash = '#' + Math.random().toString(10).substr(2, 10) + Date.now();

    // increment pending request
    app.pendingTickets++;

    // push request into queue
    app.ticketQueue[app.ticketID] = {
      timestamp: Date.now(),
      ticketID: app.ticketID,
      hash: hash,
      response: response,
      socket: socket,
      in_data: in_data,
      respond: respond_callback,
    };

    // issue request
    
    _.assign(command, {
      ticketID: app.ticketID,
      hash: hash,
    });

    app.fastDomainsDB.write( JSON.stringify( command ) + FAST_DOMAINS_EOC );
  }
}

App.initialize();
