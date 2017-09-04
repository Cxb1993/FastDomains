XS = typeof XS == "undefined" ? {} : XS;

var error_cb = function( jqXHR ) {
  console.log( jqXHR );
  var msg = jqXHR.responseJSON.error ? jqXHR.responseJSON.error : jqXHR.responseJSON.message ? jqXHR.responseJSON.message : jqXHR.responseText;
  alert( 'Code ' + jqXHR.status + '\n\n' + msg + '\n\n' );
}

function highlight_navigation_button(name) {
    $('#tabs li').removeClass('active');
    $('#tab-' + name).addClass('active');
}

function makeOfferDotCom( domain ) {
  XS.server.api_stats({'makeOffer': 1});
  window.open( 'https://www.afternic.com/arrival/agent?name=' + domain + '.com');
}

function registerDotCom( domain ) {
  XS.server.api_stats({'register': 1});
  window.open( 'https://wordpress.com/start/domain-first/site-or-domain?new=' + domain + '.com');
}

// ----------------------------------------------------------------------------

function component_domain_entry( domain, is_available ) {
  var td = document.createElement('td');
  $(td).addClass( is_available ? 'text-success' : 'text-danger' );

  var heart = is_favourite( domain ) ? 'glyphicon-heart' : 'glyphicon-heart-empty';
  var check = 'glyphicon-chevron-right';

  var html =
  '<span class="single-domain-span">' + '<i class="glyphicon ' + check + '"></i> ' + domain + '<small>.com</small></span> ' +
  '<a href="#" onclick="return false;" target="_blank" class="pull-right faved-icon" title="Favourite"><i class="glyphicon ' + heart + '" data-domain="' + domain.toLowerCase() + '"></i></a>' +
  '<span class="pull-right">&nbsp;&nbsp;&nbsp;</span>' +
  '<a href="https://whois.icann.org/en/lookup?name=' + domain + '.com" target="_blank" class="pull-right domain-action" title="Whois"><i class="fa fa-question-circle-o"></i></a>';
  if ( ! is_available ) {
    html += '<span class="pull-right">&nbsp;&nbsp;&nbsp;</span>' +
    '<a href="http://' + domain + '.com" target="_blank" class="pull-right domain-action" title="Visit"><i class="fa fa-eye"></i></a>';
  }

  $( td ).html( html );

  $( td ).find('.faved-icon').click(function() {
    toggle_favourite( domain );
  });

  $( td ).find('.single-domain-span').click(function() {
    if ( is_available ) {
      registerDotCom( domain );
    } else {
      makeOfferDotCom( domain );
    }
  })
  .css( 'cursor', 'pointer' );

  return td;
}

// case insensitive test
function is_favourite( domain ) {
  domain = domain.toLowerCase();
  for (var key in XS.faved_domains) {
    if ( XS.faved_domains.hasOwnProperty( key ) && key.toLowerCase() == domain ) {
        return true;
    }
  }

  return false;
}

// case insensitive test
function del_favourite( domain ) {
  domain = domain.toLowerCase();
  for (var key in XS.faved_domains) {
    if ( XS.faved_domains.hasOwnProperty( key ) && key.toLowerCase() == domain ) {
      delete XS.faved_domains[ key ];
      return true;
    }
  }

  return false;
}

function toggle_favourite( domain ) {
  if ( is_favourite( domain ) ) {
    del_favourite( domain );
    $('i[data-domain="' + domain.toLowerCase() + '"]').removeClass('glyphicon-heart').addClass('glyphicon-heart-empty');
    XS.server.api_stats({'unfavour': 1});
  } else {
    XS.faved_domains[domain] = Date.now();
    $('i[data-domain="' + domain.toLowerCase() + '"]').addClass('glyphicon-heart').removeClass('glyphicon-heart-empty');
    XS.server.api_stats({'favour': 1});
  }
  localStorage.setItem( 'faved_domains', JSON.stringify(XS.faved_domains) );
  updated_faved_count();
}

function updated_faved_count() {
  // no counters no more
}

// ----------------------------------------------------------------------------

