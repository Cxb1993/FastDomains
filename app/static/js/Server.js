// ----------------------------------------------------------------------------
// Server
// ----------------------------------------------------------------------------
(function() {

XS = typeof XS == "undefined" ? {} : XS;

// ----------------------------------------------------------------------------

XS.Server = function() {
  var self = this;

  self.socketRequestCallback = {
    // '10:ok' : function() {},
    // '10:err' : function() {}
  };

  self.socketRequestCounter = 0;

  self.useSockets = true;
};

// ----------------------------------------------------------------------------

XS.Server.prototype.wrap_api = function( params, user_ok_callback, user_err_callback ) {
  var self = this;

  if ( self.useSockets ) {
    self.socketRequestCounter++;
    self.socketRequestCallback[ self.socketRequestCounter + ':ok' ]  = user_ok_callback;
    self.socketRequestCallback[ self.socketRequestCounter + ':err' ] = user_err_callback;
    params.data.userSocketRequestID = self.socketRequestCounter;
    XS.socket.emit( params.method + ':' + params.url, params.data );
  } else {
    params.data.userSocketRequestID = -1;

    var ajax = $.ajax({
      url: params.url,
      method: params.method,
      dataType: 'json',
      contentType: 'application/json; charset=utf-8',
      data: JSON.stringify(params.data),
    }).done(function( msg ) {
      user_ok_callback( msg );
    }).fail(function( jqXHR, textStatus ) {
      if ( textStatus != 'abort' ) {
        user_err_callback( jqXHR );
      }
    });
  }
};

// ----------------------------------------------------------------------------

XS.Server.prototype.api_check = function( domain, user_ok_callback, user_err_callback ) {
  var self = this;

  self.wrap_api({
    url: '/api/1.0/domains/check.json',
    method: 'POST',
    data: {
        domain: domain
    }
  }, 
  
  function( data ) {
    user_ok_callback( data, domain );
  }, 
  
  function( xhr ) {
    user_err_callback( xhr );
  });

};

// ----------------------------------------------------------------------------

XS.Server.prototype.api_batch = function( domains, user_ok_callback, user_err_callback ) {
  var self = this;

  self.wrap_api({
    url: '/api/1.0/domains/batch.json',
    method: 'POST',
    data: {
        domains: domains
    }
  }, 
  
  function( data ) {
    user_ok_callback(data, domains);
  }, 
  
  function( xhr ) {
    user_err_callback( xhr );
  });
};

// ----------------------------------------------------------------------------

XS.Server.prototype.api_ideas = function( topic, filter, sorting, user_ok_callback, user_err_callback ) {
  var self = this;

  self.wrap_api({
    url: '/api/1.0/domains/ideas.json',
    method: 'POST',
    data: {
        topic: topic,
        filter: filter,
        sorting: sorting,
    }
  }, 
  
  function( data ) {
    user_ok_callback( data );
  }, 
  
  function( xhr ) {
    user_err_callback( xhr );
  });
};

// ----------------------------------------------------------------------------

XS.Server.prototype.api_version = function( user_ok_callback, user_err_callback ) {
  var self = this;

  self.wrap_api({
    url: '/api/1.0/database/version.json',
    method: 'GET',
    data: {}
  }, 
  
  function( data ) {
    user_ok_callback( data );
  }, 
  
  function( xhr ) {
    user_err_callback( xhr );
  });
};

// ----------------------------------------------------------------------------

XS.Server.prototype.api_stats = function( data ) {
  var self = this;

  self.wrap_api({
    url: '/api/1.0/stats.json',
    method: 'POST',
    data: data
  }, 
  function( data ) {}, 
  function( xhr ) {}
  );
};

// ----------------------------------------------------------------------------

})();