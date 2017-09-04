(function() {

    XS = typeof XS != typeof {} ? {} : XS;

    // --- BRANDING ---

    XS.home_url = 'http://' + document.location.hostname;
    XS.application_name = 'Fast Domains';
    XS.version_number = '1.0.0';

    // --- LOG ---

    // * 1.0  -

    // --- WIN & DOC WRAPPER ---

    XS.win = $(window);
    XS.doc = $(document);

    // --- CORE SUBSYSTEMS ---

    // Setup an instance of Simrou
    XS.Router = new Simrou();

    // --- CONSTANTS ---

    // XS.some_constant = 0

    // --- APP VARS ---

    // XS.some_status = 0;
    XS.faved_domains = {};
    XS.tested_domains = {};
    XS.filter = 'pre-post'; // pre, post, pre-post
    XS.sorting = 'popularity'; // len-asc, len-desc, alpha-asc, alpha-desk, random

    // --- SYSTEM VARS ---

    // Tracks if app has been initialized or not
    XS.initialized = false;

    // Tracks last open panel: DOM node
    XS.current_panel = null;

    // List of DOM nodes
    XS.panels = [];

    // --- SUBMODULES ---

    XS.server = new XS.Server();

    // --- PANELS ---

    XS.panel_ideas = new XS.PanelIdeas('panel-ideas');
    XS.panel_favs = new XS.PanelFavs();

    XS.bluehost_r = 'http://www.bluehost.com/track/program5?page=/web-hosting/signup&cpanel_plan=starter&domain=';
    XS.exact_available = false;

    // --- INITIALIZATION ---

    function initialize() {
        languagefy_element(document.body);

        collect_panels(document.body, XS.panels);

        new Clipboard('.copy-btn');

        $('#batch-button').click(function() {
            XS.panel_batch.query_batch();
            return false;
        });

        // ------------------------------------------------

        // $('#loading-screen').hide();
        // $('#global-wrapper').hide();
        // $('#global-wrapper').fadeIn();

        if ( localStorage.getItem('faved_domains') !== null) {
            XS.faved_domains = JSON.parse( localStorage.getItem('faved_domains') );
        }
        updated_faved_count();

        // if ( localStorage.getItem('sorting') ) {
        //     XS.sorting = localStorage.getItem('sorting');
        // }
        // if ( localStorage.getItem('filter') ) {
        //     XS.filter = localStorage.getItem('filter');
        // }

        XS.panel_ideas.update_options(null);

        $('.title, #tab-home').click(function() {
            $('#domain-ideas-input').val('');
            XS.panel_ideas.update_ideas(0);
            document.location.hash = '/domain-name-search';
            XS.server.api_stats({'home': '1'});
        });

        // ------------------------------------------------

        XS.socket = io();
        XS.socket.on( 'server-reply', function( data ) {
            // console.log( 'Server Socket Reply:' );
            // console.log( data );
            assert( data.userSocketRequestID + ':ok' in XS.server.socketRequestCallback );
            XS.server.socketRequestCallback[ data.userSocketRequestID + ':ok' ](data);
            delete XS.server.socketRequestCallback[ data.userSocketRequestID + ':ok' ];
        });

        // ------------------------------------------------

        XS.server.api_version( function( data ) {
            $('#db-version').text( data.version );
        }, error_cb);

        // ------------------------------------------------

        $('a[data-stat="1"]').click(function() {
            XS.server.api_stats({
                'shared': this.href.match(/([a-z]+)\.com/)[0]
            });
        });

        // ------------------------------------------------

        initialize_routing();

        XS.Router.start();

        if ( document.location.hash === '' ) {
            document.location.hash = '/domain-name-search';
        }

        // ------------------------------------------------
      
        $('#title').html( XS.application_name + '<sup><small>v' + XS.version_number + '<small></sup>' );

        XS.initialized = true;
      
        $(document.body).fadeIn();
    }

    function initialize_routing() {
        function open_panel(panel, params) {
            if (XS.current_panel != null) {
                XS.current_panel.close_panel();
            }
            XS.current_panel = panel;
            panel.open_panel(params);
        }

        // ----------------------------------------------------------

        XS.Router.addRoute('/domain-name-search').get(function(event, params) {
            highlight_navigation_button('ideas');
            open_panel(XS.panel_ideas, null);
        });

        // ----------------------------------------------------------

        XS.Router.addRoute('/domain-name-search/:query').get(function(event, params) {
            highlight_navigation_button('ideas');
            open_panel(XS.panel_ideas, params.query);
        });

        // ----------------------------------------------------------

        // XS.Router.addRoute('/favs').get(function(event, params) {
        //     highlight_navigation_button('favs');
        //     open_panel(XS.panel_favs);
        // });

        // ---------------------------------------------------------- unknown hashes resolve to this

        XS.Router.addRoute('/:anything').get(function(event, params) {
            // alert('what?');
            document.location.hash = '/domain-name-search';
            // highlight_navigation_button('ideas');
            // open_panel(XS.panel_ideas);
        });
    }

    // ---- REGISTER INIT -----------------------------------------------------

    $('document').ready(function(){
      initialize();
    });

})();