XS.PanelIdeas = function(root_panel_id) {
  const MAX_IDEAS = 5000;

  var self = this;

  self.root_panel_id = root_panel_id;
  self.root_node = O(root_panel_id);

  $('#domain-ideas-input').on('input', function() {
    self.on_input();
  });

  $('#ideas-options').click( function(elem) {
    self.update_options(elem);
  });

  $("#exact-love").click(function() {
    var topic = self.get_topic();
    toggle_favourite( topic );
  });

  $('#exact-register').click(function() {
    registerDotCom( self.get_topic() );
  });

  $('#exact-offer').click(function() {
    makeOfferDotCom( self.get_topic() );
  });

  $('#exact-name').click(function() {
    if ( XS.exact_available ) {
      registerDotCom( self.get_topic() );
    } else {
      makeOfferDotCom( self.get_topic() );
    }
  });

  $('#ideas-clear').click(function() {
    document.location.hash = '/domain-name-search';
    document.location.reload(true);
  });

  $('#ideas-faved').click(function() {
    $('#faved-modal').modal();
    XS.panel_favs.open_panel();
  });

  // table cells
  self.cells = [];
  $('#domain-ideas-feedback').html('');
  var table = $('#domain-ideas-feedback')[0];

  for( var i = 0; i < MAX_IDEAS; ++i ) {
    var col = document.createElement('div');
    var span = document.createElement('span');
    var love = document.createElement('i');
    col.appendChild( span );
    col.appendChild( love );
    $( love ).addClass('glyphicon glyphicon-heart-empty pull-right');
    $( col ).addClass('domain-idea faved-icon');
    col.title = 'Register this domain';
    love.title = 'Save as favourite';
    table.appendChild( col );
    self.cells.push( span );
    span.love = love;

    if ( i % 6 < 3 ) {
      $( col ).addClass('domain-idea-color');
    }

    (function( love, span ) {
      $(love).click( function() {
        var domain = span.innerText.split('.')[0].replace(/ /g, '');
        toggle_favourite( domain );
      });

      $(span).click( function( event ) {
        var domain = span.innerText.split('.')[0].replace(/ /g, '');
        if ( event.target != love ) {
          registerDotCom( domain );
        }
      });
    })( love, span );
  }

  self.update_timeout = null;
  self.query_ms_timeout = null;
  self.query_ms_list = [];
};

XS.PanelIdeas.prototype.on_input = function() {
  var self = this;
  self.update_ideas(0);
  var input = $('#domain-ideas-input').val().trim().replace(/ /g, '');
  $('#ideas-opt-pre a').html( input + '&hellip;' );
  $('#ideas-opt-post a').html( '&hellip;' + input );
}

XS.PanelIdeas.prototype.get_topic = function(elem) {
  return O('domain-ideas-input').value.trim().replace(/\b\w/g, function(l){ return l.toUpperCase();}).replace(/ /g, '').replace(/\.com$/i, '');
}

XS.PanelIdeas.prototype.update_options = function(elem) {
  if ( elem !== null) {
    var ideas_opt = elem.target.parentNode.id.substr(10);

    var sort_opt = {
        'len-asc': 1,
        'len-desc': 1,
        'alpha-asc': 1,
        'alpha-desc': 1,
        'random': 1,
        'popularity': 1
    };
    var filter_opt = {
        'pre-post': 1,
        'pre': 1,
        'post': 1
    };

    if ( ideas_opt in sort_opt ) {
        XS.sorting = ideas_opt;
    }
    if ( ideas_opt in filter_opt ) {
        XS.filter = ideas_opt;
    }
  }

  // Update GUI
  $('#ideas-options li').removeClass('active');
  $('#ideas-opt-' + XS.sorting).addClass('active');
  $('#ideas-opt-' + XS.filter).addClass('active');

  // Save options
  localStorage.setItem('sorting', XS.sorting);
  localStorage.setItem('filter', XS.filter);

  // Update view
  XS.panel_ideas.update_ideas(0);
};

