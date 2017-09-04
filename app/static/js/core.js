XS = typeof XS == "undefined" ? {} : XS;

function assert(condition, message) {
    if  ( ! condition ) {
        var msg = message || "Assertion failed"; 
        alert(msg);
        throw msg;
    }
}

function O(id) {
    assert($( '#' + id ).length, 'O("'+id+'") = null');
    return $( '#' + id )[0];
}

// ----------------------------------------------------------------------------
// Language support
// ----------------------------------------------------------------------------

function local_str(str) {
	assert(str in XS.Lang, "Language string '"+str+"' not found!");
	return XS.Lang[str];
}

function languagefy_element(elem) {	
	// console.log(elem);
	for (var i = 0; i < elem.attributes.length; i++) {
		var attrib = elem.attributes[i];
		if (attrib.specified) {
			// console.log(attrib.name + " = " + attrib.value);
			if (attrib.value.length > 1 && attrib.value[0] == '$') {
				var lang_str = attrib.value.substring(1);
				attrib.value = local_str(lang_str);
			}
		}
	}

	// Descend recursively
	for(var i=0; i<elem.children.length; ++i) {
		languagefy_element(elem.children[i]);
	}
}

// ----------------------------------------------------------------------------
// Function default arguments
// ----------------------------------------------------------------------------

// uses default vals if a parameter is missing or is null.
function apply_defaults(params, defaults) {
    var expanded = {}

    assert(typeof params == typeof {});

    for(var key in params) {
        assert(key in defaults, F('Unknown parameter "%s"', key));
    }

    for(var key in defaults) {
        if (key in params && params[key] != null) 
            expanded[key] = params[key];
        else
            expanded[key] = defaults[key];
    }
    return expanded;
}

// ----------------------------------------------------------------------------
// Templating system
// ----------------------------------------------------------------------------

function render_template_to_html(template_name, dictionary) {
    dictionary = typeof dictionary == typeof {} ? dictionary : {}

    var html = O(template_name).innerHTML;
    for (var name in dictionary) {
        var value = dictionary[name];
        html = html.replace_all('{{'+name+'}}', value);
    }
    return html;
}

function render_template_to_node(template_name, dictionary) {
    var html = render_template_to_html(template_name, dictionary);
    return html_to_node(html);
}

function html_to_node(html) {
    var mother = O('mother-node');

    // inoculates the html code in the mother node - conception!
    mother.innerHTML = html;
    
    // remove all text nodes
    while(mother.childNodes.length && mother.childNodes[0].nodeName == '#text') {
        mother.removeChild(mother.childNodes[0]);
    }
    
    // save the node we are interested in - a new baby node is born!
    var node = mother.removeChild(mother.childNodes[0]);

    /*
    // remove all remaining nodes, typically spurious text nodes that
    // follow the template so they don't accumulate
    while(mother.childNodes.length) {
        mother.removeChild(mother.childNodes[0]);
    }
    */

    return node;
}

function clear_selection() {
    if (window.getSelection && window.getSelection().empty) { // Chrome
        window.getSelection().empty();
    }
    else
    if (window.getSelection && window.getSelection().removeAllRanges) {  // Firefox
        window.getSelection().removeAllRanges();
    }
    else 
    if (document.selection && document.selection.empty) {  // IE?
        document.selection.empty();
    }
}

function human_readable_file_size(size) {
    var i = Math.floor(Math.log(size) / Math.log(1024));
    return (size / Math.pow(1024, i)).toFixed(2) * 1 + ' ' + ['B', 'kB', 'MB', 'GB', 'TB'][i];
}

function collect_panels(node, panels) {

    if (node.id && node.id.indexOf("panel-") == 0) {
        // front-push: children appear before their parent        
        // panels.splice(0, 0, node)
        // back-push: children appear after their parents
        panels.push(node)
    }
    for(var i=0; i<node.children.length; ++i) {
        var child = node.children[i];
        collect_panels(child, panels)
    }
}

function show_panel(panel_self, panel_name)
{
    clear_selection();

    for(var i=0; i<XS.panels.length; ++i)
    {
        var panel = XS.panels[i];

        var relative_button_name = panel.id.substr(6) + '-btn';
        var relative_button = document.getElementById(relative_button_name);

        // "panel-private-messages-view-message" matches both:
        // "panel-private-messages"
        // "panel-private-messages-view-message"
        if (panel_name.indexOf(panel.id) == 0) {
            // emit panel open? call panel_open()?
            panel.style.display = 'block';

            // route infinite scrolling events here: child panels override the event handlers from the parents
            // XS.sig_near_bottom_of_page.removeAll();
            // if ('slot_near_bottom_of_page' in panel) {
            //     XS.sig_near_bottom_of_page.add(panel.slot_near_bottom_of_page);
            // }
        } else {
            panel.style.display = 'none';
        }
    }

    XS.current_panel = panel_self;
}

