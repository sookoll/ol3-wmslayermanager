/**
 * LayerTreeFromOWS
 * @param opt_options
 * @constructor
 */
ol.control.LayerTreeFromOWS = function(opt_options) {

    var options = {
        singlelayer: true,// currently works only single layer
        capabilities: null,
        layers: [],
        className: null,
        title: null,
        iconPrefix: 'glyphicon',
        collapseIcon: 'glyphicon-triangle-bottom',
        expandIcon: 'glyphicon-triangle-right',
        depth: 2,
        orderby: false
    };

    this.options = Object.assign({}, options, opt_options);
    this.parser = new ol.format.WMSCapabilities();
    this.capabilities = null;
    this.metadata = {};
    this.layers = [];
    this.layerList = [];
    this.rerenderLayer = false;

    var controlEl = document.createElement('div');
    controlEl.className = 'ol-layermanager ol-control' + (this.options.className ? ' ' + this.options.className : '');
    this.el = document.createElement('div');
    controlEl.appendChild(this.el);
    
    ol.control.Control.call(this, {
        element: controlEl,
        target: this.options.target
    });
};

ol.inherits(ol.control.LayerTreeFromOWS, ol.control.Control);

/**
 * Set the map instance the control is associated with.
 * @param {ol.Map} map The map instance.
 */
ol.control.LayerTreeFromOWS.prototype.setMap = function(map) {
    ol.control.Control.prototype.setMap.call(this, map);
    var capabilities = this.handleCapabilities(this.options.capabilities);
    if (capabilities) {
        // single layer
        this.layers.push(this.createLayer());
        map.addLayer(this.layers[0]);
        this.renderCall();
        map.getView().on('change:resolution', function(e){
            if (this.rerenderLayer) {
                var source = this.layers[0].getSource();
                source.setTileLoadFunction(source.getTileLoadFunction());
                this.rerenderLayer = false;
            }
        }, this);
    }
};

ol.control.LayerTreeFromOWS.prototype.handleCapabilities = function(doc) {
    var result = this.parser.read(doc);
    if (this.isValid(result)) {
        // set capabilities
        this.capabilities = result;
        this.metadata = this.getServiceMetaData(result);
        return result;
    } else {
        return null;
    }
};

ol.control.LayerTreeFromOWS.prototype.isValid = function(capabilities) {
    return capabilities.Service &&
        capabilities.Service.Name &&
        capabilities.Service.Name === 'WMS' &&
        capabilities.Capability &&
        capabilities.Capability.Layer;
};

ol.control.LayerTreeFromOWS.prototype.renderCall = function() {
    while(this.el.firstChild) {
        this.el.removeChild(this.el.firstChild);
    }
    
    var label = document.createElement('label');
    label.className = 'control-label';
    label.innerHTML = this.options.title || this.metadata.title;
    this.el.appendChild(label);
    var ul = document.createElement('ul');
    this.el.appendChild(ul);
    this.iterateLayers(this.capabilities.Capability.Layer, ul, 1, true);
    
};

ol.control.LayerTreeFromOWS.prototype.iterateLayers = function(lyr, el, depth, test) {
    var item, ul,
        this_= this,
        next = depth,
        doNotTest = false;
    if (Array.isArray(lyr)) {
        next++;
        lyr.forEach(function (sub) {
            this.iterateLayers(sub, el, next, test);
        }, this);
    } else {
        if (test && this.options.layers.length > 0) {
            if (this.options.layers.indexOf(lyr.Name) > -1) {
                item = this.formatItem(lyr, depth);
                test = false;
            } else if (lyr.Layer) {
                item = this.formatItem(lyr, depth);
            }
        } else {
            item = this.formatItem(lyr, depth);
        }
        if (item && lyr.Layer) {
            next++;
            ul = document.createElement('ul');
            item.appendChild(ul);
            this.iterateLayers(lyr.Layer, ul, next, test);
            if (ul.children.length === 0) {
                item = null;
            }
        }
        if (item) {
            el.appendChild(item);
        }
    }
};

ol.control.LayerTreeFromOWS.prototype.formatItem = function(lyr, depth) {
    var li = document.createElement('li'),
        label = document.createElement('label'),
        _this = this,
        checkbox, i, visible, icon;
    if (lyr.Layer) {
        if (depth >= this.options.depth) {
            visible = 'collapsed';
            icon = this.options.expandIcon;
        } else {
            visible = 'expanded';
            icon = this.options.collapseIcon;
        }
        li.classList.add('layer-group', visible);
        i = document.createElement('i');
        i.classList.add(this.options.iconPrefix, icon);
        label.appendChild(i);
        label.onclick = function(e) {_this.toggleGroup(e)};
    } else {
        checkbox = document.createElement('input');
        checkbox.type = "checkbox";
        checkbox.name = lyr.Name;
        checkbox.onclick = function(e) {_this.handleCheckboxChange(e)};
        label.appendChild(checkbox);
    }
    label.appendChild(document.createTextNode(lyr.Title));
    li.appendChild(label);
    return li;
};

ol.control.LayerTreeFromOWS.prototype.getServiceMetaData = function(capability) {
    var meta = {
        url: null,
        format: null,
        version: null,
        title: null
    };
    if (capability &&
        capability.Capability &&
        capability.Capability.Request &&
        capability.Capability.Request.GetMap
       ) {
        var getmap = capability.Capability.Request.GetMap;
        meta.format = getmap.Format;
        meta.url = getmap.DCPType[0].HTTP.Get.OnlineResource;
        meta.version = capability.version;
        meta.title = capability.Service.Title;
    }
    return meta;
};

ol.control.LayerTreeFromOWS.prototype.createLayer = function() {
    return new ol.layer.Tile({
        visible: false,
        source: new ol.source.TileWMS({
            url: this.metadata.url,
            params: {
                'TILED': true,
                'VERSION': '1.1.1',// this.metadata.version,// do not work!
                'LAYERS': null,
                'FORMAT': this.metadata.format[0]
            },
            serverType: 'mapserver',
            gutter: 20
        })
    });
};

ol.control.LayerTreeFromOWS.prototype.handleCheckboxChange = function(e) {
    var layerName = e.target.name,
        visible = e.target.checked,
        layers = this.layerList;
    if (visible && layers.indexOf(layerName) === -1) {
        layers.push(layerName)
    }
    if (!visible && layers.indexOf(layerName) !== -1) {
        layers.splice(layers.indexOf(layerName), 1)
    }
    this.layerList = layers;
    this.updateLayer(this.layers[0], layers);
};

ol.control.LayerTreeFromOWS.prototype.updateLayer = function(lyr, list) {
    if (list.length > 0) {
        var source = lyr.getSource(),
            inputs;
        if (!this.options.orderby) {
            inputs = Array.prototype.slice.call(this.el.querySelectorAll('input[type=checkbox]:checked'));
            list = inputs.map(function (item) {
                return item.name;
            });
        }
        source.updateParams({ LAYERS: list.join(',') });
        this.rerenderLayer = true;
        lyr.setVisible(true);
    } else {
        lyr.setVisible(false);
    }
};

ol.control.LayerTreeFromOWS.prototype.toggleGroup = function(e) {
    var i = e.currentTarget.querySelector('i'),
        li = e.currentTarget.parentNode;
    if (i && li) {
        i.classList.toggle(this.options.collapseIcon);
        i.classList.toggle(this.options.expandIcon);
        li.classList.toggle('collapsed');
        li.classList.toggle('expanded');
    }
};