XS.PanelIdeas.prototype.update_ideas = function( delay ) {
  var self = this;

  var topic = self.get_topic();

  if ( topic.length === 0 ) {
    $('#domain-ideas-input-group').removeClass('has-error');
    $('#ideas').hide();
    $('#exact-summary').hide();
    $('#title').show();
    return;
  } else
  if ( ! /^[a-zA-Z0-9- ]{1,32}$/.test( topic ) && ! /^@[a-zA-Z0-9]{1,16}$/.test( topic ) ) {
    $('#domain-ideas-input-group').addClass('has-error');
    return;
  } else {
    $('#domain-ideas-input-group').removeClass('has-error');
  }

  var clean_topic = topic.replace(/ /g, '');

  var time_start = Date.now();
  var prefix_end = XS.DICTIONARY_POST_COUNT;
  var success_cb = function( data ) {
    if ( O('domain-ideas-input').value.trim() === '' ) {
      return;
    }

    if ( data.domains ) {
      console.log( data.domains );
      return;
    }

    var ms = Date.now() - time_start;
    $('#domain-ideas-summary').html(
      'Found <span class="summary-highlight">' + data.ideasIndex.length + '</span> available domains with <span class="summary-highlight">' + topic
      );
    $('#ideas').show();

    // speed monitoring
    self.query_ms_list.push( ms );
    if ( self.query_ms_timeout ) {
      clearTimeout(self.query_ms_timeout);
    }
    self.query_ms_timeout = setTimeout( function() {
      var ms_list = self.query_ms_list.sort();
      var avg = 0;
      ms_list.forEach(function(ms) {
        avg += ms;
      });
      avg = Math.round( avg / ms_list.length );

      XS.server.api_stats({
        ms_avg: avg,
        ms_min: ms_list[0],
        ms_max: ms_list[ ms_list.length -1 ],
      });
      self.query_ms_list = [];
    }, 3000);

    if ( self.update_timeout ) {
      clearTimeout( self.update_timeout );
      self.update_timeout = null;
    }

    var fill_ideas_i = 0;

    $('#title').hide();
    $('#exact-summary').show();
    $('#exact-name').text( topic + '.com' );

    $('#exact-whois').attr( 'href', 'https://whois.icann.org/en/lookup?name=' + self.get_topic() + '.com' );
    $('#exact-visit').attr( 'href', 'http://' + self.get_topic() + '.com' );

    if ( is_favourite( topic ) ) {
      $("#exact-love").removeClass('glyphicon-heart-empty').addClass('glyphicon-heart').attr('data-domain', topic.toLowerCase());
    } else {
      $("#exact-love").removeClass('glyphicon-heart').addClass('glyphicon-heart-empty').attr('data-domain', topic.toLowerCase());
    }

    XS.exact_available = data.exactMatch;

    if ( data.exactMatch === true ) {
        $('#exact-summary-yes').css('display', 'inline-block');
        $('#exact-summary-no').css('display', 'none');
        $('#exact-summary').css('background-color', 'lightgreen');
        $('#exact-love').addClass('text-success').removeClass('text-danger');
    } else {
        $('#exact-summary-yes').css('display', 'none');
        $('#exact-summary-no').css('display', 'inline-block');
        $('#exact-summary').css('background-color', '#ff99aa');
        $('#exact-love').removeClass('text-success').addClass('text-danger');
    }

    var fill_ideas = function() {
      var domain = null;
      var batch = 100;
      for( ; fill_ideas_i < data.ideasIndex.length && fill_ideas_i < self.cells.length; ++fill_ideas_i, --batch ) {
        if ( batch === 0 ) {
          self.update_timeout = setTimeout( fill_ideas, 0 );
          return;
        }

        var index = data.ideasIndex[ fill_ideas_i ];

        if ( index < prefix_end ) {
          domain = topic + XS.dictionary[ index ];
          self.cells[ fill_ideas_i ].innerHTML = '<i class="glyphicon glyphicon-chevron-right" style="color: mediumseagreen;"></i> ' + topic + '<b>' + XS.dictionary[ index ] + '</b>' + '<small>.com</small>';
          self.cells[ fill_ideas_i ].title = 'Register ' + domain + '.com';
        } else {
          domain = XS.dictionary[ index ] + topic;
          self.cells[ fill_ideas_i ].innerHTML = '<i class="glyphicon glyphicon-chevron-right" style="color: mediumseagreen;"></i> ' + '<b>' + XS.dictionary[ index ] + '</b>' + topic + '<small>.com</small>';
          self.cells[ fill_ideas_i ].title = 'Register ' + domain + '.com';
        }

        // initialize FAVED icon
        if ( is_favourite( domain ) ) {
          $(self.cells[ fill_ideas_i ].love).removeClass('glyphicon-heart-empty').addClass('glyphicon-heart').attr('data-domain', domain.toLowerCase());
        } else {
          $(self.cells[ fill_ideas_i ].love).removeClass('glyphicon-heart').addClass('glyphicon-heart-empty').attr('data-domain', domain.toLowerCase());
        }

        $(self.cells[ fill_ideas_i ]).parent().show();
      }
      for( ; fill_ideas_i < self.cells.length; ++fill_ideas_i ) {
        $(self.cells[ fill_ideas_i ]).parent().hide();
      }
    };

    self.update_timeout = setTimeout( fill_ideas, delay );
  };

  XS.server.api_ideas(
    clean_topic,
    XS.filter,
    XS.sorting,
    success_cb,
    error_cb
  );
};

XS.PanelIdeas.prototype.open_panel = function(query) {
    var self = this;

    XS.server.api_stats({'panel': 'ideas'});

    show_panel(self, self.root_panel_id);

    $('#domain-ideas-input').focus();

    if ( query ) {
      query = decodeURIComponent( query );
      $('#domain-ideas-input').val( query );
      self.on_input();
    }
};

XS.PanelIdeas.prototype.close_panel = function() {
};

// ----------------------------------------------------------------------------

XS.PanelFavs = function() {
    var self = this;
}

XS.PanelFavs.prototype.open_panel = function() {
    var self = this;

    XS.server.api_stats({'panel': 'favs'});

    $( '#favourite' ).html('');
    var faved_list = [];
    _.forOwn(XS.faved_domains, function( val, domain ) {
      faved_list.push( val + '_' + domain );
    });
    faved_list.sort();
    faved_list.reverse();

    var domains = [];
    faved_list.forEach( function( entry ) {
      domains.push( entry.split('_')[1] );
    });

    var success_cb = function( data, domains ) {
      for( var i = 0; i < domains.length; ++i ) {
        var col = component_domain_entry( domains[ i ], data.availability[ i ] );
        var row = document.createElement( 'tr' );
        row.appendChild( col );
        $( '#favourite' )[0].appendChild( row );
      }
    };

    if ( domains.length > 0 ) {
      XS.server.api_batch( domains, success_cb, error_cb );
    }
}

XS.PanelFavs.prototype.close_panel = function() {
};
